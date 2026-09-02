import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createLearningLanguage(learnerClient: SupabaseClient, languageTag: string) {
  const { error } = await learnerClient.rpc('create_learning_language', { p_language_tag: languageTag });
  if (error) throw error;
}

async function capture(
  page: Page,
  expression: string,
  translation: string,
  example: string,
  answerLanguage = 'en',
) {
  await page.getByLabel('Expression').fill(expression);
  await page.getByLabel('Translation').fill(translation);
  await page.getByLabel('Answer Language').fill(answerLanguage);
  await page.getByLabel('Example').fill(example);
  await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
}

test.describe('repeated capture enrichment', () => {
  test('enriches a matching Sense with another Example', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'fr');
    await extensionPage.reload();
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

    await expect(extensionPage.getByText('Existing Sense enriched')).toBeVisible();
    await expect(extensionPage.getByText('Elle commande un CAFÉ au lait.')).toBeVisible();
  });

  test('enriches the existing Sense with another translation', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'fr');
    await extensionPage.reload();
    await capture(extensionPage, 'vol', 'flight', 'Le vol part demain.');
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await capture(extensionPage, 'VOL', 'theft', 'Le vol du tableau reste inexpliqué.');

    await expect(extensionPage.getByText('Existing Sense enriched')).toBeVisible();
    await expect(extensionPage.getByText('theft', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('Le vol du tableau reste inexpliqué.')).toBeVisible();
  });

  test('keeps the same Expression variants independent across Answer Languages', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'fr');
    await extensionPage.reload();
    await capture(extensionPage, 'livre', 'book', 'Je lis un livre.');
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await capture(extensionPage, 'LIVRE', 'книга', 'Ce LIVRE est à moi.', 'uk');

    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();
    await expect(extensionPage.getByText('Ce LIVRE est à moi.')).toBeVisible();
    await expect(extensionPage.getByText(/source URL|page title|source application|provenance/i)).toHaveCount(0);
  });
});
