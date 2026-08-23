import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function createStudyPair(
  page: Page,
  targetLanguage: string,
  referenceLanguage: string,
) {
  const addButton = page.getByRole('button', { name: 'Add Study Pair' });

  if (await addButton.isVisible()) {
    await addButton.click();
  }

  await page.getByLabel('Target Language').fill(targetLanguage);
  await page.getByLabel('Reference Language').fill(referenceLanguage);
  await page.getByRole('button', { name: 'Create Study Pair' }).click();
  await expect(page.getByRole('button', { name: 'Add Study Pair' })).toBeVisible();
}

async function capture(
  page: Page,
  expression: string,
  translation: string,
  example: string,
) {
  await page.getByLabel('Expression').fill(expression);
  await page.getByLabel('Translation').fill(translation);
  await page.getByLabel('Example').fill(example);
  await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
}

test.describe('repeated capture enrichment', () => {
  test('enriches a matching Sense with another Example', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'fr', 'en');
    await capture(
      extensionPage,
      'CAFÉ AU LAIT',
      'Morning Drink',
      'Le café au lait est déjà prêt.',
    );
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await capture(
      extensionPage,
      ' cafe\u0301   au lait ',
      ' morning   drink ',
      'Elle commande un CAFÉ au lait.',
    );

    await expect(extensionPage.getByText('Existing Vocabulary Entry used')).toBeVisible();
    await expect(extensionPage.getByText('Existing Sense enriched')).toBeVisible();
    await expect(extensionPage.getByText('Elle commande un CAFÉ au lait.')).toBeVisible();
  });

  test('adds a personal Sense when the translation does not match', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'fr', 'en');
    await capture(extensionPage, 'vol', 'flight', 'Le vol part demain.');
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await capture(extensionPage, 'VOL', 'theft', 'Le vol du tableau reste inexpliqué.');

    await expect(extensionPage.getByText('Existing Vocabulary Entry used')).toBeVisible();
    await expect(extensionPage.getByText('New Sense added')).toBeVisible();
    await expect(extensionPage.getByText('theft', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('Le vol du tableau reste inexpliqué.')).toBeVisible();
  });

  test('keeps the same Expression independent across Study Pairs', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'fr', 'en');
    await createStudyPair(extensionPage, 'fr', 'uk');

    await extensionPage.getByLabel('Active Study Pair').selectOption({ label: 'French → English' });
    await capture(extensionPage, 'livre', 'book', 'Je lis un livre.');
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await extensionPage.getByLabel('Active Study Pair').selectOption({ label: 'French → Ukrainian' });
    await capture(extensionPage, 'LIVRE', 'книга', 'Ce LIVRE est à moi.');

    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();
    await expect(extensionPage.getByText('Ce LIVRE est à moi.')).toBeVisible();
    await expect(extensionPage.getByText(/source URL|page title|source application|provenance/i)).toHaveCount(0);
  });
});
