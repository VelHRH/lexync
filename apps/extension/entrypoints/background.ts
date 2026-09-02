import { canonicalLanguageTag, languageName } from '@lexync/domain';
import { readExpressionSnapshot, writeExpressionSnapshot } from '../lib/learning-mode-index';
import {
  isClozemasterCaptureMessage,
  type ClozemasterCaptureMessage,
} from '../lib/clozemaster-messages';
import {
  isDuolingoCaptureMessage,
  type DuolingoCaptureMessage,
} from '../lib/duolingo-messages';
import {
  isLearningModeMessage,
  type LearningModeEntry,
  type LearningModeLoadResponse,
  type LearningModeMessage,
  type LearningModeSiteState,
} from '../lib/learning-mode-messages';
import {
  isOrdinaryCaptureMessage,
  type LoadOrdinaryCaptureMessage,
  type LoadOrdinaryCaptureResponse,
  type OrdinaryCaptureMessage,
  type SaveOrdinaryCaptureMessage,
} from '../lib/ordinary-capture-messages';
import {
  isCaptureNeedsSense,
  type CaptureLearningLanguageResponse,
  type LearningLanguageOption,
  type LearningLanguageSnapshot,
} from '../lib/learning-language-messages';
import { learningModeSiteKey } from '../lib/study-pairs';
import { supabase } from '../lib/supabase';

type SiteChoice = { enabled: boolean; learningLanguageId?: string };

async function loadSnapshot(): Promise<LearningLanguageSnapshot> {
  const { data, error } = await supabase.rpc('account_learning_snapshot');
  if (error) throw error;
  return data as LearningLanguageSnapshot;
}

function languageOptions(snapshot: LearningLanguageSnapshot): LearningLanguageOption[] {
  return snapshot.learningLanguages.map(({ id, languageTag, preferredAnswerLanguageTag }) => ({
    id,
    languageTag,
    preferredAnswerLanguageTag,
  }));
}

function selectedLanguage(snapshot: LearningLanguageSnapshot, id?: string) {
  return snapshot.learningLanguages.find((language) => language.id === id);
}

async function loadOrdinaryCapture(_message: LoadOrdinaryCaptureMessage): Promise<LoadOrdinaryCaptureResponse> {
  try {
    const snapshot = await loadSnapshot();
    const active = selectedLanguage(snapshot, snapshot.activeLearningLanguageId ?? undefined)
      ?? snapshot.learningLanguages[0];
    return {
      activeLearningLanguageId: active?.id,
      answerLanguageTag: active?.preferredAnswerLanguageTag ?? undefined,
      learningLanguages: languageOptions(snapshot),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Learning Languages could not be loaded.',
      learningLanguages: [],
    };
  }
}

async function detectOrdinaryAnswerLanguage(text: string) {
  const detection = await browser.i18n.detectLanguage(text).catch(() => undefined);
  if (!detection?.isReliable) return { reliable: false, languageTag: undefined };
  const language = detection.languages
    .filter((candidate) => candidate.language !== 'und' && candidate.percentage > 0)
    .sort((first, second) => second.percentage - first.percentage)[0];
  return {
    reliable: Boolean(language),
    languageTag: language ? canonicalLanguageTag(language.language) ?? undefined : undefined,
  };
}

async function saveCapture(
  message: {
    answerLanguageTag: string;
    createNewSense?: boolean;
    example: string | null;
    expression: string;
    learningLanguageId: string;
    senseId?: string;
    translation: string;
  },
  sender: { tab?: { id?: number } },
): Promise<CaptureLearningLanguageResponse> {
  const { data, error } = await supabase.rpc('capture_learning_language_entry', {
    p_answer_language_tag: message.answerLanguageTag,
    p_create_new_sense: message.createNewSense ?? false,
    p_example: message.example,
    p_expression: message.expression,
    p_learning_language_id: message.learningLanguageId,
    p_sense_id: message.senseId ?? null,
    p_translation: message.translation,
  });
  if (error) return { error: error.message };
  const response = data as CaptureLearningLanguageResponse;
  if (isCaptureNeedsSense(response)) return response;
  if ('error' in response) return response;
  if (response.kind !== 'saved') return response;
  const entries = await syncExpressionSnapshot(message.learningLanguageId);
  if (sender.tab?.id) {
    await browser.tabs.sendMessage(sender.tab.id, { entries, type: 'learning-mode:index-updated' }).catch(() => undefined);
  }
  return response;
}

async function handleOrdinaryCapture(message: OrdinaryCaptureMessage, sender: { tab?: { id?: number } }) {
  if (message.type === 'ordinary-capture:load') return loadOrdinaryCapture(message);
  if (message.type === 'ordinary-capture:detect-answer-language') return detectOrdinaryAnswerLanguage(message.text);
  return saveCapture(message, sender);
}

async function handleAdapterCapture(
  message: ClozemasterCaptureMessage | DuolingoCaptureMessage,
  sender: { tab?: { id?: number } },
): Promise<CaptureLearningLanguageResponse | { error?: string; learningLanguageId?: string; switched?: boolean; learningLanguageTag?: string }> {
  if (message.type === 'clozemaster-capture:load' || message.type === 'duolingo-capture:load') {
    const snapshot = await loadSnapshot();
    const learningLanguageTag = canonicalLanguageTag(message.learningLanguageTag);
    const answerLanguageTag = canonicalLanguageTag(message.answerLanguageTag);
    const language = snapshot.learningLanguages.find((candidate) => candidate.languageTag === learningLanguageTag);
    if (!language || !answerLanguageTag || !learningLanguageTag) return { error: 'Matching Learning Language is unavailable.' };
    const switched = snapshot.activeLearningLanguageId !== language.id;
    if (switched) {
      const { error } = await supabase.rpc('set_active_learning_language', { p_learning_language_id: language.id });
      if (error) return { error: error.message };
    }
    return { learningLanguageId: language.id, learningLanguageTag: language.languageTag, switched };
  }
  return saveCapture(message, sender);
}

function originPattern(origin: string): string { return `${origin}/*`; }

async function detectTextLanguages(textSample: string): Promise<string[]> {
  const detection = await browser.i18n.detectLanguage(textSample).catch(() => undefined);
  if (!detection?.isReliable) return [];
  return detection.languages
    .filter((language) => language.language !== 'und' && language.percentage > 0)
    .sort((first, second) => second.percentage - first.percentage)
    .map((language) => canonicalLanguageTag(language.language))
    .filter((language): language is string => Boolean(language));
}

async function pageTextSample(tabId: number): Promise<string> {
  const [injection] = await browser.scripting.executeScript({
    args: [20_000],
    func: (maximumLength) => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, maximumLength),
    target: { tabId },
  });
  return typeof injection?.result === 'string' ? injection.result : '';
}

async function siteChoice(origin: string): Promise<{ choice?: SiteChoice; decided: boolean }> {
  const stored = await browser.storage.local.get(learningModeSiteKey(origin));
  const choice = stored[learningModeSiteKey(origin)];
  return typeof choice === 'object' && choice !== null && 'enabled' in choice
    ? { choice: choice as SiteChoice, decided: true }
    : { decided: false };
}

async function syncExpressionSnapshot(learningLanguageId: string): Promise<LearningModeEntry[]> {
  const snapshot = await loadSnapshot();
  const language = selectedLanguage(snapshot, learningLanguageId);
  if (!language) throw new Error('Learning Language is unavailable.');
  const entries = language.vocabularyEntries.map((entry) => ({
    expression: entry.expression,
    id: entry.id,
    senses: entry.senses.map((sense) => ({
      examples: sense.examples.map((example) => example.text),
      translations: sense.translations.map((translation) => ({
        answerLanguageTag: translation.answerLanguageTag,
        text: translation.text,
      })),
    })),
    suspended: entry.suspended,
  }));
  await writeExpressionSnapshot(learningLanguageId, entries);
  return entries;
}

async function resolveSiteState(origin: string, detectedTags: string[]): Promise<LearningModeSiteState> {
  const { choice, decided } = await siteChoice(origin);
  const snapshot = await loadSnapshot().catch(() => ({ activeLearningLanguageId: null, learningLanguages: [] } as LearningLanguageSnapshot));
  const detected = snapshot.learningLanguages.find((language) => detectedTags.includes(language.languageTag));
  const selectedId = choice?.learningLanguageId ?? detected?.id ?? snapshot.activeLearningLanguageId ?? undefined;
  const permitted = await browser.permissions.contains({ origins: [originPattern(origin)] });
  return {
    decided,
    detectedLearningLanguageTag: detected?.languageTag ?? selectedLanguage(snapshot, selectedId)?.languageTag ?? detectedTags[0],
    enabled: Boolean(choice?.enabled),
    learningLanguages: languageOptions(snapshot),
    origin,
    permitted,
    selectedLearningLanguageId: selectedId,
  };
}

async function activeOrdinaryTab() {
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs.filter((tab) => tab.id && /^https?:\/\//.test(tab.url ?? ''))
    .sort((first, second) => (second.lastAccessed ?? 0) - (first.lastAccessed ?? 0))[0];
}

async function popupState(): Promise<LearningModeSiteState> {
  const tab = await activeOrdinaryTab();
  if (!tab?.id || !tab.url) return { decided: false, enabled: false, learningLanguages: [], permitted: false };
  const origin = new URL(tab.url).origin;
  const tags = await detectTextLanguages(await pageTextSample(tab.id).catch(() => ''));
  return { ...await resolveSiteState(origin, tags), tabId: tab.id };
}

async function injectLearningMode(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ files: ['/learning-mode.js'], target: { tabId } });
}

function learningModeRegistrationId(origin: string): string {
  let hash = 0;
  for (const character of origin) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return `lexync-learning-${Math.abs(hash)}`;
}

async function updateLearningModeRegistration(origin: string, enabled: boolean): Promise<void> {
  const id = learningModeRegistrationId(origin);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) await browser.scripting.unregisterContentScripts({ ids: [id] });
  if (enabled) await browser.scripting.registerContentScripts([{
    id, js: ['learning-mode.js'], matches: [originPattern(origin)], persistAcrossSessions: true, runAt: 'document_idle',
  }]);
}

async function refreshAction(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url || !/^https?:\/\//.test(tab.url)) return;
  const url = new URL(tab.url);
  if (url.hostname === 'duolingo.com' || url.hostname.endsWith('.duolingo.com')
    || url.hostname === 'clozemaster.com' || url.hostname.endsWith('.clozemaster.com')) {
    await browser.action.setBadgeText({ tabId, text: '' });
    await browser.action.setTitle({ tabId, title: 'Lexync' });
    return;
  }
  const { choice, decided } = await siteChoice(url.origin);
  if (choice?.enabled) {
    await browser.action.setBadgeText({ tabId, text: '' });
    await injectLearningMode(tabId).catch(() => undefined);
    return;
  }
  if (decided) {
    await browser.action.setBadgeText({ tabId, text: '' });
    await browser.action.setTitle({ tabId, title: 'Lexync' });
    return;
  }
  const tags = await detectTextLanguages(await pageTextSample(tabId).catch(() => ''));
  const snapshot = await loadSnapshot().catch(() => undefined);
  const available = Boolean(snapshot?.learningLanguages.some((language) => tags.includes(language.languageTag)));
  await browser.action.setBadgeText({ tabId, text: available ? 'NEW' : '' });
  await browser.action.setTitle({ tabId, title: available ? 'Learning Mode is available' : 'Lexync' });
  if (available) await injectLearningMode(tabId).catch(() => undefined);
}

async function handleLearningMode(message: LearningModeMessage, sender: { tab?: { id?: number } }) {
  if (message.type === 'learning-mode:popup-state') return popupState();
  if (message.type === 'learning-mode:permission-granted') {
    await injectLearningMode(message.tabId);
    return { granted: true };
  }
  if (message.type === 'learning-mode:set-site') {
    const key = learningModeSiteKey(message.origin);
    await browser.storage.local.set({ [key]: { enabled: message.enabled, learningLanguageId: message.learningLanguageId } satisfies SiteChoice });
    await updateLearningModeRegistration(message.origin, message.enabled);
    if (!message.enabled) {
      const tabs = await browser.tabs.query({ url: originPattern(message.origin) });
      await Promise.all(tabs.map((tab) => tab.id ? browser.tabs.sendMessage(tab.id, { type: 'learning-mode:disable' }).catch(() => undefined) : undefined));
    }
    if (message.enabled && message.learningLanguageId) await syncExpressionSnapshot(message.learningLanguageId).catch(() => undefined);
    return { enabled: message.enabled };
  }
  if (message.type === 'learning-mode:start-capture') {
    if (sender.tab?.id) await browser.scripting.executeScript({ files: ['/ordinary-capture.js'], target: { tabId: sender.tab.id } });
    return {};
  }
  if (message.type === 'learning-mode:disable' || message.type === 'learning-mode:index-updated') return {};
  const tags = await detectTextLanguages(message.textSample);
  const state = await resolveSiteState(message.origin, tags);
  const entries = state.enabled && state.selectedLearningLanguageId
    ? await readExpressionSnapshot(state.selectedLearningLanguageId)
    : [];
  return { ...state, entries } satisfies LearningModeLoadResponse;
}

export default defineBackground(() => {
  supabase.auth.startAutoRefresh();
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return undefined;
    const operation = isClozemasterCaptureMessage(message)
      ? handleAdapterCapture(message, sender)
      : isDuolingoCaptureMessage(message)
        ? handleAdapterCapture(message, sender)
        : isOrdinaryCaptureMessage(message)
          ? handleOrdinaryCapture(message, sender)
          : isLearningModeMessage(message)
            ? handleLearningMode(message, sender)
            : undefined;
    if (!operation) return undefined;
    void operation.then(sendResponse).catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Capture could not be completed.' }));
    return true;
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') void refreshAction(tabId);
  });
});
