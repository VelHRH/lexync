import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';
import { PROGRESS_STATE_COPY, defaultVocabulary, fileEntry, practiceStreaks, practiseToMixedStates, seedCollection, seedEntries, stateOf, statesOf } from './support/vocabulary-progress';
import { chooseOption, expectSelectValue, themedSelect } from './support/select';
import { addEntryToCollection, createCollectionFromEntry, entryCollectionPicker, openEntryCollectionPicker, removeFromCollectionButton } from './support/entry-collections';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-vocabulary') {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerWithPair(account: ReturnType<typeof credentials>) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: pair, error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
  if (pairError) throw pairError;
  return { client, pair: pair as { id: string } };
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function createEntry(client: Awaited<ReturnType<typeof registerWithPair>>['client'], pairId: string, expression: string, translation: string, example = '') {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
  return data as { vocabularyEntryId: string };
}

async function storedClipPath(client: Awaited<ReturnType<typeof registerWithPair>>['client']) {
  const { data, error } = await client.from('learning_vocabulary_entries').select('audio_clip_path').limit(1).single();
  if (error) throw error;
  return (data as { audio_clip_path: string | null }).audio_clip_path;
}

function audioClipControls(page: Page) {
  return page.getByRole('group', { name: 'Audio Clip' });
}

function playControl(page: Page, expression: string) {
  return page.locator('[data-ui="vocabulary-row-audio"]').getByRole('button', { name: `Play the pronunciation of ${expression}` });
}

async function recordClip(page: Page) {
  await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
  const stop = audioClipControls(page).getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeEnabled();
  await stop.click();
}

async function learnerIdOf(client: Awaited<ReturnType<typeof registerWithPair>>['client']) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error ?? new Error('The local learner is missing.');
  return data.user.id;
}

async function storedClipObjects(client: Awaited<ReturnType<typeof registerWithPair>>['client'], prefix: string): Promise<string[]> {
  const { data, error } = await client.storage.from('vocabulary-audio-clips').list(prefix, { limit: 100 });
  if (error) throw error;
  const found: string[] = [];
  for (const item of data ?? []) {
    const name = `${prefix}/${item.name}`;
    if (item.id) found.push(name);
    else found.push(...await storedClipObjects(client, name));
  }
  return found;
}

async function captureWithClip(page: Page, expression: string, translation: string) {
  await page.getByRole('button', { name: 'Add vocabulary' }).click();
  await page.getByLabel('Expression').fill(expression);
  await page.getByLabel('Answer Language').fill('en');
  await page.getByLabel('Translation', { exact: true }).fill(translation);
  await recordClip(page);
  await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
  await expect(page.getByLabel('Expression')).toHaveCount(0);
}

async function expandEntry(page: Page, expression: string) {
  const summary = page.locator('summary').filter({ hasText: expression });
  await expect(summary).toBeVisible();
  await summary.click();
}

async function openEditor(page: Page, expression: string) {
  await expandEntry(page, expression);
  await page.getByRole('button', { name: `Edit ${expression}` }).click();
  await expect(audioClipControls(page)).toBeVisible();
}

function expandedEntry(page: Page, expression: string) {
  return page.locator('.vocabulary-entry-item').filter({ has: page.locator('summary').filter({ hasText: expression }) });
}

async function learningLanguageIdFor(client: Awaited<ReturnType<typeof registerWithPair>>['client'], languageTag: string) {
  const { data, error } = await client.from('learning_languages').select('id,language_tag');
  if (error || !data) throw error ?? new Error('The Learning Language fixtures are missing.');
  const language = data.find((row) => (row as { language_tag: string }).language_tag === languageTag);
  if (!language) throw new Error(`The ${languageTag} Learning Language fixture is missing.`);
  return (language as { id: string }).id;
}

async function captureSense(
  client: Awaited<ReturnType<typeof registerWithPair>>['client'],
  learningLanguageId: string,
  expression: string,
  translation: string,
  createNewSense = false,
) {
  const { error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: createNewSense,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_translation: translation,
  });
  if (error) throw error;
}

async function seedCollections(client: Awaited<ReturnType<typeof registerWithPair>>['client'], learningLanguageId: string, names: string[]) {
  for (const name of names) {
    const { error } = await client.rpc('create_collection', { p_learning_language_id: learningLanguageId, p_name: name });
    if (error) throw error;
  }
}

function progressState(page: Page, expression: string) {
  return expandedEntry(page, expression).locator('[data-ui="entry-progress-state"]');
}

const spacingScale = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];

test.describe('web Vocabulary Entry library', () => {
  test('searches and filters only the active Learning Language', async ({ page }) => {
    const account = credentials('web-discovery');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');
    await createEntry(client, pair.id, 'nube', 'cloud');
    const { data: otherPair, error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'it', p_reference_language_tag: 'en' });
    if (pairError) throw pairError;
    await createEntry(client, (otherPair as { id: string }).id, 'casa italiana', 'Italian house');

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('house');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.getByText('casa italiana', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('nube');
    await expect(page.locator('summary').filter({ hasText: 'nube' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toHaveCount(0);
    await expect(page.getByText('Vocabulary status', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('');
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'nube' })).toBeVisible();
    const { data: languages, error: languagesError } = await client.from('learning_languages').select('id,language_tag');
    if (languagesError) throw languagesError;
    const italian = languages?.find((language) => language.language_tag === 'it');
    if (!italian) throw new Error('The Italian Learning Language fixture is missing.');
    await selectLearningLanguage(page, italian.id);
    await expect(page.locator('summary').filter({ hasText: 'casa italiana' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'nube' })).toHaveCount(0);
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('distinguishes an empty library from search results', async ({ page }) => {
    const account = credentials('web-empty');
    const { client } = await registerWithPair(account);
    const { error } = await client.rpc('create_study_pair', { p_target_language_tag: 'it', p_reference_language_tag: 'en' });
    if (error) throw error;
    await signIn(page, account);
    await page.goto('/library');
    await expect(page.getByText('No vocabulary entries yet. Add your first one.')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search vocabulary' }).fill('missing');
    await expect(page.getByText('No Vocabulary Entries match “missing”.')).toBeVisible();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('shows the Vocabulary Progress State of every word on its Library row', async ({ page }) => {
    const account = credentials('web-row-progress');
    const { client } = await registerWithPair(account);
    const learningLanguageId = await learningLanguageIdFor(client, 'es');
    const entries = await seedEntries(client, learningLanguageId);
    const travel = await seedCollection(client, learningLanguageId, 'Travel');
    for (const entry of entries.slice(0, 8)) await fileEntry(client, travel, entry.vocabularyEntryId);
    await practiseToMixedStates(client, learningLanguageId, travel);
    const streaks = await practiceStreaks(client);
    const tally = statesOf(entries, streaks);
    expect(tally.learned, 'the fixture must leave a learned word in the Library').toBeGreaterThan(0);
    expect(tally.inPractice, 'the fixture must leave a word in practice in the Library').toBeGreaterThan(0);
    expect(tally.new, 'the fixture must leave an unpractised word in the Library').toBeGreaterThan(0);

    await signIn(page, account);
    await page.goto('/library');
    for (const [index, [expression]] of defaultVocabulary.entries()) {
      await expect(progressState(page, expression)).toHaveText(PROGRESS_STATE_COPY[stateOf(entries[index], streaks)]);
    }
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('filters the Library to one Vocabulary Progress State and explains a state with no words', async ({ page }) => {
    const account = credentials('web-progress-filter');
    const { client } = await registerWithPair(account);
    const learningLanguageId = await learningLanguageIdFor(client, 'es');
    const entries = await seedEntries(client, learningLanguageId);
    const travel = await seedCollection(client, learningLanguageId, 'Travel');
    for (const entry of entries.slice(0, 8)) await fileEntry(client, travel, entry.vocabularyEntryId);
    await practiseToMixedStates(client, learningLanguageId, travel);
    const streaks = await practiceStreaks(client);
    const tally = statesOf(entries, streaks);

    await signIn(page, account);
    await page.goto('/library');
    await expect(page.locator('[data-ui="entry-progress-state"]')).toHaveCount(entries.length);

    for (const [state, expected] of [['learned', tally.learned], ['in-practice', tally.inPractice], ['new', tally.new]] as const) {
      await chooseOption(page, 'Vocabulary Progress State', state);
      await expect(page.locator('[data-ui="entry-progress-state"]')).toHaveCount(expected);
      await expect(page.locator(`[data-ui="entry-progress-state"][data-state="${state}"]`)).toHaveCount(expected);
      await expect(page.locator('.library-toolbar')).toContainText(`${expected} shown`);
    }

    await chooseOption(page, 'Vocabulary Progress State', 'all');
    await expect(page.locator('[data-ui="entry-progress-state"]')).toHaveCount(entries.length);
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('shows an Entry with its details and no Suspend or Resume action', async ({ page }) => {
    const account = credentials('web-no-suspension');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    const summary = page.locator('summary').filter({ hasText: 'descubrir' });
    await summary.focus();
    await page.keyboard.press('Enter');
    const entry = summary.locator('..');
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
    await expect(entry.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Edit descubrir' })).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Suspend descubrir' })).toHaveCount(0);
    await expect(entry.getByRole('button', { name: 'Resume descubrir' })).toHaveCount(0);
    await expect(page.getByText('Suspended', { exact: true })).toHaveCount(0);
  });

  test('keeps an open Add Vocabulary draft through rerenders and tab switches', async ({ page }) => {
    const account = credentials('web-vocabulary-draft');
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Quiero descubrir la ciudad.');

    await themedSelect(page, 'Vocabulary Progress State').dispatchEvent('click');
    await page.locator('#vocabulary-progress-state-listbox [role="option"][data-value="new"]').dispatchEvent('click');
    await expectSelectValue(page, 'Vocabulary Progress State', 'new');

    const secondPage = await page.context().newPage();
    await secondPage.goto('/');
    await secondPage.bringToFront();
    await page.bringToFront();

    await expect(page.getByLabel('Expression')).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('descubrir');
    await expect(page.getByLabel('Answer Language')).toHaveValue('en');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('to discover');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('Quiero descubrir la ciudad.');
    await secondPage.close();
  });

  test('creates repeated entries without navigation and preserves validation values', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    const unloadMarker = `web-vocabulary-unload-${crypto.randomUUID()}`;
    await page.evaluate((key) => {
      window.addEventListener('beforeunload', () => {
        window.sessionStorage.setItem(key, 'unloaded');
      });
    }, unloadMarker);
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    if (test.info().project.name === 'web-vocabulary-mobile') {
      await expect(page.getByLabel('Expression')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Quiero descubrir la ciudad.');
    await page.evaluate((key) => window.sessionStorage.removeItem(key), unloadMarker);
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.locator('summary').filter({ hasText: 'descubrir' })).toBeVisible();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), unloadMarker)).toBeNull();
    await expect(page).toHaveURL('/library');

    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByRole('heading', { name: 'descubrir' })).toBeVisible();
    await expect(entry.getByText(/^to discover en$/)).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('');
    await page.getByLabel('Expression').fill('fallo');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('failure');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Esto es un fallo.');
    await page.evaluate((key) => window.sessionStorage.removeItem(key), unloadMarker);
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'fallo' })).toBeVisible();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), unloadMarker)).toBeNull();
    await expect(page).toHaveURL('/library');

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('');
    await page.route('**/rest/v1/rpc/capture_learning_language_entry', (route) => route.abort());
    await page.getByLabel('Expression').fill('error');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('mistake');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Es un error menor.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('error');
    await expect(page.getByLabel('Answer Language')).toHaveValue('en');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('mistake');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('Es un error menor.');
    await page.unroute('**/rest/v1/rpc/capture_learning_language_entry');
    await page.getByLabel('Answer Language').fill('not_a_language');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid BCP 47 Answer Language tag.' })).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('error');
    await expect(page.getByLabel('Answer Language')).toHaveValue('not_a_language');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('mistake');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('Es un error menor.');
  });

  test('reuses equivalent expressions and enriches the existing entry', async ({ page }) => {
    const account = credentials();
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('Casa');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('house');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('summary').filter({ hasText: 'Casa' })).toBeVisible();
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toBeVisible();
    await page.getByLabel('Expression').fill(' casa ');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('home');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Mi casa es pequeña.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    const entry = page.locator('summary').filter({ hasText: 'Casa' });
    await entry.click();
    const entryDetails = entry.locator('..');
    await expect(entryDetails.getByRole('heading', { name: 'Casa' })).toHaveCount(1);
    await expect(entryDetails.getByText(/^house en$/)).toBeVisible();
    await expect(entryDetails.getByText(/^home en$/)).toBeVisible();
    await expect(entryDetails.getByText('Mi casa es pequeña.')).toBeVisible();
  });

  test('cancels an Add Vocabulary draft and clears it on reopen', async ({ page }) => {
    const account = credentials('web-vocabulary-cancel');
    await registerWithPair(account);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('cancelar');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('cancel');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Cancelar esta captura.');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(page.getByLabel('Expression')).toHaveValue('');
    await expect(page.getByLabel('Answer Language')).toHaveValue('');
    await expect(page.getByLabel('Translation', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Example (optional)', { exact: true })).toHaveValue('');
  });

  test('shows extension material only to its owner', async ({ page }) => {
    const owner = credentials('web-owner');
    const { client, pair } = await registerWithPair(owner);
    const { error } = await client.rpc('capture_manual_entry', {
      p_expression: 'biblioteca',
      p_example: 'La biblioteca abre temprano.',
      p_study_pair_id: pair.id,
      p_translation: 'library',
    });
    if (error) throw error;
    await signIn(page, owner);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'biblioteca' }).click();
    const entry = page.locator('summary').filter({ hasText: 'biblioteca' }).locator('..');
    await expect(entry.getByRole('heading', { name: 'biblioteca' })).toBeVisible();
    await expect(entry.getByText(/^library en$/)).toBeVisible();

    const other = credentials('web-other');
    const { client: otherClient } = await registerWithPair(other);
    const { error: ownershipError } = await otherClient.rpc('capture_manual_entry', { p_expression: 'intruso', p_study_pair_id: pair.id, p_translation: 'intruder' });
    expect(ownershipError).toBeTruthy();
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, other);
    await page.goto('/library');
    await expect(page.getByText('biblioteca', { exact: true })).toHaveCount(0);
  });

  test('corrects Senses, translations, and Examples as one aggregate', async ({ page }) => {
    const account = credentials('web-editor');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Esta ciudad es fácil de descubrir.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Expression').fill('descubrir algo');
    await page.getByLabel('Sense 1 translation 1').fill('discover');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 2').fill('find out');
    await page.getByRole('button', { name: 'Add Sense' }).click();
    await page.getByLabel('Sense 2 translation 1').fill('uncover');
    await page.getByRole('button', { name: 'Remove Example 2' }).click();
    await page.getByLabel('Example 1 text').fill('Quiero descubrir algo nuevo.');
    await chooseOption(page, 'Example 1 Sense', { label: 'Sense 2 · uncover' });
    await page.getByRole('button', { name: 'Add Example to Sense 2' }).click();
    await page.getByLabel('Example 2 text').fill('Descubrimos la respuesta.');
    await page.getByRole('button', { name: 'Save changes' }).press('Enter');

    const updatedEntry = page.locator('summary').filter({ hasText: 'descubrir algo' });
    await updatedEntry.click();
    const updatedDetails = updatedEntry.locator('..');
    await expect(updatedDetails.getByRole('heading', { name: 'descubrir algo' })).toBeVisible();
    await expect(updatedDetails.getByText(/^discover en$/)).toBeVisible();
    await expect(updatedDetails.getByText(/^find out en$/)).toBeVisible();
    await expect(updatedDetails.getByText(/^uncover en$/)).toBeVisible();
    await expect(updatedDetails.getByText('Quiero descubrir algo nuevo.')).toBeVisible();

    const { data: snapshot, error } = await client.rpc('account_vocabulary_snapshot');
    if (error) throw error;
    expect(JSON.stringify(snapshot)).toContain('descubrir algo');
    expect(JSON.stringify(snapshot)).toContain('Quiero descubrir algo nuevo.');
    expect(JSON.stringify(snapshot)).not.toContain('Esta ciudad es fácil de descubrir.');
    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  });

  test('keeps invalid and unsaved aggregate changes recoverable', async ({ page }) => {
    const account = credentials('web-validation');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house', 'La casa es azul.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'casa' }).click();
    await page.getByRole('button', { name: 'Edit casa' }).click();
    await page.getByRole('button', { name: 'Remove translation 1 from Sense 1' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Each Sense needs at least one translation.' })).toBeVisible();
    await expect(page.getByLabel('Expression')).toHaveValue('casa');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 1').fill('house');
    await page.getByRole('button', { name: 'Add translation to Sense 1' }).click();
    await page.getByLabel('Sense 1 translation 2').fill(' HOUSE ');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Translations in a Sense must be distinct.' })).toBeVisible();
    await page.getByLabel('Sense 1 translation 2').fill('home');
    await page.route('**/rest/v1/rpc/update_vocabulary_entry', (route) => route.abort());
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Changes could not be saved' })).toBeVisible();
    await expect(page.getByLabel('Sense 1 translation 2')).toHaveValue('home');
  });

  test('supports keyboard-only correction and confirmed deletion', async ({ page }) => {
    const account = credentials('web-keyboard');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'teclado', 'keyboard');
    await signIn(page, account);
    await page.goto('/library');
    const summary = page.locator('summary').filter({ hasText: 'teclado' });
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Add to collection' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit teclado' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByLabel('Expression').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('teclado nuevo');
    await page.getByRole('button', { name: 'Save changes' }).focus();
    await page.keyboard.press('Enter');
    const updatedSummary = page.locator('summary').filter({ hasText: 'teclado nuevo' });
    await updatedSummary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Add to collection' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit teclado nuevo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Delete teclado nuevo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Delete Vocabulary Entry' }).getByRole('button', { name: 'Delete Vocabulary Entry' }).click();
    await expect(page.getByText('teclado nuevo', { exact: true })).toHaveCount(0);
  });

  test('disables mutation offline and deletes one Entry with explicit consequences', async ({ page }) => {
    const account = credentials('web-delete');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'borrar', 'delete', 'Voy a borrar esto.');
    await createEntry(client, pair.id, 'guardar', 'keep');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'borrar' }).click();
    await page.context().setOffline(true);
    await expect(page.getByRole('button', { name: 'Add vocabulary' })).toBeDisabled();
    await expect(page.getByLabel('Add vocabulary unavailable offline')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit borrar' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete borrar' })).toBeDisabled();
    await expect(page.getByText('You are offline. Vocabulary and Collection changes require a connection.')).toBeVisible();
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    const nativeDialogs: string[] = [];
    page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });

    await page.getByRole('button', { name: 'Delete borrar' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete Vocabulary Entry' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Senses, translations, Examples, and learning progress');
    await expect(confirmation).toContainText('borrar');
    await expect(confirmation).toContainText('cannot be undone');

    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'borrar' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete borrar' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Delete Vocabulary Entry' })).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'borrar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete borrar' })).toBeFocused();

    await page.getByRole('button', { name: 'Delete borrar' }).click();
    await page.getByRole('dialog', { name: 'Delete Vocabulary Entry' }).getByRole('button', { name: 'Delete Vocabulary Entry' }).click();
    await expect(page.getByText('borrar', { exact: true })).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'guardar' })).toBeVisible();
    expect(nativeDialogs).toEqual([]);
  });

  test('writes a translation for an Example and sees it after saving and reloading', async ({ page }) => {
    const account = credentials('web-example-translation');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toBeVisible();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await expect(page.getByLabel('Example 1 translation', { exact: true })).toHaveValue('I want to discover the city.');
  });

  test('edits an existing Example Translation', async ({ page }) => {
    const account = credentials('web-example-translation-edit');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I wish to explore the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I wish to explore the city\. en$/)).toBeVisible();
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toHaveCount(0);
  });

  test('clearing the field removes the translation and keeps the Example', async ({ page }) => {
    const account = credentials('web-example-translation-clear');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the city.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 translation', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText(/^I want to discover the city\. en$/)).toHaveCount(0);
    await expect(entry.getByText('Quiero descubrir la ciudad.')).toBeVisible();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await expect(page.getByLabel('Example 1 translation', { exact: true })).toHaveValue('');
  });

  test('saves an Example that has no translation', async ({ page }) => {
    const account = credentials('web-example-translation-none');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
    await signIn(page, account);
    await page.goto('/library');
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    await page.getByRole('button', { name: 'Edit descubrir' }).click();
    await page.getByLabel('Example 1 text').fill('Quiero descubrir algo nuevo.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(page.getByText(/Changes could not be saved/)).toHaveCount(0);
    await page.reload();
    await page.locator('summary').filter({ hasText: 'descubrir' }).click();
    const entry = page.locator('summary').filter({ hasText: 'descubrir' }).locator('..');
    await expect(entry.getByText('Quiero descubrir algo nuevo.')).toBeVisible();
  });

  test('records an Audio Clip for a word, plays it back before keeping it, and keeps it reachable from the Library', async ({ page }) => {
    const account = credentials('web-audio-record');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(0);

    await recordClip(page);
    const preview = audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]');
    await expect(audioClipControls(page).getByRole('button', { name: 'Play the recording to listen back' })).toBeVisible();
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).hasAttribute('autoplay'))).toBe(false);

    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(1);
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.reload();
    const player = page.locator('[data-ui="vocabulary-row-audio"] [data-ui="vocabulary-audio-clip"]');
    await expect(playControl(page, 'casa')).toBeVisible();
    expect(await player.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await player.evaluate((element) => (element as HTMLAudioElement).hasAttribute('autoplay'))).toBe(false);
    expect(await player.evaluate((element) => (element as HTMLAudioElement).controls)).toBe(false);
  });

  test('records an Audio Clip while capturing a word and keeps it with the saved word', async ({ page }) => {
    const account = credentials('web-capture-audio');
    await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await expect(audioClipControls(page).getByText('No pronunciation yet')).toBeVisible();

    await recordClip(page);
    const preview = audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]');
    await expect(audioClipControls(page).getByRole('button', { name: 'Play the recording to listen back' })).toBeVisible();
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await preview.evaluate((element) => (element as HTMLAudioElement).hasAttribute('autoplay'))).toBe(false);

    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'descubrir' })).toBeVisible();

    await page.reload();
    await expect(playControl(page, 'descubrir')).toBeVisible();
  });

  test('keeps a recording the Learner never stopped before saving the word', async ({ page }) => {
    const account = credentials('web-capture-audio-running');
    const { client } = await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Stop recording' })).toBeVisible();

    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(playControl(page, 'descubrir')).toBeVisible();
    expect(await storedClipPath(client)).not.toBeNull();
  });

  test('keeps a recording the Learner stops and saves in one motion', async ({ page }) => {
    const account = credentials('web-capture-audio-rushed');
    const { client } = await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await audioClipControls(page).getByRole('button', { name: 'Stop recording' }).click();
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(playControl(page, 'descubrir')).toBeVisible();
    expect(await storedClipPath(client)).not.toBeNull();
  });

  test('reports a recording that could not be kept apart from the word that was saved', async ({ page }) => {
    const account = credentials('web-capture-audio-failure');
    await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    await page.route('**/storage/v1/object/vocabulary-audio-clips/**', (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Bucket not found', message: 'Bucket not found', statusCode: '404' }),
    }));
    await captureWithClip(page, 'descubrir', 'to discover');

    await expect(page.getByRole('alert').filter({ hasText: 'This server cannot store pronunciations yet' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Saved “descubrir” to your vocabulary.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'cannot store pronunciations' })).toHaveCount(0);
    await expect(playControl(page, 'descubrir')).toHaveCount(0);
  });

  test('closes the capture dialog without waiting for the Library to reload', async ({ page }) => {
    const account = credentials('web-capture-audio-close');
    await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    const held: Array<() => void> = [];
    let holding = true;
    await page.route('**/rest/v1/rpc/vocabulary_progress_states', async (route) => {
      if (holding) await new Promise<void>((resolve) => { held.push(resolve); });
      await route.continue();
    });

    await captureWithClip(page, 'descubrir', 'to discover');
    await expect(page.getByRole('status').filter({ hasText: 'Saved “descubrir” to your vocabulary.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Refreshing your vocabulary…' })).toBeAttached();

    holding = false;
    for (const release of held) release();
    await expect(playControl(page, 'descubrir')).toBeVisible();
  });

  test('reports a pending state the Learner can see while the capture dialog writes', async ({ page }) => {
    const account = credentials('web-capture-pending');
    await registerWithPair(account);

    await signIn(page, account);
    await page.goto('/library');
    const held: Array<() => void> = [];
    await page.route('**/rest/v1/rpc/capture_learning_language_entry', async (route) => {
      await new Promise<void>((resolve) => { held.push(resolve); });
      await route.continue();
    });

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Saving “descubrir”' })).toBeVisible();
    await expect(page.getByLabel('Expression')).toBeDisabled();

    for (const release of held) release();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'descubrir' })).toBeVisible();
  });

  test('offers a word its pronunciation in the read view, without opening the editor', async ({ page }) => {
    const account = credentials('web-audio-read-view');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await expandEntry(page, 'casa');
    await expect(audioClipControls(page).getByText('No pronunciation yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit casa' })).toBeVisible();

    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    await expect(playControl(page, 'casa')).toBeVisible();
    expect(await storedClipPath(client)).not.toBeNull();

    await page.reload();
    await expandEntry(page, 'casa');
    await expect(audioClipControls(page).getByRole('button', { name: 'Replace recording' })).toBeVisible();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(1);

    await audioClipControls(page).getByRole('button', { name: 'Remove recording' }).click();
    await expect(audioClipControls(page).getByText('No pronunciation yet')).toBeVisible();
    await expect(playControl(page, 'casa')).toHaveCount(0);
  });

  test('saves a captured word when the Learner declines the microphone', async ({ page }) => {
    const account = credentials('web-capture-audio-declined');
    await registerWithPair(account);

    await signIn(page, account);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      });
    });
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByText(/could not use your microphone/i)).toBeVisible();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]')).toHaveCount(0);

    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await page.getByLabel('Example (optional)', { exact: true }).fill('Quiero descubrir la ciudad.');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);

    await expect(playControl(page, 'descubrir')).toHaveCount(0);
    await expandEntry(page, 'descubrir');
    await expect(page.getByText(/^to discover en$/)).toBeVisible();
    await expect(page.getByText('Quiero descubrir la ciudad.')).toBeVisible();
  });

  test('stores nothing when the Learner abandons the dialog after recording', async ({ page }) => {
    const account = credentials('web-capture-audio-abandoned');
    const { client } = await registerWithPair(account);
    const learnerId = await learnerIdOf(client);

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await recordClip(page);
    await expect(audioClipControls(page).getByRole('button', { name: 'Play the recording to listen back' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    expect(await storedClipObjects(client, learnerId)).toEqual([]);

    await page.getByRole('button', { name: 'Add vocabulary' }).click();
    await expect(audioClipControls(page).getByText('No pronunciation yet')).toBeVisible();
    await page.getByLabel('Expression').fill('descubrir');
    await page.getByLabel('Answer Language').fill('en');
    await page.getByLabel('Translation', { exact: true }).fill('to discover');
    await page.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByLabel('Expression')).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'descubrir' })).toBeVisible();

    expect(await storedClipObjects(client, learnerId)).toEqual([]);
    expect(await storedClipPath(client)).toBeNull();
    await expect(playControl(page, 'descubrir')).toHaveCount(0);
  });

  test('keeps the pronunciation a word already has when the Learner captures it again', async ({ page }) => {
    const account = credentials('web-capture-audio-existing');
    const { client } = await registerWithPair(account);
    const learnerId = await learnerIdOf(client);

    await signIn(page, account);
    await page.goto('/library');
    await captureWithClip(page, 'casa', 'house');
    await expect(playControl(page, 'casa')).toBeVisible();
    const firstPath = await storedClipPath(client);
    expect(firstPath).not.toBeNull();
    expect(await storedClipObjects(client, learnerId)).toEqual([firstPath]);

    await captureWithClip(page, 'casa', 'home');
    await expect(page.getByRole('alert').filter({ hasText: 'already had a pronunciation' })).toBeVisible();
    expect(await storedClipPath(client)).toBe(firstPath);
    expect(await storedClipObjects(client, learnerId)).toEqual([firstPath]);
    expect((await client.storage.from('vocabulary-audio-clips').download(firstPath as string)).error).toBeNull();

    await expandEntry(page, 'casa');
    await expect(page.getByText(/^home en$/)).toBeVisible();
  });

  test('plays a recorded word from its Library row, and offers nothing for a word without a recording', async ({ page }) => {
    const account = credentials('web-audio-row');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');
    await createEntry(client, pair.id, 'nube', 'cloud');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.reload();

    const entry = page.locator('details.vocabulary-entry').filter({ has: page.locator('summary').filter({ hasText: 'casa' }) });
    await expect(playControl(page, 'casa')).toBeVisible();
    await expect(playControl(page, 'nube')).toHaveCount(0);
    await expect(entry).not.toHaveAttribute('open', '');

    await playControl(page, 'casa').click();
    await expect(page.getByRole('button', { name: 'Stop the pronunciation of casa' })).toBeVisible();
    await expect(entry).not.toHaveAttribute('open', '');
  });

  test('tells the Learner a server that cannot store pronunciations apart from one that cannot keep them', async ({ page }) => {
    const account = credentials('web-audio-missing-backend');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    const logged: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') logged.push(message.text()); });

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');

    await page.route('**/storage/v1/object/vocabulary-audio-clips/**', (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Bucket not found', message: 'Bucket not found', statusCode: '404' }),
    }));
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByText('This server cannot store pronunciations yet, so the recording was not saved. Everything else here still works.')).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Keep recording' })).toBeEnabled();
    expect(logged.some((entry) => entry.includes('storage-missing'))).toBe(true);

    await page.unroute('**/storage/v1/object/vocabulary-audio-clips/**');
    await page.route('**/rest/v1/rpc/set_vocabulary_entry_audio_clip', (route) => route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.set_vocabulary_entry_audio_clip(p_audio_clip_duration_ms, p_audio_clip_path, p_learning_vocabulary_entry_id) in the schema cache' }),
    }));
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByText('This server cannot keep pronunciations yet, so the recording was not saved. Everything else here still works.')).toBeVisible();
    expect(logged.some((entry) => entry.includes('contract-missing'))).toBe(true);

    await page.unroute('**/rest/v1/rpc/set_vocabulary_entry_audio_clip');
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    expect(await storedClipPath(client)).not.toBeNull();
  });

  test('replaces an Audio Clip so the earlier recording stops being reachable, then removes it entirely', async ({ page }) => {
    const account = credentials('web-audio-replace');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Replace recording' })).toBeVisible();
    const firstPath = await storedClipPath(client);
    expect(firstPath).not.toBeNull();

    await audioClipControls(page).getByRole('button', { name: 'Replace recording' }).click();
    const stop = audioClipControls(page).getByRole('button', { name: 'Stop recording' });
    await expect(stop).toBeEnabled();
    await stop.click();
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect.poll(async () => storedClipPath(client)).not.toBe(firstPath);
    const secondPath = await storedClipPath(client);
    expect(secondPath).not.toBeNull();

    const { error: staleError } = await client.storage.from('vocabulary-audio-clips').download(firstPath as string);
    expect(staleError).not.toBeNull();
    const { error: currentError } = await client.storage.from('vocabulary-audio-clips').download(secondPath as string);
    expect(currentError).toBeNull();

    await audioClipControls(page).getByRole('button', { name: 'Remove recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeVisible();
    await expect.poll(async () => storedClipPath(client)).toBeNull();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip"]')).toHaveCount(0);
  });

  test('keeps the editor usable and the word saveable when the Learner declines the microphone', async ({ page }) => {
    const account = credentials('web-audio-declined');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      });
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByText(/could not use your microphone/i)).toBeVisible();
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]')).toHaveCount(0);

    await page.getByLabel('Sense 1 translation 1').fill('home');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    await expandEntry(page, 'casa');
    await expect(page.getByText(/^home en$/)).toBeVisible();
  });

  test('explains that a pronunciation cannot be recorded when the browser offers no microphone', async ({ page }) => {
    const account = credentials('web-audio-unsupported');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).getByText(/cannot record audio/i)).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeDisabled();
  });

  test('removes the Audio Clip from storage when the word itself is deleted', async ({ page }) => {
    const account = credentials('web-audio-delete');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    const path = await storedClipPath(client);
    expect(path).not.toBeNull();
    expect((await client.storage.from('vocabulary-audio-clips').download(path as string)).error).toBeNull();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expandEntry(page, 'casa');
    await page.getByRole('button', { name: 'Delete casa' }).click();
    await page.getByRole('dialog', { name: 'Delete Vocabulary Entry' }).getByRole('button', { name: 'Delete Vocabulary Entry' }).click();
    await expect(page.getByText('No vocabulary entries yet. Add your first one.')).toBeVisible();
    await expect.poll(async () => (await client.storage.from('vocabulary-audio-clips').download(path as string)).error !== null).toBe(true);
  });

  test('releases the microphone when the Learner leaves the editor while still recording', async ({ page }) => {
    const account = credentials('web-audio-release');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (window as unknown as { openedStreams: MediaStream[] }).openedStreams = [];
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const stream = await original(constraints);
        (window as unknown as { openedStreams: MediaStream[] }).openedStreams.push(stream);
        return stream;
      };
    });
    await page.goto('/library');
    await openEditor(page, 'casa');
    await audioClipControls(page).getByRole('button', { name: 'Record pronunciation' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Stop recording' })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { openedStreams: MediaStream[] }).openedStreams.flatMap((stream) => stream.getTracks()).some((track) => track.readyState === 'live'))).toBe(true);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expandEntry(page, 'casa');
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Stop recording' })).toHaveCount(0);
    await expect(audioClipControls(page).locator('[data-ui="vocabulary-audio-clip-preview"]')).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => (window as unknown as { openedStreams: MediaStream[] }).openedStreams.flatMap((stream) => stream.getTracks()).every((track) => track.readyState === 'ended'))).toBe(true);
  });

  test('never leaves a Vocabulary Entry pointing at an Audio Clip that is no longer stored', async ({ page }) => {
    const account = credentials('web-audio-strand');
    const { client } = await registerWithPair(account);
    const { data: languages, error: languagesError } = await client.from('learning_languages').select('id').limit(1);
    if (languagesError) throw languagesError;
    const learningLanguageId = (languages ?? [])[0]?.id as string;
    for (const [answerLanguageTag, translation, createNewSense] of [['en', 'house', false], ['uk', 'budynok', true]] as const) {
      const { error } = await client.rpc('capture_learning_language_entry', {
        p_answer_language_tag: answerLanguageTag,
        p_create_new_sense: createNewSense,
        p_example: null,
        p_expression: 'casa',
        p_learning_language_id: learningLanguageId,
        p_sense_id: null,
        p_translation: translation,
      });
      if (error) throw error;
    }

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await recordClip(page);
    await audioClipControls(page).getByRole('button', { name: 'Keep recording' }).click();
    await expect(audioClipControls(page).getByRole('button', { name: 'Remove recording' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expandEntry(page, 'casa');

    await page.getByRole('button', { name: 'Delete casa' }).click();
    await page.getByRole('dialog', { name: 'Delete Vocabulary Entry' }).getByRole('button', { name: 'Delete Vocabulary Entry' }).click();
    await expect.poll(async () => {
      const { count } = await client.from('vocabulary_entries').select('id', { count: 'exact', head: true });
      return count ?? 0;
    }).toBeLessThan(2);

    const remainingPath = await storedClipPath(client).catch(() => null);
    if (remainingPath) {
      const { error } = await client.storage.from('vocabulary-audio-clips').download(remainingPath);
      expect(error, 'a surviving Vocabulary Entry must still reach the Audio Clip it points at').toBeNull();
    }
  });

  test('explains that a pronunciation cannot be recorded once the Learner goes offline mid-edit', async ({ page, context }) => {
    const account = credentials('web-audio-offline');
    const { client, pair } = await registerWithPair(account);
    await createEntry(client, pair.id, 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await openEditor(page, 'casa');
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeEnabled();

    await context.setOffline(true);
    await expect(audioClipControls(page).getByText(/needs a connection/i)).toBeVisible();
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeDisabled();

    await context.setOffline(false);
    await expect(audioClipControls(page).getByRole('button', { name: 'Record pronunciation' })).toBeEnabled();
  });

  test('shows the Sense ordinal only to an entry that has more than one Sense', async ({ page }) => {
    const account = credentials('web-sense-ordinal');
    const { client } = await registerWithPair(account);
    const spanish = await learningLanguageIdFor(client, 'es');
    await captureSense(client, spanish, 'casa', 'house');
    await captureSense(client, spanish, 'banco', 'bank');
    await captureSense(client, spanish, 'banco', 'bench', true);

    await signIn(page, account);
    await page.goto('/library');

    await expandEntry(page, 'casa');
    const single = expandedEntry(page, 'casa');
    await expect(single.getByRole('group', { name: 'Sense 1' })).toBeVisible();
    const singleOrdinal = await single.getByRole('heading', { name: 'Sense 1' }).boundingBox();
    expect(singleOrdinal, 'a single-Sense entry still names its Sense for assistive technology').not.toBeNull();
    expect(singleOrdinal!.height, 'a single-Sense entry draws no Sense ordinal').toBeLessThanOrEqual(2);

    await expandEntry(page, 'banco');
    const multiple = expandedEntry(page, 'banco');
    await expect(multiple.getByRole('group', { name: 'Sense 1' })).toBeVisible();
    await expect(multiple.getByRole('group', { name: 'Sense 2' })).toBeVisible();
    for (const ordinal of ['Sense 1', 'Sense 2']) {
      const box = await multiple.getByRole('heading', { name: ordinal }).boundingBox();
      expect(box!.height, `a multi-Sense entry draws ${ordinal}`).toBeGreaterThan(2);
    }
  });

  test('files an expanded entry into existing and new Collections from the Add to collection picker and removes it with ×', async ({ page }) => {
    const account = credentials('web-entry-collections');
    const { client, pair } = await registerWithPair(account);
    const spanish = await learningLanguageIdFor(client, 'es');
    await createEntry(client, pair.id, 'casa', 'house');
    await seedCollections(client, spanish, ['Kitchen', 'Places', 'Travel']);

    await signIn(page, account);
    await page.goto('/library');
    await expandEntry(page, 'casa');
    const entry = expandedEntry(page, 'casa');
    const chips = entry.locator('[data-ui="entry-collection"]');
    await expect(chips).toHaveCount(0);

    await addEntryToCollection(entry, 'casa', 'Places');
    await expect(chips).toHaveText(['Places×']);

    let picker = await openEntryCollectionPicker(entry, 'casa');
    await expect(entry.getByRole('option')).toHaveText(['Kitchen', 'Travel']);
    await picker.fill('trav');
    await expect(entry.getByRole('option')).toHaveText(['Travel', 'Create “trav”']);
    await picker.fill('kitchen');
    await expect(entry.getByRole('option'), 'an existing name is not offered for creation').toHaveText(['Kitchen']);
    await picker.press('Escape');
    await expect(entryCollectionPicker(entry, 'casa')).toHaveCount(0);
    await expect(entry.getByRole('button', { name: 'Add to collection' })).toBeFocused();

    picker = await openEntryCollectionPicker(entry, 'casa');
    await picker.fill('trav');
    await picker.press('Enter');
    await expect(removeFromCollectionButton(entry, 'casa', 'Travel')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Add to collection' })).toBeFocused();

    await createCollectionFromEntry(entry, 'casa', 'Weekend');
    await expect(chips).toHaveCount(3);
    const { data: created } = await client.from('collections').select('name').eq('name', 'Weekend');
    expect(created, 'typing a new name creates the Collection').toHaveLength(1);

    await removeFromCollectionButton(entry, 'casa', 'Places').click();
    await expect(removeFromCollectionButton(entry, 'casa', 'Places')).toHaveCount(0);
    await expect(chips).toHaveCount(2);
    picker = await openEntryCollectionPicker(entry, 'casa');
    await expect(entry.getByRole('option'), 'a removed Collection returns to the picker').toHaveText(['Kitchen', 'Places']);
    await picker.press('Escape');

    const { count } = await client.from('collection_memberships').select('collection_id', { count: 'exact', head: true });
    expect(count).toBe(2);

    if (test.info().project.name === 'web-vocabulary-mobile') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('closes the expanded entry with an even rhythm, member-only Collections, and receding actions', async ({ page }) => {
    const account = credentials('web-read-view');
    const { client, pair } = await registerWithPair(account);
    const spanish = await learningLanguageIdFor(client, 'es');
    await createEntry(client, pair.id, 'casa', 'house', 'La casa es grande.');
    await seedCollections(client, spanish, ['Kitchen', 'Places', 'Travel', 'Verbs', 'Food', 'Family', 'Work', 'Weather', 'Body', 'Animals', 'Numbers', 'Colours']);

    await signIn(page, account);
    await page.goto('/library');
    await expandEntry(page, 'casa');
    const entry = expandedEntry(page, 'casa');
    await expect(entry.getByRole('button', { name: 'Add to collection' })).toBeVisible();
    await expect(entry.locator('[data-ui="entry-collection"]'), 'an unfiled entry lists no Collections').toHaveCount(0);
    await expect(entry.getByRole('button', { name: /Kitchen|Colours/ })).toHaveCount(0);

    const title = await entry.locator('summary').evaluate((node) => getComputedStyle(node).fontWeight);
    expect(title, 'DESIGN.md sets card titles at semibold').toBe('600');

    const gaps = await entry.evaluate((node) => {
      const sections = [...node.querySelectorAll('.vocabulary-entry-body > *')].map((section) => section.getBoundingClientRect());
      return sections.slice(1).map((section, index) => Math.round(section.top - sections[index].bottom));
    });
    expect(gaps.length, 'Sense, Audio Clip, Collections and actions are separate sections').toBe(3);
    expect(new Set(gaps).size, `sections are evenly spaced: ${gaps.join(', ')}`).toBe(1);
    expect(spacingScale, `${gaps[0]}px section gap comes from --lexync-space-*`).toContain(gaps[0]);
    expect(gaps[0], 'sections are not cramped against the one above').toBeGreaterThanOrEqual(16);

    const example = await entry.evaluate((node) => {
      const translation = node.querySelector('.vocabulary-sense > p')!.getBoundingClientRect();
      const block = node.querySelector('.vocabulary-sense-example')!.getBoundingClientRect();
      return Math.round(block.top - translation.bottom);
    });
    expect(example, 'the Example block breathes below the translation').toBeGreaterThanOrEqual(16);

    const labels = await entry.evaluate((node) => [
      ['.vocabulary-audio-editor > legend', '.vocabulary-audio-row'],
      ['.entry-collections > h4', '.entry-collections-member'],
    ].map(([labelSelector, contentSelector]) => {
      const label = node.querySelector(labelSelector)!.getBoundingClientRect();
      const content = node.querySelector(contentSelector)!.getBoundingClientRect();
      return { left: Math.round(content.left - label.left), gap: Math.round(content.top - label.bottom) };
    }));
    for (const label of labels) expect(label.left, 'each section label lines up with its content').toBe(0);
    expect(labels[0].gap, 'the Audio Clip and Collections labels sit the same distance above their content').toBe(labels[1].gap);
    expect(labels[0].gap).toBeGreaterThan(0);

    await addEntryToCollection(entry, 'casa', 'Colours');
    const shortControls = await entry.evaluate((node) => [...node.querySelectorAll('button')]
      .filter((control) => control.getBoundingClientRect().height < 44)
      .map((control) => `${control.className}:${control.getAttribute('aria-label') ?? control.textContent}`));
    expect(shortControls, 'every control in the expanded entry meets the 44px minimum').toEqual([]);

    const scrollingGroups = await entry.evaluate((node) => [...node.querySelectorAll('.entry-collections-member')]
      .filter((group) => group.scrollWidth > group.clientWidth).length);
    expect(scrollingGroups, 'the filing region wraps its Collections instead of scrolling them').toBe(0);

    for (const action of ['Edit casa', 'Delete casa']) {
      await expect(entry.getByRole('button', { name: action })).toBeVisible();
    }
    const weights = await entry.evaluate((node) => ['Edit', 'Delete'].map((action) => {
      const control = [...node.querySelectorAll('.vocabulary-entry-actions button')].find((button) => button.textContent?.trim() === action)!;
      const style = getComputedStyle(control);
      return { action, background: style.backgroundColor, border: style.borderTopColor, borderWidth: Number.parseFloat(style.borderTopWidth) };
    }));
    const [edit, remove] = weights;
    expect(edit.background, 'Edit is the one filled action').not.toBe('rgba(0, 0, 0, 0)');
    expect(remove.background, 'Delete recedes to transparent').toBe('rgba(0, 0, 0, 0)');
    expect(remove.border, 'Delete no longer carries the loudest edge on the card').toBe('rgba(0, 0, 0, 0)');
  });
});
