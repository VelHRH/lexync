import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return { email: `web-example-reuse-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function register(account: ReturnType<typeof credentials>) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { error: pairError } = await client.rpc('create_study_pair', { p_target_language_tag: 'es', p_reference_language_tag: 'en' });
  if (pairError) throw pairError;
  return client;
}

async function exampleTexts(client: SupabaseClient) {
  const { data, error } = await client.from('examples').select('text').order('text');
  if (error) throw error;
  return (data ?? []).map((example) => example.text as string);
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function capture(page: Page, expression: string, translation: string, example: string, exampleTranslation = '') {
  await page.getByRole('button', { name: /Add vocabulary/i }).click();
  const form = page.locator('form').filter({ has: page.getByLabel('Expression', { exact: true }) }).last();
  await form.getByLabel('Expression', { exact: true }).fill(expression);
  const answerLanguage = form.getByLabel('Answer Language', { exact: true });
  if (await answerLanguage.evaluate((element) => element.tagName === 'SELECT')) await answerLanguage.selectOption('en');
  else await answerLanguage.fill('en');
  await form.getByLabel('Translation', { exact: true }).fill(translation);
  await form.getByLabel('Example (optional)', { exact: true }).fill(example);
  if (exampleTranslation) await form.getByLabel('Example translation (optional)', { exact: true }).fill(exampleTranslation);
  await form.getByRole('button', { name: /Save Vocabulary Entry|Save/i }).click();
  await expect(page.locator('.vocabulary-entry summary').filter({ has: page.getByRole('heading', { name: expression, exact: true }) })).toHaveCount(1);
}

function entry(page: Page, expression: string) {
  return page.locator('.vocabulary-entry summary').filter({ has: page.getByRole('heading', { name: expression, exact: true }) }).locator('..');
}

async function expandEntry(page: Page, expression: string) {
  const summary = page.locator('.vocabulary-entry summary').filter({ has: page.getByRole('heading', { name: expression, exact: true }) });
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

test('capturing a saved sentence again shares one Example that edits from either word', async ({ page }) => {
  const account = credentials();
  const client = await register(account);
  await signIn(page, account);
  await page.goto('/library');

  await capture(page, 'descubrir', 'to discover', 'Quiero descubrir la ciudad.', 'I want to discover the city.');
  await capture(page, 'ciudad', 'city', ' Quiero  descubrir la ciudad. ', 'Another translation.');
  expect(await exampleTexts(client)).toEqual(['Quiero descubrir la ciudad.']);

  await page.reload();
  await expandEntry(page, 'ciudad');
  await expect(entry(page, 'ciudad').getByText('Quiero descubrir la ciudad.')).toBeVisible();
  await expect(entry(page, 'ciudad').getByText(/^I want to discover the city\. en$/)).toBeVisible();

  await editEntry(page, 'ciudad', async () => {
    await page.getByLabel('Example 1 text').fill('Quiero descubrir la ciudad vieja.');
  });
  await expandEntry(page, 'descubrir');
  await expect(entry(page, 'descubrir').getByText('Quiero descubrir la ciudad vieja.')).toBeVisible();

  await editEntry(page, 'descubrir', async () => {
    await page.getByLabel('Example 1 text').fill('Quiero descubrir la ciudad nueva.');
  });
  await expandEntry(page, 'ciudad');
  await expect(entry(page, 'ciudad').getByText('Quiero descubrir la ciudad nueva.')).toBeVisible();
  expect(await exampleTexts(client)).toEqual(['Quiero descubrir la ciudad nueva.']);
});

test('editing an Example to match another merges them and both words keep it', async ({ page }) => {
  const account = credentials();
  const client = await register(account);
  await signIn(page, account);
  await page.goto('/library');

  await capture(page, 'playa', 'beach', 'Vamos a la playa.', 'We are going to the beach.');
  await capture(page, 'vamos', 'we go', 'Vamos al mar.');
  expect(await exampleTexts(client)).toEqual(['Vamos a la playa.', 'Vamos al mar.']);

  await page.reload();
  await expandEntry(page, 'vamos');
  await editEntry(page, 'vamos', async () => {
    await page.getByLabel('Example 1 text').fill('Vamos a la playa.');
  });
  expect(await exampleTexts(client)).toEqual(['Vamos a la playa.']);

  await expandEntry(page, 'vamos');
  await expect(entry(page, 'vamos').getByText('Vamos a la playa.')).toBeVisible();
  await expect(entry(page, 'vamos').getByText(/^We are going to the beach\. en$/)).toBeVisible();
  await expandEntry(page, 'playa');
  await expect(entry(page, 'playa').getByText('Vamos a la playa.')).toBeVisible();
});
