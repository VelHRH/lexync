import { existsSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';
import { expectNoLearnerFacingTechnicalTerms } from './support/lesson-copy';
import { armGenerationFault, clearGenerationFault, generationFaultFile } from './support/generation-faults';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = ReturnType<typeof credentials>;
type LessonQuestionType = 'cloze' | 'translation';
type LessonDirection = 'recognition' | 'recall' | null;

const SENTINEL = 'zyrrenthal';
const STUDY_PARAGRAPH_ONE = 'The water cycle explains how the planet reuses its water again and again. Warm sunlight heats the ocean and causes evaporation, which lifts tiny water molecules into the atmosphere as vapor. As the vapor rises, a drop in temperature leads to condensation, and the vapor turns back into liquid drops that form clouds. Once those drops grow heavy, precipitation falls back to earth as rain or snow, feeding rivers, lakes, and groundwater below the surface. This simple loop repeats every day across the whole planet.';
const STUDY_PARAGRAPH_TWO = 'Once precipitation reaches the ground, part of it sinks down to become groundwater while the rest runs off into streams. Plants pull up that groundwater through their roots and send water molecules back into the atmosphere through transpiration, joining the vapor already rising from evaporation nearby. The balance between evaporation, condensation, and precipitation depends on sunlight, wind, and local temperature each day.';
const SENTINEL_PARAGRAPH = `The research notebook calls this phenomenon ${SENTINEL} retention, and every observer in the study referred to the ${SENTINEL} pattern when comparing basins. Local guides warned that a ${SENTINEL} shift could change the whole valley, and they tracked the ${SENTINEL} readings every morning before sunrise.`;
const RELEVANT_FIXTURE_CONTENT = `${STUDY_PARAGRAPH_ONE}\n\n${STUDY_PARAGRAPH_TWO}\n\n${SENTINEL_PARAGRAPH}\n`;
const RELEVANT_PRACTICE_REQUEST = 'I want to work on evaporation, condensation, precipitation, groundwater, atmosphere, and temperature.';
const IRRELEVANT_PRACTICE_REQUEST = 'Can you help me practise ordering food at a restaurant in French?';
const INSUFFICIENT_MATERIAL_MESSAGE = 'Your Learning Materials do not contain enough about that yet. Try describing what you want to practise differently, or add another Learning Material.';
const NO_READY_MATERIAL_MESSAGE = 'Add a Learning Material and wait for it to be ready before creating a Lesson from it.';
const RETRY_MESSAGE = 'Lexync could not build a Lesson just now. Please try again.';
const BUSY_MESSAGE = 'Lexync is building too many Lessons right now. Please try again in a few minutes.';
const MATERIAL_FAILURE_MESSAGE = 'Lexync could not build a usable Lesson from your Learning Materials this time. Please try again, or describe what you want to practise differently.';

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerWithLanguage(prefix: string, languageTag = 'es') {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session || !data.user) throw error ?? new Error('The local learner session is missing.');
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: languageTag });
  if (languageError) throw languageError;
  return { account, client, learningLanguageId: (language as { id: string }).id, userId: data.user.id, accessToken: data.session.access_token };
}

async function captureEntry(client: SupabaseClient, learningLanguageId: string, expression: string, translation: string) {
  const { error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
}

async function seedPreferredAnswerLanguage(client: SupabaseClient, learningLanguageId: string) {
  await captureEntry(client, learningLanguageId, 'perro', 'dog');
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function openSection(page: Page, pathname: string) {
  if (new URL(page.url()).pathname !== pathname) await page.goto(pathname);
}

function openHome(page: Page) {
  return openSection(page, '/');
}

function openMaterials(page: Page) {
  return openSection(page, '/materials');
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
}

function dynamicLessonRegion(page: Page) {
  return page.locator('[data-ui="dynamic-lesson-request"]');
}

function createLessonButton(page: Page) {
  return dynamicLessonRegion(page).getByRole('button', { name: /^Create lesson$|^Creating lesson$/ });
}

async function submitPracticeRequest(page: Page, text: string) {
  await openHome(page);
  await dynamicLessonRegion(page).getByLabel('What do you want to practise?').fill(text);
  await createLessonButton(page).click();
}

const runnerUrl = /\/lessons\/[0-9a-f-]{36}$/;

function lessonShell(page: Page) {
  return page.getByRole('main');
}

function lessonQuestion(page: Page) {
  return page.getByRole('region', { name: 'Lesson question' });
}

function answerChoices(page: Page) {
  return lessonQuestion(page).getByRole('radio');
}

function continueButton(page: Page) {
  return lessonShell(page).getByRole('button', { name: 'Continue' });
}

async function progressValue(page: Page, property: 'max' | 'value') {
  return lessonShell(page).getByRole('progressbar').evaluateAll((elements, progressProperty) => {
    const progress = elements[0] as HTMLProgressElement | undefined;
    if (!progress) throw new Error('Lesson progress is unavailable.');
    return progressProperty === 'max' ? progress.max : progress.value;
  }, property);
}

async function questionSnapshot(page: Page) {
  const question = lessonQuestion(page);
  await expect.poll(async () => {
    const count = await answerChoices(page).count();
    return count >= 2 && count <= 4;
  }).toBe(true);
  const type: LessonQuestionType = await question.getByText('Cloze', { exact: true }).count() ? 'cloze' : 'translation';
  const direction: LessonDirection = type === 'cloze'
    ? null
    : (await question.getByText(/^(Recognition|Recall)(?: · .+)?$/).innerText()).split(' · ')[0] as Exclude<LessonDirection, null>;
  return {
    choices: await answerChoices(page).evaluateAll((elements) => elements.map((element) => element.closest('label')?.textContent?.replace(/\s+/g, ' ').trim() ?? element.getAttribute('aria-label') ?? '')),
    direction,
    position: (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim(),
    prompt: (await question.getByRole('heading', { level: 1 }).innerText()).trim(),
    type,
  };
}

async function selectAnswer(page: Page, choice: Locator) {
  const selectedValue = await choice.inputValue();
  await choice.check();
  await expect(lessonQuestion(page).getByRole('radio', { name: selectedValue, exact: true })).toBeChecked();
  await expect(answerChoices(page).first()).toBeDisabled();
  await expect(lessonShell(page).getByRole('status')).toContainText(/Correct|Incorrect/);
  await expect(continueButton(page)).toBeEnabled();
}

async function answerCurrentQuestion(page: Page) {
  await selectAnswer(page, answerChoices(page).first());
}

async function continueToNextQuestion(page: Page) {
  const before = await progressValue(page, 'value').catch(() => 0);
  await continueButton(page).click();
  await expect.poll(async () => {
    if (await page.getByRole('heading', { name: 'Lesson complete', exact: true }).count()) return true;
    return (await progressValue(page, 'value').catch(() => before)) > before;
  }, { timeout: 20_000 }).toBe(true);
}

async function completeLesson(page: Page) {
  await expect(lessonQuestion(page)).toBeVisible();
  for (let iteration = 0; iteration < 20; iteration += 1) {
    if (await lessonShell(page).getByRole('heading', { name: 'Lesson complete', exact: true }).count()) {
      await expect(lessonShell(page).getByRole('heading', { name: 'Lesson complete' })).toBeVisible();
      return;
    }
    await expect(lessonQuestion(page)).toBeVisible();
    await answerCurrentQuestion(page);
    await continueToNextQuestion(page);
  }
  throw new Error('The Lesson did not reach Lesson complete within the expected number of questions.');
}

function dynamicLessonFailure(page: Page) {
  return page.locator('[data-ui="dynamic-lesson-failure"]');
}

function retryButton(page: Page) {
  return dynamicLessonFailure(page).getByRole('button', { name: 'Try again' });
}

async function expectNoLesson(client: SupabaseClient, learningLanguageId: string) {
  const { data: overview, error } = await client.rpc('lesson_overview', { p_learning_language_id: learningLanguageId });
  if (error) throw error;
  expect(overview).toBeNull();
}

async function setupLearnerWithReadyMaterial(prefix: string, page: Page, fileName: string) {
  const setup = await registerWithLanguage(prefix);
  await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
  await signIn(page, setup.account);
  await selectLearningLanguage(page, setup.learningLanguageId);
  await uploadMaterial(page, fileName, Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
  await expectReadyMaterial(page, fileName);
  return setup;
}

test.describe('web Dynamic Lesson recovery', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    clearGenerationFault();
  });

  test.afterEach(() => {
    clearGenerationFault();
  });

  test('exposes an actionable retry state after a provider failure, creates no Lesson, and recovers on retry', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-transport', page, 'transport-notes.txt');
    armGenerationFault({ kind: 'transport' });
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonFailure(page)).toBeVisible();
    await expect(dynamicLessonFailure(page).getByRole('alert')).toHaveText(RETRY_MESSAGE);
    await expect(retryButton(page)).toBeVisible();
    await expect(retryButton(page)).toBeEnabled();
    await expect(page).toHaveURL('/');
    await expect(dynamicLessonRegion(page).getByLabel('What do you want to practise?')).toHaveValue(RELEVANT_PRACTICE_REQUEST);
    await expectNoLesson(setup.client, setup.learningLanguageId);

    await retryButton(page).click();
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
  });

  test('shows the busy message and still offers a retry when the provider reports quota exhaustion', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-quota', page, 'quota-notes.txt');
    armGenerationFault({ kind: 'quota' });
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonFailure(page).getByRole('alert')).toHaveText(BUSY_MESSAGE);
    await expect(retryButton(page)).toBeVisible();
    await expectNoLesson(setup.client, setup.learningLanguageId);
  });

  test('rejects duplicate-prompt generated questions before persistence and leaves no partial Lesson', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-invalid-duplicate', page, 'invalid-duplicate-notes.txt');
    armGenerationFault({ invalid: 'duplicate-prompts' });
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonFailure(page).getByRole('alert')).toHaveText(MATERIAL_FAILURE_MESSAGE);
    await expect(retryButton(page)).toBeVisible();

    const { data: lessonRows, error: lessonsError } = await setup.client.from('lessons').select('id');
    if (lessonsError) throw lessonsError;
    expect(lessonRows).toEqual([]);
    const { data: questionRows, error: questionsError } = await setup.client.from('lesson_questions').select('id');
    if (questionsError) throw questionsError;
    expect(questionRows).toEqual([]);

    await retryButton(page).click();
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
  });

  test('rejects generated questions with no correct answer before persistence and leaves no partial Lesson', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-invalid-no-answer', page, 'invalid-no-answer-notes.txt');
    armGenerationFault({ invalid: 'no-correct-answer' });
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonFailure(page).getByRole('alert')).toHaveText(MATERIAL_FAILURE_MESSAGE);
    await expect(retryButton(page)).toBeVisible();

    const { data: lessonRows, error: lessonsError } = await setup.client.from('lessons').select('id');
    if (lessonsError) throw lessonsError;
    expect(lessonRows).toEqual([]);
    const { data: questionRows, error: questionsError } = await setup.client.from('lesson_questions').select('id');
    if (questionsError) throw questionsError;
    expect(questionRows).toEqual([]);
  });

  test('cannot create two active Lessons from concurrent generation submissions', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-concurrent', page, 'concurrent-notes.txt');
    const body = JSON.stringify({ learningLanguageId: setup.learningLanguageId, practiceRequest: RELEVANT_PRACTICE_REQUEST });
    const headers = { Authorization: `Bearer ${setup.accessToken}`, 'Content-Type': 'application/json' };

    const [first, second] = await Promise.all([
      page.request.post('/api/dynamic-lessons', { headers, data: body }),
      page.request.post('/api/dynamic-lessons', { headers, data: body }),
    ]);

    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);
    const firstBody = await first.json() as { lesson?: { id: string } };
    const secondBody = await second.json() as { lesson?: { id: string } };
    expect(firstBody.lesson?.id).toBeTruthy();
    expect(secondBody.lesson?.id).toBeTruthy();
    expect(firstBody.lesson?.id).toBe(secondBody.lesson?.id);

    const { data: overview, error: overviewError } = await setup.client.rpc('lesson_overview', { p_learning_language_id: setup.learningLanguageId });
    if (overviewError) throw overviewError;
    expect((overview as { id: string } | null)?.id).toBe(firstBody.lesson?.id);

    const { data: activeLessons, error: activeLessonsError } = await setup.client.from('lessons').select('id').eq('status', 'active');
    if (activeLessonsError) throw activeLessonsError;
    expect(activeLessons).toHaveLength(1);
  });

  test('keeps the Dynamic Lesson snapshot stable after the source Learning Material is deleted', async ({ page }) => {
    const materialName = 'snapshot-deletion-notes.txt';
    const setup = await setupLearnerWithReadyMaterial('recovery-snapshot-deletion', page, materialName);
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    const lessonUrl = page.url();
    const initial = await questionSnapshot(page);

    await openMaterials(page);
    const materialItem = materialsRegion(page).getByRole('listitem').filter({ hasText: materialName });
    const deleteButton = materialItem.getByRole('button', { name: /^Delete\b/i });
    await deleteButton.focus();
    await expect(deleteButton).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^Delete\b/i }).click();
    await expect(materialItem).toHaveCount(0);

    await page.goto(lessonUrl);
    await page.reload();
    expect(await questionSnapshot(page)).toEqual(initial);
    await completeLesson(page);

    await openHome(page);
    await expect(createLessonButton(page)).toBeDisabled();
    await expect(dynamicLessonRegion(page).getByRole('status').filter({ hasText: NO_READY_MATERIAL_MESSAGE })).toBeVisible();
  });

  test('refuses an irrelevant Practice Request without calling the generation provider', async ({ page }) => {
    const setup = await setupLearnerWithReadyMaterial('recovery-irrelevant', page, 'irrelevant-notes.txt');
    armGenerationFault({ kind: 'transport' });
    await submitPracticeRequest(page, IRRELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonRegion(page).getByRole('status').filter({ hasText: INSUFFICIENT_MATERIAL_MESSAGE })).toBeVisible();
    await expect(dynamicLessonFailure(page)).toHaveCount(0);
    await expectNoLesson(setup.client, setup.learningLanguageId);
    expect(existsSync(generationFaultFile)).toBe(true);
  });

  test('discloses neither provider internals nor private source text in a failure state', async ({ page }) => {
    await setupLearnerWithReadyMaterial('recovery-copy-safety', page, 'copy-safety-notes.txt');
    armGenerationFault({ kind: 'provider' });
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);

    await expect(dynamicLessonFailure(page)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(new RegExp(SENTINEL, 'i'));
    await expect(page.locator('body')).not.toContainText(/Gemini/i);
    await expect(page.locator('body')).not.toContainText(/stack/i);
    await expect(page.locator('body')).not.toContainText(/503/);
    await expect(page.locator('body')).not.toContainText(/429/);
    await expectNoLearnerFacingTechnicalTerms(page);
  });
});
