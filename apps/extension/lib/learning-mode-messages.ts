import type { StudyPair } from '@lexync/domain';

export type LearningModeSense = {
  examples: string[];
  translations: string[];
};

export type LearningModeEntry = {
  expression: string;
  id: string;
  senses: LearningModeSense[];
  suspended?: boolean;
};

export type LearningModeSiteState = {
  decided: boolean;
  detectedTargetLanguageTag?: string;
  enabled: boolean;
  origin?: string;
  pairs: StudyPair[];
  permitted: boolean;
  selectedStudyPairId?: string;
  tabId?: number;
};

export type LearningModeMessage =
  | { type: 'learning-mode:popup-state' }
  | { origin: string; tabId: number; type: 'learning-mode:permission-granted' }
  | { detectedTargetLanguageTag: string; origin: string; type: 'learning-mode:load' }
  | { enabled: boolean; origin: string; studyPairId?: string; type: 'learning-mode:set-site' }
  | { type: 'learning-mode:start-capture' };

export type LearningModeLoadResponse = LearningModeSiteState & {
  entries: LearningModeEntry[];
  error?: string;
};

export function isLearningModeMessage(value: unknown): value is LearningModeMessage {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && typeof value.type === 'string'
    && value.type.startsWith('learning-mode:');
}
