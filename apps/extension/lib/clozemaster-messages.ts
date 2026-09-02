import type { CaptureLearningLanguageResponse } from './learning-language-messages';

export type LoadClozemasterCaptureMessage = {
  answerLanguageTag: string;
  learningLanguageTag: string;
  type: 'clozemaster-capture:load';
};
export type LoadClozemasterCaptureResponse = { error?: string; learningLanguageId?: string; switched?: boolean; learningLanguageTag?: string };
export type SaveClozemasterCaptureMessage = {
  answerLanguageTag: string;
  createNewSense?: boolean;
  example: string | null;
  expression: string;
  learningLanguageId: string;
  senseId?: string;
  translation: string;
  type: 'clozemaster-capture:save';
};
export type SaveClozemasterCaptureResponse = CaptureLearningLanguageResponse;
export type ClozemasterCaptureMessage = LoadClozemasterCaptureMessage | SaveClozemasterCaptureMessage;
export function isClozemasterCaptureMessage(value: unknown): value is ClozemasterCaptureMessage {
  return typeof value === 'object' && value !== null && 'type' in value
    && (value.type === 'clozemaster-capture:load' || value.type === 'clozemaster-capture:save');
}
