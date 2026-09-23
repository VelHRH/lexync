import { expect, test } from '@playwright/test';
import { buildClozePrompt, clozeQuestionTargetCount } from '../../packages/domain/src/index';

test.describe('Cloze Questions', () => {
  test.describe('prompt eligibility', () => {
    test('replaces exactly one normalized whole-expression occurrence with a blank', () => {
      expect(buildClozePrompt('Quiero leer el libro nuevo.', 'libro')).toBe('Quiero leer el _____ nuevo.');
      expect(buildClozePrompt('¿Puedes visitar CAFE\u0301, por favor?', 'café')).toBe('¿Puedes visitar _____, por favor?');
      expect(buildClozePrompt('No quiero ECHAR DE MENOS a nadie.', 'echar de menos')).toBe('No quiero _____ a nadie.');
    });

    test('rejects missing, repeated, and partial-word occurrences', () => {
      expect(buildClozePrompt('La casa está lejos.', 'perro')).toBeNull();
      expect(buildClozePrompt('La casa casa necesita pintura.', 'casa')).toBeNull();
      expect(buildClozePrompt('La cafetería está abierta.', 'café')).toBeNull();
      expect(buildClozePrompt('Quiero amar esta canción.', 'mar')).toBeNull();
    });
  });

  test('targets half the session for eligible Cloze material and caps by candidates', () => {
    expect(clozeQuestionTargetCount(0, 4)).toBe(0);
    expect(clozeQuestionTargetCount(1, 4)).toBe(0);
    expect(clozeQuestionTargetCount(2, 4)).toBe(1);
    expect(clozeQuestionTargetCount(3, 4)).toBe(1);
    expect(clozeQuestionTargetCount(4, 1)).toBe(1);
    expect(clozeQuestionTargetCount(5, 4)).toBe(2);
    expect(clozeQuestionTargetCount(7, 2)).toBe(2);
  });
});
