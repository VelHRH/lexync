import { createClient } from '@supabase/supabase-js';
import { expect, test, type APIRequestContext } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return {
    email: `web-learner-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function registerLearner(email: string, password: string, withPair = false) {
  if (!supabasePublishableKey) {
    throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required for web acceptance tests.');
  }

  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signUp({ email, password });

  if (error) {
    throw error;
  }
  if (withPair && data.session) {
    const { error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
    if (pairError) throw pairError;
  }
}

async function recoveryLink(request: APIRequestContext, email: string) {
  let messageId = '';
  await expect.poll(async () => {
    const response = await request.get('http://127.0.0.1:54324/api/v1/search', { params: { query: `to:${email}` } });
    const result = await response.json() as { messages?: Array<{ ID: string }> };
    messageId = result.messages?.[0]?.ID ?? '';
    return messageId;
  }).not.toBe('');
  const response = await request.get(`http://127.0.0.1:54324/api/v1/message/${messageId}`);
  const message = await response.json() as { HTML?: string; Text?: string };
  const content = `${message.HTML ?? ''}\n${message.Text ?? ''}`.replaceAll('&amp;', '&');
  const link = content.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
  if (!link) throw new Error('The password recovery link is missing from the local email.');
  return link;
}

test.describe('authenticated web learning client', () => {
  test('offers account actions from the signed-out public home', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    await expect(page.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', /auth/);
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /auth/);
  });

  test('publishes the extension privacy policy without requiring authentication', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page).toHaveTitle('Privacy Policy — Lexync');
    await expect(page.getByRole('heading', { name: 'Your words stay yours.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chrome Web Store Limited Use' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'yrchenko644@gmail.com' })).toHaveAttribute('href', 'mailto:yrchenko644@gmail.com');
  });

  test('registers, signs in, signs out, and protects private destinations', async ({ page }) => {
    const account = credentials();
    await page.goto('/auth/sign-up');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password').fill(account.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/onboarding/study-pair');
    await expect(page.getByRole('heading', { name: /Learning Language/i })).toBeVisible();
    await expect(page.getByLabel(/Answer Language|Reference Language/i)).toHaveCount(0);
    await page.getByLabel('Learning Language').fill('es');
    await page.getByRole('button', { name: 'Create Learning Language' }).click();
    await expect(page.getByRole('heading', { name: 'Your Learning Language is ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to dashboard' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByLabel('Active Learning Language')).toContainText(/Spanish|es/i);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL('/library');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');
    const secondPage = await page.context().newPage();
    await secondPage.goto('/library');
    await expect(secondPage).toHaveURL(/auth\/sign-in/);
    await expect(secondPage.getByText('Sign in to continue')).toBeVisible();
  });

  test('signs in an existing learner and exposes responsive private navigation', async ({ page }) => {
    const account = credentials();
    await registerLearner(account.email, account.password, true);
    await page.goto('/auth/sign-in');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByLabel('Password').press('Enter');

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('validates password recovery and keeps focusable form controls', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL('/auth/forgot-password');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'valid email' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
  });

  test('completes password recovery from the emailed link', async ({ page, request }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    await page.goto('/auth/forgot-password');
    await page.getByLabel('Email').fill(account.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    const link = await recoveryLink(request, account.email);
    await page.goto(link);
    await expect(page).toHaveURL('/auth/reset-password');
    await page.getByLabel('New password', { exact: true }).fill(`${account.password}-new`);
    await page.getByLabel('Confirm new password').fill(`${account.password}-new`);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('status')).toContainText('Password updated');
  });
});
