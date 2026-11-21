import { expect, test } from '@playwright/test';
import { isVocabularyEntryLearningEligible } from '../../packages/domain/src/index';

test.describe('Vocabulary Entry learning eligibility', () => {
  test('excludes cross-pair material from Lesson selection', () => {
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english' }, 'spanish-english')).toBeTruthy();
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'italian-english' }, 'spanish-english')).toBeFalsy();
  });

  test('includes every Vocabulary Entry of the active Study Pair, even one that still reports suspension', () => {
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english', suspended: true } as { studyPairId: string }, 'spanish-english')).toBeTruthy();
  });

  test('excludes cross-pair material from Lesson distractors', () => {
    const activeStudyPairId = 'spanish-english';
    const candidates = [
      { id: 'active', studyPairId: activeStudyPairId },
      { id: 'formerly-suspended', studyPairId: activeStudyPairId },
      { id: 'other-pair', studyPairId: 'italian-english' },
    ];

    expect(candidates.filter((entry) => isVocabularyEntryLearningEligible(entry, activeStudyPairId)).map((entry) => entry.id)).toEqual(['active', 'formerly-suspended']);
  });
});
