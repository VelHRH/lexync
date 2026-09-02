import type { CaptureLearningLanguageResponse } from './learning-language-messages';

export type LoadDuolingoCaptureMessage = {
  answerLanguageTag: string;
  learningLanguageTag: string;
  type: 'duolingo-capture:load';
};
export type LoadDuolingoCaptureResponse = { error?: string; learningLanguageId?: string; switched?: boolean; learningLanguageTag?: string };
export type SaveDuolingoCaptureMessage = {
  answerLanguageTag: string;
  createNewSense?: boolean;
  example: string | null;
  expression: string;
  learningLanguageId: string;
  senseId?: string;
  translation: string;
  type: 'duolingo-capture:save';
};
export type SaveDuolingoCaptureResponse = CaptureLearningLanguageResponse;
export type DuolingoCaptureMessage = LoadDuolingoCaptureMessage | SaveDuolingoCaptureMessage;
export function isDuolingoCaptureMessage(value: unknown): value is DuolingoCaptureMessage {
  return typeof value === 'object' && value !== null && 'type' in value
    && (value.type === 'duolingo-capture:load' || value.type === 'duolingo-capture:save');
}
