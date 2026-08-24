import { expect, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createStudyPair(
  learnerClient: SupabaseClient,
  targetLanguageTag: string,
  referenceLanguageTag: string,
) {
  const { data, error } = await learnerClient.rpc('create_study_pair', {
    p_reference_language_tag: referenceLanguageTag,
    p_target_language_tag: targetLanguageTag,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function openCapturePopup(context: BrowserContext, targetPage: Page): Promise<Page> {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: 'Capture from this page' }).click();
  await targetPage.waitForTimeout(250);

  if (await targetPage.getByRole('status').count() === 0 && !popup.isClosed()) {
    throw new Error(await popup.getByRole('status').textContent() ?? 'Ordinary capture did not start.');
  }

  await expect(targetPage.getByRole('status')).toHaveText('Click a word or select a phrase. Press Escape to cancel.');
  return popup;
}

async function openControlledPage(context: BrowserContext): Promise<Page> {
  await context.route('http://127.0.0.1:54321/ordinary-capture-fixture', (route) => route.fulfill({
    body: `<!doctype html>
      <html lang="it">
        <head><title>Private reading notes</title></head>
        <body>
          <p id="word-sentence">Ogni <span id="word">scoperta</span> cambia il viaggio.</p>
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

test.describe('ordinary webpage capture', () => {
  test('captures an exact clicked word into a changed Study Pair with an edited Example', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'en');
    const ukrainianPair = await createStudyPair(learnerClient, 'it', 'uk');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);
    let captureRequest: Record<string, unknown> | undefined;
    extensionContext.on('request', (request) => {
      if (request.url().includes('/rest/v1/rpc/capture_manual_entry')) {
        captureRequest = request.postDataJSON() as Record<string, unknown>;
      }
    });

    await openCapturePopup(extensionContext, page);
    await page.locator('#word').click();

    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture.getByLabel('Expression')).toHaveValue('scoperta');
    await expect(capture.getByLabel('Active Study Pair')).toContainText('Italian → English');
    await capture.getByLabel('Active Study Pair').selectOption(ukrainianPair.id);
    await capture.getByLabel('Translation').fill('відкриття');
    await expect(capture.getByLabel('Example')).toHaveValue('Ogni scoperta cambia il viaggio.');
    await capture.getByLabel('Example').fill('Una scoperta cambia il viaggio.');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByRole('status')).toHaveText('Vocabulary Entry saved.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, study_pair_id, senses(translations(text), examples(text))')
      .eq('expression_identity', 'scoperta')
      .single();
    expect(data).toEqual({
      expression: 'scoperta',
      study_pair_id: ukrainianPair.id,
      senses: [{ translations: [{ text: 'відкриття' }], examples: [{ text: 'Una scoperta cambia il viaggio.' }] }],
    });
    expect(Object.keys(captureRequest ?? {}).sort()).toEqual([
      'p_example',
      'p_expression',
      'p_study_pair_id',
      'p_translation',
    ]);
    expect(JSON.stringify(captureRequest)).not.toContain('Private reading notes');
    expect(JSON.stringify(captureRequest)).not.toContain('unrelated private paragraph');
    expect(JSON.stringify(captureRequest)).not.toContain('ordinary-capture-fixture');
  });

  test('captures an exact selected phrase without decomposing it and allows removing the Example', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);

    await openCapturePopup(extensionContext, page);
    await page.locator('#phrase').selectText();
    await page.locator('#phrase').dispatchEvent('mouseup');

    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture.getByLabel('Expression')).toHaveValue('strada maestra');
    await expect(capture.getByLabel('Example')).toHaveValue('La strada maestra attraversa il borgo.');
    await capture.getByLabel('Translation').fill('main road');
    await capture.getByLabel('Example').fill('');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(page.getByRole('status')).toHaveText('Vocabulary Entry saved.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, study_pair_id, senses(translations(text), examples(text))')
      .eq('study_pair_id', pair.id)
      .single();
    expect(data).toEqual({
      expression: 'strada maestra',
      study_pair_id: pair.id,
      senses: [{ translations: [{ text: 'main road' }], examples: [] }],
    });
  });

  test('blocks capture until a translation is provided', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const page = await openControlledPage(extensionContext);

    await openCapturePopup(extensionContext, page);
    await page.locator('#word').click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(capture.getByText('Translation is required.')).toBeVisible();
    const { count } = await learnerClient.from('vocabulary_entries').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
});
