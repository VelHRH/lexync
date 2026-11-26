import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { linkExampleToSense } from './support/database';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return { email: `web-shared-example-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerWithPair(account: ReturnType<typeof credentials>) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: pair, error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
  if (pairError) throw pairError;
  return { client, pairId: (pair as { id: string }).id };
}

async function createEntry(client: SupabaseClient, pairId: string, expression: string, translation: string, example = '') {
  const { error } = await client.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: pairId,
    p_translation: translation,
  });
  if (error) throw error;
}

async function senseIdOf(client: SupabaseClient, expression: string) {
  const { data, error } = await client.from('vocabulary_entries').select('senses(id)').eq('expression', expression).single();
  if (error) throw error;
  return (data as { senses: Array<{ id: string }> }).senses[0].id;
}

async function exampleIds(client: SupabaseClient) {
  const { data, error } = await client.from('examples').select('id');
  if (error) throw error;
  return (data ?? []).map((example) => example.id as string);
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function entry(page: Page, expression: string) {
  return page.locator('summary').filter({ hasText: new RegExp(`^${expression}`) }).locator('..');
}

async function expandEntry(page: Page, expression: string) {
  const summary = page.locator('summary').filter({ hasText: new RegExp(`^${expression}`) });
  await expect(summary).toBeVisible();
  await summary.click();
}

async function editEntry(page: Page, expression: string, change: () => Promise<void>) {
  await page.getByRole('button', { name: `Edit ${expression}` }).click();
  await change();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByLabel('Expression')).toHaveCount(0);
  await page.reload();
}

test('a shared Example is edited once for every Vocabulary Entry and unlinked one entry at a time', async ({ page }) => {
  const account = credentials();
  const { client, pairId } = await registerWithPair(account);
  await createEntry(client, pairId, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');
  await createEntry(client, pairId, 'ciudad', 'city');
  const [sharedExampleId] = await exampleIds(client);
  linkExampleToSense(sharedExampleId, await senseIdOf(client, 'ciudad'));

  await signIn(page, account);
  await page.goto('/library');
  await expandEntry(page, 'ciudad');
  await expect(entry(page, 'ciudad').getByText('Quiero descubrir la ciudad.')).toBeVisible();

  await editEntry(page, 'ciudad', async () => {
    await page.getByLabel('Example 1 text').fill('Quiero descubrir la ciudad vieja.');
    await page.getByLabel('Example 1 translation', { exact: true }).fill('I want to discover the old city.');
  });
  await expandEntry(page, 'descubrir');
  await expect(entry(page, 'descubrir').getByText('Quiero descubrir la ciudad vieja.')).toBeVisible();
  await expect(entry(page, 'descubrir').getByText(/^I want to discover the old city\. en$/)).toBeVisible();
  await expect(entry(page, 'descubrir').getByText('Quiero descubrir la ciudad.', { exact: true })).toHaveCount(0);
  await editEntry(page, 'descubrir', async () => {
    await page.getByRole('button', { name: 'Remove Example 1' }).click();
  });
  await expandEntry(page, 'descubrir');
  await expect(entry(page, 'descubrir').getByText('Quiero descubrir la ciudad vieja.')).toHaveCount(0);
  await expandEntry(page, 'ciudad');
  await expect(entry(page, 'ciudad').getByText('Quiero descubrir la ciudad vieja.')).toBeVisible();
  await expect(entry(page, 'ciudad').getByText(/^I want to discover the old city\. en$/)).toBeVisible();
  expect(await exampleIds(client)).toEqual([sharedExampleId]);
  await editEntry(page, 'ciudad', async () => {
    await page.getByRole('button', { name: 'Remove Example 1' }).click();
  });
  await expandEntry(page, 'ciudad');
  await expect(entry(page, 'ciudad').getByText('Quiero descubrir la ciudad vieja.')).toHaveCount(0);
  expect(await exampleIds(client)).toEqual([]);
});
