import { expect, test } from '@playwright/test';
import {
  deriveRecognitionCardSchedule,
  scheduledReviewRetention,
  selectDueRecognitionCards,
  type RecognitionCard,
} from '../../packages/domain/src/index';

const createdAt = '2026-09-01T08:00:00.000Z';
const reviewedAt = '2026-09-01T09:00:00.000Z';

function card(overrides: Partial<RecognitionCard> = {}): RecognitionCard {
  return {
    createdAt,
    events: [],
    expression: 'casa',
    id: 'card-one',
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
