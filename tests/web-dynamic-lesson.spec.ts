import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { selectLearningLanguage } from './support/language-switcher';
import { expectNoLearnerFacingTechnicalTerms } from './support/lesson-copy';
import { selectWord } from './support/text-selection';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = ReturnType<typeof credentials>;
type LessonQuestionType = 'cloze' | 'translation';
type LessonDirection = 'recognition' | 'recall' | null;

const STUDY_PARAGRAPH_ONE = 'The water cycle explains how the planet reuses its water again and again. Warm sunlight heats the ocean and causes evaporation, which lifts tiny water molecules into the atmosphere as vapor. As the vapor rises, a drop in temperature leads to condensation, and the vapor turns back into liquid drops that form clouds. Once those drops grow heavy, precipitation falls back to earth as rain or snow, feeding rivers, lakes, and groundwater below the surface. This simple loop repeats every day across the whole planet.';
const STUDY_PARAGRAPH_TWO = 'Once precipitation reaches the ground, part of it sinks down to become groundwater while the rest runs off into streams. Plants pull up that groundwater through their roots and send water molecules back into the atmosphere through transpiration, joining the vapor already rising from evaporation nearby. The balance between evaporation, condensation, and precipitation depends on sunlight, wind, and local temperature each day.';
const RELEVANT_FIXTURE_CONTENT = `${STUDY_PARAGRAPH_ONE}\n\n${STUDY_PARAGRAPH_TWO}\n`;
const RELEVANT_PRACTICE_REQUEST = 'I want to work on evaporation, condensation, precipitation, groundwater, atmosphere, and temperature.';
const IRRELEVANT_PRACTICE_REQUEST = 'Can you help me practise ordering food at a restaurant in French?';
const INSUFFICIENT_MATERIAL_MESSAGE = 'Your Learning Materials do not contain enough about that yet. Try describing what you want to practise differently, or add another Learning Material.';
const OFFLINE_MESSAGE = 'You are offline. Creating a Lesson from your Learning Materials requires a connection.';
const NO_READY_MATERIAL_MESSAGE = 'Add a Learning Material and wait for it to be ready before creating a Lesson from it.';

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
  return { account, client, learningLanguageId: (language as { id: string }).id, userId: data.user.id };
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

function openLessons(page: Page) {
  return openSection(page, '/lessons');
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

async function waitForMaterialsLoaded(page: Page) {
  await openMaterials(page);
  await expect(materialsRegion(page).getByText('Loading your Learning Materials…')).toHaveCount(0);
}

async function seedMaterial(client: SupabaseClient, userId: string, learningLanguageId: string, fileName: string, status: 'processing' | 'failed') {
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

function vocabularyTile(page: Page) {
  return page.locator('[data-ui="lesson-tile-vocabulary"]');
}

function lessonProgressBanner(page: Page) {
  return page.locator('[data-ui="lesson-in-progress"]');
}

function resumeLessonLink(page: Page) {
  return lessonProgressBanner(page).getByRole('link', { name: 'Resume Lesson' });
}

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
  await expect(lessonQuestion(page).getByRole('status')).toContainText(/Correct|Incorrect/);
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

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

function lessonCaptureBar(page: Page) {
  return page.getByRole('region', { name: 'Save to vocabulary' });
}

function vocabularyCaptureDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Add vocabulary' });
}

function saveToVocabularyButton(page: Page) {
  return lessonCaptureBar(page).getByRole('button', { name: 'Save to vocabulary', exact: true });
}

function libraryEntrySummary(page: Page, expression: string) {
  return page.locator('summary').filter({ hasText: expression });
}

function pickSelectableWord(text: string): string {
  const match = text.match(/[A-Za-z]{3,}/u);
  if (!match) throw new Error(`No selectable word was found in "${text}".`);
  return match[0];
}

function expectedAnswerLanguageFromDirectionText(directionText: string): string {
  const match = directionText.match(/ · (.+)$/);
  return match ? match[1] : '';
}

async function fillCaptureForm(dialog: Locator, translation: string, answerLanguage: string) {
  await dialog.getByLabel('Translation', { exact: true }).fill(translation);
  await dialog.getByLabel('Answer Language', { exact: true }).fill(answerLanguage);
}

async function submitCaptureForm(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
}

async function findLessonQuestionContaining(page: Page, text: string, maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await lessonShell(page).getByRole('heading', { name: 'Lesson complete', exact: true }).count()) {
      throw new Error(`The Lesson reached completion before any question contained "${text}".`);
    }
    const headingText = (await lessonQuestion(page).getByRole('heading', { level: 1 }).innerText()).trim();
    if (headingText.includes(text)) return headingText;
    await answerCurrentQuestion(page);
    await continueToNextQuestion(page);
  }
  throw new Error(`No Lesson question contained "${text}" within ${maxAttempts} questions.`);
}

async function answerQuestionIncorrectly(page: Page, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await lessonShell(page).getByRole('heading', { name: 'Lesson complete', exact: true }).count()) {
      throw new Error('The Lesson reached completion before any question was answered incorrectly.');
    }
    await selectAnswer(page, answerChoices(page).nth(1));
    const status = (await lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ }).innerText()).trim();
    if (status.includes('Incorrect')) return;
    await continueToNextQuestion(page);
  }
  throw new Error(`No Lesson question was answered incorrectly within ${maxAttempts} attempts.`);
}

test.describe('web Dynamic Lesson', () => {
  test('creates a Dynamic Lesson from a relevant Practice Request and completes it in the canonical runner', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-relevant');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'reading-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'reading-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    const total = await progressValue(page, 'max');
    expect(total).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThanOrEqual(12);

    await answerCurrentQuestion(page);
    const positionTextBefore = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    const feedbackTextBefore = (await lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ }).innerText()).trim();
    const directionText = (await lessonQuestion(page).locator('.lesson-direction').innerText()).trim();
    const promptHeading = lessonQuestion(page).getByRole('heading', { level: 1 });
    const promptText = (await promptHeading.innerText()).trim();
    const capturedWord = pickSelectableWord(promptText);
    await selectWord(page, promptHeading, capturedWord);
    const captureBar = lessonCaptureBar(page);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText(capturedWord);
    await saveToVocabularyButton(page).click();
    const dialog = vocabularyCaptureDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Expression', { exact: true })).toHaveValue(capturedWord);
    await expect(dialog.getByLabel('Example')).toHaveValue(promptText);
    await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('Answer Language', { exact: true })).toHaveValue(expectedAnswerLanguageFromDirectionText(directionText));
    const capturedTranslation = 'a passing shower';
    await fillCaptureForm(dialog, capturedTranslation, 'en');
    await submitCaptureForm(dialog);
    await expect(dialog).toHaveCount(0);
    await expect(captureBar.getByRole('status')).toContainText(`Saved “${capturedWord}” to your vocabulary.`);
    await expect(promptHeading).toHaveText(promptText);
    await expect(lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ })).toHaveText(feedbackTextBefore);
    await expect(answerChoices(page).first()).toBeChecked();
    await expect(answerChoices(page).first()).toBeDisabled();
    const positionTextAfter = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    expect(positionTextAfter).toBe(positionTextBefore);

    await continueToNextQuestion(page);
    await completeLesson(page);
    await expect(lessonShell(page).getByText(new RegExp(`\\d+/${total}`))).toBeVisible();
    await expect(lessonShell(page).getByRole('button', { name: 'Practise something else' })).toBeVisible();
    await expect(lessonShell(page).getByRole('button', { name: 'Start another lesson' })).toHaveCount(0);

    const vocabularyLesson = await setup.client.rpc('start_or_resume_vocabulary_lesson', { p_learning_language_id: setup.learningLanguageId });
    if (vocabularyLesson.error) throw vocabularyLesson.error;
    const vocabularyLessonPayload = vocabularyLesson.data as { questions: Array<{ prompt: string; choices: string[]; correct_answer: string | null }> };
    const presentsCapturedEntry = vocabularyLessonPayload.questions.some((vocabularyQuestion) =>
      vocabularyQuestion.prompt.includes(capturedWord) || vocabularyQuestion.prompt.includes(capturedTranslation)
      || vocabularyQuestion.choices.includes(capturedWord) || vocabularyQuestion.choices.includes(capturedTranslation)
      || vocabularyQuestion.correct_answer === capturedWord || vocabularyQuestion.correct_answer === capturedTranslation);
    expect(presentsCapturedEntry).toBe(true);
  });

  test('keeps the same Dynamic Lesson question stable across a reload', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-reload');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'reload-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'reload-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    const initial = await questionSnapshot(page);
    await page.reload();
    expect(await questionSnapshot(page)).toEqual(initial);
    await completeLesson(page);
  });

  test('refuses to create a Lesson for an irrelevant Practice Request and offers actionable guidance', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-irrelevant');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'irrelevant-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'irrelevant-notes.txt');
    await submitPracticeRequest(page, IRRELEVANT_PRACTICE_REQUEST);
    await expect(dynamicLessonRegion(page).getByRole('status').filter({ hasText: INSUFFICIENT_MATERIAL_MESSAGE })).toBeVisible();
    await expect(page).toHaveURL('/');
    await openLessons(page);
    await expect(resumeLessonLink(page)).toHaveCount(0);
    const { data: overview, error } = await setup.client.rpc('lesson_overview', { p_learning_language_id: setup.learningLanguageId });
    if (error) throw error;
    expect(overview).toBeNull();
  });

  test('keeps Dynamic Lesson creation unavailable without a ready Learning Material', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-unready');
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    const region = dynamicLessonRegion(page);
    await waitForMaterialsLoaded(page);
    await openHome(page);
    await expect(createLessonButton(page)).toBeDisabled();
    await expect(region.getByRole('status').filter({ hasText: NO_READY_MATERIAL_MESSAGE })).toBeVisible();

    await seedMaterial(setup.client, setup.userId, setup.learningLanguageId, 'processing-only.txt', 'processing');
    await openMaterials(page);
    await page.reload();
    await expect(materialsRegion(page).getByRole('listitem').filter({ hasText: 'processing-only.txt' })).toBeVisible();
    await waitForMaterialsLoaded(page);
    await openHome(page);
    await expect(createLessonButton(page)).toBeDisabled();
    await expect(region.getByRole('status').filter({ hasText: NO_READY_MATERIAL_MESSAGE })).toBeVisible();

    await seedMaterial(setup.client, setup.userId, setup.learningLanguageId, 'failed-only.txt', 'failed');
    await openMaterials(page);
    await page.reload();
    await expect(materialsRegion(page).getByRole('listitem').filter({ hasText: 'failed-only.txt' })).toBeVisible();
    await waitForMaterialsLoaded(page);
    await openHome(page);
    await expect(createLessonButton(page)).toBeDisabled();
    await expect(region.getByRole('status').filter({ hasText: NO_READY_MATERIAL_MESSAGE })).toBeVisible();
  });

  test('keeps Dynamic Lesson creation unavailable while a Vocabulary Lesson is active', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-vocabulary-active');
    await captureEntry(setup.client, setup.learningLanguageId, 'casa', 'house');
    await captureEntry(setup.client, setup.learningLanguageId, 'perro', 'dog');
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'vocabulary-blocks-dynamic.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'vocabulary-blocks-dynamic.txt');
    await openLessons(page);
    await vocabularyTile(page).click();
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await lessonShell(page).getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL('/lessons');
    await openHome(page);
    const region = dynamicLessonRegion(page);
    await expect(region.getByRole('status').filter({ hasText: 'You have a Lesson in progress.' })).toBeVisible();
    await expect(createLessonButton(page)).toHaveCount(0);
    await expect(region.getByLabel('What do you want to practise?')).toHaveCount(0);
    await expect(region.getByRole('list', { name: 'Request ideas' })).toHaveCount(0);
    await region.getByRole('link', { name: 'Resume Lesson' }).click();
    await expect(page).toHaveURL(runnerUrl);
  });

  test('resumes the active Dynamic Lesson from Home instead of starting a new one', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-resume-home');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'resume-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'resume-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    const initial = await questionSnapshot(page);
    await lessonShell(page).getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL('/lessons');
    await openLessons(page);
    await expect(vocabularyTile(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(lessonProgressBanner(page).getByText('Dynamic Lesson · finish it before starting another one.')).toBeVisible();
    await resumeLessonLink(page).click();
    await expect(page).toHaveURL(runnerUrl);
    expect(await questionSnapshot(page)).toEqual(initial);
  });

  test('blocks the Vocabulary Lesson control while a Dynamic Lesson is active and resumes it from the Lesson in progress banner', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-resume-vocabulary-control');
    await captureEntry(setup.client, setup.learningLanguageId, 'casa', 'house');
    await captureEntry(setup.client, setup.learningLanguageId, 'perro', 'dog');
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'resume-via-vocabulary-control-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'resume-via-vocabulary-control-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    const initial = await questionSnapshot(page);
    await lessonShell(page).getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL('/lessons');
    await openLessons(page);
    await expect(vocabularyTile(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(vocabularyTile(page).getByText('Finish the Lesson in progress first')).toBeVisible();
    await resumeLessonLink(page).click();
    await expect(page).toHaveURL(runnerUrl);
    expect(await questionSnapshot(page)).toEqual(initial);
    await completeLesson(page);
    await expect(lessonShell(page).getByRole('button', { name: 'Practise something else' })).toBeVisible();
    await expect(lessonShell(page).getByRole('button', { name: 'Start another lesson' })).toHaveCount(0);
  });

  test('requires a Preferred Answer Language before generating when the Learner has none', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-answer-language');
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'answer-language-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'answer-language-notes.txt');
    await openHome(page);
    const region = dynamicLessonRegion(page);
    await expect(region.getByLabel('Language you want to answer in')).toHaveCount(0);
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(region.getByLabel('Language you want to answer in')).toBeVisible();
    await expect(region.getByText('Enter a language tag such as en or uk.')).toBeVisible();
    await expect(page).toHaveURL('/');
    await region.getByLabel('Language you want to answer in').fill('en');
    await createLessonButton(page).click();
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
  });

  test('keeps Dynamic Lesson creation unavailable offline with an accessible reason', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-offline');
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'offline-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'offline-notes.txt');
    await openHome(page);
    await expect(dynamicLessonRegion(page).getByLabel('What do you want to practise?')).toBeVisible();
    await page.context().setOffline(true);
    const region = dynamicLessonRegion(page);
    await expect(region.getByRole('status').filter({ hasText: OFFLINE_MESSAGE })).toBeVisible();
    await expect(createLessonButton(page)).toBeDisabled();
  });

  test('shows a completed Dynamic Lesson in the existing Lesson history', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-history');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'history-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'history-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await completeLesson(page);
    await lessonShell(page).getByRole('button', { name: 'Practise something else' }).click();
    await expect(page).toHaveURL('/');
    await openLessons(page);
    await page.locator('[data-ui="lesson-tile-history"]').click();
    await expect(page).toHaveURL(/\/lessons\/history$/);
    const lessons = page.locator('details').filter({ has: page.locator('summary') });
    await expect(lessons.first()).toContainText('From your Learning Materials');
    await expect(lessons.first()).toContainText(/\d+\/\d+/);
  });

  test('never exposes RAG, embeddings, or provider details to the Learner across every Dynamic Lesson state', async ({ page, browser }) => {
    const happy = await registerWithLanguage('dynamic-lesson-copy-happy');
    await seedPreferredAnswerLanguage(happy.client, happy.learningLanguageId);
    await signIn(page, happy.account);
    await selectLearningLanguage(page, happy.learningLanguageId);
    const region = dynamicLessonRegion(page);
    await expectNoLearnerFacingTechnicalTerms(page);
    await uploadMaterial(page, 'copy-ban-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'copy-ban-notes.txt');
    await openHome(page);
    await region.getByLabel('What do you want to practise?').fill(RELEVANT_PRACTICE_REQUEST);
    await createLessonButton(page).click();
    await expect(region.getByRole('status').filter({ hasText: 'Building your Lesson from your Learning Materials…' })).toBeVisible();
    await expectNoLearnerFacingTechnicalTerms(page);
    await expect(page).toHaveURL(runnerUrl);
    await expectNoLearnerFacingTechnicalTerms(page);
    await completeLesson(page);
    await expectNoLearnerFacingTechnicalTerms(page);

    const insufficientContext = await browser.newContext();
    const insufficientPage = await insufficientContext.newPage();
    try {
      const insufficient = await registerWithLanguage('dynamic-lesson-copy-insufficient');
      await seedPreferredAnswerLanguage(insufficient.client, insufficient.learningLanguageId);
      await signIn(insufficientPage, insufficient.account);
      await selectLearningLanguage(insufficientPage, insufficient.learningLanguageId);
      await uploadMaterial(insufficientPage, 'copy-ban-insufficient.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
      await expectReadyMaterial(insufficientPage, 'copy-ban-insufficient.txt');
      await submitPracticeRequest(insufficientPage, IRRELEVANT_PRACTICE_REQUEST);
      await expect(dynamicLessonRegion(insufficientPage).getByRole('status').filter({ hasText: INSUFFICIENT_MATERIAL_MESSAGE })).toBeVisible();
      await expectNoLearnerFacingTechnicalTerms(insufficientPage);
    } finally {
      await insufficientContext.close();
    }
  });

  test('remains usable on narrow viewports throughout the Practice Request and Lesson flow', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-responsive');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'responsive-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'responsive-notes.txt');
    await assertNoHorizontalOverflow(page);
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await completeLesson(page);
    await assertNoHorizontalOverflow(page);
  });

  test('leaves the Dynamic Lesson untouched when a vocabulary capture is cancelled or dismissed', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-capture-cancel');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'capture-cancel-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'capture-cancel-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await answerCurrentQuestion(page);
    const positionTextBefore = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    const feedbackTextBefore = (await lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ }).innerText()).trim();
    const choice = answerChoices(page).nth(1);
    const choiceValue = await choice.inputValue();
    const choiceLabel = choice.locator('..');
    const captureBar = lessonCaptureBar(page);

    await selectWord(page, choiceLabel, choiceValue);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText(choiceValue);
    await saveToVocabularyButton(page).click();
    const dialog = vocabularyCaptureDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Expression', { exact: true })).toHaveValue(choiceValue);
    await expect(dialog.getByLabel('Example')).toHaveValue(choiceValue);
    await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(answerChoices(page).first()).toBeChecked();
    await expect(lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ })).toHaveText(feedbackTextBefore);
    let positionTextAfter = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    expect(positionTextAfter).toBe(positionTextBefore);

    await selectWord(page, choiceLabel, choiceValue);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText(choiceValue);
    await saveToVocabularyButton(page).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(answerChoices(page).first()).toBeChecked();
    await expect(lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ })).toHaveText(feedbackTextBefore);
    positionTextAfter = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    expect(positionTextAfter).toBe(positionTextBefore);

    await page.goto('/library');
    await expect(libraryEntrySummary(page, choiceValue)).toHaveCount(0);
  });

  test('captures a word from the revealed correct answer in Dynamic Lesson feedback', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-capture-feedback');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'capture-feedback-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'capture-feedback-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await answerQuestionIncorrectly(page);
    const positionTextBefore = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    const feedbackTextBefore = (await lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ }).innerText()).trim();
    const correctAnswer = lessonQuestion(page).locator('.lesson-correction-answer');
    await expect(correctAnswer).toBeVisible();
    const correctAnswerText = (await correctAnswer.innerText()).trim();
    const capturedWord = pickSelectableWord(correctAnswerText);
    await selectWord(page, correctAnswer, capturedWord);
    const captureBar = lessonCaptureBar(page);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText(capturedWord);
    await saveToVocabularyButton(page).click();
    const dialog = vocabularyCaptureDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Expression', { exact: true })).toHaveValue(capturedWord);
    await expect(dialog.getByLabel('Example')).toHaveValue(correctAnswerText);
    expect(correctAnswerText).not.toContain('Incorrect');
    expect(correctAnswerText).not.toContain('Correct answer');
    await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('');
    const capturedTranslation = 'a short burst of rain';
    await fillCaptureForm(dialog, capturedTranslation, 'en');
    await submitCaptureForm(dialog);
    await expect(dialog).toHaveCount(0);
    await expect(captureBar.getByRole('status')).toContainText(`Saved “${capturedWord}” to your vocabulary.`);
    await expect.poll(async () => (await lessonQuestion(page).getByRole('status').filter({ hasText: /Correct|Incorrect/ }).innerText()).trim()).toBe(feedbackTextBefore);
    await expect(answerChoices(page).nth(1)).toBeChecked();
    await expect(answerChoices(page).nth(1)).toBeDisabled();
    const positionTextAfter = (await lessonShell(page).getByText(/^Lesson question \d+ of \d+$/).innerText()).trim();
    expect(positionTextAfter).toBe(positionTextBefore);

    await page.goto('/library');
    await expect(libraryEntrySummary(page, capturedWord)).toHaveCount(1);
  });

  test('keeps existing Sense rules authoritative when a Dynamic Lesson capture matches an Expression with multiple Senses', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-capture-existing-sense');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    await captureEntry(setup.client, setup.learningLanguageId, 'banco', 'bank');
    const { error: secondSenseError } = await setup.client.rpc('capture_learning_language_entry', {
      p_answer_language_tag: 'en',
      p_create_new_sense: true,
      p_example: null,
      p_expression: 'banco',
      p_learning_language_id: setup.learningLanguageId,
      p_sense_id: null,
      p_translation: 'bench',
    });
    if (secondSenseError) throw secondSenseError;
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    const existingSenseLeadIn = 'Zebra banco banco rested peacefully.';
    const fixtureContent = `${existingSenseLeadIn} ${STUDY_PARAGRAPH_ONE}\n\n${existingSenseLeadIn} ${STUDY_PARAGRAPH_TWO}\n`;
    await uploadMaterial(page, 'existing-sense-notes.txt', Buffer.from(fixtureContent, 'utf8'));
    await expectReadyMaterial(page, 'existing-sense-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await findLessonQuestionContaining(page, 'banco');
    await answerCurrentQuestion(page);
    const promptHeading = lessonQuestion(page).getByRole('heading', { level: 1 });
    const promptText = (await promptHeading.innerText()).trim();
    await selectWord(page, promptHeading, 'banco');
    const captureBar = lessonCaptureBar(page);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText('banco');
    await saveToVocabularyButton(page).click();
    const dialog = vocabularyCaptureDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Expression', { exact: true })).toHaveValue('banco');
    await expect(dialog.getByLabel('Example')).toHaveValue(promptText);
    await expect(dialog.getByLabel('Translation', { exact: true })).toHaveValue('');
    await fillCaptureForm(dialog, 'bank note', 'en');
    await submitCaptureForm(dialog);
    const senseGroup = dialog.getByRole('group', { name: 'Choose an existing Sense or create a new Sense' });
    await expect(senseGroup).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Choose existing Sense 1: / })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Choose existing Sense 2: / })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create a new Sense' })).toBeVisible();
    await dialog.getByRole('button', { name: /^Choose existing Sense 1: / }).click();
    await expect(dialog).toHaveCount(0);
    await expect(captureBar.getByRole('status')).toContainText('Saved “banco” to your vocabulary.');

    await page.goto('/library');
    const bancoSummary = libraryEntrySummary(page, 'banco');
    await expect(bancoSummary).toHaveCount(1);
    await expect(bancoSummary.locator('.surface-tally')).toHaveText('2');
  });

  test('keeps a Dynamic Lesson capture scoped to the Learning Language it was captured in', async ({ page }) => {
    const setup = await registerWithLanguage('dynamic-lesson-capture-cross-language');
    await seedPreferredAnswerLanguage(setup.client, setup.learningLanguageId);
    const { data: otherLanguage, error: otherLanguageError } = await setup.client.rpc('create_learning_language', { p_language_tag: 'fr' });
    if (otherLanguageError) throw otherLanguageError;
    const otherLearningLanguageId = (otherLanguage as { id: string }).id;
    await signIn(page, setup.account);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await uploadMaterial(page, 'cross-language-notes.txt', Buffer.from(RELEVANT_FIXTURE_CONTENT, 'utf8'));
    await expectReadyMaterial(page, 'cross-language-notes.txt');
    await submitPracticeRequest(page, RELEVANT_PRACTICE_REQUEST);
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    await answerCurrentQuestion(page);
    const promptHeading = lessonQuestion(page).getByRole('heading', { level: 1 });
    const promptText = (await promptHeading.innerText()).trim();
    const capturedWord = pickSelectableWord(promptText);
    await selectWord(page, promptHeading, capturedWord);
    const captureBar = lessonCaptureBar(page);
    await expect(captureBar.locator('.lesson-capture-expression')).toHaveText(capturedWord);
    await saveToVocabularyButton(page).click();
    const dialog = vocabularyCaptureDialog(page);
    await expect(dialog).toBeVisible();
    await fillCaptureForm(dialog, 'a short burst of rain', 'en');
    await submitCaptureForm(dialog);
    await expect(dialog).toHaveCount(0);
    await expect(captureBar.getByRole('status')).toContainText(`Saved “${capturedWord}” to your vocabulary.`);

    await page.goto('/library');
    await selectLearningLanguage(page, otherLearningLanguageId);
    await expect(libraryEntrySummary(page, capturedWord)).toHaveCount(0);
    await selectLearningLanguage(page, setup.learningLanguageId);
    await expect(libraryEntrySummary(page, capturedWord)).toHaveCount(1);
  });
});
