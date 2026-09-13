import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

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

async function createEntry(client: Awaited<ReturnType<typeof register>>['client'], pairId: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_manual_entry', {
    p_example: '',
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
    await page.getByLabel('Active Learning Language').selectOption(italian.id);
    await expect(page.getByLabel('Active Learning Language')).toHaveValue(italian.id);
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

    await page.getByLabel('Active Learning Language').selectOption(french.id);
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
});
