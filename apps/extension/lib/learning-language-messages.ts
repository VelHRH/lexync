export type LearningLanguageTranslation = { answerLanguageTag: string; id: string; text: string };
export type LearningLanguageSense = { id: string; translations: LearningLanguageTranslation[] };
export type LearningLanguageOption = { id: string; languageTag: string; preferredAnswerLanguageTag?: string | null };
export type CaptureLearningLanguageSaved = {
  answerLanguageTag: string;
  example: string | null;
  expression: string;
  kind: 'saved';
  learningLanguageId: string;
  senseCreated: boolean;
  senseId: string;
  translation: string;
  translationCreated: boolean;
  translationId: string;
  vocabularyEntryCreated: boolean;
  vocabularyEntryId: string;
};
export type CaptureLearningLanguageNeedsSense = {
  expression: string;
  kind: 'needs_sense';
  learningLanguageId: string;
  senses: LearningLanguageSense[];
  vocabularyEntryId: string;
};
export type CaptureLearningLanguageResponse = CaptureLearningLanguageNeedsSense | CaptureLearningLanguageSaved | { error: string };
export type LearningLanguageSnapshot = {
  activeLearningLanguageId: string | null;
  learningLanguages: Array<LearningLanguageOption & {
    vocabularyEntries: Array<{
      expression: string;
      id: string;
      senses: Array<LearningLanguageSense & { examples: Array<{ id: string; text: string }> }>;
      suspended: boolean;
    }>;
  }>;
};
export function isCaptureNeedsSense(value: unknown): value is CaptureLearningLanguageNeedsSense {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'needs_sense' && 'senses' in value && Array.isArray(value.senses);
}
