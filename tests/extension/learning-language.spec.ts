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

async function captureNewSense(
  learnerClient: SupabaseClient,
  learningLanguageId: string,
  answerLanguageTag: string,
  expression: string,
  translation: string,
) {
  const { error } = await learnerClient.rpc('capture_learning_language_entry', {
    p_answer_language_tag: answerLanguageTag,
    p_create_new_sense: true,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
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
    <html>
      <head><meta charset="utf-8"><title>Controlled reading</title></head>
      <body>${text}<p><span id="capture-word">${expression}</span>.</p></body>
    </html>`);
}

async function enableLearningMode(page: Page) {
  const prompt = page.getByRole('dialog', { name: 'Learning Mode' });
  const status = page.getByRole('button', { name: 'Disable Learning Mode' });
  await expect.poll(async () => {
    if (await status.isVisible()) return 'enabled';
    if (await prompt.isVisible()) return 'prompt';
    return 'waiting';
  }).toMatch(/enabled|prompt/);
  if (await status.isVisible()) {
    return;
  }
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Enable' }).click();
  await expect(status).toHaveText('Learning Mode is on');
}

async function openCapture(page: Page) {
  await page.locator('#capture-word').hover();
  await page.locator('#capture-word').click();
  const captureDialog = page.getByRole('dialog', { name: 'Capture Expression' });
  await expect(captureDialog).toBeVisible();
  return captureDialog;
}

async function openSavedTranslation(page: Page, expression: string) {
  const saved = page.locator('[data-lexync-saved="true"]', { hasText: expression }).first();
  await expect(saved).toBeVisible();
  await saved.click();
  const details = page.getByRole('dialog', { name: 'Saved expression' });
  await details.getByRole('button', { name: 'Add translation' }).click();
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

    await extensionPage.reload();
    await expect(extensionPage.locator('.identity')).toBeVisible();
    const activeLanguage = extensionPage.getByLabel('Active Learning Language');
    await expect(activeLanguage).toBeVisible();
    await expect(activeLanguage.locator('option')).toHaveText(['Spanish', 'French']);
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
    extensionPage,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const page = await openOrdinaryPage(
      extensionContext,
      '<p>Questa è una frase italiana lunga e controllata per rilevare con affidabilità la lingua di apprendimento.</p><p>Il testo offre più frasi complete e un contesto naturale, così il rilevamento può distinguere con sicurezza l italiano dalle altre lingue.</p><p>Leggere lentamente ogni paragrafo aiuta a collegare le parole al loro significato e a ricordare meglio ciò che si è imparato.</p>',
      '/ordinary-answer-language',
    );
    await enableLearningMode(page);

    const confidentCapture = await openCapture(page);
    const confidentTranslation = 'The discovery of a new path changes the way we understand the world and helps us remember what we learned.';
    await confidentCapture.getByLabel('Translation').fill(confidentTranslation);
    const confidentLanguage = confidentCapture.getByRole('textbox', { name: 'Answer Language', exact: true });
    await expect(confidentLanguage).toHaveValue('en');
    const persistedTranslation = `${confidentTranslation} The surrounding context remains clear and useful.`;
    await confidentCapture.getByLabel('Translation').fill(persistedTranslation);
    await confidentLanguage.fill('en-GB');
    await page.waitForTimeout(100);
    await expect(confidentLanguage).toHaveValue('en-GB');
    await confidentCapture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByText(/Vocabulary Entry saved/i)).toBeVisible();
    await expect.poll(async () => {
      const { data, error } = await learnerClient
        .from('translations')
        .select('answer_language_tag')
        .eq('text', persistedTranslation);
      if (error) throw error;
      return data.map((translation) => translation.answer_language_tag);
    }).toEqual(['en-GB']);

    const uncertainCapture = await openSavedTranslation(page, 'scoperta');
    await uncertainCapture.getByLabel('Translation').fill('xqz');
    const uncertainLanguage = uncertainCapture.getByRole('textbox', { name: 'Answer Language', exact: true });
    await expect(uncertainLanguage).toHaveValue('en-GB');
    await uncertainLanguage.fill('en');
    await expect(uncertainLanguage).toHaveValue('en');
    await expect(uncertainCapture.getByRole('button', { name: 'Save Vocabulary Entry' })).toBeDisabled();
    const uncertainConfirmation = uncertainCapture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    await expect(uncertainConfirmation).toBeVisible();
    await uncertainConfirmation.check();

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
    extensionPage,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient, 'es', 'en');
    await capture(learnerClient, pair.id, 'casa', 'house', 'La casa es azul.');
    await extensionPage.close();
    const page = await openOrdinaryPage(
      extensionContext,
      '<p>Esta es una frase española larga y controlada para detectar con fiabilidad el idioma de aprendizaje.</p><p>El texto contiene varias oraciones completas y un contexto natural, para que el detector pueda distinguir el español de otras lenguas con seguridad.</p><p>Leer cada párrafo con atención ayuda a relacionar las palabras con su significado y a recordar mejor lo que hemos aprendido.</p>',
      '/ordinary-sole-sense',
      'casa',
    );
    await enableLearningMode(page);

    const soleSenseCapture = await openSavedTranslation(page, 'casa');
    await expect(soleSenseCapture.getByLabel('Expression')).toHaveValue('casa');
    await soleSenseCapture.getByLabel('Translation').fill('дім');
    await soleSenseCapture.getByRole('textbox', { name: 'Answer Language', exact: true }).fill('uk');
    const soleSenseConfirmation = soleSenseCapture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    await expect(soleSenseConfirmation).toBeVisible();
    await soleSenseConfirmation.check();
    await soleSenseCapture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByText(/Vocabulary Entry saved|Existing Sense enriched/i)).toBeVisible();

    await capture(learnerClient, pair.id, 'puerta', 'door');
    await captureNewSense(learnerClient, pair.learning_language_id, 'en', 'puerta', 'gate');
    const multipleSensePage = await openOrdinaryPage(
      extensionContext,
      '<p>Esta es otra frase española larga y controlada para detectar con fiabilidad el idioma de aprendizaje.</p><p>Estas oraciones forman un contexto amplio y controlado, de modo que el detector reconoce el español aunque la página no declare su idioma.</p><p>Un lector puede comparar cada palabra con las frases cercanas y comprender cómo cambia el sentido según el contexto.</p>',
      '/ordinary-multiple-senses',
      'puerta',
    );
    await enableLearningMode(multipleSensePage);
    const multipleSenseCapture = await openSavedTranslation(multipleSensePage, 'puerta');
    await multipleSenseCapture.getByLabel('Translation').fill('двері');
    await multipleSenseCapture.getByRole('textbox', { name: 'Answer Language', exact: true }).fill('uk');
    const multipleSenseConfirmation = multipleSenseCapture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    await expect(multipleSenseConfirmation).toBeVisible();
    await multipleSenseConfirmation.check();
    await multipleSenseCapture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(multipleSenseCapture.getByRole('group', { name: 'Choose a Sense', exact: true })).toBeVisible();
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
      '<!doctype html><html><body><p id="reading">La scoperta apre una strada nuova e invita il lettore a osservare il significato delle parole nel loro contesto.</p><p>Ogni frase completa aggiunge informazioni utili, mentre il testo controllato rende affidabile il rilevamento della lingua italiana.</p><p>Leggere con attenzione aiuta a collegare le espressioni al viaggio quotidiano e a ricordare ciò che si è imparato.</p></body></html>',
    );
    await enableLearningMode(page);

    const saved = page.locator('[data-lexync-saved="true"]', { hasText: 'scoperta' }).first();
    await expect(saved).toBeVisible();
    await saved.hover();
    await expect(page.getByRole('tooltip')).toContainText('discovery');
    await saved.click();
    const details = page.getByRole('dialog', { name: 'Saved expression' });
    await expect(details).toContainText(/British English|English.*United Kingdom|en-GB/i);
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
