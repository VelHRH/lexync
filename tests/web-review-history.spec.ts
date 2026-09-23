import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = ReturnType<typeof credentials>;
type CapturedEntry = { expression: string; translation: string; vocabularyEntryId: string };

const vocabulary = [
  ['casa', 'house'],
  ['perro', 'dog'],
  ['nube', 'cloud'],
  ['libro', 'book'],
  ['mesa', 'table'],
] as const;

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

async function captureEntry(client: SupabaseClient, learningLanguageId: string, expression: string, translation: string, options: { example?: string } = {}) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: false,
    p_example: options.example ?? null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as CapturedEntry & { senseId: string };
}

async function seedEntries(prefix: string, entries: ReadonlyArray<readonly [string, string]> = vocabulary.slice(0, 4), withExamples = false) {
  const fixture = await registerLearner(prefix);
  const captured: Array<CapturedEntry & { senseId: string }> = [];
  for (const [expression, translation] of entries) {
    captured.push(await captureEntry(fixture.client, fixture.learningLanguageId, expression, translation, withExamples ? { example: `Aprendo ${expression} hoy.` } : {}));
  }
  return { ...fixture, captured };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function reviewShell(page: Page) {
  return page.getByRole('main');
}

function reviewQuestion(page: Page) {
  return page.getByRole('region', { name: 'Review question' });
}

async function startReview(page: Page) {
  await page.getByRole('link', { name: /Start review|Resume review/ }).click();
  await expect(page).toHaveURL('/review');
  await expect(reviewQuestion(page)).toBeVisible();
}

async function continueQuestion(page: Page) {
  const before = await reviewShell(page).getByRole('progressbar').evaluate((element) => (element as HTMLProgressElement).value);
  await reviewShell(page).getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => {
    if (await page.getByRole('heading', { name: 'Review complete', exact: true }).count()) return true;
    return reviewShell(page).getByRole('progressbar').evaluateAll((elements, previous) => elements.length > 0 && (elements[0] as HTMLProgressElement).value > previous, before);
  }, { timeout: 20_000 }).toBe(true);
}

async function completeReview(page: Page, answerFirst = true) {
  let answered = 0;
  while (await reviewQuestion(page).count()) {
    const choices = reviewQuestion(page).getByRole('radio');
    await choices.nth(answerFirst ? 0 : Math.min(1, (await choices.count()) - 1)).check();
    await expect(reviewShell(page).getByRole('status')).toContainText(/Correct|Incorrect/);
    await continueQuestion(page);
    answered += 1;
  }
  await expect(reviewShell(page).getByRole('heading', { name: 'Review complete' })).toBeVisible();
  return answered;
}

async function openHistory(page: Page) {
  await page.getByRole('link', { name: 'Review history', exact: true }).click();
  await expect(page).toHaveURL(/\/review-history$/);
  await expect(page.getByRole('heading', { name: 'Review history', exact: true })).toBeVisible();
}

async function bridgeEntryId(client: SupabaseClient, learningVocabularyEntryId: string) {
  const { data, error } = await client.from('vocabulary_entries').select('id').eq('learning_vocabulary_entry_id', learningVocabularyEntryId).limit(1).single();
  if (error) throw error;
  return data.id as string;
}

function sessionDetails(page: Page) {
  return page.locator('details').filter({ has: page.locator('summary') });
}

test.describe('web Review history', () => {
  test.describe.configure({ mode: 'serial' });

  test('links from Home without navigation exposure and teaches the empty state', async ({ page }) => {
    const fixture = await registerLearner('review-history-empty');
    await signIn(page, fixture.account);
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation.getByRole('link', { name: /Review|history/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Review history', exact: true })).toBeVisible();
    await openHistory(page);
    await expect(page.getByText(/no completed Review Sessions yet/i)).toBeVisible();
  });

  test('lists completed sessions newest first and expands mixed answer details', async ({ page }) => {
    const fixture = await seedEntries('review-history-details', vocabulary, true);
    await signIn(page, fixture.account);
    await startReview(page);
    await completeReview(page);
    await reviewShell(page).getByRole('button', { name: 'Start another review' }).click();
    await expect(reviewQuestion(page)).toBeVisible();
    await completeReview(page, false);
    await reviewShell(page).getByRole('button', { name: 'Back to Home' }).click();
    await openHistory(page);
    const sessions = sessionDetails(page);
    await expect(sessions).toHaveCount(2);
    const timestamps = await sessions.locator('summary time').evaluateAll((elements) => elements.map((element) => Date.parse(element.getAttribute('datetime') ?? '')));
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
    await expect(sessions.first().locator('summary')).toContainText(/Spanish/);
    await expect(sessions.first().locator('summary')).toContainText(/\d+\/\d+/);
    await expect(sessions.first().locator('summary')).toContainText(/\d+%/);
    await sessions.first().locator('summary').click();
    const expanded = sessions.first();
    await expect(expanded).toHaveAttribute('open', '');
    await expect(expanded).toContainText(/Translation|Cloze/);
    await expect(expanded).toContainText(/Recognition|Recall/);
    await expect(expanded).toContainText(/Correct answer/i);
    await expect(expanded).toContainText(/Correct|Incorrect/);
    expect(await expanded.locator('time[datetime]').count()).toBeGreaterThan(1);
  });

  test('scopes per-Sense practice statistics to the selected Learning Language', async ({ page }) => {
    const fixture = await seedEntries('review-history-stats', vocabulary.slice(0, 2));
    const { data: secondLanguage, error: secondLanguageError } = await fixture.client.rpc('create_learning_language', { p_language_tag: 'fr' });
    if (secondLanguageError) throw secondLanguageError;
    const secondLanguageId = (secondLanguage as { id: string }).id;
    await captureEntry(fixture.client, secondLanguageId, 'chat', 'cat');
    await captureEntry(fixture.client, secondLanguageId, 'chien', 'dog');
    await signIn(page, fixture.account);
    await startReview(page);
    await completeReview(page);
    await reviewShell(page).getByRole('button', { name: 'Back to Home' }).click();
    await page.getByLabel('Active Learning Language').selectOption(secondLanguageId);
    await expect(page.getByText(/French.*2 Senses ready/)).toBeVisible();
    await startReview(page);
    await completeReview(page);
    await reviewShell(page).getByRole('button', { name: 'Back to Home' }).click();
    await openHistory(page);
    const stats = page.getByRole('region', { name: /Per-Sense/i });
    await expect(stats.getByText('chat', { exact: true })).toBeVisible();
    await expect(stats.getByText('casa', { exact: true })).toHaveCount(0);
    await expect(stats.getByText(/Practice count/i).first()).toBeVisible();
    expect(await stats.locator('time[datetime]').count()).toBeGreaterThan(0);
    await page.getByLabel('Active Learning Language').selectOption(fixture.learningLanguageId);
    await expect(stats.getByText('casa', { exact: true })).toBeVisible();
    await expect(stats.getByText('chat', { exact: true })).toHaveCount(0);
  });

  test('preserves suspended history, removes deleted details, recomputes summaries, and isolates learners', async ({ page, browser }) => {
    const fixture = await seedEntries('review-history-lifecycle', vocabulary.slice(0, 3));
    await signIn(page, fixture.account);
    await startReview(page);
    await completeReview(page);
    await reviewShell(page).getByRole('button', { name: 'Back to Home' }).click();
    const suspendedId = await bridgeEntryId(fixture.client, fixture.captured[0].vocabularyEntryId);
    const deletedId = await bridgeEntryId(fixture.client, fixture.captured[1].vocabularyEntryId);
    const { error: suspensionError } = await fixture.client.rpc('set_vocabulary_entry_suspended', { p_vocabulary_entry_id: suspendedId, p_suspended: true });
    if (suspensionError) throw suspensionError;
    const { error: deletionError } = await fixture.client.rpc('delete_vocabulary_entry', { p_vocabulary_entry_id: deletedId });
    if (deletionError) throw deletionError;
    await openHistory(page);
    const first = sessionDetails(page).first();
    await first.locator('summary').click();
    const correctAnswers = await first.locator('dt', { hasText: 'Correct answer' }).locator('..').locator('dd').allTextContents();
    expect(correctAnswers.some((answer) => answer === fixture.captured[0].expression || answer === fixture.captured[0].translation)).toBe(true);
    expect(correctAnswers.some((answer) => answer === fixture.captured[1].expression || answer === fixture.captured[1].translation)).toBe(false);
    await expect(first.locator('summary')).toContainText(/\d+\/2/);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    try {
      const other = await registerLearner('review-history-isolation');
      await signIn(secondPage, other.account);
      await openHistory(secondPage);
      await expect(secondPage.getByText(/no completed Review Sessions yet/i)).toBeVisible();
    } finally {
      await secondContext.close();
    }
  });
});
