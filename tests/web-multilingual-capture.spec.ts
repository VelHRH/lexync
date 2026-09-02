import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-multilingual-capture') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function register(account: ReturnType<typeof credentials>, pairs: Array<[string, string]>) {
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

async function setLanguage(field: Locator, value: string) {
  if (await field.evaluate((element) => element.tagName === 'SELECT')) {
    await field.selectOption({ label: value }).catch(() => field.selectOption(value));
    return;
  }
  await field.fill(value);
}

async function saveCapture(page: Page, expression: string, answerLanguage: string, translation: string) {
  await page.getByRole('button', { name: /Add vocabulary/i }).click();
  const form = page.locator('form').filter({ has: page.getByLabel('Expression', { exact: true }) }).last();
  await form.getByLabel('Expression', { exact: true }).fill(expression);
  await setLanguage(form.getByLabel('Answer Language', { exact: true }), answerLanguage);
  await form.getByLabel('Translation', { exact: true }).fill(translation);
  await form.getByRole('button', { name: /Save Vocabulary Entry|Save/i }).click();
}

test.describe('web multilingual manual capture', () => {
  test('scopes the library to the active Learning Language and matches duplicate Expressions across Answer Languages', async ({ page }) => {
    const account = credentials('web-language-scoped-library');
    const setup = await register(account, [['es', 'en'], ['fr', 'en']]);
    await signIn(page, account);
    await page.goto('/library');

    await expect(page.getByLabel('Active Learning Language')).toBeVisible();
    await saveCapture(page, 'Casa', 'en-US', 'house');
    await expect(page.getByText('Casa', { exact: true })).toHaveCount(1);
    await saveCapture(page, ' casa ', 'uk-UA', 'дім');
    await expect(page.getByText('Casa', { exact: true })).toHaveCount(1);
    await page.getByText('Casa', { exact: true }).click();
    await expect(page.getByText('house', { exact: true })).toBeVisible();
    await expect(page.getByText('дім', { exact: true })).toBeVisible();
    await expect(page.getByText('en-US', { exact: true })).toBeVisible();
    await expect(page.getByText('uk-UA', { exact: true })).toBeVisible();

    const { data: languages, error: languageError } = await setup.client.from('learning_languages').select('id,language_tag');
    if (languageError) throw languageError;
    const french = languages?.find((language) => language.language_tag === 'fr');
    if (!french) throw new Error('The French Learning Language fixture is missing.');
    await page.getByLabel('Active Learning Language').selectOption(french.id);
    await expect(page.getByText('Casa', { exact: true })).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Study Pair');
  });

  test('keeps Answer Language editable and preserves BCP 47 variants', async ({ page }) => {
    const account = credentials('web-answer-language');
    await register(account, [['es', 'en']]);
    await signIn(page, account);
    await page.goto('/library');
    await page.getByRole('button', { name: /Add vocabulary/i }).click();
    const form = page.locator('form').filter({ has: page.getByLabel('Expression', { exact: true }) }).last();
    const answerLanguage = form.getByLabel('Answer Language', { exact: true });
    await expect(answerLanguage).toBeEditable();
    await form.getByLabel('Expression', { exact: true }).fill('ordenador');
    await setLanguage(answerLanguage, 'pt-BR');
    await form.getByLabel('Translation', { exact: true }).fill('computador');
    await form.getByRole('button', { name: /Save Vocabulary Entry|Save/i }).click();
    await expect(page.getByText('pt-BR', { exact: true })).toBeVisible();
    await expect(page.getByText('computador', { exact: true })).toBeVisible();
  });

  test('requires an explicit Sense choice before adding an Answer Language to a multi-Sense entry', async ({ page }) => {
    const account = credentials('web-sense-choice');
    const setup = await register(account, [['es', 'en']]);
    const { data: pair, error: pairError } = await setup.client.from('study_pairs').select('id').eq('id', setup.pairIds[0]).single();
    if (pairError || !pair) throw pairError ?? new Error('The Study Pair fixture is missing.');
    const { data: captured, error: captureError } = await setup.client.rpc('capture_manual_entry', {
      p_example: null,
      p_expression: 'banco',
      p_study_pair_id: pair.id,
      p_translation: 'bank',
    });
    if (captureError) throw captureError;
    const entryId = (captured as { vocabularyEntryId: string }).vocabularyEntryId;
    const { data: secondSense, error: senseError } = await setup.client
      .from('senses')
      .insert({ vocabulary_entry_id: entryId })
      .select('id')
      .single();
    if (senseError || !secondSense) throw senseError ?? new Error('The second Sense fixture is missing.');
    const { error: translationError } = await setup.client.from('translations').insert({ sense_id: secondSense.id, text: 'bench', answer_language_tag: 'en' });
    if (translationError) throw translationError;

    await signIn(page, account);
    await page.goto('/library');
    await saveCapture(page, 'banco', 'uk', 'банк');
    await expect(page.getByText(/Choose an existing Sense|Create a new Sense|Select a Sense/i)).toBeVisible();
    await expect(page.getByText('банк', { exact: true })).toHaveCount(0);
  });

  test('reviews one Learning Language while exposing translations from multiple Answer Languages', async ({ page }) => {
    const account = credentials('web-mixed-answer-review');
    const setup = await register(account, [['es', 'en'], ['es', 'uk'], ['fr', 'en']]);
    const spanishEnglish = setup.pairIds[0];
    const spanishUkrainian = setup.pairIds[1];
    const first = await setup.client.rpc('capture_manual_entry', { p_example: null, p_expression: 'casa', p_study_pair_id: spanishEnglish, p_translation: 'house' });
    const second = await setup.client.rpc('capture_manual_entry', { p_example: null, p_expression: 'casa', p_study_pair_id: spanishUkrainian, p_translation: 'дім' });
    if (first.error || second.error) throw first.error ?? second.error;

    await signIn(page, account);
    await page.goto('/review');
    await expect(page.getByRole('heading', { name: /Recognition|Review/i })).toBeVisible();
    await expect(page.getByText(/Spanish/i)).toBeVisible();
    await expect(page.getByText(/French/i)).toHaveCount(0);
    await expect(page.getByText(/English|Ukrainian|en|uk/i)).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Study Pair');
  });
});
