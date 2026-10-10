import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { expectActiveLearningLanguage, selectLearningLanguage } from './support/language-switcher';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

const materialsLinkName = /^(Learning Materials|Materials)$/;

function credentials(prefix = 'web-library-caching') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function register(account: ReturnType<typeof credentials>, pairs: Array<[string, string]> = [['es', 'en']]) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const pairIds: string[] = [];
  for (const [target, reference] of pairs) {
    const result = await client.rpc('create_study_pair', { p_reference_language_tag: reference, p_target_language_tag: target });
    if (result.error) throw result.error;
    pairIds.push((result.data as { id: string }).id);
  }
  return { client, pairIds };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function createEntry(client: Awaited<ReturnType<typeof register>>['client'], pairId: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: '',
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function learningLanguages(client: Awaited<ReturnType<typeof register>>['client']) {
  const { data, error } = await client.from('learning_languages').select('id,language_tag').order('created_at');
  if (error || !data) throw error ?? new Error('The Learning Language fixtures are missing.');
  return data;
}

function collectionCard(page: Page, name: string) {
  return page.getByRole('region', { name: `Collection ${name}` });
}

async function createCollection(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add collection' }).click();
  await page.getByLabel('Collection name').fill(name);
  await page.getByRole('button', { name: 'Create Collection' }).click();
  await expect(collectionCard(page, name)).toBeVisible();
}

function trackRequests(page: Page, pattern: RegExp) {
  let urls: string[] = [];
  page.on('request', (request) => {
    if (pattern.test(request.url())) urls.push(request.url());
  });
  return {
    count: () => urls.length,
    reset: () => { urls = []; },
  };
}

function trackLibraryRequests(page: Page) {
  return trackRequests(page, /\/rest\/v1\/(vocabulary_entries|senses|translations|examples|collections|collection_memberships)(?:[?/]|$)/);
}

async function clickNavLink(page: Page, name: string | RegExp) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name, exact: true }).click();
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

test.describe('web Library data lifetime', () => {
  test('does not refetch Library data on a navigation round trip, while unrelated surfaces still load their own data (AC1, AC11)', async ({ page }) => {
    const account = credentials('web-library-roundtrip');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'perro', 'dog');
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();

    const libraryRequests = trackLibraryRequests(page);
    const lessonOverviewRequests = trackRequests(page, /\/rest\/v1\/rpc\/lesson_overview(?:[?/]|$)/);
    libraryRequests.reset();

    await clickNavLink(page, 'Lessons');
    await expect(page).toHaveURL('/lessons');
    await clickNavLink(page, materialsLinkName);
    await expect(page).toHaveURL('/materials');
    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');

    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading your vocabulary…' })).toHaveCount(0);
    expect(libraryRequests.count()).toBe(0);
    expect(lessonOverviewRequests.count()).toBeGreaterThan(0);

    if (test.info().project.name === 'web-library-caching-mobile') await assertNoHorizontalOverflow(page);
  });

  test('announces a cold load and keeps the Entry list visible during a non-blocking warm refresh (AC2)', async ({ page }) => {
    const account = credentials('web-library-cold-warm');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.route('**/rest/v1/vocabulary_entries*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto('/library');
    await expect(page.getByRole('status').filter({ hasText: 'Loading your vocabulary…' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading your vocabulary…' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Refresh library' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Refreshing your vocabulary…' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading your vocabulary…' })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Refreshing your vocabulary…' })).toHaveCount(0);
  });

  test('loads Library data once per Learning Language when switching the Active Learning Language (AC3)', async ({ page }) => {
    const account = credentials('web-library-language-switch');
    const { client, pairIds } = await register(account, [['es', 'en'], ['it', 'en']]);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[1], 'cane', 'dog');
    const languages = await learningLanguages(client);
    const spanish = languages.find((language) => language.language_tag === 'es');
    const italian = languages.find((language) => language.language_tag === 'it');
    if (!spanish || !italian) throw new Error('The Learning Language fixtures are missing.');

    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    const libraryRequests = trackLibraryRequests(page);
    libraryRequests.reset();
    await selectLearningLanguage(page, italian.id);
    await expectActiveLearningLanguage(page, italian.id);
    await expect(page.locator('summary').filter({ hasText: 'cane' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toHaveCount(0);
    expect(libraryRequests.count()).toBeGreaterThan(0);

    libraryRequests.reset();
    await selectLearningLanguage(page, spanish.id);
    await expectActiveLearningLanguage(page, spanish.id);
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'cane' })).toHaveCount(0);
    expect(libraryRequests.count()).toBe(0);
  });

  test('reflects Add, Edit, Suspend, Resume, and Delete immediately without a page reload (AC4)', async ({ page }) => {
    const account = credentials('web-library-own-mutations');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('perro');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation').fill('dog');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();

    await page.locator('summary').filter({ hasText: 'perro' }).click();
    await page.getByRole('button', { name: 'Edit perro' }).click();
    await page.getByLabel('Expression').fill('perrito');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('summary').filter({ hasText: 'perrito' })).toBeVisible();

    await page.locator('summary').filter({ hasText: 'perrito' }).click();
    await page.getByRole('button', { name: 'Suspend perrito' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Resume perrito' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toHaveCount(0);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete perrito' }).click();
    await expect(page.getByText('perrito', { exact: true })).toHaveCount(0);
  });

  test('reflects Collection creation, membership, rename, and deletion in the Library without reload (AC5)', async ({ page }) => {
    const account = credentials('web-library-collection-mutations');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.goto('/collections');
    await createCollection(page, 'Travel');

    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');
    const summary = page.locator('summary').filter({ hasText: 'casa' });
    const entry = summary.locator('..');
    await summary.click();
    await expect(entry.getByRole('button', { name: 'Add casa to Travel' })).toBeVisible();
    await entry.getByRole('button', { name: 'Add casa to Travel' }).click();
    await expect(entry.getByRole('button', { name: 'Remove casa from Travel' })).toBeVisible();
    await entry.getByRole('button', { name: 'Remove casa from Travel' }).click();
    await expect(entry.getByRole('button', { name: 'Add casa to Travel' })).toBeVisible();

    await clickNavLink(page, 'Collections');
    await expect(page).toHaveURL('/collections');
    await collectionCard(page, 'Travel').getByRole('button', { name: 'Rename Travel' }).click();
    await page.getByLabel('Collection name').fill('Trips');
    await page.getByRole('button', { name: 'Save Collection' }).click();
    await expect(collectionCard(page, 'Trips')).toBeVisible();

    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');
    await summary.click();
    await expect(entry.getByRole('button', { name: 'Add casa to Trips' })).toBeVisible();
    await expect(entry.getByRole('button', { name: /Travel/ })).toHaveCount(0);

    await clickNavLink(page, 'Collections');
    await expect(page).toHaveURL('/collections');
    await collectionCard(page, 'Trips').getByRole('button', { name: 'Delete Trips' }).click();
    await expect(page.getByRole('dialog', { name: 'Delete Collection' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Delete Collection' }).getByRole('button', { name: 'Delete Collection' }).click();
    await expect(collectionCard(page, 'Trips')).toHaveCount(0);

    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');
    await summary.click();
    await expect(entry.getByText('Collections', { exact: true })).toHaveCount(0);

    if (test.info().project.name === 'web-library-caching-mobile') await assertNoHorizontalOverflow(page);
  });

  test('picks up an out-of-band capture only after pressing Refresh library (AC6)', async ({ page }) => {
    const account = credentials('web-library-refresh-out-of-band');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    await createEntry(client, pairIds[0], 'perro', 'dog');
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Refresh library' }).click();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();
  });

  test('reloads Library data only after the 60-second staleness bound elapses on the next mount (AC7)', async ({ page }) => {
    const account = credentials('web-library-staleness');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    await page.clock.install();

    await createEntry(client, pairIds[0], 'perro', 'dog');

    const libraryRequests = trackLibraryRequests(page);
    libraryRequests.reset();
    await clickNavLink(page, 'Lessons');
    await expect(page).toHaveURL('/lessons');
    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toHaveCount(0);
    expect(libraryRequests.count()).toBe(0);

    await page.clock.fastForward('01:30');

    libraryRequests.reset();
    await clickNavLink(page, 'Lessons');
    await expect(page).toHaveURL('/lessons');
    await clickNavLink(page, 'Library');
    await expect(page).toHaveURL('/library');
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();
    expect(libraryRequests.count()).toBeGreaterThan(0);
  });

  test('keeps the existing Entry list and reports an error when a reload fails (AC8)', async ({ page }) => {
    const account = credentials('web-library-reload-failure');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    await page.route('**/rest/v1/vocabulary_entries*', (route) => route.abort());
    await page.getByRole('button', { name: 'Refresh library' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
  });

  test('never shows another learner\'s Vocabulary after switching accounts (AC9)', async ({ page }) => {
    const learnerA = credentials('web-library-learner-a');
    const { client: clientA, pairIds: pairIdsA } = await register(learnerA);
    await createEntry(clientA, pairIdsA[0], 'casa', 'house');
    const learnerB = credentials('web-library-learner-b');
    const { client: clientB, pairIds: pairIdsB } = await register(learnerB);
    await createEntry(clientB, pairIdsB[0], 'otro', 'other');

    await signIn(page, learnerA);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, learnerB);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'otro' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toHaveCount(0);
  });

  test('filters the Library through an in-app query change without requesting more Library data (AC10); opening the capture dialog from add=1 is exercised via a direct navigation because no in-app control reaches that URL', async ({ page }) => {
    const account = credentials('web-library-query-params');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'perro', 'dog');
    const languages = await learningLanguages(client);
    const spanish = languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Learning Language fixtures are missing.');

    const { data: collection, error: collectionError } = await client.rpc('create_collection', {
      p_learning_language_id: spanish.id,
      p_name: 'Travel',
    });
    if (collectionError) throw collectionError;
    const collectionId = (collection as { id: string }).id;

    const { data: casaEntry, error: casaEntryError } = await client
      .from('vocabulary_entries')
      .select('learning_vocabulary_entry_id')
      .eq('id', casa.vocabularyEntryId)
      .single();
    if (casaEntryError || !casaEntry?.learning_vocabulary_entry_id) {
      throw casaEntryError ?? new Error('The canonical Vocabulary Entry fixture is missing.');
    }

    const { error: membershipError } = await client.rpc('add_collection_membership', {
      p_collection_id: collectionId,
      p_learning_vocabulary_entry_id: casaEntry.learning_vocabulary_entry_id,
    });
    if (membershipError) throw membershipError;

    await signIn(page, account);
    await page.goto(`/library?collection=${collectionId}`);
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toHaveCount(0);

    const libraryRequests = trackLibraryRequests(page);
    libraryRequests.reset();

    await page.getByRole('button', { name: 'Clear Collection filter' }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'perro' })).toBeVisible();
    expect(libraryRequests.count()).toBe(0);

    await page.goto('/library?add=1');
    await expect(page.getByLabel('Expression')).toBeVisible();

    if (test.info().project.name === 'web-library-caching-mobile') await assertNoHorizontalOverflow(page);
  });
});
