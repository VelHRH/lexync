import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string, languageTags: string[]) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const languageIds: string[] = [];
  for (const languageTag of languageTags) {
    const result = await client.rpc('create_learning_language', { p_language_tag: languageTag });
    if (result.error) throw result.error;
    languageIds.push((result.data as { id: string }).id);
  }
  return { account, client, languageIds };
}

async function captureEntry(client: SupabaseClient, learningLanguageId: string, answerLanguageTag: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: answerLanguageTag,
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function suspendEntry(client: SupabaseClient, vocabularyEntryId: string) {
  const { data: compatibilityEntry, error: compatibilityError } = await client
    .from('vocabulary_entries')
    .select('id')
    .eq('learning_vocabulary_entry_id', vocabularyEntryId)
    .single();
  if (compatibilityError || !compatibilityEntry) throw compatibilityError ?? new Error('The compatibility Vocabulary Entry fixture is missing.');
  const { error } = await client.rpc('set_vocabulary_entry_suspended', {
    p_suspended: true,
    p_vocabulary_entry_id: compatibilityEntry.id,
  });
  if (error) throw error;
}

async function seedRecognitionChoices() {
  const { account, client, languageIds } = await registerLearner('recognition-choices', ['es', 'it']);
  const spanish = languageIds[0];
  const italian = languageIds[1];
  await captureEntry(client, spanish, 'en', 'casa', 'house');
  await captureEntry(client, spanish, 'en', 'perro', 'dog');
  await captureEntry(client, spanish, 'en', 'libro', 'book');
  await captureEntry(client, spanish, 'en', 'mesa', 'table');
  await captureEntry(client, spanish, 'en', 'can', ' DOG ');
  const suspended = await captureEntry(client, spanish, 'en', 'nube', 'cloud');
  await suspendEntry(client, suspended.vocabularyEntryId);
  await captureEntry(client, spanish, 'uk', 'fruta', 'фрукт');
  await captureEntry(client, italian, 'en', 'gatto', 'cat');
  const other = await registerLearner('recognition-choices-other', ['es']);
  await captureEntry(other.client, other.languageIds[0], 'en', 'privado', 'private');
  return { account, client };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

test.describe('web Scheduled Recognition', () => {
  test('shows owned due counts by Learning Language and starts only the active language', async ({ page }) => {
    const { account, client, languageIds } = await registerLearner('recognition-counts', ['es', 'it']);
    const spanish = languageIds[0];
    const italian = languageIds[1];
    await captureEntry(client, spanish, 'en', 'casa', 'house');
    await captureEntry(client, spanish, 'en', 'casa', 'home');
    const suspended = await captureEntry(client, spanish, 'en', 'nube', 'cloud');
    await suspendEntry(client, suspended.vocabularyEntryId);
    await captureEntry(client, italian, 'en', 'gatto', 'cat');
    const other = await registerLearner('recognition-other', ['es']);
    await captureEntry(other.client, other.languageIds[0], 'en', 'privado', 'private');

    await signIn(page, account);
    const counts = page.getByRole('region', { name: 'Scheduled Review due counts' });
    await expect(counts.getByText('Spanish 2 due', { exact: true })).toBeVisible();
    await expect(counts.getByText('Italian 2 due', { exact: true })).toHaveCount(0);
    await expect(page.getByText('privado', { exact: true })).toHaveCount(0);
    await page.getByLabel('Active Learning Language').selectOption(italian);
    await expect(counts.getByText('Italian 2 due', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start review' }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByText('gatto', { exact: true })).toBeVisible();
    await expect(page.getByText('casa', { exact: true })).toHaveCount(0);
    await page.getByLabel('Active Learning Language').selectOption(spanish);
    await page.getByRole('link', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('árbol');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('tree');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(counts.getByText('Spanish 4 due', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Start review' }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByText('gatto', { exact: true })).toHaveCount(0);
    await expect(page.getByText('nube', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('reveals, overrides Again, records each direction once, and restores the derived schedule', async ({ page }) => {
    const { account, client, languageIds } = await registerLearner('recognition-review', ['es']);
    await captureEntry(client, languageIds[0], 'en', 'casa', 'house');
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

    await page.getByRole('button', { name: 'Reveal translation' }).press('Enter');
    await page.getByRole('radio', { name: 'Good' }).check();
    await page.getByRole('button', { name: 'Confirm review' }).press('Enter');
    await expect(page.getByText('No recognition Cards are due for Spanish.')).toBeVisible();

    const { data: events, error } = await client.from('review_events').select('card_id, rating');
    if (error) throw error;
    expect(events).toHaveLength(2);
    expect(events?.every((event) => event.rating === 'good')).toBeTruthy();

    await page.reload();
    await expect(page.getByText('No recognition Cards are due for Spanish.')).toBeVisible();
    const { count, error: countError } = await client.from('review_events').select('*', { count: 'exact', head: true });
    if (countError) throw countError;
    expect(count).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('offers four credible choices, preselects Good for a correct answer, and records a keyboard override once', async ({ page }) => {
    const { account, client } = await seedRecognitionChoices();
    await signIn(page, account);
    await page.goto('/review');

    await expect(page.getByText('casa', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal translation' })).toHaveCount(0);
    const answerNames = ['house', 'dog', 'book', 'table'];
    const answerRadios = page.getByRole('radio');
    await expect(answerRadios).toHaveCount(4);
    for (const answerName of answerNames) {
      await expect(page.getByRole('radio', { name: answerName, exact: true })).toHaveCount(1);
    }
    await expect(page.getByText('cloud', { exact: true })).toHaveCount(0);
    await expect(page.getByText('фрукт', { exact: true })).toHaveCount(0);
    await expect(page.getByText('cat', { exact: true })).toHaveCount(0);
    await expect(page.getByText('private', { exact: true })).toHaveCount(0);

    const correctAnswer = page.getByRole('radio', { name: 'house', exact: true });
    await correctAnswer.focus();
    await correctAnswer.press('Space');
    await expect(page.getByRole('radio', { name: 'Good', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Again', exact: true }).check();
    const confirm = page.getByRole('button', { name: 'Confirm review' });
    await confirm.focus();
    await confirm.press('Enter');
    await expect(page.getByRole('status')).toContainText('Review recorded. Next review');

    const { data: events, error } = await client.from('review_events').select('rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].rating).toBe('again');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('preselects Again for an incorrect choice and allows a rating override', async ({ page }) => {
    const { account, client } = await seedRecognitionChoices();
    await signIn(page, account);
    await page.goto('/review');

    await page.getByRole('radio', { name: 'dog', exact: true }).check();
    await expect(page.getByRole('radio', { name: 'Again', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Hard', exact: true }).check();
    await page.getByRole('button', { name: 'Confirm review' }).click();
    await expect(page.getByRole('status')).toContainText('Review recorded. Next review');

    const { data: events, error } = await client.from('review_events').select('rating');
    if (error) throw error;
    expect(events).toHaveLength(1);
    expect(events?.[0].rating).toBe('hard');
  });
});
