import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';

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
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: 'es' });
  if (languageError) throw languageError;
  return { account, client, learningLanguageId: (language as { id: string }).id };
}

async function captureEntry(client: SupabaseClient, learningLanguageId: string, expression: string, translation: string) {
  const { error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
}

async function seedReviewSession(prefix: string) {
  const fixture = await registerLearner(prefix);
  await captureEntry(fixture.client, fixture.learningLanguageId, 'casa', 'house');
  await captureEntry(fixture.client, fixture.learningLanguageId, 'perro', 'dog');
  return fixture;
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function reviewSession(page: Page) {
  return page.getByRole('region', { name: 'Review Session' });
}

async function startReviewSession(page: Page) {
  const session = reviewSession(page);
  await expect(session).toBeVisible();
  await session.getByRole('button', { name: 'Start review session' }).click();
  await expect(session.getByRole('button', { name: 'Submit answer' })).toBeVisible();
  expect(await session.getByRole('radio').count()).toBeGreaterThanOrEqual(2);
}

async function reviewSessionSnapshot(page: Page) {
  const session = reviewSession(page);
  const text = (await session.innerText()).replace(/\s+/g, ' ').trim();
  const choices = await session.getByRole('radio').evaluateAll((elements) => elements.map((element) => {
    const input = element as HTMLInputElement;
    return input.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? input.getAttribute('aria-label') ?? input.value;
  }));
  return { choices, text };
}

async function expectReviewComplete(page: Page) {
  const session = reviewSession(page);
  await expect(session.getByRole('heading', { name: 'Review complete' })).toBeVisible();
  await expect(session.getByRole('status')).toContainText(/complete|correct|submitted/i);
}

async function submitFirstChoice(page: Page) {
  const session = reviewSession(page);
  await session.getByRole('radio').first().check();
  await session.getByRole('button', { name: 'Submit answer' }).click();
}

async function newSignedInContext(browser: Browser, page: Page) {
  return browser.newContext({ storageState: await page.context().storageState() });
}

test.describe('web Review Session', () => {
  test('starts an unscheduled session with a prompt and answer choices without rating controls', async ({ page }) => {
    const fixture = await seedReviewSession('review-session-start');
    await signIn(page, fixture.account);
    await page.goto('/review');

    await startReviewSession(page);
    const session = reviewSession(page);
    await expect(session.getByRole('heading', { name: 'Review Session' })).toBeVisible();
    expect(await session.getByRole('radio').count()).toBeGreaterThanOrEqual(2);
    await expect(session.getByRole('button', { name: 'Submit answer' })).toBeVisible();
    await expect(session.getByRole('button', { name: /rating|confirm review|reveal translation/i })).toHaveCount(0);
    await expect(session.getByRole('radio', { name: /Again|Hard|Good|Easy/i })).toHaveCount(0);
    expect((await session.innerText()).trim().split(/\n+/).length).toBeGreaterThan(3);
  });

  test('keeps one active question and choice order across navigation, reload, tabs, and a fresh context', async ({ page, browser }) => {
    const fixture = await seedReviewSession('review-session-resume');
    await signIn(page, fixture.account);
    await page.goto('/review');
    await startReviewSession(page);
    const initial = await reviewSessionSnapshot(page);

    await page.goto('/');
    await page.goto('/review');
    await expect(reviewSession(page).getByRole('button', { name: 'Submit answer' })).toBeVisible();
    await expect(reviewSession(page).getByRole('button', { name: 'Start review session' })).toHaveCount(0);
    expect(await reviewSessionSnapshot(page)).toEqual(initial);

    await page.reload();
    await expect(reviewSession(page).getByRole('button', { name: 'Submit answer' })).toBeVisible();
    expect(await reviewSessionSnapshot(page)).toEqual(initial);

    const anotherTab = await page.context().newPage();
    const restartedContext = await newSignedInContext(browser, page);
    const restartedPage = await restartedContext.newPage();
    try {
      await anotherTab.goto('/review');
      await expect(reviewSession(anotherTab).getByRole('button', { name: 'Submit answer' })).toBeVisible();
      await expect(reviewSession(anotherTab).getByRole('button', { name: 'Start review session' })).toHaveCount(0);
      expect(await reviewSessionSnapshot(anotherTab)).toEqual(initial);

      await restartedPage.goto('/review');
      await expect(reviewSession(restartedPage).getByRole('button', { name: 'Submit answer' })).toBeVisible();
      await expect(reviewSession(restartedPage).getByRole('button', { name: 'Start review session' })).toHaveCount(0);
      expect(await reviewSessionSnapshot(restartedPage)).toEqual(initial);
    } finally {
      await anotherTab.close();
      await restartedContext.close();
    }
  });

  test('converges on one completed result when two tabs submit the current choice concurrently', async ({ page }) => {
    const fixture = await seedReviewSession('review-session-idempotency');
    await signIn(page, fixture.account);
    await page.goto('/review');
    await startReviewSession(page);

    const concurrentPage = await page.context().newPage();
    try {
      await concurrentPage.goto('/review');
      await expect(reviewSession(concurrentPage).getByRole('button', { name: 'Submit answer' })).toBeVisible();
      expect(await reviewSessionSnapshot(concurrentPage)).toEqual(await reviewSessionSnapshot(page));
      await Promise.all([submitFirstChoice(page), submitFirstChoice(concurrentPage)]);
      await Promise.all([expectReviewComplete(page), expectReviewComplete(concurrentPage)]);
    } finally {
      await concurrentPage.close();
    }
  });

  test('restores the completed result after reload and restart while retaining legacy Scheduled Review separately', async ({ page, browser }) => {
    const fixture = await seedReviewSession('review-session-preservation');
    await signIn(page, fixture.account);
    await page.goto('/review');
    await startReviewSession(page);
    await submitFirstChoice(page);
    await expectReviewComplete(page);
    const completed = await reviewSessionSnapshot(page);
    const session = reviewSession(page);
    await expect(session.getByRole('radio')).toHaveCount(0);
    await expect(session.getByText(/\b(?:due|next review|rating|again|hard|good|easy)\b/i)).toHaveCount(0);

    await page.reload();
    await expectReviewComplete(page);
    expect(await reviewSessionSnapshot(page)).toEqual(completed);
    await expect(page.getByRole('region', { name: /Scheduled Review/ })).toBeVisible();

    const restartedContext = await newSignedInContext(browser, page);
    const restartedPage = await restartedContext.newPage();
    try {
      await restartedPage.goto('/review');
      await expectReviewComplete(restartedPage);
      expect(await reviewSessionSnapshot(restartedPage)).toEqual(completed);
      await expect(reviewSession(restartedPage).getByRole('radio')).toHaveCount(0);
      await expect(reviewSession(restartedPage).getByText(/\b(?:due|next review|rating|again|hard|good|easy)\b/i)).toHaveCount(0);
      await expect(restartedPage.getByRole('region', { name: /Scheduled Review/ })).toBeVisible();
    } finally {
      await restartedContext.close();
    }
  });
});
