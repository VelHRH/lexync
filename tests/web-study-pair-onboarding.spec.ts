import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return {
    email: `web-pairs-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function registerLearner(email: string, password: string) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signUp({ email, password });
  if (error) throw error;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
}

test.describe('web Study Pair onboarding', () => {
  test('requires a valid distinct Target and Reference Language before onboarding', async ({ page }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    await signIn(page, account.email, account.password);

    await expect(page).toHaveURL('/onboarding/study-pair');
    await expect(page.getByRole('heading', { name: 'Set up your first Study Pair' })).toBeVisible();
    await expect(page.getByText('Target Language')).toBeVisible();
    await expect(page.getByText('Reference Language')).toBeVisible();

    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid BCP 47 language tag.' })).toBeVisible();
    await page.getByLabel('Target Language').fill('en');
    await page.getByLabel('Reference Language').fill('en');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'must be different' })).toBeVisible();
    await page.getByLabel('Reference Language').fill('en_US');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'BCP 47' })).toBeVisible();
  });

  test('completes first-pair onboarding and switches the active pair', async ({ page }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    await signIn(page, account.email, account.password);

    await page.getByLabel('Target Language').fill('es');
    await page.getByLabel('Reference Language').fill('en');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(page.getByRole('heading', { name: 'Your Study Pair is ready' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to dashboard' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByLabel('Active Study Pair')).toContainText('Spanish → English');

    await page.getByRole('button', { name: 'Add Study Pair' }).click();
    await page.getByLabel('Target Language').fill('fr');
    await page.getByLabel('Reference Language').fill('en');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(page.locator('.pair-row').filter({ hasText: 'French → English' })).toBeVisible();
    await page.getByLabel('Active Study Pair').selectOption({ label: 'French → English' });
    await expect(page.getByLabel('Active Study Pair')).toContainText('French → English');
  });

  test('keeps one primary pair and supports empty-pair recovery', async ({ page }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    await signIn(page, account.email, account.password);
    await page.getByLabel('Target Language').fill('de');
    await page.getByLabel('Reference Language').fill('en');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();
    await page.getByRole('button', { name: 'Continue to dashboard' }).click();
    await page.getByRole('button', { name: 'Add Study Pair' }).click();
    await page.getByLabel('Target Language').fill('de');
    await page.getByLabel('Reference Language').fill('uk');
    await page.getByRole('button', { name: 'Create Study Pair' }).click();

    await page.getByRole('button', { name: /Make primary German → Ukrainian/ }).click();
    await expect(page.getByRole('button', { name: /Make primary German → Ukrainian/ })).toBeDisabled();
    await expect(page.locator('.pair-row strong')).toHaveCount(1);
    await page.getByRole('button', { name: /Delete German → English/ }).click();
    await expect(page.locator('.pair-row').filter({ hasText: 'German → English' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Delete German → Ukrainian/ })).toBeDisabled();
  });
});
