import { resolveStudyPair } from '@lexync/domain';
import {
  isOrdinaryCaptureMessage,
  type LoadOrdinaryCaptureMessage,
  type LoadOrdinaryCaptureResponse,
  type OrdinaryCaptureMessage,
  type SaveOrdinaryCaptureMessage,
  type SaveOrdinaryCaptureResponse,
} from '../lib/ordinary-capture-messages';
import { type PairRow, toStudyPair, websiteStudyPairKey } from '../lib/study-pairs';
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
  return {};
}

async function handleOrdinaryCapture(message: OrdinaryCaptureMessage) {
  return message.type === 'ordinary-capture:load'
    ? loadOrdinaryCapture(message)
    : saveOrdinaryCapture(message);
}

export default defineBackground(() => {
  supabase.auth.startAutoRefresh();
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !isOrdinaryCaptureMessage(message)) {
      return undefined;
    }

    void handleOrdinaryCapture(message)
      .then(sendResponse)
      .catch((error) => sendResponse({
        error: error instanceof Error ? error.message : 'Ordinary capture could not be completed.',
      }));
    return true;
  });
});
