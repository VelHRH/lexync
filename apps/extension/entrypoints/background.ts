import { resolveStudyPair } from '@lexync/domain';
import { readExpressionSnapshot, writeExpressionSnapshot } from '../lib/learning-mode-index';
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
  const { data, error } = await supabase
    .from('study_pairs')
    .select('id, is_primary, target_language_tag, reference_language_tag')
    .order('created_at');

  if (error) {
    return { error: error.message, pairs: [] };
  }

  const pairs = (data as PairRow[]).map(toStudyPair);
  const rememberedKey = websiteStudyPairKey(message.origin);
  const stored = await browser.storage.local.get(rememberedKey);
  const rememberedStudyPairId = typeof stored[rememberedKey] === 'string'
    ? stored[rememberedKey]
    : undefined;
  const resolution = resolveStudyPair(pairs, {
    detectedTargetLanguageTag: message.detectedTargetLanguageTag,
    detectionReliable: Boolean(message.detectedTargetLanguageTag),
    rememberedStudyPairId,
  });

  return {
    pairs,
    selectedStudyPairId: resolution.kind === 'resolved' ? resolution.studyPair.id : undefined,
  };
}

async function saveOrdinaryCapture(message: SaveOrdinaryCaptureMessage): Promise<SaveOrdinaryCaptureResponse> {
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
  await syncExpressionSnapshot(message.studyPairId);
  return {};
}

async function handleOrdinaryCapture(message: OrdinaryCaptureMessage) {
  return message.type === 'ordinary-capture:load'
    ? loadOrdinaryCapture(message)
    : saveOrdinaryCapture(message);
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

async function siteChoice(origin: string): Promise<{ choice?: SiteChoice; decided: boolean }> {
  const key = learningModeSiteKey(origin);
  const stored = await browser.storage.local.get(key);
  const choice = stored[key];
  return typeof choice === 'object' && choice !== null && 'enabled' in choice
    ? { choice: choice as SiteChoice, decided: true }
    : { decided: false };
}

async function syncExpressionSnapshot(studyPairId: string): Promise<LearningModeEntry[]> {
  const { data, error } = await supabase
    .from('vocabulary_entries')
    .select('id, expression, suspended, senses(translations(text), examples(text))')
    .eq('study_pair_id', studyPairId)
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
  await writeExpressionSnapshot(studyPairId, entries);
  return entries;
}

async function resolveSiteState(origin: string, detectedTargetLanguageTag: string): Promise<LearningModeSiteState> {
  const { choice, decided } = await siteChoice(origin);
  const pairs = choice?.studyPairId ? [] : await loadPairs().catch(() => []);
  const storedPairKey = websiteStudyPairKey(origin);
  const stored = await browser.storage.local.get(storedPairKey);
  const rememberedStudyPairId = typeof stored[storedPairKey] === 'string' ? stored[storedPairKey] : undefined;
  const resolution = resolveStudyPair(pairs, {
    detectedTargetLanguageTag,
    detectionReliable: Boolean(detectedTargetLanguageTag && detectedTargetLanguageTag !== 'und'),
    rememberedStudyPairId,
  });
  const selectedStudyPairId = choice?.studyPairId
    ?? (resolution.kind === 'resolved' ? resolution.studyPair.id : undefined);
  const permitted = await browser.permissions.contains({ origins: [originPattern(origin)] });

  return {
    decided,
    detectedTargetLanguageTag: detectedTargetLanguageTag || undefined,
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
  const detectedTargetLanguageTag = await browser.tabs.detectLanguage(tab.id).catch(() => '');
  return { ...await resolveSiteState(origin, detectedTargetLanguageTag), tabId: tab.id };
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

  const origin = new URL(tab.url).origin;
  const permitted = await browser.permissions.contains({ origins: [originPattern(origin)] });

  if (permitted) {
    await injectLearningMode(tabId).catch(() => undefined);
    return;
  }

  const detectedTargetLanguageTag = await browser.tabs.detectLanguage(tabId).catch(() => '');

  try {
    const pairs = await loadPairs();
    const resolution = resolveStudyPair(pairs, {
      detectedTargetLanguageTag,
      detectionReliable: Boolean(detectedTargetLanguageTag && detectedTargetLanguageTag !== 'und'),
    });
    const available = resolution.kind === 'resolved';
    await browser.action.setBadgeText({ tabId, text: available ? 'NEW' : '' });
    await browser.action.setTitle({ tabId, title: available ? 'Learning Mode is available' : 'Lexync' });
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

  const state = await resolveSiteState(message.origin, message.detectedTargetLanguageTag);
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

    const operation = isOrdinaryCaptureMessage(message)
      ? handleOrdinaryCapture(message)
      : isLearningModeMessage(message)
        ? handleLearningMode(message, sender)
        : undefined;

    if (!operation) {
      return undefined;
    }

    void operation
      .then(sendResponse)
      .catch((error) => sendResponse({
        error: error instanceof Error ? error.message : 'Ordinary capture could not be completed.',
      }));
    return true;
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      void refreshAction(tabId);
    }
  });
});
