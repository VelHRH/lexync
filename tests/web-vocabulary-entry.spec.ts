import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

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

test.describe('web Vocabulary Entry library', () => {
  test('searches and filters only the active Study Pair', async ({ page }) => {
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
    await page.getByLabel('Active Study Pair').selectOption({ label: 'Italian → English' });
    await page.getByLabel('Vocabulary status').selectOption('suspended');
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
    await expect(page.getByText('to discover', { exact: true })).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    const suspend = page.getByRole('button', { name: 'Suspend descubrir' });
    await suspend.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'descubrir is suspended.' })).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();
    await expect(page.getByText('to discover', { exact: true })).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    const resume = page.getByRole('button', { name: 'Resume descubrir' });
    await resume.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'descubrir is active.' })).toBeVisible();
    await expect(page.getByText('Suspended', { exact: true })).toHaveCount(0);
    await expect(page.getByText('to discover', { exact: true })).toBeVisible();
  });

  test('creates a complete entry and preserves validation values', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      await expect(page.getByLabel('Expression')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Translation').fill('to discover');
    await page.getByLabel('Example').fill('Quiero descubrir la ciudad.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await expect(page.getByRole('heading', { name: 'descubrir' })).toBeVisible();
    await expect(page.getByText('to discover', { exact: true })).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.route('**/rest/v1/rpc/capture_manual_entry', (route) => route.abort());
    await page.getByLabel('Expression').fill('fallo');
    await page.getByLabel('Translation').fill('failure');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('fallo');
    await expect(page.getByLabel('Translation')).toHaveValue('failure');
    await page.unroute('**/rest/v1/rpc/capture_manual_entry');
    await page.getByLabel('Expression').fill('');
    await page.getByLabel('Translation').fill('');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Expression is required.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Translation is required.' })).toBeVisible();
  });

  test('reuses equivalent expressions and enriches the existing entry', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('Casa');
    await page.getByLabel('Translation').fill('house');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'Casa' })).toBeVisible();
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill(' casa ');
    await page.getByLabel('Translation').fill('home');
    await page.getByLabel('Example').fill('Mi casa es pequeña.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await page.locator('summary').filter({ hasText: 'Casa' }).click();
    await expect(page.getByRole('heading', { name: 'Casa' })).toHaveCount(1);
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByText('home', { exact: true })).toBeVisible();
    await expect(page.getByText('Mi casa es pequeña.')).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'biblioteca' })).toBeVisible();
    await expect(page.getByText('library', { exact: true })).toBeVisible();

    const other = credentials('web-other');
    const { client: otherClient } = await registerWithPair(other);
    const { error: ownershipError } = await otherClient.rpc('capture_manual_entry', { p_expression: 'intruso', p_study_pair_id: pair.id, p_translation: 'intruder' });
    expect(ownershipError).toBeTruthy();
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

    await page.locator('summary').filter({ hasText: 'descubrir algo' }).click();
    await expect(page.getByRole('heading', { name: 'descubrir algo' })).toBeVisible();
    await expect(page.getByText('discover', { exact: true })).toBeVisible();
    await expect(page.getByText('find out', { exact: true })).toBeVisible();
    await expect(page.getByText('uncover', { exact: true })).toBeVisible();
    await expect(page.getByText('Quiero descubrir algo nuevo.')).toBeVisible();

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
    await expect(page.getByLabel('Add vocabulary unavailable offline')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Edit borrar' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete borrar' })).toBeDisabled();
    await expect(page.getByText('You are offline. Vocabulary changes require a connection.')).toBeVisible();
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
});
