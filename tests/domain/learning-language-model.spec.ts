import { expect, test } from '@playwright/test';
import {
  deriveLanguagePairs,
  preferredAnswerLanguage,
  requireSingleLearningLanguage,
  type LearningCard,
  type TranslationLanguageUsage,
} from '../../packages/domain/src/index';

const usages: TranslationLanguageUsage[] = [
  {
    answerLanguageTag: 'en',
    learningLanguageTag: 'es',
    lastUsedAt: '2026-09-01T08:00:00.000Z',
    senseId: 'sense-one',
  },
  {
    answerLanguageTag: 'en',
    learningLanguageTag: 'es',
    lastUsedAt: '2026-09-01T09:00:00.000Z',
    senseId: 'sense-one',
  },
  {
    answerLanguageTag: 'uk',
    learningLanguageTag: 'es',
    lastUsedAt: '2026-09-01T10:00:00.000Z',
    senseId: 'sense-one',
  },
  {
    answerLanguageTag: 'uk',
    learningLanguageTag: 'es',
    lastUsedAt: '2026-09-01T11:00:00.000Z',
    senseId: 'sense-two',
  },
  {
    answerLanguageTag: 'en',
    learningLanguageTag: 'fr',
    lastUsedAt: '2026-09-01T12:00:00.000Z',
    senseId: 'sense-three',
  },
];

function card(overrides: Partial<LearningCard> = {}): LearningCard {
  return {
    answerLanguageTag: 'en',
    direction: 'recognition',
    id: 'card-one',
    learningLanguageId: 'spanish',
    senseId: 'sense-one',
    ...overrides,
  };
}

test.describe('Learning Language model', () => {
  test('derives unique Language Pairs from translations while preserving BCP 47 variants', () => {
    expect(deriveLanguagePairs(usages)).toEqual([
      { answerLanguageTag: 'en', learningLanguageTag: 'es' },
      { answerLanguageTag: 'uk', learningLanguageTag: 'es' },
      { answerLanguageTag: 'en', learningLanguageTag: 'fr' },
    ]);

    expect(deriveLanguagePairs([
      ...usages,
      { ...usages[0], answerLanguageTag: 'en-GB' },
      { ...usages[0], answerLanguageTag: 'en-US' },
    ])).toContainEqual({ answerLanguageTag: 'en-GB', learningLanguageTag: 'es' });
  });

  test('prefers the Answer Language used by the most distinct Senses', () => {
    expect(preferredAnswerLanguage(usages, 'es')).toBe('uk');
  });

  test('breaks a translated-Sense count tie by most recent usage then language tag', () => {
    expect(preferredAnswerLanguage([
      { ...usages[0], lastUsedAt: '2026-09-01T10:00:00.000Z' },
      { ...usages[2], lastUsedAt: '2026-09-01T11:00:00.000Z' },
    ], 'es')).toBe('uk');

    expect(preferredAnswerLanguage([
      { ...usages[0], lastUsedAt: '2026-09-01T10:00:00.000Z' },
      { ...usages[2], lastUsedAt: '2026-09-01T10:00:00.000Z' },
    ], 'es')).toBe('en');
  });

  test('allows Answer Languages and directions to mix but rejects Learning Language mixing', () => {
    expect(requireSingleLearningLanguage([
      card(),
      card({ answerLanguageTag: 'uk', direction: 'recall', id: 'card-two' }),
    ])).toBe('spanish');

    expect(() => requireSingleLearningLanguage([
      card(),
      card({ id: 'card-two', learningLanguageId: 'french' }),
    ])).toThrow('A session cannot mix Learning Languages.');
  });
});
