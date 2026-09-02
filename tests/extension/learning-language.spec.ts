import { expect, extensionId, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

type StudyPairRow = {
  id: string;
  learning_language_id: string;
  reference_language_tag: string;
  target_language_tag: string;
};

async function createStudyPair(
  learnerClient: SupabaseClient,
  targetLanguageTag: string,
  referenceLanguageTag: string,
): Promise<StudyPairRow> {
  const { data, error } = await learnerClient.rpc('create_study_pair', {
    p_reference_language_tag: referenceLanguageTag,
    p_target_language_tag: targetLanguageTag,
  });

  if (error) {
    throw error;
  }

  const { data: pair, error: pairError } = await learnerClient
    .from('study_pairs')
    .select('id, learning_language_id, reference_language_tag, target_language_tag')
    .eq('id', data.id)
    .single();

  if (pairError) {
    throw pairError;
  }

  return pair as StudyPairRow;
}

async function setActiveLearningLanguage(learnerClient: SupabaseClient, id: string) {
  const { error } = await learnerClient.rpc('set_active_learning_language', {
    p_learning_language_id: id,
  });

  if (error) {
    throw error;
  }
}

async function capture(
  learnerClient: SupabaseClient,
  studyPairId: string,
  expression: string,
  translation: string,
  example: string | null = null,
) {
  const { error } = await learnerClient.rpc('capture_manual_entry', {
    p_example: example,
    p_expression: expression,
    p_study_pair_id: studyPairId,
    p_translation: translation,
  });

  if (error) {
    throw error;
  }
}

async function openPage(context: BrowserContext, url: string, body: string): Promise<Page> {
  await context.route(url, (route) => route.fulfill({
    body,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

async function openOrdinaryPage(
  context: BrowserContext,
  text: string,
  path: string,
  expression = 'scoperta',
): Promise<Page> {
  return openPage(context, `http://127.0.0.1:54321${path}`, `<!doctype html>
    <html lang="it">
      <head><meta charset="utf-8"><title>Controlled reading</title></head>
      <body><p id="sentence">${text} <span id="capture-word">${expression}</span>.</p></body>
    </html>`);
}

async function enableLearningMode(page: Page) {
  const prompt = page.getByRole('dialog', { name: 'Learning Mode' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Enable' }).click();
  await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');
}

async function openCapture(page: Page) {
  await page.locator('#capture-word').hover();
  await page.locator('#capture-word').click();
  const captureDialog = page.getByRole('dialog', { name: 'Capture Expression' });
  await expect(captureDialog).toBeVisible();
  return captureDialog;
}

function adapterLessonMarkup({
  adapter,
  answerLanguage,
  expression = 'scoperta',
  learningLanguage,
  translation,
}: {
  adapter: 'clozemaster' | 'duolingo';
  answerLanguage: string;
  expression?: string;
  learningLanguage: string;
  translation: string;
}) {
  const attribute = adapter === 'clozemaster' ? 'clozemaster' : 'duolingo';
  return `<!doctype html>
    <html lang="${learningLanguage}">
      <body>
        <main data-lexync-${attribute}-lesson data-lexync-target-language="${learningLanguage}" data-lexync-reference-language="${answerLanguage}">
          <p data-lexync-expression>${expression}</p>
          <p data-lexync-translation>${translation}</p>
          <p data-lexync-example>Una ${expression} cambia el día.</p>
          <button type="button">Complete lesson item</button>
        </main>
      </body>
    </html>`;
}

test.describe('Learning Language extension journeys', () => {
  test('shows one compact synchronized Active Learning Language control and no Study Pair product UI', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const spanish = await createStudyPair(learnerClient, 'es', 'en');
    await createStudyPair(learnerClient, 'es', 'uk');
    const french = await createStudyPair(learnerClient, 'fr', 'en');

    const activeLanguage = extensionPage.getByLabel('Active Learning Language');
    await expect(activeLanguage).toBeVisible();
    await expect(extensionPage.getByText(/Study Pair/i)).toHaveCount(0);
    await expect(extensionPage.getByRole('button', { name: /Add Study Pair|Manage Study Pairs|Create Study Pair/i })).toHaveCount(0);

    await activeLanguage.selectOption({ label: 'Spanish' });
    await expect(activeLanguage.locator('option:checked')).toHaveText('Spanish');
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('learner_language_state')
        .select('active_learning_language_id')
        .single();
      if (error) throw error;
      return data.active_learning_language_id;
    }).toBe(spanish.learning_language_id);

    const reopened = await extensionContext.newPage();
    const id = await extensionId(extensionContext);
    await reopened.goto(`chrome-extension://${id}/popup.html`);
    await expect(reopened.getByLabel('Active Learning Language').locator('option:checked')).toHaveText('Spanish');

    await setActiveLearningLanguage(learnerClient, french.learning_language_id);
    await reopened.reload();
    await expect(reopened.getByLabel('Active Learning Language').locator('option:checked')).toHaveText('French');
  });

  test('shows editable confident Answer Language metadata and confirms uncertain fallback before save', async ({
    extensionContext,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient, 'it', 'en');
    const page = await openOrdinaryPage(extensionContext, 'Una parola italiana', '/ordinary-answer-language');
    await enableLearningMode(page);

    const confidentCapture = await openCapture(page);
    await confidentCapture.getByLabel('Translation').fill('discovery');
    const confidentLanguage = confidentCapture.getByLabel('Answer Language');
    await expect(confidentLanguage).toHaveValue('en');
    await confidentLanguage.fill('en-GB');
    await expect(confidentLanguage).toHaveValue('en-GB');
    await confidentCapture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByText(/Vocabulary Entry saved/i)).toBeVisible();
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('answer_language_tag')
        .eq('text', 'discovery');
      if (error) throw error;
      return data.map((translation) => translation.answer_language_tag);
    }).toEqual(['en-GB']);

    const uncertainCapture = await openCapture(page);
    await uncertainCapture.getByLabel('Translation').fill('xqz');
    await expect(uncertainCapture.getByLabel('Answer Language')).toHaveValue('en');
    await expect(uncertainCapture.getByRole('button', { name: 'Save Vocabulary Entry' })).toBeDisabled();
    await expect(uncertainCapture.getByText(/confirm.*Answer Language|Answer Language.*confirm/i)).toBeVisible();

    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('answer_language_tag')
        .eq('text', 'xqz');
      if (error) throw error;
      return data.length;
    }).toBe(0);
    expect(pair.target_language_tag).toBe('it');
  });

  test('attaches a new Answer Language to a sole Sense and requires a Sense decision for multiple Senses', async ({
    extensionContext,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient, 'es', 'en');
    await capture(learnerClient, pair.id, 'casa', 'house', 'La casa es azul.');
    const page = await openOrdinaryPage(extensionContext, 'Una palabra española', '/ordinary-sole-sense', 'casa');
    await enableLearningMode(page);

    const soleSenseCapture = await openCapture(page);
    await expect(soleSenseCapture.getByLabel('Expression')).toHaveValue('casa');
    await soleSenseCapture.getByLabel('Expression').fill('casa');
    await soleSenseCapture.getByLabel('Translation').fill('дім');
    await soleSenseCapture.getByLabel('Answer Language').fill('uk');
    await soleSenseCapture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByText(/Vocabulary Entry saved|Existing Sense enriched/i)).toBeVisible();

    await capture(learnerClient, pair.id, 'puerta', 'door');
    await capture(learnerClient, pair.id, 'puerta', 'gate');
    const multipleSensePage = await openOrdinaryPage(extensionContext, 'Otra palabra española', '/ordinary-multiple-senses', 'puerta');
    await enableLearningMode(multipleSensePage);
    const multipleSenseCapture = await openCapture(multipleSensePage);
    await multipleSenseCapture.getByLabel('Expression').fill('puerta');
    await multipleSenseCapture.getByLabel('Translation').fill('двері');
    await multipleSenseCapture.getByLabel('Answer Language').fill('uk');
    await expect(multipleSenseCapture.getByText(/Choose a Sense|Create a new Sense/i)).toBeVisible();
    await expect(multipleSenseCapture.getByRole('button', { name: 'Save Vocabulary Entry' })).toBeDisabled();
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('id')
        .eq('text', 'двері');
      if (error) throw error;
      return data.length;
    }).toBe(0);
  });

  test('switches Active Learning Language and announces the change for intentional Duolingo capture', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const current = await createStudyPair(learnerClient, 'es', 'en');
    const destination = await createStudyPair(learnerClient, 'fr', 'en');
    await setActiveLearningLanguage(learnerClient, current.learning_language_id);
    await extensionPage.close();
    const page = await openPage(
      extensionContext,
      'https://www.duolingo.com/lesson/learning-language-switch',
      adapterLessonMarkup({ adapter: 'duolingo', answerLanguage: 'en', learningLanguage: 'fr', translation: 'discovery' }),
    );

    await page.getByRole('button', { name: 'Complete lesson item' }).click();
    await page.getByRole('button', { name: 'Save to Lexync' }).click();
    await expect(page.getByRole('status')).toContainText(/French|Active Learning Language|switched/i);
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('learner_language_state')
        .select('active_learning_language_id')
        .single();
      if (error) throw error;
      return data.active_learning_language_id;
    }).toBe(destination.learning_language_id);
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('answer_language_tag')
        .eq('text', 'discovery');
      if (error) throw error;
      return data.map((translation) => translation.answer_language_tag);
    }).toEqual(['en']);
  });

  test('switches Active Learning Language and announces the change for intentional Clozemaster capture', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const current = await createStudyPair(learnerClient, 'es', 'en');
    const destination = await createStudyPair(learnerClient, 'de', 'en');
    await setActiveLearningLanguage(learnerClient, current.learning_language_id);
    await extensionPage.close();
    const page = await openPage(
      extensionContext,
      'https://www.clozemaster.com/l/de-en/learning-language-switch',
      adapterLessonMarkup({ adapter: 'clozemaster', answerLanguage: 'en', learningLanguage: 'de', translation: 'discovery' }),
    );

    await page.getByRole('button', { name: 'Complete lesson item' }).click();
    await page.getByRole('button', { name: 'Add to Lexync' }).click();
    await expect(page.getByRole('status')).toContainText(/German|Active Learning Language|switched/i);
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('learner_language_state')
        .select('active_learning_language_id')
        .single();
      if (error) throw error;
      return data.active_learning_language_id;
    }).toBe(destination.learning_language_id);
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('answer_language_tag')
        .eq('text', 'discovery');
      if (error) throw error;
      return data.map((translation) => translation.answer_language_tag);
    }).toEqual(['en']);
  });

  test('marks multilingual duplicate material in Learning Mode and keeps both Answer Language variants offline', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const englishPair = await createStudyPair(learnerClient, 'it', 'en-GB');
    const ukrainianPair = await createStudyPair(learnerClient, 'it', 'uk');
    await capture(learnerClient, englishPair.id, 'scoperta', 'discovery', 'La scoperta apre una strada nuova.');
    await capture(learnerClient, ukrainianPair.id, 'scoperta', 'відкриття', 'Кожне відкриття змінює день.');
    await setActiveLearningLanguage(learnerClient, englishPair.learning_language_id);
    await extensionPage.close();
    const page = await openPage(
      extensionContext,
      'http://127.0.0.1:54321/learning-language-index',
      '<!doctype html><html lang="it"><body><p id="reading">La scoperta apre una strada nuova.</p></body></html>',
    );
    await enableLearningMode(page);

    const saved = page.locator('[data-lexync-saved="true"]', { hasText: 'scoperta' }).first();
    await expect(saved).toBeVisible();
    await saved.hover();
    await expect(page.getByRole('tooltip')).toContainText('discovery');
    await saved.click();
    const details = page.getByRole('dialog', { name: 'Saved expression' });
    await expect(details).toContainText(/English.*United Kingdom|en-GB/i);
    await expect(details).toContainText(/Ukrainian|uk/i);
    await expect(details).toContainText('відкриття');
    await details.getByRole('button', { name: 'Close' }).click();

    await extensionContext.route('http://127.0.0.1:54321/rest/v1/**', (route) => route.abort());
    await page.reload();
    await expect(page.locator('[data-lexync-saved="true"]', { hasText: 'scoperta' })).toBeVisible();
    await page.locator('[data-lexync-saved="true"]', { hasText: 'scoperta' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('discovery');
  });
});
