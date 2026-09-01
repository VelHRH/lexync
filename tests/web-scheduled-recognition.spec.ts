import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  return { account, client };
}

async function createPair(client: SupabaseClient, target: string, reference: string) {
  const { data, error } = await client.rpc('create_study_pair', { p_target_language_tag: target, p_reference_language_tag: reference });
  if (error) throw error;
  return data as { id: string };
}

async function captureEntry(client: SupabaseClient, pairId: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: null,
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
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

test.describe('web Scheduled Recognition', () => {
  test('shows owned due counts by Study Pair and starts only the active pair', async ({ page }) => {
    const { account, client } = await registerLearner('recognition-counts');
    const spanish = await createPair(client, 'es', 'en');
    const italian = await createPair(client, 'it', 'en');
    await captureEntry(client, spanish.id, 'casa', 'house');
    await captureEntry(client, spanish.id, 'casa', 'home');
    const suspended = await captureEntry(client, spanish.id, 'nube', 'cloud');
    const { error: suspensionError } = await client.rpc('set_vocabulary_entry_suspended', {
      p_suspended: true,
      p_vocabulary_entry_id: suspended.vocabularyEntryId,
    });
    if (suspensionError) throw suspensionError;
    await captureEntry(client, italian.id, 'gatto', 'cat');
    const other = await registerLearner('recognition-other');
    const otherPair = await createPair(other.client, 'es', 'en');
    await captureEntry(other.client, otherPair.id, 'privado', 'private');

    await signIn(page, account);
    const counts = page.getByRole('region', { name: 'Scheduled Review due counts' });
    await expect(counts.getByText('Spanish → English 2 due', { exact: true })).toBeVisible();
    await expect(counts.getByText('Italian → English 1 due', { exact: true })).toBeVisible();
    await expect(page.getByText('privado', { exact: true })).toHaveCount(0);
    await page.getByLabel('Active Study Pair').selectOption({ label: 'Spanish → English' });
    await page.getByRole('link', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('árbol');
    await page.getByLabel('Translation').fill('tree');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(counts.getByText('Spanish → English 3 due', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start Spanish → English review' }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByText('gatto', { exact: true })).toHaveCount(0);
    await expect(page.getByText('nube', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('reveals, overrides Again, records once, and restores the derived schedule', async ({ page }) => {
    const { account, client } = await registerLearner('recognition-review');
    const pair = await createPair(client, 'es', 'en');
    await captureEntry(client, pair.id, 'casa', 'house');
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByRole('heading', { name: 'Recognition' })).toBeVisible();
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByText('house', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reveal translation' }).press('Enter');
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Again' })).toBeChecked();
    await page.getByRole('radio', { name: 'Good' }).check();
    await page.getByRole('button', { name: 'Confirm review' }).press('Enter');
    await expect(page.getByRole('status')).toContainText('Review recorded. Next review');

    const { data: events, error } = await client.from('review_events').select('card_id, rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].rating).toBe('good');

    await page.reload();
    await expect(page.getByText('No recognition Cards are due for Spanish → English.')).toBeVisible();
    await expect(page.getByText(/Next recognition review/)).toBeVisible();
    const { count, error: countError } = await client.from('review_events').select('*', { count: 'exact', head: true });
    if (countError) throw countError;
    expect(count).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
