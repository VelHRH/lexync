import { createClient, type Session } from '@supabase/supabase-js';
import { devices, expect, test, type Page } from '@playwright/test';
import { unpackedExtensionId } from './support/extension-id';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const configuredExtensionId = unpackedExtensionId();

type Account = { email: string; password: string };

async function createLearner(withLanguage = true): Promise<{ account: Account; session: Session }> {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required for web acceptance tests.');
  const account = {
    email: `web-extension-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp(account);
  if (error || !data.session) throw error ?? new Error('Local Supabase did not create a test Learner session.');
  if (withLanguage) {
    const { error: languageError } = await client.rpc('create_learning_language', { p_language_tag: 'es' });
    if (languageError) throw languageError;
  }
  return { account, session: data.session };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}

function recommendationCard(page: Page) {
  return page.getByRole('region', { name: /Add the Lexync extension/i });
}

test.describe('web extension recommendation', () => {
  test('offers an optional install action and keeps the dashboard usable when no extension responds', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.endsWith('-mobile'), 'Chrome Web Store installation is only supported on desktop Chromium.');
    const { account } = await createLearner();
    await signIn(page, account);

    const card = recommendationCard(page);
    await expect(card).toBeVisible();
    const install = card.getByRole('link', { name: /install|add.*extension/i });
    await expect(install).toHaveAttribute(
      'href',
      new RegExp(`^https://(?:chromewebstore\\.google\\.com|chrome\\.google\\.com/webstore)/detail/[^/]+/${configuredExtensionId}`),
    );
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Library', exact: true })).toBeVisible();
  });

  test('dismisses the recommendation by keyboard and persists it in the browser profile', async ({ page }) => {
    const { account } = await createLearner();
    await signIn(page, account);

    const card = recommendationCard(page);
    const dismiss = card.getByRole('button', { name: /dismiss|not now|maybe later/i });
    await dismiss.focus();
    await expect(dismiss).toBeFocused();
    await dismiss.press('Enter');
    await expect(card).toHaveCount(0);
    const storedRecommendation = await page.evaluate(() => Object.entries(window.localStorage)
      .find(([key, value]) => /extension/i.test(key) && /dismiss|hidden|installed/i.test(`${key}:${value}`)));
    expect(storedRecommendation).toBeTruthy();
    await page.reload();
    await expect(recommendationCard(page)).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('gives unsupported browsers compatibility guidance without an install action', async ({ browser }) => {
    const { account } = await createLearner();
    const context = await browser.newContext({ ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3000', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0' });
    try {
      const page = await context.newPage();
      await signIn(page, account);
      const card = recommendationCard(page);
      await expect(card).toBeVisible();
      await expect(card).toContainText(/Chromium|Chrome|compatible|supported/i);
      await expect(card.getByRole('link', { name: /install|add.*extension/i })).toHaveCount(0);
      await expect(card.getByRole('button', { name: /install|add.*extension/i })).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('keeps the recommendation usable at a narrow responsive viewport', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { account } = await createLearner();
    await signIn(page, account);

    const card = recommendationCard(page);
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: /dismiss|not now|maybe later/i })).toBeVisible();
    if (testInfo.project.name.endsWith('-mobile')) {
      await expect(card).toContainText(/Chromium|Chrome|compatible|supported/i);
      await expect(card.getByRole('link', { name: /install|add.*extension/i })).toHaveCount(0);
      await expect(card.getByRole('button', { name: /install|add.*extension/i })).toHaveCount(0);
    } else {
      await expect(card.getByRole('link', { name: /install|add.*extension/i })).toBeVisible();
    }
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(390);
  });
});
