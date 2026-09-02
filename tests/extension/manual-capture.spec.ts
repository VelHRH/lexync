import { expect, test } from './fixtures';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createLearningLanguage(learnerClient: SupabaseClient, languageTag = 'it') {
  const { error } = await learnerClient.rpc('create_learning_language', { p_language_tag: languageTag });
  if (error) throw error;
}

test.describe('manual extension capture', () => {
  test('creates a private Vocabulary Entry with a Sense, translation, and Example', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('incontro');
    await extensionPage.getByLabel('Translation').fill('meeting');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Example').fill('La città gli veniva incontro.');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'incontro' })).toBeVisible();
    await expect(extensionPage.getByText('English', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('meeting', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('La città gli veniva incontro.')).toBeVisible();
  });

  test('accepts an entry without an Example', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('svolta');
    await extensionPage.getByLabel('Translation').fill('turning point');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'svolta' })).toBeVisible();
    await expect(extensionPage.getByText('turning point', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('No Example added')).toBeVisible();
  });

  test('rejects invalid Answer Language tags and incomplete material', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('incontro');
    await extensionPage.getByLabel('Translation').fill('meeting');
    await extensionPage.getByLabel('Answer Language').fill('not_a_tag');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Enter a valid BCP 47 language tag.')).toBeVisible();

    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Expression').fill('');
    await extensionPage.getByLabel('Translation').fill('');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Expression is required.')).toBeVisible();
    await expect(extensionPage.getByText('Translation is required.')).toBeVisible();
  });
});
