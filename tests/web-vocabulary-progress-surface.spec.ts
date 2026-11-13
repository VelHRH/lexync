import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';
import { fileEntry, practiceStreaks, practiseCollection, seedCollection, seedEntries, statesOf } from './support/vocabulary-progress';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

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

function library(page: Page) {
  return page.locator('[data-ui="vocabulary-progress-library"]');
}

function collection(page: Page, collectionId: string) {
  return page.locator(`[data-collection-id="${collectionId}"]`);
}

function headline(scope: Locator) {
  return scope.locator('[data-ui="progress-headline"]').first();
}

async function expectStates(scope: Locator, states: { new: number; inPractice: number; learned: number }) {
  await expect(scope.locator('[data-state="learned"] dd')).toHaveText(String(states.learned));
  await expect(scope.locator('[data-state="in-practice"] dd')).toHaveText(String(states.inPractice));
  await expect(scope.locator('[data-state="new"] dd')).toHaveText(String(states.new));
}

async function renderedStates(scope: Locator) {
  const count = async (state: string) => Number(await scope.locator(`[data-state="${state}"] dd`).innerText());
  return { inPractice: await count('in-practice'), learned: await count('learned'), new: await count('new') };
}

test.describe('Vocabulary Progress surface', () => {
  test('opens from the plaque and breaks the whole library into new, in practice and learned', async ({ page }) => {
    const fixture = await registerLearner('progress-surface-library');
    const entries = await seedEntries(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    await plaque(page).click();
    await expect(page).toHaveURL('/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Vocabulary Progress' })).toBeVisible();
    await expect(library(page)).toBeVisible();
    await expect(headline(library(page))).toContainText(`0 of ${entries.length} learned`);
    await expectStates(library(page), { inPractice: 0, learned: 0, new: entries.length });
    await expect(library(page).locator('[data-ui="progress-bar"]')).toBeVisible();
  });

  test('states the rule behind learned, in practice and new', async ({ page }) => {
    const fixture = await registerLearner('progress-surface-rule');
    await seedEntries(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    await page.goto('/progress');
    await expect(page.getByText('A word is new until a Lesson asks it, and in practice from then on. It counts as learned once every one of its meanings has been answered correctly twice in a row, and a wrong answer resets that count.')).toBeVisible();
  });

  test('gives every Collection in the active Learning Language its own counts and bar', async ({ page }) => {
    const fixture = await registerLearner('progress-surface-collections');
    const entries = await seedEntries(fixture.client, fixture.learningLanguageId);
    const travel = await seedCollection(fixture.client, fixture.learningLanguageId, 'Travel');
    const shelf = await seedCollection(fixture.client, fixture.learningLanguageId, 'Empty shelf');
    const filed = entries.slice(0, 8);
    for (const entry of filed) await fileEntry(fixture.client, travel, entry.vocabularyEntryId);
    await practiseCollection(fixture.client, fixture.learningLanguageId, travel);
    await practiseCollection(fixture.client, fixture.learningLanguageId, travel, 4);
    const streaks = await practiceStreaks(fixture.client);
    const filedStates = statesOf(filed, streaks);
    expect(filedStates.learned, 'the fixture must leave a learned Vocabulary Entry in the Collection').toBeGreaterThan(0);
    expect(filedStates.inPractice, 'the fixture must leave an in-practice Vocabulary Entry in the Collection').toBeGreaterThan(0);

    await signIn(page, fixture.account);
    await page.goto('/progress');

    await expectStates(library(page), statesOf(entries, streaks));
    const shown = await renderedStates(library(page));
    expect(shown.new + shown.inPractice + shown.learned).toBe(entries.length);
    await expect(headline(library(page))).toContainText(`${statesOf(entries, streaks).learned} of ${entries.length} learned`);

    await expect(collection(page, travel).getByRole('heading', { name: 'Travel' })).toBeVisible();
    await expectStates(collection(page, travel), filedStates);
    await expect(headline(collection(page, travel))).toContainText(`${filedStates.learned} of ${filed.length} learned`);
    await expect(collection(page, travel).locator('[data-ui="progress-bar"]')).toBeVisible();

    await expect(collection(page, shelf).getByRole('heading', { name: 'Empty shelf' })).toBeVisible();
    await expectStates(collection(page, shelf), { inPractice: 0, learned: 0, new: 0 });
    await expect(headline(collection(page, shelf))).toContainText('No words filed yet');
    await expect(collection(page, shelf).locator('[data-ui="progress-bar"]')).toBeVisible();
  });

  test('explains Collections to a Learner who has grouped none', async ({ page }) => {
    const fixture = await registerLearner('progress-surface-no-collections');
    const entries = await seedEntries(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    await page.goto('/progress');
    await expectStates(library(page), { inPractice: 0, learned: 0, new: entries.length });
    const collections = page.locator('[data-ui="vocabulary-progress-collections"]');
    await expect(collections.getByRole('heading', { name: 'No Collections yet.' })).toBeVisible();
    await expect(collections).toContainText('A Collection groups the words you want to practise together.');
    await expect(collections.getByRole('link', { name: 'Open your Library' })).toHaveAttribute('href', '/library');
    await expect(page.locator('[data-collection-id]')).toHaveCount(0);
  });

  test('follows a Learning Language switch in both the totals and the Collection list', async ({ page }) => {
    const fixture = await registerLearner('progress-surface-language');
    const spanish = await seedEntries(fixture.client, fixture.learningLanguageId);
    const travel = await seedCollection(fixture.client, fixture.learningLanguageId, 'Travel');
    for (const entry of spanish.slice(0, 8)) await fileEntry(fixture.client, travel, entry.vocabularyEntryId);
    const frenchId = await addLearningLanguage(fixture.client, 'fr');
    const french = await seedEntries(fixture.client, frenchId, [['maison', 'house'], ['chien', 'dog']]);
    const market = await seedCollection(fixture.client, frenchId, 'Market');
    await fileEntry(fixture.client, market, french[0].vocabularyEntryId);

    await signIn(page, fixture.account);
    await page.goto('/progress');
    await selectLearningLanguage(page, fixture.learningLanguageId);
    await expectStates(library(page), { inPractice: 0, learned: 0, new: spanish.length });
    await expect(collection(page, travel)).toBeVisible();
    await expect(collection(page, market)).toHaveCount(0);

    await selectLearningLanguage(page, frenchId);
    await expectStates(library(page), { inPractice: 0, learned: 0, new: french.length });
    await expect(collection(page, market)).toBeVisible();
    await expect(headline(collection(page, market))).toContainText('0 of 1 learned');
    await expect(collection(page, travel)).toHaveCount(0);
  });
});
