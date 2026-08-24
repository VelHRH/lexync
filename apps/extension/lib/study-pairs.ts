import type { StudyPair } from '@lexync/domain';

export type PairRow = {
  id: string;
  is_primary: boolean;
  reference_language_tag: string;
  target_language_tag: string;
};

export function toStudyPair(row: PairRow): StudyPair {
  return {
    id: row.id,
    isPrimary: row.is_primary,
    referenceLanguageTag: row.reference_language_tag,
    targetLanguageTag: row.target_language_tag,
  };
}

export function websiteStudyPairKey(origin: string): string {
  return `lexync.websiteStudyPair.${origin}`;
}
