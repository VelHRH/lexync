import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createLearningLanguage(
  learnerClient: SupabaseClient,
  languageTag: string,
) {
  const { data, error } = await learnerClient.rpc('create_learning_language', {
    p_language_tag: languageTag,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function startCaptureFromLearningMode(page: Page): Promise<void> {
  const prompt = page.getByRole('dialog', { name: 'Learning Mode' });
  await prompt.getByRole('button', { name: 'Enable' }).click();
  await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');
  await page.locator('#word').hover();
  await expect(page.getByRole('tooltip')).toHaveText('Click to add "scoperta"');
  await page.locator('#word').click();
  await expect(page.getByRole('dialog', { name: 'Capture Expression' })).toBeVisible();
}

async function openControlledPage(context: BrowserContext): Promise<Page> {
  await context.route('http://127.0.0.1:54321/ordinary-capture-fixture', (route) => route.fulfill({
    body: `<!doctype html>
      <html lang="it">
        <head><title>Private reading notes</title></head>
        <body>
          <p id="word-sentence">Ogni <span id="word">scoperta</span> cambia il <span id="second-word">viaggio</span>. Never upload this neighboring sentence.</p>
          <p id="phrase-sentence">La <span id="phrase">strada maestra</span> attraversa il borgo.</p>
          <p id="unrelated">This unrelated private paragraph must never leave the page.</p>
        </body>
      </html>`,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:54321/ordinary-capture-fixture');
  return page;
}

test.describe('Learning Mode capture', () => {
  test('captures consecutive exact words into a Learning Language with an edited Example', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const learningLanguage = await createLearningLanguage(learnerClient, 'it');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);
    let captureRequest: Record<string, unknown> | undefined;
    extensionContext.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/capture_learning_language_entry')) {
        captureRequest = request.postDataJSON() as Record<string, unknown>;
      }
    });

    await startCaptureFromLearningMode(page);

    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture.getByLabel('Expression')).toHaveValue('scoperta');
    await expect(capture.getByLabel('Learning Language')).toHaveValue(learningLanguage.id);
    await capture.getByLabel('Translation').fill('відкриття');
    await capture.getByRole('textbox', { name: 'Answer Language', exact: true }).fill('uk');
    const firstConfirmation = capture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    if (await firstConfirmation.isVisible()) await firstConfirmation.check();
    await expect(capture.getByLabel('Example')).toHaveValue('Ogni scoperta cambia il viaggio. Never upload this neighboring sentence.');
    await capture.getByLabel('Example').fill('Una scoperta cambia il viaggio.');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByText('Vocabulary Entry saved. Click another word or select a phrase.', { exact: true })).toBeVisible();
    await page.locator('#second-word').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "viaggio"');
    await page.locator('#second-word').click();
    await expect(capture.getByLabel('Expression')).toHaveValue('viaggio');
    await expect(capture.getByLabel('Learning Language')).toHaveValue(learningLanguage.id);
    await capture.getByLabel('Translation').fill('подорож');
    await capture.getByRole('textbox', { name: 'Answer Language', exact: true }).fill('uk');
    const secondConfirmation = capture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    if (await secondConfirmation.isVisible()) await secondConfirmation.check();
    await capture.getByLabel('Example').fill('');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.getByText('Vocabulary Entry saved. Click another word or select a phrase.', { exact: true })).toBeVisible();
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, learning_language_id, senses(translations(text, answer_language_tag), examples(text))')
      .eq('expression_identity', 'scoperta')
      .single();
    expect(data).toEqual({
      expression: 'scoperta',
      learning_language_id: learningLanguage.id,
      senses: [{ translations: [{ text: 'відкриття', answer_language_tag: 'uk' }], examples: [{ text: 'Una scoperta cambia il viaggio.' }] }],
    });
    const { data: secondCapture } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, learning_language_id, senses(translations(text, answer_language_tag), examples(text))')
      .eq('expression_identity', 'viaggio')
      .single();
    expect(secondCapture).toEqual({
      expression: 'viaggio',
      learning_language_id: learningLanguage.id,
      senses: [{ translations: [{ text: 'подорож', answer_language_tag: 'uk' }], examples: [] }],
    });
    expect(Object.keys(captureRequest ?? {}).sort()).toEqual([
      'p_answer_language_tag',
      'p_create_new_sense',
      'p_example',
      'p_expression',
      'p_learning_language_id',
      'p_sense_id',
      'p_translation',
    ]);
    expect(JSON.stringify(captureRequest)).not.toContain('Private reading notes');
    expect(JSON.stringify(captureRequest)).not.toContain('unrelated private paragraph');
    expect(JSON.stringify(captureRequest)).not.toContain('neighboring sentence');
    expect(JSON.stringify(captureRequest)).not.toContain('ordinary-capture-fixture');
  });

  test('captures an exact selected phrase without decomposing it and allows removing the Example', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const learningLanguage = await createLearningLanguage(learnerClient, 'it');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);

    await startCaptureFromLearningMode(page);
    await page.getByRole('dialog', { name: 'Capture Expression' }).getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#phrase').selectText();
    await page.locator('#phrase').dispatchEvent('mouseup');

    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture.getByLabel('Expression')).toHaveValue('strada maestra');
    await expect(capture.getByLabel('Example')).toHaveValue('La strada maestra attraversa il borgo.');
    await capture.getByLabel('Translation').fill('main road');
    await capture.getByRole('textbox', { name: 'Answer Language', exact: true }).fill('en');
    const confirmation = capture.getByRole('checkbox', { name: 'Confirm this Answer Language', exact: true });
    if (await confirmation.isVisible()) await confirmation.check();
    await capture.getByLabel('Example').fill('');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByText('Vocabulary Entry saved. Click another word or select a phrase.', { exact: true })).toBeVisible();
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, learning_language_id, senses(translations(text, answer_language_tag), examples(text))')
      .eq('learning_language_id', learningLanguage.id)
      .single();
    expect(data).toEqual({
      expression: 'strada maestra',
      learning_language_id: learningLanguage.id,
      senses: [{ translations: [{ text: 'main road', answer_language_tag: 'en' }], examples: [] }],
    });
  });

  test('keeps Learning Mode active after cancelling the current word', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);

    await startCaptureFromLearningMode(page);
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await capture.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText('Click a word or select a phrase. Press Escape to cancel.', { exact: true })).toBeVisible();
    await page.locator('#second-word').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "viaggio"');
    await page.locator('#second-word').click();
    await expect(capture.getByLabel('Expression')).toHaveValue('viaggio');
    const { count } = await learnerClient.from('vocabulary_entries').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });

  test('blocks capture until a translation is provided', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);

    await startCaptureFromLearningMode(page);
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(capture.getByText('Translation is required.')).toBeVisible();
    const { count } = await learnerClient.from('vocabulary_entries').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
});
