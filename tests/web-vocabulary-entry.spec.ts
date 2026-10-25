import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-vocabulary') {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerWithPair(account: ReturnType<typeof credentials>) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: pair, error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
  if (pairError) throw pairError;
  return { client, pair: pair as { id: string } };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function createEntry(client: Awaited<ReturnType<typeof registerWithPair>>['client'], pairId: string, expression: string, translation: string, example = '') {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function storedClipPath(client: Awaited<ReturnType<typeof registerWithPair>>['client']) {
  const { data, error } = await client.from('learning_vocabulary_entries').select('audio_clip_path').limit(1).single();
  if (error) throw error;
  return (data as { audio_clip_path: string | null }).audio_clip_path;
}

function audioClipControls(page: Page) {
  return page.getByRole('group', { name: 'Audio Clip' });
}

async function recordClip(page: Page) {
  await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
  const stop = audioClipControls(page).getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeEnabled();
  await stop.click();
}

async function expandEntry(page: Page, expression: string) {
  const summary = page.locator('summary').filter({ hasText: expression });
  await expect(summary).toBeVisible();
  await summary.click();
}

async function openEditor(page: Page, expression: string) {
  await expandEntry(page, expression);
  await page.getByRole('button', { name: `Edit ${expression}` }).click();
  await expect(audioClipControls(page)).toBeVisible();
}

test.describe('web Vocabulary Entry library', () => {
  test('searches and filters only the active Learning Language', async ({ page }) => {
    const account = credentials('web-discovery');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');
    const suspended = await createEntry(client, pair.id, 'nube', 'cloud');
    const { error: suspensionError } = await client.rpc('set_vocabulary_entry_suspended', { p_suspended: true, p_vocabulary_entry_id: suspended.vocabularyEntryId });
    if (suspensionError) throw suspensionError;
    const { data: otherPair, error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'it', p_reference_language_tag: 'en' });
    if (pairError) throw pairError;
    await createEntry(client, (otherPair as { id: string }).id, 'casa italiana', 'Italian house');

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('house');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.getByText('casa italiana', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('nube');
    await expect(page.locator('summary').filter({ hasText: 'nube' })).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
    await page.getByLabel('Vocabulary status').selectOption('active');
    await expect(page.getByText('No active Vocabulary Entries match “nube”.')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.getByText('nube', { exact: true })).toHaveCount(0);
    await page.getByLabel('Vocabulary status').selectOption('suspended');
    await expect(page.locator('summary').filter({ hasText: 'nube' })).toBeVisible();
    await expect(page.getByText('casa', { exact: true })).toHaveCount(0);
    const { data: languages, error: languagesError } = await client.from('learning_languages').select('id,language_tag');
    if (languagesError) throw languagesError;
    const italian = languages?.find((language) => language.language_tag === 'it');
    if (!italian) throw new Error('The Italian Learning Language fixture is missing.');
    await selectLearningLanguage(page, italian.id);
    await expect(page.getByLabel('Vocabulary status')).toHaveValue('all');
    await page.getByLabel('Vocabulary status').selectOption('suspended');
    await expect(page.getByLabel('Vocabulary status')).toHaveValue('suspended');
    await expect(page.getByText('No suspended Vocabulary Entries yet.')).toBeVisible();
    await page.getByLabel('Vocabulary status').selectOption('all');
    await expect(page.locator('summary').filter({ hasText: 'casa italiana' })).toBeVisible();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('distinguishes an empty library from search results', async ({ page }) => {
    const account = credentials('web-empty');
    const { client } = await registerWithPair(account);
    const { error } = await client.rpc('create_study_pair', { p_target_language_tag: 'it', p_reference_language_tag: 'en' });
    if (error) throw error;
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.getByText('No vocabulary entries yet. Add your first one.')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('missing');
    await expect(page.getByText('No Vocabulary Entries match “missing”.')).toBeVisible();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('suspends and resumes an Entry without losing its details', async ({ page }) => {
    const account = credentials('web-suspension');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    const summary = page.locator('summary').filter({ hasText: 'descubrir' });
    await summary.focus();
    await page.keyboard.press('Enter');
    const entry = summary.locator('..');
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
    await expect(entry.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    const suspend = page.getByRole('button', { name: 'Suspend descubrir' });
    await suspend.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'descubrir is suspended.' })).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
    await expect(entry.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    const resume = page.getByRole('button', { name: 'Resume descubrir' });
    await resume.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'descubrir is active.' })).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toHaveCount(0);
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
  });

  test('keeps an open Add Vocabulary draft through rerenders and tab switches', async ({ page }) => {
    const account = credentials('web-vocabulary-draft');
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('to discover');
    await page.getByLabel('Example').fill('Quiero descubrir la ciudad.');

    await page.getByLabel('Vocabulary status').selectOption('active');
    await expect(page.getByLabel('Vocabulary status')).toHaveValue('active');

    const secondPage = await page.context().newPage();
    await secondPage.goto('/');
    await secondPage.bringToFront();
    await page.bringToFront();

    await expect(page.getByLabel('Expression')).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('descubrir');
    await expect(page.getByLabel('Answer Language')).toHaveValue('en');
    await expect(page.getByLabel('Translation')).toHaveValue('to discover');
    await expect(page.getByLabel('Example')).toHaveValue('Quiero descubrir la ciudad.');
    await secondPage.close();
  });

  test('creates repeated entries without navigation and preserves validation values', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    const unloadMarker = `web-vocabulary-unload-${crypto.randomUUID()}`;
    await page.evaluate((key) => {
      window.addEventListener('beforeunload', () => {
        window.sessionStorage.setItem(key, 'unloaded');
      });
    }, unloadMarker);
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      await expect(page.getByLabel('Expression')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('to discover');
    await page.getByLabel('Example').fill('Quiero descubrir la ciudad.');
    await page.evaluate((key) => window.sessionStorage.removeItem(key), unloadMarker);
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.locator('summary').filter({ hasText: 'descubrir' })).toBeVisible();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), unloadMarker)).toBeNull();
    await expect(page).toHaveURL('/library');

    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByRole('heading', { name: 'descubrir' })).toBeVisible();
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation')).toHaveValue('');
    await expect(page.getByLabel('Example')).toHaveValue('');
    await page.getByLabel('Expression').fill('fallo');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('failure');
    await page.getByLabel('Example').fill('Esto es un fallo.');
    await page.evaluate((key) => window.sessionStorage.removeItem(key), unloadMarker);
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'fallo' })).toBeVisible();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), unloadMarker)).toBeNull();
    await expect(page).toHaveURL('/library');

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation')).toHaveValue('');
    await expect(page.getByLabel('Example')).toHaveValue('');
    await page.route('**/rest/v1/rpc/capture_learning_language_entry', (route) => route.abort());
    await page.getByLabel('Expression').fill('error');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('mistake');
    await page.getByLabel('Example').fill('Es un error menor.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('error');
    await expect(page.getByLabel('Answer Language')).toHaveValue('en');
    await expect(page.getByLabel('Translation')).toHaveValue('mistake');
    await expect(page.getByLabel('Example')).toHaveValue('Es un error menor.');
    await page.unroute('**/rest/v1/rpc/capture_learning_language_entry');
    await page.getByLabel('Answer Language').fill('not_a_language');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid BCP 47 Answer Language tag.' })).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('error');
    await expect(page.getByLabel('Answer Language')).toHaveValue('not_a_language');
    await expect(page.getByLabel('Translation')).toHaveValue('mistake');
    await expect(page.getByLabel('Example')).toHaveValue('Es un error menor.');
  });

  test('reuses equivalent expressions and enriches the existing entry', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('Casa');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('house');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'Casa' })).toBeVisible();
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toBeVisible();
    await page.getByLabel('Expression').fill(' casa ');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('home');
    await page.getByLabel('Example').fill('Mi casa es pequeña.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    const entry = page.locator('summary').filter({ hasText: 'Casa' });
    await entry.click();
    const entryDetails = entry.locator('..');
    await expect(entryDetails.getByRole('heading', { name: 'Casa' })).toHaveCount(1);
    await expect(entryDetails.getByText(/^house en$/)).toBeVisible();
    await expect(entryDetails.getByText(/^home en$/)).toBeVisible();
    await expect(entryDetails.getByText('Mi casa es pequeña.')).toBeVisible();
  });

  test('cancels an Add Vocabulary draft and clears it on reopen', async ({ page }) => {
    const account = credentials('web-vocabulary-cancel');
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('cancelar');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('cancel');
    await page.getByLabel('Example').fill('Cancelar esta captura.');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation')).toHaveValue('');
    await expect(page.getByLabel('Example')).toHaveValue('');
  });

  test('shows extension material only to its owner', async ({ page }) => {
    const owner = credentials('web-owner');
    const { client, pair } = await registerWithPair(owner);
    const { error } = await client.rpc('capture_manual_entry', {
      p_expression: 'biblioteca',
      p_example: 'La biblioteca abre temprano.',
      p_study_pair_id: pair.id,
      p_translation: 'library',
    });
    if (error) throw error;
    await signIn(page, owner);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'biblioteca' }).click();
    const entry = page.locator('summary').filter({ hasText: 'biblioteca' }).locator('..');
    await expect(entry.getByRole('heading', { name: 'biblioteca' })).toBeVisible();
    await expect(entry.getByText(/^library en$/)).toBeVisible();

    const other = credentials('web-other');
    const { client: otherClient } = await registerWithPair(other);
    const { error: ownershipError } = await otherClient.rpc('capture_manual_entry', { p_expression: 'intruso', p_study_pair_id: pair.id, p_translation: 'intruder' });
    expect(ownershipError).toBeTruthy();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, other);
    await page.goto('/library');
    await expect(page.getByText('biblioteca', { exact: true })).toHaveCount(0);
  });

  test('corrects Senses, translations, and Examples as one aggregate', async ({ page }) => {
    const account = credentials('web-editor');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Esta ciudad es fácil de descubrir.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Expression').fill('descubrir algo');
    await page.getByLabel('Sense 1 translation 1').fill('discover');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 2').fill('find out');
    await page.getByRole('button', { name: 'Add Sense' }).click();
    await page.getByLabel('Sense 2 translation 1').fill('uncover');
    await page.getByRole('button', { name: 'Remove Example 2' }).click();
    await page.getByLabel('Example 1 text').fill('Quiero descubrir algo nuevo.');
    await page.getByLabel('Example 1 Sense').selectOption({ label: 'Sense 2 · uncover' });
    await page.getByRole('button', { name: 'Add Example to Sense 2' }).click();
    await page.getByLabel('Example 2 text').fill('Descubrimos la respuesta.');
    await page.getByRole('button', { name: 'Save changes' }).press('Enter');

    const updatedEntry = page.locator('summary').filter({ hasText: 'descubrir algo' });
    await updatedEntry.click();
    const updatedDetails = updatedEntry.locator('..');
    await expect(updatedDetails.getByRole('heading', { name: 'descubrir algo' })).toBeVisible();
    await expect(updatedDetails.getByText(/^discover en$/)).toBeVisible();
    await expect(updatedDetails.getByText(/^find out en$/)).toBeVisible();
    await expect(updatedDetails.getByText(/^uncover en$/)).toBeVisible();
    await expect(updatedDetails.getByText('Quiero descubrir algo nuevo.')).toBeVisible();

    const { data: snapshot, error } = await client.rpc('account_vocabulary_snapshot');
    if (error) throw error;
    expect(JSON.stringify(snapshot)).toContain('descubrir algo');
    expect(JSON.stringify(snapshot)).toContain('Quiero descubrir algo nuevo.');
    expect(JSON.stringify(snapshot)).not.toContain('Esta ciudad es fácil de descubrir.');
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('keeps invalid and unsaved aggregate changes recoverable', async ({ page }) => {
    const account = credentials('web-validation');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house', 'La casa es azul.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'casa' }).click();
    await page.getByRole('button', { name: 'Edit casa' }).click();
    await page.getByRole('button', { name: 'Remove translation 1 from Sense 1' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Each Sense needs at least one translation.' })).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('casa');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 1').fill('house');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 2').fill(' HOUSE ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Translations in a Sense must be distinct.' })).toBeVisible();
    await page.getByLabel('Sense 1 translation 2').fill('home');
    await page.route('**/rest/v1/rpc/update_vocabulary_entry', (route) => route.abort());
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Changes could not be saved' })).toBeVisible();
    await expect(page.getByLabel('Sense 1 translation 2')).toHaveValue('home');
  });

  test('supports keyboard-only correction and confirmed deletion', async ({ page }) => {
    const account = credentials('web-keyboard');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'teclado', 'keyboard');
    await signIn(page, account);
    await page.goto('/library');
    const summary = page.locator('summary').filter({ hasText: 'teclado' });
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit teclado' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByLabel('Expression').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('teclado nuevo');
    await page.getByRole('button', { name: 'Save changes' }).focus();
    await page.keyboard.press('Enter');
    const updatedSummary = page.locator('summary').filter({ hasText: 'teclado nuevo' });
    await updatedSummary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit teclado nuevo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Suspend teclado nuevo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Delete teclado nuevo' })).toBeFocused();
    page.once('dialog', (dialog) => dialog.accept());
    await page.keyboard.press('Enter');
    await expect(page.getByText('teclado nuevo', { exact: true })).toHaveCount(0);
  });

  test('disables mutation offline and deletes one Entry with explicit consequences', async ({ page }) => {
    const account = credentials('web-delete');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'borrar', 'delete', 'Voy a borrar esto.');
    await createEntry(client, pair.id, 'guardar', 'keep');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'borrar' }).click();
    await page.context().setOffline(true);
    await expect(page.getByRole('button', { name: 'Add vocabulary' })).toBeDisabled();
    await expect(page.getByLabel('Add vocabulary unavailable offline')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit borrar' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete borrar' })).toBeDisabled();
    await expect(page.getByText('You are offline. Vocabulary and Collection changes require a connection.')).toBeVisible();
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Senses, translations, Examples, and learning progress');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Delete borrar' }).click();
    await expect(page.getByText('borrar', { exact: true })).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'guardar' })).toBeVisible();
  });

  test('writes a translation for an Example and sees it after saving and reloading', async ({ page }) => {
    const account = credentials('web-example-translation');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toBeVisible();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await expect(page.getByLabel('Example 1 translation', { exact: true })).toHaveValue('I want to discover the city.');
  });

  test('edits an existing Example Translation', async ({ page }) => {
    const account = credentials('web-example-translation-edit');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I wish to explore the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I wish to explore the city\. en$/)).toBeVisible();
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toHaveCount(0);
  });

  test('clearing the field removes the translation and keeps the Example', async ({ page }) => {
    const account = credentials('web-example-translation-clear');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toHaveCount(0);
    await expect(entry.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await expect(page.getByLabel('Example 1 translation', { exact: true })).toHaveValue('');
  });

  test('saves an Example that has no translation', async ({ page }) => {
    const account = credentials('web-example-translation-none');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 text').fill('Quiero descubrir algo nuevo.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(page.getByText(/Changes could not be saved/)).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText('Quiero descubrir algo nuevo.')).toBeVisible();
  });

  test('records an Audio Clip for a word, plays it back before keeping it, and keeps it reachable from the Library', async ({ page }) => {
    const account = credentials('web-audio-record');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(0);

    await recordClip(page);
    const preview = audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).hasAttribute('autoplay'))).toBe(false);

    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    const kept = audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]');
    await expect(kept).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.reload();
    await expandEntry(page, 'casa');
    const player = page.locator('[data-ui="vocabulary-audio-clip"]');
    await expect(player).toBeVisible();
    expect(await player.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await player.evaluate((element) => (element as HTMLAudioElement).hasAttribute('autoplay'))).toBe(false);
    expect(await player.evaluate((element) => (element as HTMLAudioElement).controls)).toBe(true);
  });

  test('replaces an Audio Clip so the earlier recording stops being reachable, then removes it entirely', async ({ page }) => {
    const account = credentials('web-audio-replace');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Replace recording' })).toBeVisible();
    const firstPath = await storedClipPath(client);
    expect(firstPath).not.toBeNull();

    await audioClipControls(page).getByRole('button', { name: 'Replace recording' }).click();
    const stop = audioClipControls(page).getByRole('button', { name: 'Stop recording' });
    await expect(stop).toBeEnabled();
    await stop.click();
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect.poll(async () => storedClipPath(client)).not.toBe(firstPath);
    const secondPath = await storedClipPath(client);
    expect(secondPath).not.toBeNull();

    const { error: staleError } = await client.storage.from('vocabulary-audio-clips').download(firstPath as string);
    expect(staleError).not.toBeNull();
    const { error: currentError } = await client.storage.from('vocabulary-audio-clips').download(secondPath as string);
    expect(currentError).toBeNull();

    await audioClipControls(page).getByRole('button', { name: 'Remove recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeVisible();
    await expect.poll(async () => storedClipPath(client)).toBeNull();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(0);
  });

  test('keeps the editor usable and the word saveable when the Learner declines the microphone', async ({ page }) => {
    const account = credentials('web-audio-declined');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      });
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByText(/could not use your microphone/i)).toBeVisible();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]')).toHaveCount(0);

    await page.getByLabel('Sense 1 translation 1').fill('home');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expandEntry(page, 'casa');
    await expect(page.getByText(/^home en$/)).toBeVisible();
  });

  test('explains that a pronunciation cannot be recorded when the browser offers no microphone', async ({ page }) => {
    const account = credentials('web-audio-unsupported');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).getByText(/cannot record audio/i)).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeDisabled();
  });

  test('removes the Audio Clip from storage when the word itself is deleted', async ({ page }) => {
    const account = credentials('web-audio-delete');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    const path = await storedClipPath(client);
    expect(path).not.toBeNull();
    expect((await client.storage.from('vocabulary-audio-clips').download(path as string)).error).toBeNull();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expandEntry(page, 'casa');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete casa' }).click();
    await expect(page.getByText('No vocabulary entries yet. Add your first one.')).toBeVisible();
    await expect.poll(async () => (await client.storage.from('vocabulary-audio-clips').download(path as string)).error !== null).toBe(true);
  });

  test('releases the microphone when the Learner leaves the editor while still recording', async ({ page }) => {
    const account = credentials('web-audio-release');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (window as unknown as { openedStreams: MediaStream[] }).openedStreams = [];
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const stream = await original(constraints);
        (window as unknown as { openedStreams: MediaStream[] }).openedStreams.push(stream);
        return stream;
      };
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Stop recording' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { openedStreams: MediaStream[] }).openedStreams.flatMap((stream) => stream.getTracks()).some((track) => track.readyState === 'live'))).toBe(true);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(audioClipControls(page)).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => (window as unknown as { openedStreams: MediaStream[] }).openedStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  });

  test('never leaves a Vocabulary Entry pointing at an Audio Clip that is no longer stored', async ({ page }) => {
    const account = credentials('web-audio-strand');
    const { client } = await registerWithPair(account);
    const { data: languages, error: languagesError } = await client.from('learning_languages').select('id').limit(1);
    if (languagesError) throw languagesError;
    const learningLanguageId = (languages ?? [])[0]?.id as string;
    for (const [answerLanguageTag, translation, createNewSense] of [['en', 'house', false], ['uk', 'budynok', true]] as const) {
      const { error } = await client.rpc('capture_learning_language_entry', {
        p_answer_language_tag: answerLanguageTag,
        p_create_new_sense: createNewSense,
        p_example: null,
        p_expression: 'casa',
        p_learning_language_id: learningLanguageId,
        p_sense_id: null,
        p_translation: translation,
      });
      if (error) throw error;
    }

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expandEntry(page, 'casa');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Delete casa' }).click();
    await expect.poll(async () => {
      const { count } = await client.from('vocabulary_entries').select('id', { count: 'exact', head: true });
      return count ?? 0;
    }).toBeLessThan(2);

    const remainingPath = await storedClipPath(client).catch(() => null);
    if (remainingPath) {
      const { error } = await client.storage.from('vocabulary-audio-clips').download(remainingPath);
      expect(error, 'a surviving Vocabulary Entry must still reach the Audio Clip it points at').toBeNull();
    }
  });

  test('explains that a pronunciation cannot be recorded once the Learner goes offline mid-edit', async ({ page, context }) => {
    const account = credentials('web-audio-offline');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeEnabled();

    await context.setOffline(true);
    await expect(audioClipControls(page).getByText(/needs a connection/i)).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeDisabled();

    await context.setOffline(false);
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeEnabled();
  });
});
