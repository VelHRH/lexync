import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const maxLearningMaterialBytes = 1_048_576;

type Account = { email: string; password: string };
type LearningLanguage = { id: string; language_tag: string };
type SeededMaterial = { id: string; storagePath: string };

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
  if (!data.user) throw new Error('The local learner fixture is missing its user.');
  return { client, languages: languages as LearningLanguage[], userId: data.user.id };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function openMaterials(page: Page) {
  if (new URL(page.url()).pathname !== '/materials') await page.goto('/materials');
}

function materialsRegion(page: Page) {
  return page.getByRole('region', { name: 'Learning Materials', exact: true });
}

async function uploadMaterial(page: Page, name: string, buffer: Buffer) {
  await openMaterials(page);
  const region = materialsRegion(page);
  await region.getByLabel('Learning Material file').setInputFiles({ name, mimeType: 'text/plain', buffer });
  await region.getByRole('button', { name: 'Upload Learning Material' }).click();
}

async function expectReadyMaterial(page: Page, name: string) {
  await openMaterials(page);
  const region = materialsRegion(page);
  const material = region.getByRole('listitem').filter({ hasText: name });
  await expect(material).toContainText(/ready/i, { timeout: 30_000 });
  await expect(material).toContainText(name);
}

async function expectMaterialStatus(page: Page, name: string, status: 'processing' | 'failed' | 'ready') {
  await openMaterials(page);
  const material = materialsRegion(page).getByRole('listitem').filter({ hasText: name });
  await expect(material).toContainText(new RegExp(`\\b${status}\\b`, 'i'));
  return material;
}

async function seedMaterial(
  client: SupabaseClient,
  userId: string,
  learningLanguageId: string,
  fileName: string,
  status: 'processing' | 'failed',
): Promise<SeededMaterial> {
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${learningLanguageId}/${id}/${fileName}`;
  const content = Buffer.from(`Fixture content for ${fileName}.`, 'utf8');
  const { error: insertError } = await client.from('learning_materials').insert({
    id,
    learner_id: userId,
    learning_language_id: learningLanguageId,
    file_name: fileName,
    storage_path: storagePath,
    byte_size: content.byteLength,
    status,
  });
  if (insertError) throw insertError;
  const { error: uploadError } = await client.storage.from('learning-materials').upload(storagePath, content, { contentType: 'text/plain' });
  if (uploadError) throw uploadError;
  return { id, storagePath };
}

async function expectSourceUnavailable(client: SupabaseClient, storagePath: string) {
  const { data, error } = await client.storage.from('learning-materials').download(storagePath);
  expect(data).toBeNull();
  expect(error).toBeTruthy();
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
    await selectLearningLanguage(page, spanish.id);
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
    await selectLearningLanguage(page, spanish.id);
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
      await selectLearningLanguage(page, spanish.id);
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
    await selectLearningLanguage(page, spanish.id);
    const spanishFilename = 'spanish-story.txt';
    await uploadMaterial(page, spanishFilename, Buffer.from('Una historia en español.', 'utf8'));
    await expectReadyMaterial(page, spanishFilename);

    await selectLearningLanguage(page, french.id);
    await openMaterials(page);
    await expect(materialsRegion(page).getByText(spanishFilename, { exact: true })).toHaveCount(0);
    const frenchFilename = 'french-story.txt';
    await uploadMaterial(page, frenchFilename, Buffer.from('Une histoire en français.', 'utf8'));
    await expectReadyMaterial(page, frenchFilename);

    await selectLearningLanguage(page, spanish.id);
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
      await selectLearningLanguage(otherPage, otherSpanish.id);
      await openMaterials(otherPage);
      await expect(materialsRegion(otherPage).getByText(spanishFilename, { exact: true })).toHaveCount(0);
      await expect(materialsRegion(otherPage).getByText(frenchFilename, { exact: true })).toHaveCount(0);
      await expectNoLearnerFacingTechnicalTerms(otherPage);
    } finally {
      await otherContext.close();
    }
  });

  test('shows a failed material safely, retries it to ready, and keeps retry idempotent', async ({ page }) => {
    const account = credentials('web-learning-material-retry');
    const setup = await register(account, ['es']);
    const spanish = setup.languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');
    const filename = 'retry-me.txt';
    await seedMaterial(setup.client, setup.userId, spanish.id, filename, 'failed');

    await signIn(page, account);
    await selectLearningLanguage(page, spanish.id);
    const material = await expectMaterialStatus(page, filename, 'failed');
    await expect(material.getByRole('button', { name: /^Retry\b/i })).toBeVisible();
    await expectNoLearnerFacingTechnicalTerms(page);

    await material.getByRole('button', { name: /^Retry\b/i }).click();
    await expect(page.getByRole('status').filter({ hasText: filename })).toContainText(new RegExp(`${filename}.*processing`, 'i'));
    await expectMaterialStatus(page, filename, 'ready');
    await expectNoLearnerFacingTechnicalTerms(page);

    const retriedMaterial = await expectMaterialStatus(page, filename, 'ready');
    await expect(retriedMaterial.getByRole('button', { name: /^Retry\b/i })).toHaveCount(0);
  });

  test('deletes failed, ready, and processing materials through a keyboard confirmation flow', async ({ page }) => {
    const account = credentials('web-learning-material-delete');
    const setup = await register(account, ['es']);
    const spanish = setup.languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');
    const failedFilename = 'failed-delete.txt';
    const processingFilename = 'processing-delete.txt';
    const failedSeed = await seedMaterial(setup.client, setup.userId, spanish.id, failedFilename, 'failed');
    const processingSeed = await seedMaterial(setup.client, setup.userId, spanish.id, processingFilename, 'processing');

    await signIn(page, account);
    await selectLearningLanguage(page, spanish.id);
    await uploadMaterial(page, 'ready-delete.txt', Buffer.from('Ready material for deletion.', 'utf8'));
    await expectReadyMaterial(page, 'ready-delete.txt');

    const failedMaterial = await expectMaterialStatus(page, failedFilename, 'failed');
    const failedDelete = failedMaterial.getByRole('button', { name: /^Delete\b/i });
    await failedDelete.focus();
    await expect(failedDelete).toBeFocused();
    await page.keyboard.press('Enter');
    const failedDialog = page.getByRole('dialog');
    await expect(failedDialog).toBeVisible();
    await failedDialog.getByRole('button', { name: /cancel/i }).click();
    await expect(failedMaterial).toBeVisible();
    const failedDeleteAfterCancel = failedMaterial.getByRole('button', { name: /^Delete\b/i });
    await failedDeleteAfterCancel.focus();
    await expect(failedDeleteAfterCancel).toBeFocused();
    await page.keyboard.press('Space');
    await expect(failedDialog).toBeVisible();
    await failedDialog.getByRole('button', { name: /^Delete\b/i }).click();
    await expect(failedMaterial).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText(/deleted/i);
    await expectSourceUnavailable(setup.client, failedSeed.storagePath);

    const readyMaterial = await expectMaterialStatus(page, 'ready-delete.txt', 'ready');
    await readyMaterial.getByRole('button', { name: /^Delete\b/i }).click();
    const readyDialog = page.getByRole('dialog');
    await expect(readyDialog).toBeVisible();
    await readyDialog.getByRole('button', { name: /^Delete\b/i }).click();
    await expect(readyMaterial).toHaveCount(0);

    const processingMaterial = await expectMaterialStatus(page, processingFilename, 'processing');
    await processingMaterial.getByRole('button', { name: /^Delete\b/i }).click();
    const processingDialog = page.getByRole('dialog');
    await expect(processingDialog).toBeVisible();
    await processingDialog.getByRole('button', { name: /^Delete\b/i }).click();
    await expect(processingMaterial).toHaveCount(0);
    await expectSourceUnavailable(setup.client, processingSeed.storagePath);
    await expectNoLearnerFacingTechnicalTerms(page);
  });

  test('deleting one same-name material preserves the other material', async ({ page }) => {
    const account = credentials('web-learning-material-same-name');
    const setup = await register(account, ['es']);
    const spanish = setup.languages.find((language) => language.language_tag === 'es');
    if (!spanish) throw new Error('The Spanish Learning Language fixture is missing.');

    await signIn(page, account);
    await selectLearningLanguage(page, spanish.id);
    const filename = 'same-name.txt';
    await uploadMaterial(page, filename, Buffer.from('First same-name material.', 'utf8'));
    await expectReadyMaterial(page, filename);
    await uploadMaterial(page, filename, Buffer.from('Second same-name material.', 'utf8'));
    await expect(page.getByRole('listitem').filter({ hasText: filename })).toHaveCount(2);

    const firstMaterial = page.getByRole('listitem').filter({ hasText: filename }).first();
    await firstMaterial.getByRole('button', { name: /^Delete\b/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Delete\b/i }).click();
    await expect(page.getByRole('listitem').filter({ hasText: filename })).toHaveCount(1);
    await expect(page.getByRole('listitem').filter({ hasText: filename }).getByRole('button', { name: /^Delete\b/i })).toBeVisible();
    await expectNoLearnerFacingTechnicalTerms(page);
  });
});
