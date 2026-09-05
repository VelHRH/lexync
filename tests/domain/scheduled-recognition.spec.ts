import { expect, test } from '@playwright/test';
import {
  deriveRecognitionCardSchedule,
  scheduledReviewRetention,
  selectRecognitionChoices,
  selectDueRecognitionCards,
  type RecognitionChoice,
  type RecognitionChoiceCard,
} from '../../packages/domain/src/index';

const createdAt = '2026-09-01T08:00:00.000Z';
const reviewedAt = '2026-09-01T09:00:00.000Z';

function card(overrides: Partial<RecognitionChoiceCard> = {}): RecognitionChoiceCard {
  return {
    answerLanguageTag: 'en',
    createdAt,
    direction: 'recognition',
    events: [],
    expression: 'casa',
    id: 'card-one',
    learningLanguageId: 'spanish',
    referenceLanguageTag: 'en',
    senseId: 'sense-one',
    studyPairId: 'spanish-english',
    suspended: false,
    targetLanguageTag: 'es',
    translations: ['house'],
    ...overrides,
  };
}

test.describe('Scheduled Recognition domain', () => {
  test('selects four meaningful choices from eligible distinct Senses and deduplicates identities', () => {
    const current = card({ id: 'current', senseId: 'current-sense', translations: ['house'] });
    const choices: RecognitionChoice[] | null = selectRecognitionChoices(current, [
      current,
      card({ id: 'dog', expression: 'perro', senseId: 'dog-sense', translations: ['dog'] }),
      card({ id: 'book', expression: 'libro', senseId: 'book-sense', translations: ['book'] }),
      card({ id: 'table', expression: 'mesa', senseId: 'table-sense', translations: ['table'] }),
      card({ id: 'duplicate-dog', expression: 'can', senseId: 'duplicate-dog-sense', translations: [' DOG '] }),
      card({ id: 'suspended', expression: 'nube', senseId: 'suspended-sense', suspended: true, translations: ['cloud'] }),
      card({ id: 'other-language', expression: 'gatto', senseId: 'other-language-sense', learningLanguageId: 'italian', targetLanguageTag: 'it', translations: ['cat'] }),
      card({ id: 'other-answer', expression: 'fruta', senseId: 'other-answer-sense', answerLanguageTag: 'uk', referenceLanguageTag: 'uk', translations: ['фрукт'] }),
      card({ id: 'recall-dog', direction: 'recall', expression: 'perro', senseId: 'dog-sense', translations: ['dog'] }),
    ]);

    expect(choices).toHaveLength(4);
    expect(new Set(choices?.map((choice) => choice.text))).toEqual(new Set(['house', 'dog', 'book', 'table']));
    expect(new Set(choices?.map((choice) => choice.senseId))).toEqual(new Set(['current-sense', 'dog-sense', 'book-sense', 'table-sense']));
    expect(choices?.filter((choice) => choice.correct)).toEqual([{ correct: true, senseId: 'current-sense', text: 'house' }]);
  });

  test('falls back when fewer than three eligible distractors remain', () => {
    const current = card({ id: 'current', senseId: 'current-sense', translations: ['house'] });
    const choices: RecognitionChoice[] | null = selectRecognitionChoices(current, [
      current,
      card({ id: 'dog', expression: 'perro', senseId: 'dog-sense', translations: ['dog'] }),
      card({ id: 'book', expression: 'libro', senseId: 'book-sense', translations: ['book'] }),
      card({ id: 'duplicate-dog', expression: 'can', senseId: 'duplicate-dog-sense', translations: [' DOG '] }),
    ]);

    expect(choices).toBeNull();
  });

  test('keeps one independently scheduled recognition Card per active Sense', () => {
    const due = selectDueRecognitionCards([
      card(),
      card({ id: 'card-two', senseId: 'sense-two', translations: ['home'] }),
      card({ id: 'suspended', senseId: 'sense-three', suspended: true }),
      card({ id: 'other-pair', senseId: 'sense-four', studyPairId: 'italian-english' }),
    ], 'spanish-english', new Date(createdAt));

    expect(due.map((candidate) => candidate.id)).toEqual(['card-one', 'card-two']);
  });

  test('derives only the reviewed Card schedule with 90 percent desired retention', () => {
    const first = card({ events: [{ id: 'event-one', occurredAt: reviewedAt, rating: 'good' }] });
    const second = card({ id: 'card-two', senseId: 'sense-two' });
    const firstSchedule = deriveRecognitionCardSchedule(first);
    const secondSchedule = deriveRecognitionCardSchedule(second);

    expect(scheduledReviewRetention).toBe(0.9);
    expect(firstSchedule.reps).toBe(1);
    expect(firstSchedule.last_review?.toISOString()).toBe(reviewedAt);
    expect(firstSchedule.due.getTime()).toBeGreaterThan(new Date(reviewedAt).getTime());
    expect(secondSchedule.reps).toBe(0);
    expect(secondSchedule.due.toISOString()).toBe(createdAt);
  });

  test('replays chronological events deterministically', () => {
    const reviews = [
      { id: 'event-two', occurredAt: '2026-09-02T09:00:00.000Z', rating: 'hard' as const },
      { id: 'event-one', occurredAt: reviewedAt, rating: 'good' as const },
    ];

    expect(deriveRecognitionCardSchedule(card({ events: reviews }))).toEqual(
      deriveRecognitionCardSchedule(card({ events: [...reviews].reverse() })),
    );
  });
});
