import { expect, test } from '@playwright/test';
import { resolveStudyPair, type StudyPair } from '../../packages/domain/src/index';

const pairs: StudyPair[] = [
  {
    id: 'portuguese-english',
    isPrimary: true,
    referenceLanguageTag: 'en',
    targetLanguageTag: 'pt-BR',
  },
  {
    id: 'portuguese-ukrainian',
    isPrimary: false,
    referenceLanguageTag: 'uk',
    targetLanguageTag: 'pt-BR',
  },
  {
    id: 'italian-english',
    isPrimary: true,
    referenceLanguageTag: 'en',
    targetLanguageTag: 'it',
  },
];

test.describe('Study Pair resolution', () => {
  test('prefers adapter languages over a remembered website choice and page detection', () => {
    const result = resolveStudyPair(pairs, {
      adapterLanguages: { referenceLanguageTag: 'uk', targetLanguageTag: 'pt-BR' },
      detectedTargetLanguageTag: 'it',
      detectionReliable: true,
      rememberedStudyPairId: 'italian-english',
    });

    expect(result).toEqual({ kind: 'resolved', studyPair: pairs[1] });
  });

  test('uses a remembered owned choice before reliable page detection', () => {
    const result = resolveStudyPair(pairs, {
      detectedTargetLanguageTag: 'it',
      detectionReliable: true,
      rememberedStudyPairId: 'portuguese-ukrainian',
    });

    expect(result).toEqual({ kind: 'resolved', studyPair: pairs[1] });
  });

  test('maps reliable detection to the primary pair for that Target Language', () => {
    const result = resolveStudyPair(pairs, {
      detectedTargetLanguageTag: 'pt-BR',
      detectionReliable: true,
    });

    expect(result).toEqual({ kind: 'resolved', studyPair: pairs[0] });
  });

  test('requires an explicit choice for unreliable or unmatched detection', () => {
    expect(resolveStudyPair(pairs, {
      detectedTargetLanguageTag: 'pt-BR',
      detectionReliable: false,
    })).toEqual({ kind: 'choice-required' });
    expect(resolveStudyPair(pairs, {
      detectedTargetLanguageTag: 'fr',
      detectionReliable: true,
    })).toEqual({ kind: 'choice-required' });
  });

  test('accepts only an existing owned explicit choice', () => {
    expect(resolveStudyPair(pairs, {
      explicitStudyPairId: 'italian-english',
    })).toEqual({ kind: 'resolved', studyPair: pairs[2] });
    expect(resolveStudyPair(pairs, {
      explicitStudyPairId: 'another-learners-pair',
    })).toEqual({ kind: 'choice-required' });
  });

  test('uses a replaced remembered website choice', () => {
    const first = resolveStudyPair(pairs, { rememberedStudyPairId: 'portuguese-english' });
    const replaced = resolveStudyPair(pairs, { rememberedStudyPairId: 'portuguese-ukrainian' });

    expect(first).toEqual({ kind: 'resolved', studyPair: pairs[0] });
    expect(replaced).toEqual({ kind: 'resolved', studyPair: pairs[1] });
  });
});
