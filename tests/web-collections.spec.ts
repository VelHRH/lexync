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

function entrySummary(page: Page, expression: string) {
  return page.locator('summary').filter({ hasText: expression });
}

function scopePicker(page: Page) {
  return page.getByRole('combobox', { name: 'Collection scope' });
}

function scopeListbox(page: Page) {
  return page.getByRole('listbox');
}

function scopeOptions(page: Page) {
  return scopeListbox(page).getByRole('option');
}

function scopeAnnouncement(page: Page, text: string | RegExp) {
  return page.getByRole('status').filter({ hasText: text });
}

async function openScopePicker(page: Page) {
  await scopePicker(page).click();
  await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'true');
  const listboxId = await scopePicker(page).getAttribute('aria-controls');
  expect(listboxId).toBeTruthy();
  await expect(scopeListbox(page)).toHaveAttribute('id', String(listboxId));
}

async function chooseScope(page: Page, option: string | RegExp) {
  await openScopePicker(page);
  await scopeListbox(page).getByRole('option', { name: option }).click();
  await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');
}

async function highlightedScopeOption(page: Page) {
  const activeDescendant = await scopePicker(page).getAttribute('aria-activedescendant');
  for (const option of await scopeOptions(page).all()) {
    if ((await option.getAttribute('id')) !== activeDescendant) continue;
    return `${await option.getAttribute('role')} ${(await option.innerText()).replace(/\s+/g, ' ').trim()}`;
  }
  return 'no option carries the aria-activedescendant id';
}

async function expectHighlightedScopeOption(page: Page, name: string) {
  await expect.poll(() => highlightedScopeOption(page)).toContain(`option ${name}`);
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
    await expect(scopePicker(page)).toHaveValue('All vocabulary');
    await expect(scopePicker(page)).toHaveAttribute('aria-autocomplete', 'list');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();

    await chooseScope(page, /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(scopePicker(page)).toHaveValue('Places');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'sol')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toHaveCount(0);

    await openScopePicker(page);
    await expect(scopeListbox(page).getByRole('option', { name: /Places/ })).toHaveAttribute('aria-selected', 'true');
    await scopePicker(page).press('Escape');
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');

    await entrySummary(page, 'casa').click();
    const casaEntry = entrySummary(page, 'casa').locator('..');
    await expect(casaEntry.getByRole('heading', { name: 'Sense 1' })).toBeVisible();
    await expect(casaEntry.getByText(/^house\s+en$/)).toBeVisible();
    await expect(casaEntry.getByText('La casa es grande.', { exact: true })).toBeVisible();
    await expect(casaEntry.getByRole('button', { name: 'Suspend casa' })).toBeVisible();

    await chooseScope(page, 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await chooseScope(page, 'All vocabulary');
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

    await openScopePicker(page);
    await expect(scopeOptions(page)).toHaveCount(5);
    await expect(scopeOptions(page).nth(0)).toContainText('All vocabulary');
    await expect(scopeOptions(page).nth(1)).toContainText('Not in a Collection');
    await expect(scopeOptions(page).nth(2)).toContainText('Places');
    await expect(scopeOptions(page).nth(2)).toContainText('2 entries');
    await expect(scopeOptions(page).nth(3)).toContainText('Sky');
    await expect(scopeOptions(page).nth(3)).toContainText('1 entry');
    await expect(scopeOptions(page).nth(4)).toContainText('Empty shelf');
    await expect(scopeOptions(page).nth(4)).toContainText('0 entries');

    await page.getByLabel('Search vocabulary').click();
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');
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
    await openScopePicker(page);

    await scopePicker(page).fill('pla');
    await expect(scopeListbox(page).getByRole('option', { name: /Places/ })).toBeVisible();
    await expect(scopeListbox(page).getByRole('option', { name: /Sky/ })).toHaveCount(0);

    await scopePicker(page).fill('');
    await scopePicker(page).fill('  WEATHER   WORDS  ');
    await expect(scopeListbox(page).getByRole('option', { name: /Weather words/ })).toBeVisible();

    await scopePicker(page).fill('zzz');
    await expect(page.getByText('No Collections match').first()).toBeVisible();
    await expect(scopeAnnouncement(page, 'No Collections match')).toHaveText('No Collections match');
    await expect(scopeOptions(page)).toHaveCount(0);
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

    await scopePicker(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('s');
    await expect(scopeAnnouncement(page, /options available/)).toHaveText(/^\d+ options available$/);

    await page.keyboard.press('End');
    await expectHighlightedScopeOption(page, 'Sky');
    await page.keyboard.press('ArrowUp');
    await expectHighlightedScopeOption(page, 'Places');
    await page.keyboard.press('Home');
    await expectHighlightedScopeOption(page, 'Places');
    await page.keyboard.press('ArrowDown');
    await expectHighlightedScopeOption(page, 'Sky');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/library?collection=${sky}`);
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(scopePicker(page)).toHaveValue('Sky');
    await expect(scopeAnnouncement(page, 'Collection scope: Sky')).toHaveText('Collection scope: Sky');
    await expect(entrySummary(page, 'cielo')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await page.keyboard.press('ArrowDown');
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(scopePicker(page)).toHaveValue('Sky');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('pla');
    await page.keyboard.press('Tab');
    await expect(scopePicker(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(scopePicker(page)).toHaveValue('Sky');
    await expect(page).toHaveURL(`/library?collection=${sky}`);
    await expect(entrySummary(page, 'cielo')).toBeVisible();

    if (test.info().project.name === 'web-collections-mobile') await assertNoHorizontalOverflow(page);
  });

  test('composes search and the status filter with the Collection scope', async ({ page }) => {
    const account = credentials('web-collection-scope-compose');
    const { client, pairIds } = await register(account);
    const casa = await createEntry(client, pairIds[0], 'casa', 'house');
    const sol = await createEntry(client, pairIds[0], 'sol', 'sun');
    await createEntry(client, pairIds[0], 'luna', 'moon');
    const places = await seedCollection(client, await languageIdFor(client, 'es'), 'Places');
    await fileEntry(client, places, casa.learningVocabularyEntryId);
    await fileEntry(client, places, sol.learningVocabularyEntryId);

    await signIn(page, account);
    await page.goto('/library');
    await entrySummary(page, 'sol').click();
    await page.getByRole('button', { name: 'Suspend sol' }).click();
    await expect(page.getByText('Suspended', { exact: true })).toBeVisible();

    await chooseScope(page, /Places/);
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
    await expect(page.getByText('No Vocabulary Entries match “luna”.', { exact: true })).toBeVisible();
    await expect(page.getByText('No vocabulary entries in “Places”.')).toHaveCount(0);
    await expect(scopePicker(page)).toHaveValue('Places');
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

    await chooseScope(page, /Empty shelf/);
    await expect(page.getByRole('heading', { name: 'This Collection is empty.' })).toBeVisible();
    await expect(page.getByText('No vocabulary entries in “Empty shelf”.', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'This Collection is empty.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Library' }).getByRole('alert')).toHaveCount(0);

    await chooseScope(page, 'Not in a Collection');
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
    await chooseScope(page, /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);

    await page.reload();
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(scopePicker(page)).toHaveValue('Places');
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toHaveCount(0);

    await chooseScope(page, 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');

    await page.reload();
    await expect(page).toHaveURL('/library?collection=none');
    await expect(scopePicker(page)).toHaveValue('Not in a Collection');
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
    await chooseScope(page, /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);

    await selectLearningLanguage(page, french);
    await expectActiveLearningLanguage(page, french);
    await expect(page).toHaveURL('/library');
    await expect(scopePicker(page)).toHaveValue('All vocabulary');
    await expect(entrySummary(page, 'fromage')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await openScopePicker(page);
    await expect(scopeListbox(page).getByRole('option', { name: /Paris/ })).toBeVisible();
    await expect(scopeListbox(page).getByRole('option', { name: /Places/ })).toHaveCount(0);
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

    await chooseScope(page, /Places/);
    await expect(page).toHaveURL(`/library?collection=${places}`);
    await expect(entrySummary(page, 'casa')).toBeVisible();
    await expect(entrySummary(page, 'cielo')).toHaveCount(0);

    await chooseScope(page, 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(entrySummary(page, 'luna')).toBeVisible();
    await expect(entrySummary(page, 'casa')).toHaveCount(0);

    await chooseScope(page, 'All vocabulary');
    await expect(page).toHaveURL('/library');
    await expect(entrySummary(page, 'cielo')).toBeVisible();
    await expect(entrySummary(page, 'luna')).toBeVisible();
    expect(libraryRequests.count()).toBe(0);
  });
});
