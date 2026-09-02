import { expect, test } from '@playwright/test';
import { resolveAnswerLanguage } from '../../packages/domain/src/index';

test.describe('Answer Language resolution', () => {
  test('confirms adapter-provided exact variants without collapsing them', () => {
    expect(resolveAnswerLanguage({ adapterAnswerLanguageTag: 'en-GB' })).toEqual({
      answerLanguageTag: 'en-GB',
      confirmationRequired: false,
      confidence: 'confirmed',
      editable: false,
      source: 'adapter',
    });
  });

  test('returns a confident detector suggestion that remains editable', () => {
    expect(resolveAnswerLanguage({
      detectedAnswerLanguageTag: 'en-US',
      detectionConfidence: 0.92,
      detectionReliable: true,
    })).toEqual({
      answerLanguageTag: 'en-US',
      confirmationRequired: false,
      confidence: 'suggested',
      editable: true,
      source: 'detector',
    });
  });

  test('requires confirmation and uses the preferred fallback for uncertain detection', () => {
    expect(resolveAnswerLanguage({
      detectedAnswerLanguageTag: 'en-US',
      detectionConfidence: 0.1,
      detectionReliable: false,
      preferredAnswerLanguageTag: 'en-GB',
    })).toEqual({
      answerLanguageTag: 'en-GB',
      confirmationRequired: true,
      confidence: 'fallback',
      editable: true,
      source: 'detector',
    });
  });

  test('requires confirmation when no detector result or preferred language exists', () => {
    expect(resolveAnswerLanguage({})).toEqual({
      answerLanguageTag: null,
      confirmationRequired: true,
      confidence: 'fallback',
      editable: true,
      source: 'preferred',
    });
  });
});
