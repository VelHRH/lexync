import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const browserTimezone = 'Pacific/Auckland';

const vocabulary = [
  ['casa', 'house'],
  ['perro', 'dog'],
  ['nube', 'cloud'],
  ['libro', 'book'],
] as const;

test.use({ timezoneId: browserTimezone });

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
  const learningLanguageId = (language as { id: string }).id;
  await seedEntries(client, learningLanguageId);
  return { account, client };
}

async function seedEntries(client: SupabaseClient, learningLanguageId: string) {
  for (const [expression, translation] of vocabulary) {
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
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function dailyStreak(page: Page) {
  return page.locator('[data-ui="daily-streak"]');
}

async function completeOneLesson(page: Page) {
  await page.goto('/lessons');
  await page.locator('[data-ui="lesson-tile-vocabulary"]').click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  const question = page.getByRole('region', { name: 'Lesson question' });
  await expect(question).toBeVisible();
  const questionCount = await page.getByRole('main').getByRole('progressbar').first().evaluate((element) => (element as HTMLProgressElement).max);
  const complete = page.getByRole('heading', { name: 'Lesson complete', exact: true });
  for (let answered = 0; answered < questionCount && !(await complete.count()); answered += 1) {
    const choice = question.getByRole('radio').first();
    await expect(choice).toBeEnabled();
    await choice.check();
    await expect(page.getByRole('main').locator('.lesson-feedback')).toContainText(/Correct|Incorrect/);
    const advance = page.getByRole('main').getByRole('button', { name: 'Continue' });
    await expect(advance).toBeEnabled();
    await advance.click();
    await expect(complete.or(question.getByRole('radio').first())).toBeVisible();
  }
  await expect(complete).toBeVisible();
}

test.describe('Daily Streak on web', () => {
  test('reports the browser timezone and shows a streak that is not yet extended today', async ({ page }) => {
    const fixture = await registerLearner('streak-not-yet');
    await signIn(page, fixture.account);

    await expect(dailyStreak(page)).toBeVisible();
    await expect(dailyStreak(page)).toHaveAttribute('data-state', 'not-yet-today');
    await expect(dailyStreak(page)).toHaveAccessibleName('Daily Streak: 0 days, not yet today');

    await expect.poll(async () => (await fixture.client.rpc('learner_timezone')).data).toBe(browserTimezone);
  });

  test('shows the extended moment for the first Lesson of the day only, and the sidebar switches to extended today', async ({ page }) => {
    const fixture = await registerLearner('streak-extended');
    await signIn(page, fixture.account);
    await expect(dailyStreak(page)).toHaveAttribute('data-state', 'not-yet-today');

    await completeOneLesson(page);
    const moment = page.locator('[data-ui="daily-streak-extended"]');
    await expect(moment).toBeVisible();
    await expect(moment).toContainText('Daily Streak extended');
    await expect(moment).toContainText('1 day');
    await expect(page.getByRole('status').filter({ has: moment })).toHaveCount(1);

    await page.getByRole('button', { name: 'Back to Lessons' }).click();
    await expect(page).toHaveURL('/lessons');
    await expect(dailyStreak(page)).toHaveAttribute('data-state', 'extended-today');
    await expect(dailyStreak(page)).toHaveAccessibleName('Daily Streak: 1 day, extended today');

    await completeOneLesson(page);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-ui="daily-streak-extended"]')).toHaveCount(0);

    const { data } = await fixture.client.rpc('daily_streak');
    expect(data).toMatchObject({ current: 1, extended_today: true });
  });
});
