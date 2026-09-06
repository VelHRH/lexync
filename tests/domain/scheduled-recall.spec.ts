import { expect, test } from '@playwright/test';
import { deriveRecognitionCardSchedule, isTypedRecallAnswerCorrect } from '../../packages/domain/src/index';

const createdAt = '2026-09-01T08:00:00.000Z';
const reviewedAt = '2026-09-01T09:00:00.000Z';

test.describe('Scheduled Recall domain', () => {
  test('derives recognition and recall schedules independently for one Sense', () => {
    const recognitionEvents = [{ id: 'recognition-event', occurredAt: reviewedAt, rating: 'again' as const }];
    const recallEvents = [{ id: 'recall-event', occurredAt: reviewedAt, rating: 'good' as const }];
    const initialRecognitionSchedule = deriveRecognitionCardSchedule({ createdAt, events: [] });
    const recognitionSchedule = deriveRecognitionCardSchedule({ createdAt, events: recognitionEvents });
    const recallSchedule = deriveRecognitionCardSchedule({ createdAt, events: recallEvents });

    expect(initialRecognitionSchedule.reps).toBe(0);
    expect(initialRecognitionSchedule.due.toISOString()).toBe(createdAt);
    expect(recallSchedule.reps).toBe(1);
    expect(recallSchedule.last_review?.toISOString()).toBe(reviewedAt);
    expect(recallSchedule.due.getTime()).toBeGreaterThan(new Date(createdAt).getTime());
    expect(recallSchedule).toEqual(deriveRecognitionCardSchedule({ createdAt, events: recallEvents }));
    expect(recognitionSchedule).toEqual(deriveRecognitionCardSchedule({ createdAt, events: recognitionEvents }));
    expect(recallSchedule).not.toEqual(recognitionSchedule);
    expect(initialRecognitionSchedule).toEqual(deriveRecognitionCardSchedule({ createdAt, events: [] }));
  });

  test('accepts NFC-equivalent, case-insensitive, whitespace-trimmed answers and surrounding sentence punctuation', () => {
    expect(isTypedRecallAnswerCorrect('  CAFÉ!  ', 'cafe\u0301')).toBe(true);
    for (const punctuation of ['.', ',', '!', '?', ';', ':']) {
      expect(isTypedRecallAnswerCorrect(`${punctuation}casa${punctuation}`, 'casa')).toBe(true);
    }
    expect(isTypedRecallAnswerCorrect('¿CASA?', 'casa')).toBe(true);
    expect(isTypedRecallAnswerCorrect('¡casa!', 'casa')).toBe(true);
    expect(isTypedRecallAnswerCorrect('casa', '  Casa,  ')).toBe(true);
  });

  test('accepts typographic apostrophe and dash variants without removing meaningful internal punctuation', () => {
    expect(isTypedRecallAnswerCorrect('  don’t  ', "don't")).toBe(true);
    expect(isTypedRecallAnswerCorrect('  donʼt  ', "don't")).toBe(true);
    expect(isTypedRecallAnswerCorrect('mother–in‑law', 'mother-in-law')).toBe(true);
    expect(isTypedRecallAnswerCorrect('mother—in‑law', 'mother-in-law')).toBe(true);
    expect(isTypedRecallAnswerCorrect('dont', "don't")).toBe(false);
    expect(isTypedRecallAnswerCorrect('mother in law', 'mother-in-law')).toBe(false);
  });

  test('rejects spelling changes and unrelated prompt text', () => {
    expect(isTypedRecallAnswerCorrect('casa', 'casa')).toBe(true);
    expect(isTypedRecallAnswerCorrect('caza', 'casa')).toBe(false);
    expect(isTypedRecallAnswerCorrect('house', 'casa')).toBe(false);
  });
});
