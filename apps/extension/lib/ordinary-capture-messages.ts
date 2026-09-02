import type { CaptureLearningLanguageResponse, LearningLanguageOption } from './learning-language-messages';

export type LoadOrdinaryCaptureMessage = { origin: string; type: 'ordinary-capture:load' };
export type DetectOrdinaryAnswerLanguageMessage = { text: string; type: 'ordinary-capture:detect-answer-language' };
export type SaveOrdinaryCaptureMessage = {
  answerLanguageTag: string;
  createNewSense?: boolean;
  example: string | null;
  expression: string;
  learningLanguageId: string;
  origin: string;
  senseId?: string;
  translation: string;
  type: 'ordinary-capture:save';
};
export type OrdinaryCaptureMessage = LoadOrdinaryCaptureMessage | DetectOrdinaryAnswerLanguageMessage | SaveOrdinaryCaptureMessage;
export type LoadOrdinaryCaptureResponse = {
  activeLearningLanguageId?: string;
  answerLanguageTag?: string;
  error?: string;
  learningLanguages: LearningLanguageOption[];
};
export type SaveOrdinaryCaptureResponse = CaptureLearningLanguageResponse;

export function isOrdinaryCaptureMessage(value: unknown): value is OrdinaryCaptureMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  if (value.type === 'ordinary-capture:load') return 'origin' in value && typeof value.origin === 'string';
  if (value.type === 'ordinary-capture:detect-answer-language') return 'text' in value && typeof value.text === 'string';
  return value.type === 'ordinary-capture:save'
    && 'answerLanguageTag' in value && typeof value.answerLanguageTag === 'string'
    && 'example' in value && (value.example === null || typeof value.example === 'string')
    && 'expression' in value && typeof value.expression === 'string'
    && 'learningLanguageId' in value && typeof value.learningLanguageId === 'string'
    && 'origin' in value && typeof value.origin === 'string'
    && 'translation' in value && typeof value.translation === 'string'
    && (!('createNewSense' in value) || value.createNewSense === undefined || typeof value.createNewSense === 'boolean')
    && (!('senseId' in value) || value.senseId === undefined || typeof value.senseId === 'string');
}
