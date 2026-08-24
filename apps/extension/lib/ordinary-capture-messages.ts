import type { StudyPair } from '@lexync/domain';

export type LoadOrdinaryCaptureMessage = {
  detectedTargetLanguageTag: string;
  origin: string;
  type: 'ordinary-capture:load';
};

export type SaveOrdinaryCaptureMessage = {
  example: string | null;
  expression: string;
  origin: string;
  studyPairId: string;
  translation: string;
  type: 'ordinary-capture:save';
};

export type OrdinaryCaptureMessage = LoadOrdinaryCaptureMessage | SaveOrdinaryCaptureMessage;

export type LoadOrdinaryCaptureResponse = {
  error?: string;
  pairs: StudyPair[];
  selectedStudyPairId?: string;
};

export type SaveOrdinaryCaptureResponse = {
  error?: string;
};

export function isOrdinaryCaptureMessage(value: unknown): value is OrdinaryCaptureMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  if (value.type === 'ordinary-capture:load') {
    return 'detectedTargetLanguageTag' in value
      && typeof value.detectedTargetLanguageTag === 'string'
      && 'origin' in value
      && typeof value.origin === 'string';
  }

  return value.type === 'ordinary-capture:save'
    && 'example' in value
    && (value.example === null || typeof value.example === 'string')
    && 'expression' in value
    && typeof value.expression === 'string'
    && 'origin' in value
    && typeof value.origin === 'string'
    && 'studyPairId' in value
    && typeof value.studyPairId === 'string'
    && 'translation' in value
    && typeof value.translation === 'string';
}
