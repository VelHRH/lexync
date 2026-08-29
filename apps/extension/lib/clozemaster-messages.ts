export type LoadClozemasterCaptureMessage = {
  referenceLanguageTag: string;
  targetLanguageTag: string;
  type: 'clozemaster-capture:load';
};

export type LoadClozemasterCaptureResponse = {
  error?: string;
  studyPairId?: string;
};

export type SaveClozemasterCaptureMessage = {
  example: string | null;
  expression: string;
  studyPairId: string;
  translation: string;
  type: 'clozemaster-capture:save';
};

export type SaveClozemasterCaptureResponse = {
  error?: string;
};

export type ClozemasterCaptureMessage = LoadClozemasterCaptureMessage | SaveClozemasterCaptureMessage;

export function isClozemasterCaptureMessage(value: unknown): value is ClozemasterCaptureMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  return value.type === 'clozemaster-capture:load'
    || value.type === 'clozemaster-capture:save';
}
