import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { expectActiveLearningLanguage, selectLearningLanguage } from './support/language-switcher';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-collections') {
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

async function createEntry(client: Awaited<ReturnType<typeof register>>['client'], pairId: string, expression: string, translation: string, example = '') {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
  const compatibilityEntry = data as { vocabularyEntryId: string };
  const { data: canonicalEntry, error: canonicalEntryError } = await client
    .from('vocabulary_entries')
    .select('learning_vocabulary_entry_id')
    .eq('id', compatibilityEntry.vocabularyEntryId)
    .single();
  if (canonicalEntryError || !canonicalEntry?.learning_vocabulary_entry_id) {
    throw canonicalEntryError ?? new Error('The canonical Vocabulary Entry fixture is missing.');
  }
  return { ...compatibilityEntry, learningVocabularyEntryId: canonicalEntry.learning_vocabulary_entry_id as string };
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

async function addEntryToCollection(page: Page, collection: string, expression: string) {
  const card = collectionCard(page, collection);
  await card.getByRole('button', { name: `Add entry to ${collection}` }).click();
  await page.getByLabel(`Vocabulary entry for ${collection}`).selectOption({ label: expression });
  await page.getByRole('button', { name: `Add ${expression} to ${collection}` }).click();
  await expect(card.getByText(expression, { exact: true })).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

async function languageIdFor(client: Awaited<ReturnType<typeof register>>['client'], languageTag: string) {
  const language = (await learningLanguages(client)).find((item) => item.language_tag === languageTag);
  if (!language) throw new Error(`The ${languageTag} Learning Language fixture is missing.`);
  return language.id as string;
}

async function seedCollection(client: Awaited<ReturnType<typeof register>>['client'], learningLanguageId: string, name: string) {
  const { data, error } = await client.rpc('create_collection', { p_learning_language_id: learningLanguageId, p_name: name });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function fileEntry(client: Awaited<ReturnType<typeof register>>['client'], collectionId: string, learningVocabularyEntryId: string) {
  const { error } = await client.rpc('add_collection_membership', { p_collection_id: collectionId, p_learning_vocabulary_entry_id: learningVocabularyEntryId });
  if (error) throw error;
}

async function snapshotCollections(client: Awaited<ReturnType<typeof register>>['client'], learningLanguageId: string) {
  const { data, error } = await client.rpc('account_learning_snapshot');
  if (error) throw error;
  const language = (data.learningLanguages as Array<{ id: string; collections: Array<{ id: string; name: string; vocabularyEntryIds: string[] }> }>).find((item) => item.id === learningLanguageId);
  if (!language) throw new Error('The Learning Language is missing from the account snapshot.');
  return language.collections;
}

function entrySummary(page: Page, expression: string) {
  return page.locator('summary').filter({ hasText: expression });
}

function entryCheckbox(page: Page, expression: string) {
  return page.getByRole('checkbox', { name: `Select ${expression}` });
}

function selectionCount(page: Page) {
  return page.getByRole('status').filter({ hasText: /Vocabulary Entr(?:y|ies) selected/ });
}

async function expandEntry(page: Page, expression: string) {
  await entrySummary(page, expression).getByRole('heading', { name: expression }).click();
  return entrySummary(page, expression).locator('..');
}

function picker(page: Page, label: string) {
  return page.getByRole('combobox', { name: label });
}

function pickerListbox(page: Page, label: string) {
  return page.getByRole('listbox', { name: label });
}

function pickerOptions(page: Page, label: string) {
  return pickerListbox(page, label).getByRole('option');
}

function pickerAnnouncement(page: Page, text: string | RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}

async function openPicker(page: Page, label: string) {
  await picker(page, label).click();
  await expect(picker(page, label)).toHaveAttribute('aria-expanded', 'true');
  const listboxId = await picker(page, label).getAttribute('aria-controls');
  expect(listboxId).toBeTruthy();
  await expect(pickerListbox(page, label)).toHaveAttribute('id', String(listboxId));
}

async function choosePickerOption(page: Page, label: string, option: string | RegExp) {
  await openPicker(page, label);
  await pickerListbox(page, label).getByRole('option', { name: option }).click();
  await expect(picker(page, label)).toHaveAttribute('aria-expanded', 'false');
}

async function fileSelectionInto(page: Page, name: string, typed: string) {
  await openPicker(page, 'Collection to file into');
  await picker(page, 'Collection to file into').fill(typed);
  await pickerListbox(page, 'Collection to file into').getByRole('option', { name }).click();
  await expect(picker(page, 'Collection to file into')).toHaveValue(name);
  await page.getByRole('button', { name: 'File into Collection' }).click();
}

async function highlightedPickerOption(page: Page, label: string) {
  const activeDescendant = await picker(page, label).getAttribute('aria-activedescendant');
  for (const option of await pickerOptions(page, label).all()) {
    if ((await option.getAttribute('id')) !== activeDescendant) continue;
    return `${await option.getAttribute('role')} ${(await option.innerText()).replace(/\s+/g, ' ').trim()}`;
  }
  return 'no option carries the aria-activedescendant id';
}

async function expectHighlightedPickerOption(page: Page, label: string, name: string) {
  await expect.poll(() => highlightedPickerOption(page, label)).toContain(`option ${name}`);
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

test.describe('web Collections', () => {
  test('creates, renames, and deletes a Collection without deleting its Entry', async ({ page }) => {
    const account = credentials('web-collection-crud');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'viaje', 'trip');

    await signIn(page, account);
    await page.goto('/collections');
    await expect(page.getByRole('heading', { name: 'Collections', level: 1 })).toBeVisible();
    await createCollection(page, 'Travel plans');

    const card = collectionCard(page, 'Travel plans');
    await card.getByRole('button', { name: 'Rename Travel plans' }).click();
    await page.getByLabel('Collection name').fill('Weekend trips');
    await page.getByRole('button', { name: 'Save Collection' }).click();
    await expect(collectionCard(page, 'Weekend trips')).toBeVisible();
    await addEntryToCollection(page, 'Weekend trips', 'viaje');

    await collectionCard(page, 'Weekend trips').getByRole('button', { name: 'Delete Weekend trips' }).click();
    await expect(page.getByRole('dialog', { name: 'Delete Collection' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Delete Collection' }).getByRole('button', { name: 'Delete Collection' }).click();
    await expect(collectionCard(page, 'Weekend trips')).toHaveCount(0);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'viaje' })).toBeVisible();
  });

  test('keeps one Entry when it belongs to two Collections and one membership is removed', async ({ page }) => {
    const account = credentials('web-collection-memberships');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');

    await signIn(page, account);
    await page.goto('/collections');
    await createCollection(page, 'Places');
    await createCollection(page, 'Favorites');
    await addEntryToCollection(page, 'Places', 'casa');
    await addEntryToCollection(page, 'Favorites', 'casa');
    await expect(collectionCard(page, 'Places').getByText('casa', { exact: true })).toBeVisible();
    await expect(collectionCard(page, 'Favorites').getByText('casa', { exact: true })).toBeVisible();

    await collectionCard(page, 'Places').getByRole('button', { name: 'Remove casa from Places' }).click();
    await expect(collectionCard(page, 'Places').getByText('casa', { exact: true })).toHaveCount(0);
    await expect(collectionCard(page, 'Favorites').getByText('casa', { exact: true })).toBeVisible();
    await page.goto('/library');
    const entry = page.locator('summary').filter({ hasText: 'casa' });
    await entry.click();
    await expect(entry.locator('..').getByText('Collections')).toBeVisible();
    await expect(entry.locator('..').getByRole('button', { name: 'Remove casa from Favorites' })).toBeVisible();
    await expect(entry.locator('..').getByRole('button', { name: 'Add casa to Places' })).toBeVisible();
  });

  test('rejects cross-Learning-Language membership and isolates another learner', async ({ page }) => {
    const owner = credentials('web-collection-owner');
    const { client: ownerClient, pairIds } = await register(owner, [['es', 'en'], ['it', 'en']]);
    await createEntry(ownerClient, pairIds[0], 'casa', 'house');
    await createEntry(ownerClient, pairIds[1], 'cane', 'dog');
    const ownerLanguages = await learningLanguages(ownerClient);
    const spanish = ownerLanguages.find((language) => language.language_tag === 'es');
    const italian = ownerLanguages.find((language) => language.language_tag === 'it');
    if (!spanish || !italian) throw new Error('The Learning Language fixtures are missing.');

    await signIn(page, owner);
    await page.goto('/collections');
    await createCollection(page, 'Spanish study');
    await addEntryToCollection(page, 'Spanish study', 'casa');
    await selectLearningLanguage(page, italian.id);
    await expectActiveLearningLanguage(page, italian.id);
    await expect(page.getByRole('region', { name: 'Collection Spanish study' })).toHaveCount(0);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'cane' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'casa' })).toHaveCount(0);
    await page.locator('summary').filter({ hasText: 'cane' }).click();
    await expect(page.getByRole('button', { name: /Add .* to collection/i })).toHaveCount(0);

    const other = credentials('web-collection-other');
    const { client: otherClient, pairIds: otherPairIds } = await register(other);
    await createEntry(otherClient, otherPairIds[0], 'otro', 'other');
    await signIn(page, other);
    await page.goto('/collections');
    await expect(page.getByText('Spanish study', { exact: true })).toHaveCount(0);
    await page.goto('/library');
    await expect(page.getByText('casa', { exact: true })).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: 'otro' })).toBeVisible();
  });

  test('scopes Collections to the active language and filters the Library with explicit empty results', async ({ page }) => {
    const account = credentials('web-collection-filter');
    const { client, pairIds } = await register(account, [['es', 'en'], ['fr', 'en']]);
    await createEntry(client, pairIds[0], 'sol', 'sun');
    await createEntry(client, pairIds[1], 'lune', 'moon');
    const languages = await learningLanguages(client);
    const french = languages.find((language) => language.language_tag === 'fr');
    if (!french) throw new Error('The French Learning Language fixture is missing.');

    await signIn(page, account);
    await page.goto('/collections');
    await createCollection(page, 'Sunny');
    await addEntryToCollection(page, 'Sunny', 'sol');
    await createCollection(page, 'Empty shelf');
    await expect(page.getByRole('region', { name: 'Collection Sunny' }).getByText('sol', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Filter by Sunny' }).click();
    await expect(page).toHaveURL(/\/library\?collection=/);
    await expect(page.locator('summary').filter({ hasText: 'sol' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'lune' })).toHaveCount(0);
    await page.goto('/collections');
    await page.getByRole('button', { name: 'Filter by Empty shelf' }).click();
    await expect(page.getByText('No vocabulary entries in “Empty shelf”.', { exact: true })).toBeVisible();

    await selectLearningLanguage(page, french.id);
    await expect(page.getByRole('region', { name: 'Collection Sunny' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Collection Empty shelf' })).toHaveCount(0);
    await page.goto('/library');
    await expect(page.locator('summary').filter({ hasText: 'lune' })).toBeVisible();
    await expect(page.locator('summary').filter({ hasText: 'sol' })).toHaveCount(0);
  });

  test('synchronizes Collection CRUD and membership in account_learning_snapshot', async ({ page }) => {
    const account = credentials('web-collection-snapshot');
    const { client, pairIds } = await register(account, [['es', 'en'], ['it', 'en']]);
    const entry = await createEntry(client, pairIds[0], 'mar', 'sea');
    const other = credentials('web-collection-snapshot-other');
    const { client: otherClient, pairIds: otherPairIds } = await register(other);
    await createEntry(otherClient, otherPairIds[0], 'privado', 'private');

    await signIn(page, account);
    await page.goto('/collections');
    await createCollection(page, 'Snapshot set');
    await addEntryToCollection(page, 'Snapshot set', 'mar');
    await collectionCard(page, 'Snapshot set').getByRole('button', { name: 'Rename Snapshot set' }).click();
    await page.getByLabel('Collection name').fill('Snapshot renamed');
    await page.getByRole('button', { name: 'Save Collection' }).click();
    await expect(collectionCard(page, 'Snapshot renamed')).toBeVisible();

    const { data: snapshot, error } = await client.rpc('account_learning_snapshot');
    if (error) throw error;
    const spanish = (await learningLanguages(client)).find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');
    const ownLanguage = (snapshot.learningLanguages as Array<{ id: string; collections: Array<{ name: string; vocabularyEntryIds: string[] }> }>).find((language) => language.id === spanish.id);
    expect(ownLanguage?.collections).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Snapshot renamed', vocabularyEntryIds: expect.arrayContaining([entry.learningVocabularyEntryId]) }),
    ]));
    expect(JSON.stringify(snapshot)).not.toContain('privado');
    expect(JSON.stringify(snapshot)).not.toContain(other.email);
  });

  test('supports keyboard CRUD, membership, and filtering with accessible offline controls', async ({ page }) => {
    const account = credentials('web-collection-keyboard');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'teclado', 'keyboard');

    await signIn(page, account);
    await page.goto('/collections');
    const addCollection = page.getByRole('button', { name: 'Add collection' });
    await addCollection.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Collection name').fill('Keyboard set');
    await page.getByRole('button', { name: 'Create Collection' }).press('Enter');
    await expect(collectionCard(page, 'Keyboard set')).toBeVisible();

    await collectionCard(page, 'Keyboard set').getByRole('button', { name: 'Rename Keyboard set' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Collection name').fill('Keyboard renamed');
    await page.getByRole('button', { name: 'Save Collection' }).press('Enter');
    await addEntryToCollection(page, 'Keyboard renamed', 'teclado');
    await collectionCard(page, 'Keyboard renamed').getByRole('button', { name: 'Filter by Keyboard renamed' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/library\?collection=/);

    await page.goto('/collections');
    await expect(collectionCard(page, 'Keyboard renamed')).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.getByLabel('Add collection unavailable offline')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Rename Keyboard renamed' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Keyboard renamed' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove teclado from Keyboard renamed' })).toBeDisabled();
    await expect(page.getByText('You are offline. Collection changes require a connection.')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('scopes the Library to a Collection, to entries outside a Collection, and back', async ({ page }) => {
    const account = credentials('web-collection-scope');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house', 'La casa es grande.');
    const sol = await createEntry(client, pairIds[0], 'sol', 'sun');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const places = await seedCollection(client, await languageIdFor(client, 'es'), 'Places');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, places, sol.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(picker(page, 'Collection scope')).toHaveValue('All vocabulary');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-autocomplete', 'list');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(picker(page, 'Collection scope')).toHaveValue('Places');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toHaveCount(0);

    await openPicker(page, 'Collection scope');
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Places/ })).toHaveAttribute('aria-selected', 'true');
    await picker(page, 'Collection scope').press('Escape');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');

    await entrySummary(page, 'casa').click();
    const casaEntry = entrySummary(page, 'casa').locator('..');
    await expect(casaEntry.getByRole('heading', { name: 'Sense 1' })).toBeVisible();
    await expect(casaEntry.getByText(/^house\s+en$/)).toBeVisible();
    await expect(casaEntry.getByText('La casa es grande.', { exact: true })).toBeVisible();
    await expect(casaEntry.getByRole('button', { name: 'Suspend casa' })).toBeVisible();

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'All vocabulary');
    await expect(page).toHaveURL('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test("shows each Collection's Vocabulary Entry count in the scope control", async ({ page }) => {
    const account = credentials('web-collection-scope-counts');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const sol = await createEntry(client, pairIds[0], 'sol', 'sun');
    const cielo = await createEntry(client, pairIds[0], 'cielo', 'sky');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const sky = await seedCollection(client, spanish, 'Sky');
    await seedCollection(client, spanish, 'Empty shelf');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, places, sol.learningVocabularyEntryId);
    await fileEntry(client, sky, cielo.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope')).toHaveCount(5);
    await expect(pickerOptions(page, 'Collection scope').nth(0)).toContainText('All vocabulary');
    await expect(pickerOptions(page, 'Collection scope').nth(1)).toContainText('Not in a Collection');
    await expect(pickerOptions(page, 'Collection scope').nth(2)).toContainText('Places');
    await expect(pickerOptions(page, 'Collection scope').nth(2)).toContainText('2 entries');
    await expect(pickerOptions(page, 'Collection scope').nth(3)).toContainText('Sky');
    await expect(pickerOptions(page, 'Collection scope').nth(3)).toContainText('1 entry');
    await expect(pickerOptions(page, 'Collection scope').nth(4)).toContainText('Empty shelf');
    await expect(pickerOptions(page, 'Collection scope').nth(4)).toContainText('0 entries');

    await page.getByLabel('Search vocabulary').click();
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');
  });

  test('filters the scope control by typing and states when no Collection matches', async ({ page }) => {
    const account = credentials('web-collection-scope-search');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    await seedCollection(client, spanish, 'Places');
    await seedCollection(client, spanish, 'Sky');
    await seedCollection(client, spanish, 'Weather words');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await openPicker(page, 'Collection scope');

    await picker(page, 'Collection scope').fill('pla');
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Places/ })).toBeVisible();
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Sky/ })).toHaveCount(0);

    await picker(page, 'Collection scope').fill('');
    await picker(page, 'Collection scope').fill('  WEATHER   WORDS  ');
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Weather words/ })).toBeVisible();

    await picker(page, 'Collection scope').fill('zzz');
    await expect(page.getByText('No Collections match').first()).toBeVisible();
    await expect(pickerAnnouncement(page, 'No Collections match')).toHaveText('No Collections match');
    await expect(pickerOptions(page, 'Collection scope')).toHaveCount(0);
  });

  test('operates the scope control with the keyboard alone to a completed choice', async ({ page }) => {
    const account = credentials('web-collection-scope-keyboard');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const sol = await createEntry(client, pairIds[0], 'sol', 'sun');
    const cielo = await createEntry(client, pairIds[0], 'cielo', 'sky');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const sky = await seedCollection(client, spanish, 'Sky');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, places, sol.learningVocabularyEntryId);
    await fileEntry(client, sky, cielo.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'cielo')).toBeVisible();

    await picker(page, 'Collection scope').focus();
    await page.keyboard.press('ArrowDown');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('s');
    await expect(pickerAnnouncement(page, /options available/)).toHaveText(/^\d+ options available$/);

    await page.keyboard.press('End');
    await expectHighlightedPickerOption(page, 'Collection scope', 'Sky');
    await page.keyboard.press('ArrowUp');
    await expectHighlightedPickerOption(page, 'Collection scope', 'Places');
    await page.keyboard.press('Home');
    await expectHighlightedPickerOption(page, 'Collection scope', 'Places');
    await page.keyboard.press('ArrowDown');
    await expectHighlightedPickerOption(page, 'Collection scope', 'Sky');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/library?collection=${sky}`);
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');
    await expect(picker(page, 'Collection scope')).toHaveValue('Sky');
    await expect(pickerAnnouncement(page, 'Collection scope: Sky')).toHaveText('Collection scope: Sky');
    await expect(entrySummary(page, 'cielo')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await page.keyboard.press('ArrowDown');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');
    await expect(picker(page, 'Collection scope')).toHaveValue('Sky');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('pla');
    await page.keyboard.press('Tab');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');
    await expect(picker(page, 'Collection scope')).toHaveValue('Sky');
    await expect(page).toHaveURL(`/library?collection=${sky}`);
    await expect(entrySummary(page, 'cielo')).toBeVisible();

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test('composes search and the status filter with the Collection scope', async ({ page }) => {
    const account = credentials('web-collection-scope-compose');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const sol = await createEntry(client, pairIds[0], 'sol', 'sun');
    const cielo = await createEntry(client, pairIds[0], 'cielo', 'sky');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const sky = await seedCollection(client, spanish, 'Sky');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, places, sol.learningVocabularyEntryId);
    await fileEntry(client, sky, cielo.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await entrySummary(page, 'sol').click();
    await page.getByRole('button', { name: 'Suspend sol' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);

    await page.getByLabel('Vocabulary status').selectOption({ label: 'Active entries' });
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toHaveCount(0);

    await page.getByLabel('Vocabulary status').selectOption({ label: 'Suspended entries' });
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await page.getByLabel('Vocabulary status').selectOption({ label: 'All entries' });
    await page.getByLabel('Search vocabulary').fill('cas');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toHaveCount(0);

    await page.getByLabel('Search vocabulary').fill('luna');
    await expect(entrySummary(page, 'casa')).toHaveCount(0);
    await expect(entrySummary(page, 'luna')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No match in this library.' })).toBeVisible();
    await expect(page.getByText('No Vocabulary Entries match “luna”.', { exact: true })).toBeVisible();
    await expect(page.getByText('No vocabulary entries in “Places”.')).toHaveCount(0);
    await expect(picker(page, 'Collection scope')).toHaveValue('Places');

    await page.getByLabel('Search vocabulary').fill('');
    await page.getByLabel('Vocabulary status').selectOption({ label: 'Suspended entries' });
    await choosePickerOption(page, 'Collection scope', /Sky/);
    await expect(page).toHaveURL(`/library?collection=${sky}`);
    await expect(page.getByRole('heading', { name: 'Nothing here right now.' })).toBeVisible();
    await expect(page.getByText('No suspended Vocabulary Entries in “Sky”.', { exact: true })).toBeVisible();
    await expect(page.getByText('No vocabulary entries in “Sky”.')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(page.getByRole('heading', { name: 'Nothing here right now.' })).toBeVisible();
    await expect(page.getByText('No suspended Vocabulary Entries outside a Collection.', { exact: true })).toBeVisible();
    await expect(page.getByText('No Vocabulary Entries are outside a Collection.')).toHaveCount(0);
  });

  test('names an empty Collection and keeps it distinguishable from a failed load', async ({ page }) => {
    const account = credentials('web-collection-scope-empty');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const filed = await seedCollection(client, spanish, 'Filed away');
    await seedCollection(client, spanish, 'Empty shelf');
    await fileEntry(client, filed, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Empty shelf/);
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toBeVisible();
    await expect(page.getByText('No vocabulary entries in “Empty shelf”.', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'This Collection is empty.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Library' }).getByRole('alert')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(page.getByRole('heading', { name: 'Nothing outside your Collections.' })).toBeVisible();
    await expect(page.getByText('No Vocabulary Entries are outside a Collection.', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Library' }).getByRole('alert')).toHaveCount(0);
  });

  test('keeps the Collection scope in the page address across a reload', async ({ page }) => {
    const account = credentials('web-collection-scope-address');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const places = await seedCollection(client, await languageIdFor(client, 'es'), 'Places');
    await fileEntry(client, places, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);

    await page.reload();
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(picker(page, 'Collection scope')).toHaveValue('Places');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');

    await page.reload();
    await expect(page).toHaveURL('/library?collection=none');
    await expect(picker(page, 'Collection scope')).toHaveValue('Not in a Collection');
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);
  });

  test('scopes the Collection control to the Active Learning Language', async ({ page }) => {
    const account = credentials('web-collection-scope-language');
    const { client, pairIds } = await register(account, [['es', 'en'], ['fr', 'en']]);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const fromage = await createEntry(client, pairIds[1], 'fromage', 'cheese');
    const spanish = await languageIdFor(client, 'es');
    const french = await languageIdFor(client, 'fr');
    const places = await seedCollection(client, spanish, 'Places');
    const paris = await seedCollection(client, french, 'Paris');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, paris, fromage.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);

    await selectLearningLanguage(page, french);
    await expectActiveLearningLanguage(page, french);
    await expect(page).toHaveURL('/library');
    await expect(picker(page, 'Collection scope')).toHaveValue('All vocabulary');
    await expect(entrySummary(page, 'fromage')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await openPicker(page, 'Collection scope');
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Paris/ })).toBeVisible();
    await expect(pickerListbox(page, 'Collection scope').getByRole('option', { name: /Places/ })).toHaveCount(0);
  });

  test('changes the Collection scope without issuing a Library request', async ({ page }) => {
    const account = credentials('web-collection-scope-requests');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const cielo = await createEntry(client, pairIds[0], 'cielo', 'sky');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const sky = await seedCollection(client, spanish, 'Sky');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, sky, cielo.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'cielo')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();

    const libraryRequests = trackLibraryRequests(page);
    libraryRequests.reset();

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'cielo')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'All vocabulary');
    await expect(page).toHaveURL('/library');
    await expect(entrySummary(page, 'cielo')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();
    expect(libraryRequests.count()).toBe(0);
  });

  test('falls back to all vocabulary when the page address names an unknown Collection', async ({ page }) => {
    const account = credentials('web-collection-scope-unknown');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const places = await seedCollection(client, await languageIdFor(client, 'es'), 'Places');
    await fileEntry(client, places, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto(`/library?collection=${crypto.randomUUID()}`);
    await expect(page).toHaveURL('/library');
    await expect(picker(page, 'Collection scope')).toHaveValue('All vocabulary');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Nothing here right now.' })).toHaveCount(0);
  });

  test('opens the capture dialog from add=1 while keeping the Collection scope', async ({ page }) => {
    const account = credentials('web-collection-scope-capture');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const places = await seedCollection(client, await languageIdFor(client, 'es'), 'Places');
    await fileEntry(client, places, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto(`/library?collection=${places}&add=1`);
    await expect(page.getByLabel('Expression')).toBeVisible();
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(picker(page, 'Collection scope')).toHaveValue('Places');
    await expect(entrySummary(page, 'casa')).toHaveCount(1);
    await expect(entrySummary(page, 'luna')).toHaveCount(0);
  });

  test('creates a Collection from the Library and refuses an empty name', async ({ page }) => {
    const account = credentials('web-library-collection-create');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'casa')).toBeVisible();

    await page.getByRole('button', { name: 'New Collection' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create Collection' });
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole('button', { name: 'Create Collection' }).click();
    await expect(createDialog.getByRole('alert')).toHaveText('Collection name is required.');
    await expect(createDialog).toBeVisible();
    await expect(page.locator('#collection-name')).toHaveAttribute('aria-invalid', 'true');

    const createSubmit = createDialog.getByRole('button', { name: 'Create Collection' });
    await page.context().setOffline(true);
    await expect(createDialog.getByText('You are offline. Collection changes require a connection.', { exact: true })).toBeVisible();
    await expect(createSubmit).toBeDisabled();
    const describedBy = await createSubmit.getAttribute('aria-describedby');
    expect(describedBy).toBe('collection-dialog-offline-notice');
    await expect(createDialog.locator(`#${describedBy}`)).toHaveText('You are offline. Collection changes require a connection.');
    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(createSubmit).toBeEnabled();

    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(createDialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'New Collection' })).toBeFocused();

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope')).toHaveCount(2);
    await expect(pickerOptions(page, 'Collection scope').nth(0)).toContainText('All vocabulary');
    await expect(pickerOptions(page, 'Collection scope').nth(1)).toContainText('Not in a Collection');
    await picker(page, 'Collection scope').press('Escape');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: 'New Collection' }).click();
    await page.getByLabel('Collection name').fill('Kitchen');
    await createDialog.getByRole('button', { name: 'Create Collection' }).click();
    await expect(createDialog).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: 'Created the Collection “Kitchen”.' })).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Kitchen/);
    await expect(page).toHaveURL(/\/library\?collection=/);
    await expect(page.getByText('Filtered by Kitchen')).toBeVisible();

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test('renames a Collection from the Library and propagates the new name without a reload', async ({ page }) => {
    const account = credentials('web-library-collection-rename');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const kitchn = await seedCollection(client, await languageIdFor(client, 'es'), 'Kitchn');
    await fileEntry(client, kitchn, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await choosePickerOption(page, 'Collection scope', /Kitchn/);
    await expect(page).toHaveURL(`/library?collection=${kitchn}`);
    await page.evaluate(() => { (window as unknown as { __lexyncNoReload?: boolean }).__lexyncNoReload = true; });

    await page.getByRole('button', { name: 'Rename Kitchn' }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename Collection' });
    await expect(renameDialog).toBeVisible();
    await expect(page.getByLabel('Collection name')).toHaveValue('Kitchn');
    await page.getByLabel('Collection name').fill('Kitchen');
    await renameDialog.getByRole('button', { name: 'Save Collection' }).click();
    await expect(renameDialog).toBeHidden();

    await expect(page.getByText('Filtered by Kitchen')).toBeVisible();
    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Kitchen' })).toHaveCount(1);
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Kitchn' })).toHaveCount(0);
    await picker(page, 'Collection scope').press('Escape');
    await expect(picker(page, 'Collection scope')).toHaveAttribute('aria-expanded', 'false');

    await entrySummary(page, 'casa').click();
    await expect(page.getByRole('button', { name: 'Remove casa from Kitchen' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Kitchn/ })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __lexyncNoReload?: boolean }).__lexyncNoReload)).toBe(true);

    const renameTrigger = page.getByRole('button', { name: 'Rename Kitchen' });
    await renameTrigger.click();
    await expect(renameDialog).toBeVisible();
    await renameDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(renameDialog).toBeHidden();
    await expect(renameTrigger).toBeFocused();

    await renameTrigger.click();
    await expect(renameDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(renameDialog).toBeHidden();
    await expect(renameTrigger).toBeFocused();

    await renameTrigger.click();
    await expect(renameDialog).toBeVisible();
    const { error: removedError } = await client.rpc('delete_collection', { p_collection_id: kitchn });
    if (removedError) throw removedError;
    await page.getByLabel('Collection name').fill('Kitchen shelf');
    await renameDialog.getByRole('button', { name: 'Save Collection' }).click();
    await expect(renameDialog.getByRole('alert')).toHaveText('Collection is unavailable.');
    await expect(renameDialog).toBeVisible();
    await renameDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(renameDialog).toBeHidden();

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test('deletes a Collection from the Library behind a confirmation and keeps its Vocabulary Entries', async ({ page }) => {
    const account = credentials('web-library-collection-delete');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const kitchen = await seedCollection(client, await languageIdFor(client, 'es'), 'Kitchen');
    await fileEntry(client, kitchen, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await choosePickerOption(page, 'Collection scope', /Kitchen/);
    await expect(page).toHaveURL(`/library?collection=${kitchen}`);

    const deleteTrigger = page.getByRole('button', { name: 'Delete Kitchen' });
    await deleteTrigger.click();
    const deleteDialog = page.getByRole('dialog', { name: 'Delete Collection' });
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByText('Delete “Kitchen”? Vocabulary Entries will stay in your Library.', { exact: true })).toBeVisible();
    await expect(deleteDialog).toHaveAttribute('aria-describedby', 'delete-collection-description');
    await expect(page.locator('#delete-collection-description')).toHaveText('Delete “Kitchen”? Vocabulary Entries will stay in your Library.');
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(deleteTrigger).toBeFocused();
    await expect(page.getByText('Filtered by Kitchen')).toBeVisible();

    await deleteTrigger.click();
    await deleteDialog.getByRole('button', { name: 'Delete Collection' }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('status').filter({ hasText: 'Deleted the Collection “Kitchen”. Its Vocabulary Entries are still in your Library.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Collection' })).toBeFocused();
    await expect(page.getByText('Filtered by Kitchen')).toHaveCount(0);
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Kitchen' })).toHaveCount(0);

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test("reflects Library Collection changes in the account snapshot and hides another Learner's Collections", async ({ page }) => {
    const account = credentials('web-library-collection-snapshot');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: 'New Collection' }).click();
    await page.getByLabel('Collection name').fill('Private shelf');
    await page.getByRole('dialog', { name: 'Create Collection' }).getByRole('button', { name: 'Create Collection' }).click();
    await choosePickerOption(page, 'Collection scope', /Private shelf/);
    await expect(page.getByText('Filtered by Private shelf')).toBeVisible();

    const { data: snapshot, error } = await client.rpc('account_learning_snapshot');
    if (error) throw error;
    expect(JSON.stringify(snapshot)).toContain('Private shelf');

    const { data: shelf, error: shelfError } = await client.from('collections').select('id').eq('name', 'Private shelf').single();
    if (shelfError || !shelf?.id) throw shelfError ?? new Error('The Library Collection fixture is missing.');

    await page.getByRole('button', { name: 'Rename Private shelf' }).click();
    await page.getByLabel('Collection name').fill('Private archive');
    await page.getByRole('dialog', { name: 'Rename Collection' }).getByRole('button', { name: 'Save Collection' }).click();
    await expect(page.getByText('Filtered by Private archive')).toBeVisible();

    const { data: renamedSnapshot, error: renamedError } = await client.rpc('account_learning_snapshot');
    if (renamedError) throw renamedError;
    expect(JSON.stringify(renamedSnapshot)).toContain('Private archive');
    expect(JSON.stringify(renamedSnapshot)).not.toContain('Private shelf');

    await page.getByRole('button', { name: 'Delete Private archive' }).click();
    await page.getByRole('dialog', { name: 'Delete Collection' }).getByRole('button', { name: 'Delete Collection' }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('status').filter({ hasText: 'Deleted the Collection “Private archive”. Its Vocabulary Entries are still in your Library.' })).toBeVisible();

    const { data: deletedSnapshot, error: deletedError } = await client.rpc('account_learning_snapshot');
    if (deletedError) throw deletedError;
    expect(JSON.stringify(deletedSnapshot)).not.toContain('Private archive');

    const other = credentials('web-library-collection-other');
    const { client: otherClient, pairIds: otherPairIds } = await register(other);
    await createEntry(otherClient, otherPairIds[0], 'otro', 'other');
    await signIn(page, other);
    await page.goto('/library');
    await expect(entrySummary(page, 'otro')).toBeVisible();

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Private shelf' })).toHaveCount(0);
    await picker(page, 'Collection scope').press('Escape');

    const { data: otherSnapshot, error: otherError } = await otherClient.rpc('account_learning_snapshot');
    if (otherError) throw otherError;
    expect(JSON.stringify(otherSnapshot)).not.toContain('Private shelf');

    await page.goto(`/library?collection=${shelf.id as string}`);
    await expect(page).toHaveURL('/library');
  });

  test('disables Library Collection controls with a stated reason while offline', async ({ page }) => {
    const account = credentials('web-library-collection-offline');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const kitchen = await seedCollection(client, await languageIdFor(client, 'es'), 'Kitchen');
    await fileEntry(client, kitchen, casa.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await choosePickerOption(page, 'Collection scope', /Kitchen/);
    await expect(page).toHaveURL(`/library?collection=${kitchen}`);

    await page.context().setOffline(true);
    const offlineNotice = page.getByText('You are offline. Vocabulary and Collection changes require a connection.', { exact: true });
    await expect(offlineNotice).toBeVisible();
    await expect(page.getByText('You are offline. Vocabulary changes require a connection.', { exact: true })).toHaveCount(0);
    await expect(page.getByText('You are offline. Collection changes require a connection.', { exact: true })).toHaveCount(0);
    const collectionControls = [
      page.getByRole('button', { name: 'New Collection' }),
      page.getByRole('button', { name: 'Rename Kitchen' }),
      page.getByRole('button', { name: 'Delete Kitchen' }),
    ];
    for (const control of collectionControls) {
      await expect(control).toBeDisabled();
      const describedBy = await control.getAttribute('aria-describedby');
      expect(describedBy).toBe('library-offline-notice');
      await expect(page.locator(`#${describedBy}`)).toHaveText('You are offline. Vocabulary and Collection changes require a connection.');
    }
    await assertNoHorizontalOverflow(page);

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    for (const control of collectionControls) await expect(control).toBeEnabled();
    await expect(offlineNotice).toHaveCount(0);
  });

  test('counts a Library selection and clears the whole selection in one action', async ({ page }) => {
    const account = credentials('web-library-selection-count');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(selectionCount(page)).toHaveCount(0);

    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');
    await entryCheckbox(page, 'adios').check();
    await entryCheckbox(page, 'casa').check();
    await expect(selectionCount(page)).toHaveText('3 Vocabulary Entries selected');

    await entryCheckbox(page, 'casa').uncheck();
    await expect(selectionCount(page)).toHaveText('2 Vocabulary Entries selected');
    await expect(entryCheckbox(page, 'casa')).not.toBeChecked();

    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(selectionCount(page)).toHaveCount(0);
    for (const expression of ['hola', 'adios', 'casa']) await expect(entryCheckbox(page, expression)).not.toBeChecked();
  });

  test('files a Library selection into an existing Collection chosen by typing its name', async ({ page }) => {
    const account = credentials('web-library-selection-merge');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');
    await seedCollection(client, spanish, 'Kitchen');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await expect(selectionCount(page)).toHaveText('2 Vocabulary Entries selected');

    await openPicker(page, 'Collection to file into');
    await picker(page, 'Collection to file into').fill('tra');
    await expect(pickerOptions(page, 'Collection to file into')).toHaveCount(1);
    await pickerListbox(page, 'Collection to file into').getByRole('option', { name: 'Travel' }).click();
    await expect(picker(page, 'Collection to file into')).toHaveValue('Travel');
    await page.getByRole('button', { name: 'File into Collection' }).click();

    await expect(page.getByText('Filed 2 Vocabulary Entries into Travel.', { exact: true })).toBeVisible();
    await expect(selectionCount(page)).toHaveCount(0);
    await expect(entryCheckbox(page, 'hola')).not.toBeChecked();
    await expect(entryCheckbox(page, 'adios')).not.toBeChecked();

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);
  });

  test('files a Library selection into a Collection named during the same action', async ({ page }) => {
    const account = credentials('web-library-selection-new-collection');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await expect(selectionCount(page)).toHaveText('2 Vocabulary Entries selected');

    await page.getByRole('button', { name: 'File into new Collection' }).click();
    const fileIntoNew = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Create and file' }) });
    await expect(fileIntoNew).toBeVisible();
    await fileIntoNew.getByLabel('Collection name').fill('Travel');
    await fileIntoNew.getByRole('button', { name: 'Create and file' }).click();
    await expect(fileIntoNew).toBeHidden();
    await expect(page.getByText('Filed 2 Vocabulary Entries into Travel.', { exact: true })).toBeVisible();
    await expect(selectionCount(page)).toHaveCount(0);

    await openPicker(page, 'Collection scope');
    const travelOption = pickerOptions(page, 'Collection scope').filter({ hasText: 'Travel' });
    await expect(travelOption).toHaveCount(1);
    await expect(travelOption).toContainText('2 entries');
    await travelOption.click();
    await expect(page).toHaveURL(/\/library\?collection=/);
    await expect(picker(page, 'Collection scope')).toHaveValue('Travel');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toBeVisible();
  });

  test('reports filing an Entry that is already a member as success without duplicating it', async ({ page }) => {
    const account = credentials('web-library-selection-member');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    const adios = await createEntry(client, pairIds[0], 'adios', 'goodbye');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');
    await fileEntry(client, travel, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await fileSelectionInto(page, 'Travel', 'trav');

    await expect(page.getByText('Filed 2 Vocabulary Entries into Travel.', { exact: true })).toBeVisible();
    await expect(page.getByText('Some Vocabulary Entries could not be filed into Travel')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Library' }).getByRole('alert')).toHaveCount(0);
    await expect(selectionCount(page)).toHaveCount(0);

    const members = (await snapshotCollections(client, spanish)).find((collection) => collection.id === travel)?.vocabularyEntryIds ?? [];
    expect(members.filter((id) => id === hola.learningVocabularyEntryId)).toHaveLength(1);
    expect(members).toContain(adios.learningVocabularyEntryId);
  });

  test('keeps other Collection memberships intact when filing a selection', async ({ page }) => {
    const account = credentials('web-library-selection-other-collections');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const travel = await seedCollection(client, spanish, 'Travel');
    await fileEntry(client, places, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');
    await fileSelectionInto(page, 'Travel', 'trav');
    await expect(page.getByText('Filed 1 Vocabulary Entry into Travel.', { exact: true })).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();

    expect(await snapshotCollections(client, spanish)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: places, vocabularyEntryIds: [hola.learningVocabularyEntryId] }),
      expect.objectContaining({ id: travel, vocabularyEntryIds: [hola.learningVocabularyEntryId] }),
    ]));
  });

  test('names the Entries that were not filed, keeps the selection, and leaves the rest filed', async ({ page }) => {
    const account = credentials('web-library-selection-partial');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    const adios = await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.route('**/rest/v1/rpc/add_collection_membership', async (route) => {
      if (!(route.request().postData() ?? '').includes(adios.learningVocabularyEntryId)) {
        await route.continue();
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'The Collection membership could not be stored.' }) });
    });

    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await entryCheckbox(page, 'casa').check();
    await fileSelectionInto(page, 'Travel', 'trav');

    await expect(page.getByText('Some Vocabulary Entries could not be filed into Travel: adios.', { exact: true })).toBeVisible();
    await expect(page.getByText('Filed 3 Vocabulary Entries into Travel.')).toHaveCount(0);
    await expect(selectionCount(page)).toHaveText('3 Vocabulary Entries selected');
    for (const expression of ['hola', 'adios', 'casa']) await expect(entryCheckbox(page, expression)).toBeChecked();

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toHaveCount(0);
  });

  test('drops the selection on a Collection scope change and on an Active Learning Language change', async ({ page }) => {
    const account = credentials('web-library-selection-reset');
    const { client, pairIds } = await register(account, [['es', 'en'], ['fr', 'en']]);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[1], 'bonjour', 'good day');
    const spanish = await languageIdFor(client, 'es');
    const french = await languageIdFor(client, 'fr');
    const places = await seedCollection(client, spanish, 'Places');
    await fileEntry(client, places, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await expect(selectionCount(page)).toHaveText('2 Vocabulary Entries selected');

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(selectionCount(page)).toHaveCount(0);
    await expect(entryCheckbox(page, 'hola')).not.toBeChecked();

    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');

    await selectLearningLanguage(page, french);
    await expectActiveLearningLanguage(page, french);
    await expect(page).toHaveURL('/library');
    await expect(entrySummary(page, 'bonjour')).toBeVisible();
    await expect(selectionCount(page)).toHaveCount(0);
    await expect(entryCheckbox(page, 'bonjour')).not.toBeChecked();
  });

  test('adds a single Vocabulary Entry to the scoped Collection through the Entry picker', async ({ page }) => {
    const account = credentials('web-library-entry-picker');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(picker(page, 'Vocabulary Entry to add')).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toBeVisible();

    await openPicker(page, 'Vocabulary Entry to add');
    await picker(page, 'Vocabulary Entry to add').fill('hol');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(1);
    await pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'hola' }).click();

    await expect(page.getByText('Added hola to Travel.', { exact: true })).toBeVisible();
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toHaveCount(0);

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Travel' })).toContainText('1 entry');
  });

  test('matches the Entry picker on translations under the Library normalisation rule', async ({ page }) => {
    const account = credentials('web-library-entry-picker-search');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'Hello there');
    await createEntry(client, pairIds[0], 'adios', 'Goodbye friend');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);

    await openPicker(page, 'Vocabulary Entry to add');
    await picker(page, 'Vocabulary Entry to add').fill('goodbye');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(1);
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'adios' })).toBeVisible();

    await picker(page, 'Vocabulary Entry to add').fill('  HELLO   THERE  ');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(1);
    await pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'hola' }).click();
    await expect(page.getByText('Added hola to Travel.', { exact: true })).toBeVisible();
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toHaveCount(0);
  });

  test('leaves Entries already in the scoped Collection out of the Entry picker', async ({ page }) => {
    const account = credentials('web-library-entry-picker-members');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');
    await fileEntry(client, travel, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);

    await openPicker(page, 'Vocabulary Entry to add');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(2);
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'hola' })).toHaveCount(0);
    await pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'adios' }).click();
    await expect(page.getByText('Added adios to Travel.', { exact: true })).toBeVisible();

    await openPicker(page, 'Vocabulary Entry to add');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(1);
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toContainText('casa');
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'hola' })).toHaveCount(0);
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'adios' })).toHaveCount(0);
  });

  test('operates the filing and Entry pickers with the keyboard alone to a completed choice', async ({ page }) => {
    const account = credentials('web-library-filing-keyboard');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    await seedCollection(client, spanish, 'Travel');
    const trips = await seedCollection(client, spanish, 'Trips');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');

    await picker(page, 'Collection to file into').focus();
    await page.keyboard.press('ArrowDown');
    await expect(picker(page, 'Collection to file into')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('zzz');
    await expect(pickerOptions(page, 'Collection to file into')).toHaveCount(0);
    await expect(pickerListbox(page, 'Collection to file into')).toContainText('No Collections match');
    await expect(pickerAnnouncement(page, 'No Collections match')).toHaveText('No Collections match');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('tr');
    await expect(pickerAnnouncement(page, /options available/)).toHaveText('2 options available');
    await page.keyboard.press('End');
    await expectHighlightedPickerOption(page, 'Collection to file into', 'Trips');
    await page.keyboard.press('ArrowUp');
    await expectHighlightedPickerOption(page, 'Collection to file into', 'Travel');
    await page.keyboard.press('Home');
    await expectHighlightedPickerOption(page, 'Collection to file into', 'Travel');
    await page.keyboard.press('ArrowDown');
    await expectHighlightedPickerOption(page, 'Collection to file into', 'Trips');

    await page.keyboard.press('Enter');
    await expect(picker(page, 'Collection to file into')).toHaveAttribute('aria-expanded', 'false');
    await expect(picker(page, 'Collection to file into')).toHaveValue('Trips');
    await expect(pickerAnnouncement(page, 'Collection to file into: Trips')).toHaveText('Collection to file into: Trips');

    await page.getByRole('button', { name: 'File into Collection' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Filed 1 Vocabulary Entry into Trips.', { exact: true })).toBeVisible();
    await expect(selectionCount(page)).toHaveCount(0);

    await picker(page, 'Collection scope').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('trips');
    await expectHighlightedPickerOption(page, 'Collection scope', 'Trips');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/library?collection=${trips}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();

    await picker(page, 'Vocabulary Entry to add').focus();
    await page.keyboard.press('ArrowDown');
    await expect(picker(page, 'Vocabulary Entry to add')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('zzz');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(0);
    await expect(pickerListbox(page, 'Vocabulary Entry to add')).toContainText('No Vocabulary Entries match');
    await expect(pickerAnnouncement(page, 'No Vocabulary Entries match')).toHaveText('No Vocabulary Entries match');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('a');
    await expect(pickerAnnouncement(page, /options available/)).toHaveText('2 options available');
    await page.keyboard.press('End');
    await expectHighlightedPickerOption(page, 'Vocabulary Entry to add', 'casa');
    await page.keyboard.press('ArrowUp');
    await expectHighlightedPickerOption(page, 'Vocabulary Entry to add', 'adios');
    await page.keyboard.press('Home');
    await expectHighlightedPickerOption(page, 'Vocabulary Entry to add', 'adios');
    await page.keyboard.press('ArrowDown');
    await expectHighlightedPickerOption(page, 'Vocabulary Entry to add', 'casa');

    await page.keyboard.press('Enter');
    await expect(picker(page, 'Vocabulary Entry to add')).toHaveAttribute('aria-expanded', 'false');
    await expect(pickerAnnouncement(page, 'Vocabulary Entry to add: casa')).toHaveText('Vocabulary Entry to add: casa');
    await expect(page.getByText('Added casa to Trips.', { exact: true })).toBeVisible();
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toHaveCount(0);

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test('adds and removes Collection membership from an expanded Entry without leaving the Library', async ({ page }) => {
    const account = credentials('web-library-entry-chips');
    const { client, pairIds } = await register(account);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    const spanish = await languageIdFor(client, 'es');
    const places = await seedCollection(client, spanish, 'Places');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    const entry = await expandEntry(page, 'hola');
    await entry.getByRole('button', { name: 'Add hola to Places' }).click();
    await expect(entry.getByRole('button', { name: 'Remove hola from Places' })).toHaveAttribute('aria-pressed', 'true');
    await entry.getByRole('button', { name: 'Add hola to Travel' }).click();
    await expect(entry.getByRole('button', { name: 'Remove hola from Travel' })).toHaveAttribute('aria-pressed', 'true');

    await entry.getByRole('button', { name: 'Remove hola from Places' }).click();
    await expect(entry.getByRole('button', { name: 'Add hola to Places' })).toHaveAttribute('aria-pressed', 'false');
    await expect(entrySummary(page, 'hola')).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(entrySummary(page, 'hola')).toBeVisible();

    await choosePickerOption(page, 'Collection scope', /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toBeVisible();

    await choosePickerOption(page, 'Collection scope', 'All vocabulary');
    await expect(page).toHaveURL('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await expect(entrySummary(page, 'adios')).toBeVisible();
  });

  test('refuses Collection membership across Learning Languages from the Library', async ({ page }) => {
    const account = credentials('web-library-cross-language');
    const { client, pairIds } = await register(account, [['es', 'en'], ['fr', 'en']]);
    await createEntry(client, pairIds[0], 'hola', 'hello');
    const bonjour = await createEntry(client, pairIds[1], 'bonjour', 'good day');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);

    await openPicker(page, 'Vocabulary Entry to add');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(1);
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'hola' })).toBeVisible();
    await expect(pickerListbox(page, 'Vocabulary Entry to add').getByRole('option', { name: 'bonjour' })).toHaveCount(0);

    await picker(page, 'Vocabulary Entry to add').fill('bonjour');
    await expect(pickerOptions(page, 'Vocabulary Entry to add')).toHaveCount(0);
    await expect(pickerListbox(page, 'Vocabulary Entry to add')).toContainText('No Vocabulary Entries match');

    const refused = await client.rpc('add_collection_membership', { p_collection_id: travel, p_learning_vocabulary_entry_id: bonjour.learningVocabularyEntryId });
    expect(refused.error).not.toBeNull();
  });

  test('reflects a Library merge in account_learning_snapshot', async ({ page }) => {
    const account = credentials('web-library-merge-snapshot');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    const adios = await createEntry(client, pairIds[0], 'adios', 'goodbye');
    await createEntry(client, pairIds[0], 'casa', 'house');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await fileSelectionInto(page, 'Travel', 'trav');
    await expect(page.getByText('Filed 2 Vocabulary Entries into Travel.', { exact: true })).toBeVisible();

    expect(await snapshotCollections(client, spanish)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: travel,
        name: 'Travel',
        vocabularyEntryIds: expect.arrayContaining([hola.learningVocabularyEntryId, adios.learningVocabularyEntryId]),
      }),
    ]));

    await openPicker(page, 'Collection scope');
    await expect(pickerOptions(page, 'Collection scope').filter({ hasText: 'Travel' })).toContainText('2 entries');
  });

  test('disables every Library filing control with a stated reason while offline', async ({ page }) => {
    const account = credentials('web-library-filing-offline');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel');
    await fileEntry(client, travel, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    const entry = await expandEntry(page, 'hola');
    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');
    await choosePickerOption(page, 'Collection to file into', 'Travel');

    await page.context().setOffline(true);
    const offlineNotice = page.getByText('You are offline. Vocabulary and Collection changes require a connection.', { exact: true });
    await expect(offlineNotice).toBeVisible();
    const filingControls = [
      picker(page, 'Collection to file into'),
      picker(page, 'Vocabulary Entry to add'),
      page.getByRole('button', { name: 'File into Collection' }),
      page.getByRole('button', { name: 'File into new Collection' }),
      entry.getByRole('button', { name: 'Remove hola from Travel' }),
    ];
    for (const control of filingControls) {
      await expect(control).toBeDisabled();
      const describedBy = await control.getAttribute('aria-describedby');
      expect(describedBy).toBe('library-offline-notice');
      await expect(page.locator(`#${describedBy}`)).toHaveText('You are offline. Vocabulary and Collection changes require a connection.');
    }
    await assertNoHorizontalOverflow(page);

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    for (const control of filingControls) await expect(control).toBeEnabled();
    await expect(offlineNotice).toHaveCount(0);
  });

  test('keeps the selection bar and the Collection controls free of horizontal overflow at phone width', async ({ page }) => {
    const account = credentials('web-library-selection-overflow');
    const { client, pairIds } = await register(account);
    const hola = await createEntry(client, pairIds[0], 'hola', 'hello');
    await createEntry(client, pairIds[0], 'adios', 'goodbye');
    const spanish = await languageIdFor(client, 'es');
    const travel = await seedCollection(client, spanish, 'Travel plans for the long summer');
    await fileEntry(client, travel, hola.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await expect(entrySummary(page, 'hola')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await entryCheckbox(page, 'adios').check();
    await expect(selectionCount(page)).toHaveText('2 Vocabulary Entries selected');
    await expect(picker(page, 'Collection to file into')).toBeVisible();
    await expect(page.getByRole('button', { name: 'File into Collection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'File into new Collection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible();
    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);

    await choosePickerOption(page, 'Collection scope', /Travel plans/);
    await expect(page).toHaveURL(`/library?collection=${travel}`);
    await expect(page.getByText('Filtered by Travel plans for the long summer')).toBeVisible();
    await expect(picker(page, 'Vocabulary Entry to add')).toBeVisible();
    await entryCheckbox(page, 'hola').check();
    await expect(selectionCount(page)).toHaveText('1 Vocabulary Entry selected');
    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });
});
