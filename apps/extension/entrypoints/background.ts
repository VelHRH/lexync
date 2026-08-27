import { resolveStudyPair, type StudyPair } from '@lexync/domain';
import { readExpressionSnapshot, writeExpressionSnapshot } from '../lib/learning-mode-index';
import {
  isDuolingoCaptureMessage,
  type DuolingoCaptureMessage,
  type LoadDuolingoCaptureResponse,
  type SaveDuolingoCaptureResponse,
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
  type SaveOrdinaryCaptureResponse,
} from '../lib/ordinary-capture-messages';
import { learningModeSiteKey, type PairRow, toStudyPair, websiteStudyPairKey } from '../lib/study-pairs';
import { supabase } from '../lib/supabase';

async function loadOrdinaryCapture(message: LoadOrdinaryCaptureMessage): Promise<LoadOrdinaryCaptureResponse> {
  let pairs: StudyPair[];

  try {
    pairs = await loadPairs();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Study Pairs could not be loaded.', pairs: [] };
  }
  const rememberedKey = websiteStudyPairKey(message.origin);
  const stored = await browser.storage.local.get(rememberedKey);
  const rememberedStudyPairId = typeof stored[rememberedKey] === 'string'
    ? stored[rememberedKey]
    : undefined;
  const resolution = resolveDetectedStudyPair(pairs, message.detectedTargetLanguageTag, rememberedStudyPairId);

  return {
    pairs,
    selectedStudyPairId: resolution.kind === 'resolved' ? resolution.studyPair.id : undefined,
  };
}

async function saveOrdinaryCapture(
  message: SaveOrdinaryCaptureMessage,
  sender: { tab?: { id?: number } },
): Promise<SaveOrdinaryCaptureResponse> {
  const { error } = await supabase.rpc('capture_manual_entry', {
    p_example: message.example,
    p_expression: message.expression,
    p_study_pair_id: message.studyPairId,
    p_translation: message.translation,
  });

  if (error) {
    return { error: error.message };
  }

  await browser.storage.local.set({ [websiteStudyPairKey(message.origin)]: message.studyPairId });
  const entries = await syncExpressionSnapshot(message.studyPairId);

  if (sender.tab?.id) {
    await browser.tabs.sendMessage(sender.tab.id, {
      entries,
      type: 'learning-mode:index-updated',
    }).catch(() => undefined);
  }
  return {};
}

async function handleOrdinaryCapture(message: OrdinaryCaptureMessage, sender: { tab?: { id?: number } }) {
  return message.type === 'ordinary-capture:load'
    ? loadOrdinaryCapture(message)
    : saveOrdinaryCapture(message, sender);
}

async function handleDuolingoCapture(
  message: DuolingoCaptureMessage,
  sender: { tab?: { id?: number } },
): Promise<LoadDuolingoCaptureResponse | SaveDuolingoCaptureResponse> {
  if (message.type === 'duolingo-capture:load') {
    const pairs = await loadPairs();
    const resolution = resolveStudyPair(pairs, {
      adapterLanguages: {
        referenceLanguageTag: message.referenceLanguageTag,
        targetLanguageTag: message.targetLanguageTag,
      },
    });
    return resolution.kind === 'resolved'
      ? { studyPairId: resolution.studyPair.id }
      : { error: 'Matching Study Pair is unavailable.' };
  }

  const { error } = await supabase.rpc('capture_manual_entry', {
    p_example: message.example,
    p_expression: message.expression,
    p_study_pair_id: message.studyPairId,
    p_translation: message.translation,
  });

  if (error) {
    return { error: error.message };
  }

  const entries = await syncExpressionSnapshot(message.studyPairId);
  if (sender.tab?.id) {
    await browser.tabs.sendMessage(sender.tab.id, {
      entries,
      type: 'learning-mode:index-updated',
    }).catch(() => undefined);
  }
  return {};
}

type EntryRow = {
  expression: string;
  id: string;
  suspended: boolean;
  senses: Array<{
    examples: Array<{ text: string }>;
    translations: Array<{ text: string }>;
  }>;
};

type SiteChoice = {
  enabled: boolean;
  studyPairId?: string;
};

function originPattern(origin: string): string {
  return `${origin}/*`;
}

async function loadPairs() {
  const { data, error } = await supabase
    .from('study_pairs')
    .select('id, is_primary, target_language_tag, reference_language_tag')
    .order('created_at');

  if (error) {
    throw error;
  }

  return (data as PairRow[]).map(toStudyPair);
}

function resolveDetectedStudyPair(
  pairs: StudyPair[],
  detectedTargetLanguageTags: string | string[],
  rememberedStudyPairId?: string,
) {
  const rememberedResolution = resolveStudyPair(pairs, { rememberedStudyPairId });

  if (rememberedResolution.kind === 'resolved') {
    return rememberedResolution;
  }

  for (const detectedTargetLanguageTag of [detectedTargetLanguageTags].flat()) {
    const resolution = resolveStudyPair(pairs, {
      detectedTargetLanguageTag,
      detectionReliable: Boolean(detectedTargetLanguageTag && detectedTargetLanguageTag !== 'und'),
    });

    if (resolution.kind === 'resolved') {
      return resolution;
    }
  }

  return rememberedResolution;
}

async function detectTextLanguages(textSample: string): Promise<string[]> {
  if (!textSample.trim()) {
    return [];
  }

  const detection = await browser.i18n.detectLanguage(textSample).catch(() => undefined);

  if (!detection?.isReliable) {
    return [];
  }

  return detection.languages
    .filter((language) => language.language !== 'und' && language.percentage > 0)
    .sort((first, second) => second.percentage - first.percentage)
    .map((language) => language.language);
}

async function pageTextSample(tabId: number): Promise<string> {
  const [injection] = await browser.scripting.executeScript({
    args: [20_000],
    func: (maximumLength) => (document.body?.innerText ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maximumLength),
    target: { tabId },
  });

  return typeof injection?.result === 'string' ? injection.result : '';
}

async function siteChoice(origin: string): Promise<{ choice?: SiteChoice; decided: boolean }> {
  const key = learningModeSiteKey(origin);
  const stored = await browser.storage.local.get(key);
  const choice = stored[key];
  return typeof choice === 'object' && choice !== null && 'enabled' in choice
    ? { choice: choice as SiteChoice, decided: true }
    : { decided: false };
}

async function syncExpressionSnapshot(studyPairId: string): Promise<LearningModeEntry[]> {
  const pairs = await loadPairs();
  const selectedPair = pairs.find((pair) => pair.id === studyPairId);

  if (!selectedPair) {
    throw new Error('Study Pair is unavailable.');
  }

  const targetStudyPairIds = pairs
    .filter((pair) => pair.targetLanguageTag === selectedPair.targetLanguageTag)
    .map((pair) => pair.id);
  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, suspended, senses(translations(text), examples(text))')
    .in('study_pair_id', targetStudyPairIds)
    .order('created_at');

  if (error) {
    throw error;
  }

  const entries = (data as EntryRow[]).map((entry) => ({
    expression: entry.expression,
    id: entry.id,
    senses: entry.senses.map((sense) => ({
      examples: sense.examples.map((example) => example.text),
      translations: sense.translations.map((translation) => translation.text),
    })),
    suspended: entry.suspended,
  }));
  for (const pairId of targetStudyPairIds) {
    await writeExpressionSnapshot(pairId, entries);
  }
  return entries;
}

async function resolveSiteState(origin: string, detectedTargetLanguageTags: string[]): Promise<LearningModeSiteState> {
  const { choice, decided } = await siteChoice(origin);
  const pairs = choice?.studyPairId ? [] : await loadPairs().catch(() => []);
  const storedPairKey = websiteStudyPairKey(origin);
  const stored = await browser.storage.local.get(storedPairKey);
  const rememberedStudyPairId = typeof stored[storedPairKey] === 'string' ? stored[storedPairKey] : undefined;
  const resolution = resolveDetectedStudyPair(pairs, detectedTargetLanguageTags, rememberedStudyPairId);
  const selectedStudyPairId = choice?.studyPairId
    ?? (resolution.kind === 'resolved' ? resolution.studyPair.id : undefined);
  const permitted = await browser.permissions.contains({ origins: [originPattern(origin)] });

  return {
    decided,
    detectedTargetLanguageTag: resolution.kind === 'resolved'
      ? resolution.studyPair.targetLanguageTag
      : detectedTargetLanguageTags[0],
    enabled: Boolean(choice?.enabled),
    origin,
    pairs,
    permitted,
    selectedStudyPairId,
  };
}

async function activeOrdinaryTab() {
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab) => tab.id && /^https?:\/\//.test(tab.url ?? ''))
    .sort((first, second) => (second.lastAccessed ?? 0) - (first.lastAccessed ?? 0))[0];
}

async function popupState(): Promise<LearningModeSiteState> {
  const tab = await activeOrdinaryTab();

  if (!tab?.id || !tab.url) {
    return { decided: false, enabled: false, pairs: [], permitted: false };
  }

  const origin = new URL(tab.url).origin;
  const textSample = await pageTextSample(tab.id).catch(() => '');
  const detectedTargetLanguageTags = await detectTextLanguages(textSample);
  return { ...await resolveSiteState(origin, detectedTargetLanguageTags), tabId: tab.id };
}

async function injectLearningMode(tabId: number): Promise<void> {
  await browser.scripting.executeScript({ files: ['/learning-mode.js'], target: { tabId } });
}

function learningModeRegistrationId(origin: string): string {
  let hash = 0;

  for (const character of origin) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }

  return `lexync-learning-${Math.abs(hash)}`;
}

async function updateLearningModeRegistration(origin: string, enabled: boolean): Promise<void> {
  const id = learningModeRegistrationId(origin);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });

  if (existing.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  }

  if (enabled) {
    await browser.scripting.registerContentScripts([{
      id,
      js: ['learning-mode.js'],
      matches: [originPattern(origin)],
      persistAcrossSessions: true,
      runAt: 'document_idle',
    }]);
  }
}

async function refreshAction(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);

  if (!tab?.url || !/^https?:\/\//.test(tab.url)) {
    return;
  }

  const url = new URL(tab.url);
  const origin = url.origin;

  if (url.hostname === 'duolingo.com' || url.hostname.endsWith('.duolingo.com')) {
    await browser.action.setBadgeText({ tabId, text: '' });
    await browser.action.setTitle({ tabId, title: 'Lexync' });
    return;
  }

  const { choice, decided } = await siteChoice(origin);

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

  const textSample = await pageTextSample(tabId).catch(() => '');
  const detectedTargetLanguageTags = await detectTextLanguages(textSample);

  try {
    const pairs = await loadPairs();
    const resolution = resolveDetectedStudyPair(pairs, detectedTargetLanguageTags);
    const available = resolution.kind === 'resolved';
    await browser.action.setBadgeText({ tabId, text: available ? 'NEW' : '' });
    await browser.action.setTitle({ tabId, title: available ? 'Learning Mode is available' : 'Lexync' });

    if (available) {
      await injectLearningMode(tabId).catch(() => undefined);
    }
  } catch {
    await browser.action.setBadgeText({ tabId, text: '' });
  }
}

async function handleLearningMode(message: LearningModeMessage, sender: { tab?: { id?: number } }) {
  if (message.type === 'learning-mode:popup-state') {
    return popupState();
  }

  if (message.type === 'learning-mode:permission-granted') {
    await injectLearningMode(message.tabId);
    return { granted: true };
  }

  if (message.type === 'learning-mode:set-site') {
    const key = learningModeSiteKey(message.origin);
    await browser.storage.local.set({
      [key]: { enabled: message.enabled, studyPairId: message.studyPairId } satisfies SiteChoice,
      ...(message.studyPairId ? { [websiteStudyPairKey(message.origin)]: message.studyPairId } : {}),
    });
    await updateLearningModeRegistration(message.origin, message.enabled);

    if (!message.enabled) {
      const tabs = await browser.tabs.query({ url: originPattern(message.origin) });
      await Promise.all(tabs.map((tab) => tab.id
        ? browser.tabs.sendMessage(tab.id, { type: 'learning-mode:disable' }).catch(() => undefined)
        : undefined));
    }

    if (message.enabled && message.studyPairId) {
      await syncExpressionSnapshot(message.studyPairId).catch(() => undefined);
    }
    return { enabled: message.enabled };
  }

  if (message.type === 'learning-mode:start-capture') {
    if (sender.tab?.id) {
      await browser.scripting.executeScript({ files: ['/ordinary-capture.js'], target: { tabId: sender.tab.id } });
    }
    return {};
  }

  if (message.type === 'learning-mode:disable' || message.type === 'learning-mode:index-updated') {
    return {};
  }

  const detectedTargetLanguageTags = await detectTextLanguages(message.textSample);
  const state = await resolveSiteState(message.origin, detectedTargetLanguageTags);
  const entries = state.enabled && state.selectedStudyPairId
    ? await readExpressionSnapshot(state.selectedStudyPairId)
    : [];
  return { ...state, entries } satisfies LearningModeLoadResponse;
}

export default defineBackground(() => {
  supabase.auth.startAutoRefresh();
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) {
      return undefined;
    }

    const operation = isDuolingoCaptureMessage(message)
      ? handleDuolingoCapture(message, sender)
      : isOrdinaryCaptureMessage(message)
        ? handleOrdinaryCapture(message, sender)
        : isLearningModeMessage(message)
          ? handleLearningMode(message, sender)
          : undefined;

    if (!operation) {
      return undefined;
    }

    void operation
      .then(sendResponse)
      .catch((error) => sendResponse({
        error: error instanceof Error ? error.message : 'Capture could not be completed.',
      }));
    return true;
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      void refreshAction(tabId);
    }
  });
});
