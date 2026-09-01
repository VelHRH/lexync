import { expect, test } from '@playwright/test';
import { isVocabularyEntryLearningEligible } from '../../packages/domain/src/index';

test.describe('Vocabulary Entry learning eligibility', () => {
  test('excludes suspended and cross-pair material from Scheduled Review selection', () => {
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english', suspended: false }, 'spanish-english')).toBeTruthy();
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'spanish-english', suspended: true }, 'spanish-english')).toBeFalsy();
    expect(isVocabularyEntryLearningEligible({ studyPairId: 'italian-english', suspended: false }, 'spanish-english')).toBeFalsy();
  });

  test('excludes suspended and cross-pair material from recognition distractors', () => {
    const activeStudyPairId = 'spanish-english';
    const candidates = [
      { id: 'active', studyPairId: activeStudyPairId, suspended: false },
      { id: 'suspended', studyPairId: activeStudyPairId, suspended: true },
      { id: 'other-pair', studyPairId: 'italian-english', suspended: false },
    ];

    expect(candidates.filter((entry) => isVocabularyEntryLearningEligible(entry, activeStudyPairId)).map((entry) => entry.id)).toEqual(['active']);
  });
});
