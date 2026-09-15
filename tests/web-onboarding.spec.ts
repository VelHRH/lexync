import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = { email: string; password: string };

function credentials(prefix = 'web-onboarding') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function createLearner(withLanguage = false): Promise<Account> {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required for web acceptance tests.');
  const account = credentials();
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('Local Supabase did not create a test Learner session.');
  if (withLanguage) {
    const { error: languageError } = await client.rpc('create_learning_language', { p_language_tag: 'es' });
    if (languageError) throw languageError;
  }
  return account;
}

async function signIn(page: Page, account: Account, navigateToSignIn = true) {
  if (navigateToSignIn) await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
}

async function watchOnboarding(page: Page) {
  await page.addInitScript(() => {
    const marker = '__lexyncOnboardingRendered';
    const detect = () => {
      if (document.querySelector('main.pair-onboarding h1, main.pair-onboarding form, #learning-language, [aria-labelledby="language-ready-heading"]')) sessionStorage.setItem(marker, 'true');
    };
    if (sessionStorage.getItem(marker) === null) sessionStorage.setItem(marker, 'false');
    new MutationObserver(detect).observe(document, { childList: true, subtree: true });
    detect();
  });
}

async function expectNoOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: /Set up your first Learning Language|Your Learning Language is ready/i })).toHaveCount(0);
  await expect(page.getByLabel('Learning Language', { exact: true })).toHaveCount(0);
  const flashMarker = await page.evaluate(() => {
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return false;
    return sessionStorage.getItem('__lexyncOnboardingRendered') === 'true';
  });
  expect(flashMarker).toBe(false);
}

async function resetOnboardingMarker(page: Page) {
  await page.evaluate(() => sessionStorage.removeItem('__lexyncOnboardingRendered'));
}

async function expectSignInDestination(page: Page, next: string) {
  await expect(page).toHaveURL((url) => url.pathname === '/auth/sign-in' && url.searchParams.get('next') === next);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

test.describe('web Learning Language onboarding protection', () => {
  test('signs up a Learner, validates BCP 47, and immediately opens Home with the active language', async ({ page }) => {
    const account = credentials('web-onboarding-sign-up');

    await page.goto('/auth/sign-up');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password').fill(account.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL('/onboarding/learning-language');
    await expect(page).not.toHaveURL(/onboarding\/study-pair/);
    await expect(page.getByRole('heading', { name: 'Set up your first Learning Language' })).toBeVisible();
    const language = page.getByLabel('Learning Language', { exact: true });
    await language.fill('en_US');
    await page.getByRole('button', { name: 'Create Learning Language' }).click();
    await expect(page.locator('#learning-language-notice')).toContainText('valid BCP 47');
    await expect(language).toHaveValue('en_US');

    await language.fill('pt-BR');
    await page.getByRole('button', { name: 'Create Learning Language' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByLabel('Active Learning Language')).toContainText(/Portuguese|pt-BR/i);
  });

  test('replaces canonical and legacy onboarding routes for a completed Learner without rendering onboarding', async ({ page }) => {
    const account = await createLearner(true);
    await watchOnboarding(page);
    await signIn(page, account);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    for (const route of ['/onboarding/learning-language', '/onboarding/study-pair']) {
      await page.goto(route);
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expectNoOnboarding(page);
    }
  });

  test('replaces the legacy route with canonical onboarding for a signed-in Learner without languages', async ({ page }) => {
    const account = await createLearner();
    await watchOnboarding(page);
    await signIn(page, account);
    await expect(page).toHaveURL('/onboarding/learning-language');
    await expect(page.getByRole('heading', { name: 'Set up your first Learning Language' })).toBeVisible();

    await page.goto('/onboarding/study-pair');
    await expect(page).toHaveURL('/onboarding/learning-language');
    await expect(page.getByRole('heading', { name: 'Set up your first Learning Language' })).toBeVisible();
  });

  test('returns an unauthenticated direct canonical request to canonical onboarding after sign-in', async ({ page }) => {
    const account = await createLearner();
    await watchOnboarding(page);
    await page.goto('/onboarding/learning-language');
    await expectSignInDestination(page, '/onboarding/learning-language');
    await signIn(page, account, false);
    await expect(page).toHaveURL('/onboarding/learning-language');
    await expect(page.getByRole('heading', { name: 'Set up your first Learning Language' })).toBeVisible();
  });

  test('returns an unauthenticated direct legacy request to canonical onboarding after sign-in', async ({ page }) => {
    const account = await createLearner();
    await watchOnboarding(page);
    await page.goto('/onboarding/study-pair');
    await expectSignInDestination(page, '/onboarding/study-pair');
    await signIn(page, account, false);
    await expect(page).toHaveURL('/onboarding/learning-language');
    await expect(page).not.toHaveURL(/onboarding\/study-pair/);
    await expect(page.getByRole('heading', { name: 'Set up your first Learning Language' })).toBeVisible();
  });

  test('returns a completed Learner to Home after signing in from the canonical onboarding route', async ({ page }) => {
    const account = await createLearner(true);
    await page.goto('/onboarding/learning-language');
    await expectSignInDestination(page, '/onboarding/learning-language');
    await signIn(page, account, false);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expectNoOnboarding(page);
  });

  test('returns a completed Learner to Home after signing in from the legacy onboarding route', async ({ page }) => {
    const account = await createLearner(true);
    await page.goto('/onboarding/study-pair');
    await expectSignInDestination(page, '/onboarding/study-pair');
    await signIn(page, account, false);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expectNoOnboarding(page);
  });

  test('never exposes onboarding when going Back after completing onboarding', async ({ page }) => {
    const account = await createLearner();
    await watchOnboarding(page);
    await signIn(page, account);
    await expect(page).toHaveURL('/onboarding/learning-language');
    await page.getByLabel('Learning Language').fill('de');
    await page.getByRole('button', { name: 'Create Learning Language' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    await resetOnboardingMarker(page);
    await page.goBack();
    await expect(page).not.toHaveURL(/onboarding/);
    await expectNoOnboarding(page);
  });

  test('never exposes onboarding when going Back after a completed-user route guard', async ({ page }) => {
    const account = await createLearner(true);
    await watchOnboarding(page);
    await signIn(page, account);
    await expect(page).toHaveURL('/');

    await page.goto('/onboarding/learning-language');
    await expect(page).toHaveURL('/');
    await expectNoOnboarding(page);
    await page.goBack();
    await expect(page).not.toHaveURL(/onboarding/);
    await expectNoOnboarding(page);
  });
});
