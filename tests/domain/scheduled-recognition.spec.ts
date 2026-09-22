import { expect, test } from '@playwright/test';
import * as domain from '../../packages/domain/src/index';
import type { LearningCard } from '../../packages/domain/src/index';

test.describe('Review domain contract', () => {
  test('does not export scheduling, due-date, retention, or rating state', () => {
    expect(domain).not.toHaveProperty('deriveRecognitionCardSchedule');
    expect(domain).not.toHaveProperty('scheduledReviewRetention');
    expect(domain).not.toHaveProperty('selectDueRecognitionCards');
  });

  test('keeps Card identity at Sense, Answer Language, and direction', () => {
    const cards: LearningCard[] = [
      { id: 'recognition-en', learningLanguageId: 'spanish', senseId: 'sense-one', answerLanguageTag: 'en', direction: 'recognition' },
      { id: 'recall-en', learningLanguageId: 'spanish', senseId: 'sense-one', answerLanguageTag: 'en', direction: 'recall' },
      { id: 'recognition-uk', learningLanguageId: 'spanish', senseId: 'sense-one', answerLanguageTag: 'uk', direction: 'recognition' },
    ];

    expect(new Set(cards.map((card) => `${card.senseId}:${card.answerLanguageTag}:${card.direction}`)).size).toBe(3);
  });

  test('suspension excludes material from future Review eligibility', () => {
    expect(domain.isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english', suspended: false }, 'spanish-english')).toBe(true);
    expect(domain.isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english', suspended: true }, 'spanish-english')).toBe(false);
  });
});
