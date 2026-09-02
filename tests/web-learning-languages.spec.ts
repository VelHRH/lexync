import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-learning-language') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function register(account: ReturnType<typeof credentials>, pairs: Array<[string, string]> = []) {
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

async function submitForm(form: Locator) {
  await form.getByRole('button').click();
}

test.describe('web Learning Language settings', () => {
  test('onboards with only one valid Learning Language tag', async ({ page }) => {
    const account = credentials('web-onboarding-language');
    await page.goto('/auth/sign-up');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password').fill(account.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding(?:\/|$)/);
    await expect(page.getByRole('heading', { name: /Learning Language/i })).toBeVisible();
    const form = page.locator('form').last();
    const language = form.getByLabel('Learning Language', { exact: true });
    await expect(language).toBeVisible();
    await expect(form.getByLabel(/Answer Language/i)).toHaveCount(0);
    await expect(form.getByLabel(/Reference Language/i)).toHaveCount(0);
    await expect(page.getByText(/Study Pair/i)).toHaveCount(0);

    await language.fill('en_US');
    await submitForm(form);
    await expect(form.getByRole('alert')).toContainText('valid BCP 47');
    await expect(language).toHaveValue('en_US');

    await language.fill('pt-BR');
    await submitForm(form);
    const continueButton = page.getByRole('button', { name: /Continue to dashboard/i });
    await expect(continueButton).toBeVisible();
    await continueButton.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByLabel('Active Learning Language')).toContainText(/Portuguese|pt-BR/i);
  });

  test('manages later language additions and protects the last language', async ({ page }) => {
    const account = credentials('web-language-settings');
    await register(account, [['es', 'en']]);
    await signIn(page, account);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const languagesSection = page.getByRole('region', { name: 'Learning Languages' });
    await expect(languagesSection).toBeVisible();

    const addForm = languagesSection.locator('form');
    const language = addForm.getByLabel('Learning Language', { exact: true });
    await language.fill('en_US');
    await addForm.getByRole('button', { name: /Add Learning Language/i }).click();
    await expect(languagesSection.getByRole('alert')).toContainText('valid BCP 47');

    await language.fill('fr-CA');
    await addForm.getByRole('button', { name: /Add Learning Language/i }).click();
    await expect(page.getByText('fr-CA', { exact: true })).toBeVisible();
    await language.fill('fr-CA');
    await addForm.getByRole('button', { name: /Add Learning Language/i }).click();
    await expect(languagesSection.getByRole('alert')).toContainText(/already exists|duplicate/i);

    const frenchRow = page.locator('li, [role="listitem"], .language-row').filter({ hasText: 'fr-CA' }).last();
    const removeFrench = frenchRow.getByRole('button', { name: /Remove/i });
    await expect(removeFrench).toBeVisible();
    await removeFrench.click();
    await expect(page.getByText('fr-CA', { exact: true })).toHaveCount(0);

    const spanishRow = page.locator('li, [role="listitem"], .language-row').filter({ hasText: /Spanish|es/ }).last();
    const removeSpanish = spanishRow.getByRole('button', { name: /Remove/i });
    await expect(spanishRow).toBeVisible();
    await expect(removeSpanish).toBeDisabled();
  });

  test('uses one account-wide selector and refetches external active-language changes', async ({ page }) => {
    const account = credentials('web-active-language');
    const setup = await register(account, [['es', 'en'], ['fr', 'en']]);
    const { data: languages, error } = await setup.client.from('learning_languages').select('id,language_tag').order('created_at');
    if (error || !languages || languages.length < 2) throw error ?? new Error('The Learning Language fixtures are missing.');
    const spanish = languages.find((language) => language.language_tag === 'es');
    const french = languages.find((language) => language.language_tag === 'fr');
    if (!spanish || !french) throw new Error('The Learning Language fixtures are missing.');

    await signIn(page, account);
    await expect(page.getByLabel('Active Learning Language')).toBeVisible();
    await expect(page.locator('header').getByLabel('Active Learning Language')).toBeVisible();
    await expect(page.getByLabel(/Active Study Pair|Study Pair/i)).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Study Pair');

    await page.getByLabel('Active Learning Language').selectOption(french.id);
    await expect(page.getByLabel('Active Learning Language')).toHaveValue(french.id);
    const { data: activeAfterSwitch, error: switchError } = await setup.client
      .from('learner_language_state')
      .select('active_learning_language_id')
      .single();
    if (switchError) throw switchError;
    expect(activeAfterSwitch.active_learning_language_id).toBe(french.id);

    const { error: externalError } = await setup.client.rpc('set_active_learning_language', { p_learning_language_id: spanish.id });
    if (externalError) throw externalError;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByLabel('Active Learning Language')).toHaveValue(spanish.id);
  });
});
