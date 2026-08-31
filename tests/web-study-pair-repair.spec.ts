import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return {
    email: `web-pair-repair-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function setupLearner() {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials();
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const sourceResult = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
  const destinationResult = await client.rpc('create_study_pair', { p_target_language_tag: 'fr', p_reference_language_tag: 'en' });
  const incompatibleResult = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'uk' });
  if (sourceResult.error || destinationResult.error || incompatibleResult.error) {
    throw sourceResult.error ?? destinationResult.error ?? incompatibleResult.error;
  }
  return {
    account,
    client,
    sourceId: sourceResult.data.id as string,
    destinationId: destinationResult.data.id as string,
  };
}

async function captureEntry(client: Awaited<ReturnType<typeof setupLearner>>['client'], pairId: string, expression: string, translation: string, example = '') {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.describe('web Study Pair repair', () => {
  test('locks populated languages and explains compatible destinations', async ({ page }) => {
    const setup = await setupLearner();
    await captureEntry(setup.client, setup.sourceId, 'casa', 'house');
    await signIn(page, setup.account);
    await page.goto('/library');

    await expect(page.getByRole('button', { name: 'Edit languages for Spanish → English' })).toBeDisabled();
    await expect(page.getByText('Languages are locked because this Study Pair owns Vocabulary Entries.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select casa' }).check();
    await expect(page.getByLabel('Move selected entries to')).toContainText('French → English');
    await expect(page.getByRole('option', { name: /Spanish → Ukrainian.*incompatible Reference Language/ })).toBeDisabled();
    await expect(page.getByText('Moved entries keep English translations, so the destination must also use English as its Reference Language.')).toBeVisible();
  });

  test('moves and enriches an equivalent destination aggregate once', async ({ page }) => {
    const setup = await setupLearner();
    await captureEntry(setup.client, setup.sourceId, 'Casa', 'home', 'Mi casa es pequeña.');
    await captureEntry(setup.client, setup.destinationId, ' casa ', 'house');
    await signIn(page, setup.account);
    await page.goto('/library');

    await page.getByRole('checkbox', { name: 'Select Casa' }).check();
    await page.getByLabel('Move selected entries to').selectOption({ label: 'French → English' });
    await page.getByRole('button', { name: 'Move 1 Vocabulary Entry' }).press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Moved 1 Vocabulary Entry to French → English.' })).toBeVisible();
    await expect(page.getByText('Casa', { exact: true })).toHaveCount(0);

    await page.getByLabel('Active Study Pair').selectOption({ label: 'French → English' });
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toHaveCount(1);
    await page.locator('summary').filter({ hasText: 'casa' }).click();
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByText('home', { exact: true })).toBeVisible();
    await expect(page.getByText('Mi casa es pequeña.')).toBeVisible();
  });

  test('preserves repair context after failure and strongly confirms populated deletion', async ({ page }) => {
    const setup = await setupLearner();
    await captureEntry(setup.client, setup.sourceId, 'guardar', 'keep');
    await captureEntry(setup.client, setup.sourceId, 'borrar', 'delete');
    await signIn(page, setup.account);
    await page.goto('/library');

    await page.getByRole('checkbox', { name: 'Select guardar' }).check();
    await page.getByLabel('Move selected entries to').selectOption({ label: 'French → English' });
    await page.route('**/rest/v1/rpc/move_vocabulary_entries', (route) => route.abort());
    await page.getByRole('button', { name: 'Move 1 Vocabulary Entry' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Vocabulary Entries could not be moved.' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select guardar' })).toBeChecked();
    await expect(page.locator('summary').filter({ hasText: 'guardar' })).toBeVisible();
    await page.unroute('**/rest/v1/rpc/move_vocabulary_entries');

    await page.getByRole('button', { name: 'Delete Spanish → English' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Spanish → English' });
    await expect(dialog.getByText('Vocabulary Entries, private Senses, translations, Examples, Collections, and learning progress will be permanently deleted.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('summary').filter({ hasText: 'guardar' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete Spanish → English' }).click();
    await page.getByLabel('Type Spanish → English to confirm').fill('Spanish → English');
    await page.route('**/rest/v1/rpc/delete_study_pair', (route) => route.abort());
    await dialog.getByRole('button', { name: 'Delete Study Pair' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Study Pair could not be deleted.' })).toBeVisible();
    await expect(page.getByLabel('Type Spanish → English to confirm')).toHaveValue('Spanish → English');
    await page.unroute('**/rest/v1/rpc/delete_study_pair');
    await dialog.getByRole('button', { name: 'Delete Study Pair' }).click();
    await expect(page.getByText('Spanish → English', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Active Study Pair')).toContainText('French → English');
  });

  test('keeps repair controls accessible online and responsive', async ({ page }) => {
    const setup = await setupLearner();
    await captureEntry(setup.client, setup.sourceId, 'teclado', 'keyboard');
    await signIn(page, setup.account);
    await page.goto('/library');

    const checkbox = page.getByRole('checkbox', { name: 'Select teclado' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('button', { name: 'Move 1 Vocabulary Entry' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Spanish → English' })).toBeDisabled();
    await expect(page.getByText('Study Pair repair requires a connection.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
