import type { LearningLanguageOption } from './learning-language-messages';

export type LearningModeSense = {
  examples: string[];
  translations: Array<{ answerLanguageTag: string; text: string }>;
};
export type LearningModeEntry = { expression: string; id: string; senses: LearningModeSense[]; suspended?: boolean };
export type LearningModeSiteState = {
  decided: boolean;
  detectedLearningLanguageTag?: string;
  enabled: boolean;
  learningLanguages: LearningLanguageOption[];
  origin?: string;
  permitted: boolean;
  selectedLearningLanguageId?: string;
  tabId?: number;
};
export type LearningModeMessage =
  | { type: 'learning-mode:popup-state' }
  | { origin: string; tabId: number; type: 'learning-mode:permission-granted' }
  | { origin: string; textSample: string; type: 'learning-mode:load' }
  | { enabled: boolean; learningLanguageId?: string; origin: string; type: 'learning-mode:set-site' }
  | { type: 'learning-mode:disable' }
  | { entries: LearningModeEntry[]; type: 'learning-mode:index-updated' }
  | { type: 'learning-mode:start-capture' };
export type LearningModeLoadResponse = LearningModeSiteState & { entries: LearningModeEntry[]; error?: string };

export function isLearningModeMessage(value: unknown): value is LearningModeMessage {
  return typeof value === 'object' && value !== null && 'type' in value
    && typeof value.type === 'string' && value.type.startsWith('learning-mode:');
}
