import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const maxLearningMaterialBytes = 1_048_576;

type Account = { email: string; password: string };
type LearningLanguage = { id: string; language_tag: string };

function credentials(prefix = 'web-learning-material') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function register(account: Account, languageTags: string[]) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  for (const languageTag of languageTags) {
    const result = await client.rpc('create_learning_language', { p_language_tag: languageTag });
    if (result.error) throw result.error;
  }
  const { data: languages, error: languageError } = await client
    .from('learning_languages')
    .select('id,language_tag')
    .order('created_at');
  if (languageError || !languages) throw languageError ?? new Error('The Learning Language fixtures are missing.');
  return { client, languages: languages as LearningLanguage[] };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

function materialsRegion(page: Page) {
  return page.getByRole('region', { name: 'Learning Materials' });
}

async function uploadMaterial(page: Page, name: string, buffer: Buffer) {
  const region = materialsRegion(page);
  await region.getByLabel('Learning Material file').setInputFiles({ name, mimeType: 'text/plain', buffer });
  await region.getByRole('button', { name: 'Upload Learning Material' }).click();
}

async function expectReadyMaterial(page: Page, name: string) {
  const region = materialsRegion(page);
  const material = region.getByRole('listitem').filter({ hasText: name });
  await expect(material).toContainText(/ready/i, { timeout: 30_000 });
  await expect(material).toContainText(name);
}

async function expectNoLearnerFacingTechnicalTerms(page: Page) {
  await expect(page.locator('body')).not.toContainText(/\b(?:RAG|embedding|vector|chunk|vector database|model|provider|Gemini)\b/i);
}

test.describe('web Learning Materials', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 });

  test('uploads a UTF-8 TXT Learning Material, announces processing and ready, and persists it after reload', async ({ page }) => {
    const account = credentials('web-learning-material-ready');
    const setup = await register(account, ['es']);
    const spanish = setup.languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');

    await signIn(page, account);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.getByLabel('Active Learning Language').selectOption(spanish.id);
    const filename = 'morning-notes.TXT';
    await uploadMaterial(page, filename, Buffer.from('Buenos días. Esta es una lectura breve para estudiar.', 'utf8'));

    const status = page.getByRole('status').filter({ hasText: filename });
    await expect(status).toContainText(/processing/i);
    await expectReadyMaterial(page, filename);
    await expectNoLearnerFacingTechnicalTerms(page);

    await page.reload();
    await expectReadyMaterial(page, filename);
    await expectNoLearnerFacingTechnicalTerms(page);
  });

  test('accepts a TXT file whose raw content is exactly 1 MiB', async ({ page }) => {
    const account = credentials('web-learning-material-limit');
    const setup = await register(account, ['es']);
    const spanish = setup.languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');

    await signIn(page, account);
    await page.getByLabel('Active Learning Language').selectOption(spanish.id);
    const filename = 'one-megabyte.txt';
    await uploadMaterial(page, filename, Buffer.alloc(maxLearningMaterialBytes, 'a'));
    await expectReadyMaterial(page, filename);
    await expectNoLearnerFacingTechnicalTerms(page);
  });

  const rejectedFixtures = [
    {
      name: 'empty.txt',
      buffer: Buffer.alloc(0),
      message: /Learning Material files cannot be empty\./i,
    },
    {
      name: 'blank.txt',
      buffer: Buffer.from('\uFEFF \n\t', 'utf8'),
      message: /Learning Material files cannot be empty\./i,
    },
    {
      name: 'notes.pdf',
      buffer: Buffer.from('This is text with the wrong extension.', 'utf8'),
      message: /Learning Material files must use the \.txt extension\./i,
    },
    {
      name: 'malformed.txt',
      buffer: Buffer.from([0xc3, 0x28]),
      message: /Learning Material files must be valid UTF-8 text\./i,
    },
    {
      name: 'binary.txt',
      buffer: Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
      message: /Learning Material files must contain readable text\./i,
    },
    {
      name: 'too-large.txt',
      buffer: Buffer.alloc(maxLearningMaterialBytes + 1, 'a'),
      message: /Learning Material files must be 1 MiB or smaller\./i,
    },
  ] as const;

  for (const fixture of rejectedFixtures) {
    test(`rejects ${fixture.name} with a clear product-language error`, async ({ page }) => {
      const account = credentials(`web-learning-material-${fixture.name.replace(/\W/g, '-')}`);
      const setup = await register(account, ['es']);
      const spanish = setup.languages.find((language) => language.language_tag === 'es');
      if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');

      await signIn(page, account);
      await page.getByLabel('Active Learning Language').selectOption(spanish.id);
      await uploadMaterial(page, fixture.name, fixture.buffer);

      const region = materialsRegion(page);
      await expect(region.getByRole('alert')).toContainText(fixture.message);
      await expect(region.getByText(fixture.name, { exact: true })).toHaveCount(0);
      await expectNoLearnerFacingTechnicalTerms(page);
    });
  }

  test('scopes the Learning Material list to the active language and the owning Learner', async ({ page, browser }) => {
    const owner = credentials('web-learning-material-owner');
    const ownerSetup = await register(owner, ['es', 'fr']);
    const spanish = ownerSetup.languages.find((language) => language.language_tag === 'es');
    const french = ownerSetup.languages.find((language) => language.language_tag === 'fr');
    if (!spanish || !french) throw new Error('The multilingual Learning Language fixtures are missing.');

    await signIn(page, owner);
    const activeLanguage = page.getByLabel('Active Learning Language');
    await activeLanguage.selectOption(spanish.id);
    const spanishFilename = 'spanish-story.txt';
    await uploadMaterial(page, spanishFilename, Buffer.from('Una historia en español.', 'utf8'));
    await expectReadyMaterial(page, spanishFilename);

    await activeLanguage.selectOption(french.id);
    await expect(activeLanguage).toHaveValue(french.id);
    await expect(materialsRegion(page).getByText(spanishFilename, { exact: true })).toHaveCount(0);
    const frenchFilename = 'french-story.txt';
    await uploadMaterial(page, frenchFilename, Buffer.from('Une histoire en français.', 'utf8'));
    await expectReadyMaterial(page, frenchFilename);

    await activeLanguage.selectOption(spanish.id);
    await expect(materialsRegion(page).getByText(spanishFilename, { exact: true })).toBeVisible();
    await expect(materialsRegion(page).getByText(frenchFilename, { exact: true })).toHaveCount(0);
    await expectNoLearnerFacingTechnicalTerms(page);

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    try {
      const other = credentials('web-learning-material-other');
      const otherSetup = await register(other, ['es']);
      const otherSpanish = otherSetup.languages.find((language) => language.language_tag === 'es');
      if (!otherSpanish) throw new Error('The other Spanish Learning Language fixture is missing.');
      await signIn(otherPage, other);
      await otherPage.getByLabel('Active Learning Language').selectOption(otherSpanish.id);
      await expect(materialsRegion(otherPage).getByText(spanishFilename, { exact: true })).toHaveCount(0);
      await expect(materialsRegion(otherPage).getByText(frenchFilename, { exact: true })).toHaveCount(0);
      await expectNoLearnerFacingTechnicalTerms(otherPage);
    } finally {
      await otherContext.close();
    }
  });
});
