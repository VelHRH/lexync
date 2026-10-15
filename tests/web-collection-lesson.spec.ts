import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

type Account = ReturnType<typeof credentials>;
type CapturedEntry = {
  answerLanguageTag: string;
  expression: string;
  senseId: string;
  translation: string;
  translationId: string;
  vocabularyEntryId: string;
};

type LessonQuestionType = 'cloze' | 'translation';
type LessonDirection = 'recognition' | 'recall' | null;

type LessonRow = {
  collection_id: string | null;
  id: string;
  source: string;
};

type LessonQuestionRow = {
  choice_sense_ids: string[] | null;
  choice_vocabulary_entry_ids: string[] | null;
  choices: string[];
  correct_answer: string;
  id: string;
  ordinal: number;
  prompt: string;
  question_type: string;
  sense_id: string | null;
  vocabulary_entry_id: string | null;
};

const travelVocabulary = [
  ['maleta', 'suitcase'],
  ['vuelo', 'flight'],
  ['billete', 'ticket'],
  ['frontera', 'border'],
  ['equipaje', 'luggage'],
  ['aduana', 'customs'],
  ['pasaporte', 'passport'],
  ['andén', 'platform'],
  ['brújula', 'compass'],
] as const;

const kitchenVocabulary = [
  ['sartén', 'skillet'],
  ['cuchara', 'spoon'],
  ['nevera', 'fridge'],
  ['horno', 'oven'],
  ['fregadero', 'sink'],
] as const;

function travelExample(expression: string) {
  return `Preparo ${expression} antes del viaje.`;
}

function kitchenExample(expression: string) {
  return `Uso ${expression} en la cocina.`;
}

function credentials(prefix: string) {
  return { email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`, password: `Lexync-${crypto.randomUUID()}-test` };
}

async function registerLearner(prefix: string) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const account = credentials(prefix);
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  const { data: language, error: languageError } = await client.rpc('create_learning_language', { p_language_tag: 'es' });
  if (languageError) throw languageError;
  return { account, client, learningLanguageId: (language as { id: string }).id };
}

async function captureEntry(
  client: SupabaseClient,
  learningLanguageId: string,
  expression: string,
  translation: string,
  answerLanguageTag = 'en',
  options: { createNewSense?: boolean; example?: string; senseId?: string } = {},
) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: answerLanguageTag,
    p_create_new_sense: options.createNewSense ?? false,
    p_example: options.example ?? null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: options.senseId ?? null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as CapturedEntry;
}

async function seedCollection(client: SupabaseClient, learningLanguageId: string, name: string) {
  const { data, error } = await client.rpc('create_collection', { p_learning_language_id: learningLanguageId, p_name: name });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function fileEntry(client: SupabaseClient, collectionId: string, learningVocabularyEntryId: string) {
  const { error } = await client.rpc('add_collection_membership', { p_collection_id: collectionId, p_learning_vocabulary_entry_id: learningVocabularyEntryId });
  if (error) throw error;
}

async function bridgeEntryId(client: SupabaseClient, learningVocabularyEntryId: string) {
  const { data, error } = await client.from('vocabulary_entries').select('id').eq('learning_vocabulary_entry_id', learningVocabularyEntryId).limit(1).single();
  if (error) throw error;
  return data.id as string;
}

async function seedTravelCollection(
  prefix: string,
  filed: ReadonlyArray<readonly [string, string]> = travelVocabulary.slice(0, 8),
  outside: ReadonlyArray<readonly [string, string]> = [],
) {
  const fixture = await registerLearner(prefix);
  const captured: CapturedEntry[] = [];
  for (const [expression, translation] of filed) {
    captured.push(await captureEntry(fixture.client, fixture.learningLanguageId, expression, translation, 'en', { example: travelExample(expression) }));
  }
  const outsideCaptured: CapturedEntry[] = [];
  for (const [expression, translation] of outside) {
    outsideCaptured.push(await captureEntry(fixture.client, fixture.learningLanguageId, expression, translation, 'en', { example: kitchenExample(expression) }));
  }
  const collectionId = await seedCollection(fixture.client, fixture.learningLanguageId, 'Travel');
  for (const entry of captured) await fileEntry(fixture.client, collectionId, entry.vocabularyEntryId);
  return { ...fixture, captured, collectionId, outside: outsideCaptured };
}

async function signIn(page: Page, account: Account) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
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

const runnerUrl = /\/lessons\/[0-9a-f-]{36}$/;

function vocabularyTile(page: Page) {
  return page.locator('[data-ui="lesson-tile-vocabulary"]');
}

async function openLessons(page: Page) {
  if (new URL(page.url()).pathname !== '/lessons') await page.goto('/lessons');
}

function entrySummary(page: Page, expression: string) {
  return page.locator('summary').filter({ hasText: expression });
}

function picker(page: Page, label: string) {
  return page.getByRole('combobox', { name: label });
}

function pickerListbox(page: Page, label: string) {
  return page.getByRole('listbox', { name: label });
}

async function choosePickerOption(page: Page, label: string, option: string | RegExp) {
  await picker(page, label).click();
  await expect(picker(page, label)).toHaveAttribute('aria-expanded', 'true');
  await pickerListbox(page, label).getByRole('option', { name: option }).click();
  await expect(picker(page, label)).toHaveAttribute('aria-expanded', 'false');
}

function collectionFilter(page: Page) {
  return page.locator('.library-collection-filter');
}

function practiseButton(page: Page) {
  return collectionFilter(page).getByRole('button', { name: 'Practise this Collection', exact: true });
}

function practiceReason(page: Page) {
  return page.locator('#library-collection-practice-reason');
}

async function assertNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
}

async function assertWithinViewportUnscrolled(page: Page, locator: Locator) {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('The viewport geometry is unavailable.');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function openCollectionThroughPicker(page: Page, collectionId: string) {
  await page.goto('/library');
  await expect(entrySummary(page, 'maleta')).toBeVisible();
  await choosePickerOption(page, 'Collection scope', /Travel/);
  await expect(page).toHaveURL(`/library?collection=${collectionId}`);
}

async function openCollectionByUrl(page: Page, collectionId: string) {
  await page.goto(`/library?collection=${collectionId}`);
  await expect(collectionFilter(page).getByText('Filtered by Travel')).toBeVisible();
}

function lessonIdFromUrl(page: Page) {
  const lessonId = new URL(page.url()).pathname.match(/\/lessons\/([0-9a-f-]{36})$/)?.[1];
  if (!lessonId) throw new Error('The Lesson runner URL is unavailable.');
  return lessonId;
}

async function startFromLibrary(page: Page) {
  await practiseButton(page).click();
  await expect(page).toHaveURL(runnerUrl);
  await expect(lessonQuestion(page)).toBeVisible();
  return lessonIdFromUrl(page);
}

async function startLesson(client: SupabaseClient, learningLanguageId: string, collectionId?: string) {
  const { data, error } = await client.rpc('start_or_resume_vocabulary_lesson', collectionId
    ? { p_collection_id: collectionId, p_learning_language_id: learningLanguageId }
    : { p_learning_language_id: learningLanguageId });
  if (error) throw error;
  return data as { id: string };
}

async function lessonRow(client: SupabaseClient, lessonId: string) {
  const { data, error } = await client.from('lessons').select('id, collection_id, source').eq('id', lessonId).single();
  if (error) throw error;
  return data as LessonRow;
}

async function lessonQuestions(client: SupabaseClient, lessonId: string) {
  const { data, error } = await client
    .from('lesson_questions')
    .select('id, ordinal, sense_id, vocabulary_entry_id, prompt, question_type, choices, choice_sense_ids, choice_vocabulary_entry_ids, correct_answer')
    .eq('lesson_id', lessonId)
    .order('ordinal');
  if (error) throw error;
  return data as LessonQuestionRow[];
}

function questionTexts(questions: LessonQuestionRow[]) {
  return questions.flatMap((question) => [question.prompt, question.correct_answer, ...question.choices]);
}

async function filedEntryIds(client: SupabaseClient, collectionId: string) {
  const { data, error } = await client.from('collection_memberships').select('learning_vocabulary_entry_id').eq('collection_id', collectionId);
  if (error) throw error;
  return (data as Array<{ learning_vocabulary_entry_id: string }>).map((membership) => membership.learning_vocabulary_entry_id);
}

async function provenance(client: SupabaseClient) {
  const { data: entries, error: entriesError } = await client.from('vocabulary_entries').select('id, learning_vocabulary_entry_id');
  if (entriesError) throw entriesError;
  const { data: senses, error: sensesError } = await client.from('senses').select('id, vocabulary_entry_id');
  if (sensesError) throw sensesError;
  const learningEntryByBridge = new Map((entries as Array<{ id: string; learning_vocabulary_entry_id: string }>).map((entry) => [entry.id, entry.learning_vocabulary_entry_id]));
  const bridgeBySense = new Map((senses as Array<{ id: string; vocabulary_entry_id: string }>).map((sense) => [sense.id, sense.vocabulary_entry_id]));
  return {
    byBridgeId: (bridgeId: string | null) => learningEntryByBridge.get(String(bridgeId)) ?? `unresolved bridge ${bridgeId}`,
    bySenseId: (senseId: string | null) => learningEntryByBridge.get(String(bridgeBySense.get(String(senseId)))) ?? `unresolved sense ${senseId}`,
  };
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
    prompt: (await question.getByRole('heading', { level: 1 }).innerText()).trim(),
    text: (await question.innerText()).replace(/\s+/g, ' ').trim(),
    type,
  };
}

test.describe('web Collection Lesson', () => {
  test('starts a Lesson for the scoped Collection from the Library', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-start');
    await signIn(page, fixture.account);
    await openCollectionThroughPicker(page, fixture.collectionId);
    await expect(practiseButton(page)).toBeVisible();
    await expect(practiseButton(page)).toBeEnabled();
    await expect(practiseButton(page)).toHaveAttribute('data-ui', 'practise-collection');
    await expect(practiceReason(page)).toHaveCount(0);
    await startFromLibrary(page);
    await expect(lessonShell(page).getByRole('progressbar', { name: 'Lesson progress' })).toBeVisible();
    await expect(lessonQuestion(page).getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('records the practised Collection on the Lesson it starts', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-records');
    await signIn(page, fixture.account);
    await openCollectionThroughPicker(page, fixture.collectionId);
    const lessonId = await startFromLibrary(page);
    expect(await lessonRow(fixture.client, lessonId)).toEqual({ collection_id: fixture.collectionId, id: lessonId, source: 'vocabulary' });
  });

  test('keeps every Sense, distractor, and Cloze Example inside the practised Collection', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-scope', travelVocabulary.slice(0, 8), kitchenVocabulary);
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    const lessonId = await startFromLibrary(page);
    const filed = await filedEntryIds(fixture.client, fixture.collectionId);
    const resolve = await provenance(fixture.client);
    const questions = await lessonQuestions(fixture.client, lessonId);
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(filed).toContain(resolve.bySenseId(question.sense_id));
      expect(filed).toContain(resolve.byBridgeId(question.vocabulary_entry_id));
      if (question.question_type === 'cloze') {
        expect(question.choice_vocabulary_entry_ids).toHaveLength(question.choices.length);
        for (const choiceEntryId of question.choice_vocabulary_entry_ids ?? []) expect(filed).toContain(resolve.byBridgeId(choiceEntryId));
      } else {
        expect(question.choice_sense_ids).toHaveLength(question.choices.length);
        for (const choiceSenseId of question.choice_sense_ids ?? []) expect(filed).toContain(resolve.bySenseId(choiceSenseId));
      }
    }
    for (const text of questionTexts(questions)) {
      for (const outside of fixture.outside) {
        expect(text).not.toContain(outside.expression);
        expect(text).not.toContain(outside.translation);
      }
    }
  });

  test('leaves a suspended Vocabulary Entry out of the Collection Lesson', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-suspended', travelVocabulary.slice(0, 9));
    const [suspended] = fixture.captured;
    const suspendedBridgeId = await bridgeEntryId(fixture.client, suspended.vocabularyEntryId);
    const { error: suspensionError } = await fixture.client.rpc('set_vocabulary_entry_suspended', { p_suspended: true, p_vocabulary_entry_id: suspendedBridgeId });
    if (suspensionError) throw suspensionError;
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    const lessonId = await startFromLibrary(page);
    const questions = await lessonQuestions(fixture.client, lessonId);
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      expect(question.sense_id).not.toBe(suspended.senseId);
      expect(question.choice_sense_ids ?? []).not.toContain(suspended.senseId);
      expect(question.vocabulary_entry_id).not.toBe(suspendedBridgeId);
      expect(question.choice_vocabulary_entry_ids ?? []).not.toContain(suspendedBridgeId);
    }
    for (const text of questionTexts(questions)) {
      expect(text).not.toContain(suspended.expression);
      expect(text).not.toContain(suspended.translation);
    }
  });

  test('offers no practice for a Collection one Vocabulary Entry short of the threshold', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-one-short', travelVocabulary.slice(0, 7));
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    await expect(practiceReason(page)).toHaveText('Add 1 more Vocabulary Entry to practise this Collection.');
    await expect(practiseButton(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="practise-collection"]')).toHaveCount(0);
  });

  test('states how many Vocabulary Entries a Collection still needs', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-three-short', travelVocabulary.slice(0, 5));
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    await expect(practiceReason(page)).toHaveText('Add 3 more Vocabulary Entries to practise this Collection.');
    await expect(practiseButton(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="practise-collection"]')).toHaveCount(0);
  });

  test('offers no Collection practice outside a Collection scope', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-unscoped');
    await signIn(page, fixture.account);
    await page.goto('/library');
    await expect(entrySummary(page, 'maleta')).toBeVisible();
    await expect(picker(page, 'Collection scope')).toHaveValue('All vocabulary');
    await expect(collectionFilter(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="practise-collection"]')).toHaveCount(0);
    await expect(practiceReason(page)).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', 'Not in a Collection');
    await expect(page).toHaveURL('/library?collection=none');
    await expect(collectionFilter(page)).toHaveCount(0);
    await expect(page.locator('[data-ui="practise-collection"]')).toHaveCount(0);
    await expect(practiceReason(page)).toHaveCount(0);

    await choosePickerOption(page, 'Collection scope', /Travel/);
    await expect(page).toHaveURL(`/library?collection=${fixture.collectionId}`);
    await expect(practiseButton(page)).toBeEnabled();
  });

  test('disables Collection practice with the stated offline reason', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-offline');
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    await expect(practiseButton(page)).toBeEnabled();

    await page.context().setOffline(true);
    const offlineNotice = page.getByText('You are offline. Vocabulary and Collection changes require a connection.', { exact: true });
    await expect(offlineNotice).toBeVisible();
    await expect(practiseButton(page)).toBeDisabled();
    await expect(practiseButton(page)).toHaveAttribute('aria-describedby', 'library-offline-notice');
    await expect(page.locator('#library-offline-notice')).toHaveText('You are offline. Vocabulary and Collection changes require a connection.');

    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(practiseButton(page)).toBeEnabled();
    await expect(offlineNotice).toHaveCount(0);
  });

  test('refuses Collection practice while a Lesson is in progress and states the reason', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-in-progress');
    await startLesson(fixture.client, fixture.learningLanguageId);
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    await expect(practiseButton(page)).toBeVisible();
    await expect(practiseButton(page)).toBeDisabled();
    await expect(practiceReason(page)).toHaveText('Finish the Lesson in progress first.');
    await expect(practiceReason(page)).toHaveRole('status');
    await expect(practiseButton(page)).toHaveAttribute('aria-describedby', 'library-collection-practice-reason');
  });

  test('resumes an interrupted Collection Lesson unchanged', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-resume');
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    const lessonId = await startFromLibrary(page);
    const initialQuestion = await questionSnapshot(page);
    const initialQuestions = await lessonQuestions(fixture.client, lessonId);
    const initialLesson = await lessonRow(fixture.client, lessonId);
    await page.goto('/library');
    await expect(entrySummary(page, 'maleta')).toBeVisible();
    await page.goto(`/lessons/${lessonId}`);
    await expect(lessonQuestion(page)).toBeVisible();
    expect(await questionSnapshot(page)).toEqual(initialQuestion);
    expect(await lessonQuestions(fixture.client, lessonId)).toEqual(initialQuestions);
    expect(await lessonRow(fixture.client, lessonId)).toEqual(initialLesson);
  });

  test('keeps a Collection Lesson stable when the Collection changes mid-Lesson', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-edited');
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    const lessonId = await startFromLibrary(page);
    const initialQuestion = await questionSnapshot(page);
    const initialQuestions = await lessonQuestions(fixture.client, lessonId);
    const quizzedSenseIds = new Set(initialQuestions.map((question) => question.sense_id));
    const quizzed = fixture.captured.find((entry) => quizzedSenseIds.has(entry.senseId));
    if (!quizzed) throw new Error('The Collection Lesson fixture did not quiz a filed Vocabulary Entry.');
    const { error: removalError } = await fixture.client.rpc('remove_collection_membership', { p_collection_id: fixture.collectionId, p_learning_vocabulary_entry_id: quizzed.vocabularyEntryId });
    if (removalError) throw removalError;
    expect(await lessonQuestions(fixture.client, lessonId)).toEqual(initialQuestions);
    expect(await lessonRow(fixture.client, lessonId)).toEqual({ collection_id: fixture.collectionId, id: lessonId, source: 'vocabulary' });
    await page.reload();
    await expect(lessonQuestion(page)).toBeVisible();
    expect(await questionSnapshot(page)).toEqual(initialQuestion);
  });

  test('leaves a whole-library Vocabulary Lesson without a Collection', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-whole-library');
    await signIn(page, fixture.account);
    await openLessons(page);
    await vocabularyTile(page).click();
    await expect(page).toHaveURL(runnerUrl);
    await expect(lessonQuestion(page)).toBeVisible();
    const lesson = await lessonRow(fixture.client, lessonIdFromUrl(page));
    expect(lesson.collection_id).toBeNull();
    expect(lesson.source).toBe('vocabulary');
  });

  test('refuses a Collection below the practice threshold with the shortfall stated', async () => {
    const fixture = await seedTravelCollection('collection-lesson-threshold', travelVocabulary.slice(0, 5));
    const { error } = await fixture.client.rpc('start_or_resume_vocabulary_lesson', { p_collection_id: fixture.collectionId, p_learning_language_id: fixture.learningLanguageId });
    expect(error?.message).toBe('A Collection needs at least eight Vocabulary Entries to practise. Add 3 more.');
  });

  test('resumes the active whole-library Lesson instead of rescoping it to a Collection', async () => {
    const fixture = await seedTravelCollection('collection-lesson-resume-unscoped');
    const started = await startLesson(fixture.client, fixture.learningLanguageId);
    const resumed = await startLesson(fixture.client, fixture.learningLanguageId, fixture.collectionId);
    expect(resumed.id).toBe(started.id);
    expect(await lessonRow(fixture.client, started.id)).toEqual({ collection_id: null, id: started.id, source: 'vocabulary' });
  });

  test('resumes an active Collection Lesson after the Collection falls below the threshold', async () => {
    const fixture = await seedTravelCollection('collection-lesson-resume-shrunk', travelVocabulary.slice(0, 9));
    const started = await startLesson(fixture.client, fixture.learningLanguageId, fixture.collectionId);
    for (const entry of fixture.captured.slice(0, 2)) {
      const { error } = await fixture.client.rpc('remove_collection_membership', { p_collection_id: fixture.collectionId, p_learning_vocabulary_entry_id: entry.vocabularyEntryId });
      if (error) throw error;
    }
    expect(await filedEntryIds(fixture.client, fixture.collectionId)).toHaveLength(7);
    const resumed = await startLesson(fixture.client, fixture.learningLanguageId, fixture.collectionId);
    expect(resumed.id).toBe(started.id);
    expect(await lessonRow(fixture.client, started.id)).toEqual({ collection_id: fixture.collectionId, id: started.id, source: 'vocabulary' });
  });

  test('refuses a Collection that belongs to another Learner or another Learning Language', async () => {
    const fixture = await seedTravelCollection('collection-lesson-foreign');
    const stranger = await registerLearner('collection-lesson-stranger');
    const strangerCollectionId = await seedCollection(stranger.client, stranger.learningLanguageId, 'Stranger shelf');
    const { data: italian, error: italianError } = await fixture.client.rpc('create_learning_language', { p_language_tag: 'it' });
    if (italianError) throw italianError;
    const italianCollectionId = await seedCollection(fixture.client, (italian as { id: string }).id, 'Italian shelf');
    for (const collectionId of [strangerCollectionId, italianCollectionId]) {
      const { error } = await fixture.client.rpc('start_or_resume_vocabulary_lesson', { p_collection_id: collectionId, p_learning_language_id: fixture.learningLanguageId });
      expect(error?.message).toBe('Collection is unavailable.');
    }
  });

  test('shows the failure in view and keeps the Collection practice action usable when the Lesson cannot start', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-failure');
    await signIn(page, fixture.account);
    await openCollectionByUrl(page, fixture.collectionId);
    await expect(practiseButton(page)).toBeEnabled();

    await page.route('**/rest/v1/rpc/start_or_resume_vocabulary_lesson', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'A Vocabulary Lesson could not be started right now.' }) });
    });

    await practiseButton(page).click();

    const practiceAlert = collectionFilter(page).getByRole('alert').filter({ hasText: 'This Collection could not be practised.' });
    await expect(practiceAlert).toBeVisible();
    await expect(practiceAlert).toHaveText(/^This Collection could not be practised\.\s.+/);
    await assertWithinViewportUnscrolled(page, practiceAlert);
    await expect(page).toHaveURL(`/library?collection=${fixture.collectionId}`);
    await expect(page).not.toHaveURL(runnerUrl);
    await expect(collectionFilter(page).getByRole('button', { name: 'Opening Lesson…', exact: true })).toHaveCount(0);
    await expect(practiseButton(page)).toBeVisible();
    await expect(practiseButton(page)).toBeEnabled();
  });

  test('keeps the Collection filter strip free of horizontal overflow with the practice action', async ({ page }) => {
    const fixture = await seedTravelCollection('collection-lesson-overflow');
    await signIn(page, fixture.account);
    await openCollectionThroughPicker(page, fixture.collectionId);
    await expect(practiseButton(page)).toBeEnabled();
    await expect(collectionFilter(page).getByText('Filtered by Travel')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
