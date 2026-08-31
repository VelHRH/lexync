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

test.describe('web Vocabulary Entry library', () => {
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
});
