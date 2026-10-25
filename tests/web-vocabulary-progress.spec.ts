import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

const vocabulary = [
  ['casa', 'house'],
  ['perro', 'dog'],
  ['nube', 'cloud'],
  ['libro', 'book'],
  ['mesa', 'table'],
  ['puerta', 'door'],
  ['agua', 'water'],
  ['camino', 'road'],
] as const;

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string, languageTag = 'es') {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: languageTag });
  if (languageError) throw languageError;
  return { account, client, learningLanguageId: (language as { id: string }).id };
}

async function addLearningLanguage(client: SupabaseClient, languageTag: string) {
  const { data, error } = await client.rpc('create_learning_language', { p_language_tag: languageTag });
  if (error) throw error;
  return (data as { id: string }).id;
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

async function seedEntries(client: SupabaseClient, learningLanguageId: string, entries: ReadonlyArray<readonly [string, string]> = vocabulary) {
  for (const [expression, translation] of entries) await captureEntry(client, learningLanguageId, expression, translation);
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function plaque(page: Page) {
  return page.getByRole('link', { name: 'Vocabulary Progress' });
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
    await expect(page.getByRole('main').getByRole('status')).toContainText(/Correct|Incorrect/);
    const advance = page.getByRole('main').getByRole('button', { name: 'Continue' });
    await expect(advance).toBeEnabled();
    await advance.click();
    await expect(complete.or(question.getByRole('radio').first())).toBeVisible();
  }
  await expect(complete).toBeVisible();
  return questionCount;
}

test.describe('Vocabulary Progress plaque', () => {
  test('reports the learned count against the total, the in-practice count and a bar, and leads to the progress surface', async ({ page }) => {
    const fixture = await registerLearner('progress-plaque');
    await seedEntries(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    await expect(plaque(page)).toBeVisible();
    await expect(plaque(page)).toContainText('0 of 8 learned');
    await expect(plaque(page)).toContainText('0 in practice');
    await expect(plaque(page).getByRole('progressbar')).toHaveAttribute('max', '8');
    await expect(plaque(page).getByRole('progressbar')).toHaveAttribute('value', '0');
    await expect(plaque(page)).toHaveAttribute('href', '/progress');
  });

  test('counts every Vocabulary Entry practised in one Lesson as in practice and none of them as learned', async ({ page }) => {
    const fixture = await registerLearner('progress-practised');
    await seedEntries(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    const questionCount = await completeOneLesson(page);
    expect(questionCount).toBeGreaterThan(0);
    await page.goto('/');
    await expect(plaque(page)).toContainText(`0 of 8 learned`);
    await expect(plaque(page)).toContainText(`${questionCount} in practice`);
  });

  test('renders for a Learner who has captured no words at all', async ({ page }) => {
    const fixture = await registerLearner('progress-empty');
    await signIn(page, fixture.account);
    await expect(plaque(page)).toBeVisible();
    await expect(plaque(page)).toContainText('No words yet');
    await expect(plaque(page).getByRole('progressbar')).toHaveCount(0);
  });

  test('reports the figures of the Active Learning Language and follows a switch', async ({ page }) => {
    const fixture = await registerLearner('progress-language');
    await seedEntries(fixture.client, fixture.learningLanguageId);
    const secondLanguageId = await addLearningLanguage(fixture.client, 'fr');
    await captureEntry(fixture.client, secondLanguageId, 'maison', 'house');
    await signIn(page, fixture.account);
    await selectLearningLanguage(page, fixture.learningLanguageId);
    await expect(plaque(page)).toContainText('0 of 8 learned');
    await selectLearningLanguage(page, secondLanguageId);
    await expect(plaque(page)).toContainText('0 of 1 learned');
  });
});
