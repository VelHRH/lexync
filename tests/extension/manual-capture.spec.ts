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
    await extensionPage.getByLabel('Translation', { exact: true }).fill('meeting');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Example Optional', { exact: true }).fill('La città gli veniva incontro.');
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
    await extensionPage.getByLabel('Translation', { exact: true }).fill('turning point');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'svolta' })).toBeVisible();
    await expect(extensionPage.getByText('turning point', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('No Example added')).toBeVisible();
  });

  test('offers no Example Translation until an Example is written', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    const exampleTranslation = extensionPage.getByLabel('Example translation Optional', { exact: true });
    await expect(exampleTranslation).toBeDisabled();
    await extensionPage.getByLabel('Example Optional', { exact: true }).fill('Una svolta decisiva.');
    await expect(exampleTranslation).toBeEnabled();
  });

  test('stores an optional Example Translation in the Answer Language selected at capture', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('scoperta');
    await extensionPage.getByLabel('Translation', { exact: true }).fill('discovery');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Example Optional', { exact: true }).fill('Ogni scoperta cambia il viaggio.');
    await extensionPage.getByLabel('Example translation Optional', { exact: true }).fill('Every discovery changes the journey.');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'scoperta' })).toBeVisible();
    const { data, error } = await learnerClient
      .from('examples')
      .select('text, example_translations(text, answer_language_tag)')
      .eq('text', 'Ogni scoperta cambia il viaggio.')
      .single();
    if (error) throw error;
    expect(data).toEqual({
      text: 'Ogni scoperta cambia il viaggio.',
      example_translations: [{ text: 'Every discovery changes the journey.', answer_language_tag: 'en' }],
    });
  });

  test('saves an Example with no Example Translation', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('viaggio');
    await extensionPage.getByLabel('Translation', { exact: true }).fill('journey');
    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Example Optional', { exact: true }).fill('Il viaggio comincia qui.');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'viaggio' })).toBeVisible();
    const { data, error } = await learnerClient
      .from('examples')
      .select('text, example_translations(text)')
      .eq('text', 'Il viaggio comincia qui.')
      .single();
    if (error) throw error;
    expect(data).toEqual({ text: 'Il viaggio comincia qui.', example_translations: [] });
  });

  test('rejects invalid Answer Language tags and incomplete material', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient);
    await extensionPage.reload();
    await extensionPage.getByLabel('Expression').fill('incontro');
    await extensionPage.getByLabel('Translation', { exact: true }).fill('meeting');
    await extensionPage.getByLabel('Answer Language').fill('not_a_tag');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Enter a valid BCP 47 language tag.')).toBeVisible();

    await extensionPage.getByLabel('Answer Language').fill('en');
    await extensionPage.getByLabel('Expression').fill('');
    await extensionPage.getByLabel('Translation', { exact: true }).fill('');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Expression is required.')).toBeVisible();
    await expect(extensionPage.getByText('Translation is required.')).toBeVisible();
  });
});
