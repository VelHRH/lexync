export type LoadDuolingoCaptureMessage = {
  referenceLanguageTag: string;
  targetLanguageTag: string;
  type: 'duolingo-capture:load';
};

export type LoadDuolingoCaptureResponse = {
  error?: string;
  studyPairId?: string;
};

export type SaveDuolingoCaptureMessage = {
  example: string | null;
  expression: string;
  studyPairId: string;
  translation: string;
  type: 'duolingo-capture:save';
};

export type SaveDuolingoCaptureResponse = {
  error?: string;
};

export type DuolingoCaptureMessage = LoadDuolingoCaptureMessage | SaveDuolingoCaptureMessage;

export function isDuolingoCaptureMessage(value: unknown): value is DuolingoCaptureMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  return value.type === 'duolingo-capture:load'
    || value.type === 'duolingo-capture:save';
}
