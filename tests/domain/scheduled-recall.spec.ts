import { expect, test } from '@playwright/test';
import * as domain from '../../packages/domain/src/index';

test.describe('Review recall domain contract', () => {
  test('does not expose independent recall or recognition schedules', () => {
    expect(domain).not.toHaveProperty('deriveRecognitionCardSchedule');
    expect(domain).not.toHaveProperty('selectDueRecognitionCards');
    expect(domain).not.toHaveProperty('scheduledReviewRetention');
  });

  test('accepts NFC-equivalent, case-insensitive, whitespace-trimmed answers and surrounding sentence punctuation', () => {
    expect(domain.isTypedRecallAnswerCorrect('  CAFÉ!  ', 'cafe\u0301')).toBe(true);
    for (const punctuation of ['.', ',', '!', '?', ';', ':']) {
      expect(domain.isTypedRecallAnswerCorrect(`${punctuation}casa${punctuation}`, 'casa')).toBe(true);
    }
    expect(domain.isTypedRecallAnswerCorrect('¿CASA?', 'casa')).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('¡casa!', 'casa')).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('casa', '  Casa,  ')).toBe(true);
  });

  test('accepts typographic apostrophe and dash variants without removing meaningful internal punctuation', () => {
    expect(domain.isTypedRecallAnswerCorrect('  don’t  ', "don't")).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('  donʼt  ', "don't")).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('mother–in‑law', 'mother-in-law')).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('mother—in‑law', 'mother-in-law')).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('dont', "don't")).toBe(false);
    expect(domain.isTypedRecallAnswerCorrect('mother in law', 'mother-in-law')).toBe(false);
  });

  test('rejects spelling changes and unrelated prompt text', () => {
    expect(domain.isTypedRecallAnswerCorrect('casa', 'casa')).toBe(true);
    expect(domain.isTypedRecallAnswerCorrect('caza', 'casa')).toBe(false);
    expect(domain.isTypedRecallAnswerCorrect('house', 'casa')).toBe(false);
  });
});
