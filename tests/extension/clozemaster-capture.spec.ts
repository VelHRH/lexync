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

function lessonMarkup({
  example = 'Il gatto dorme sul divano.',
  expression = 'gatto',
  translation = 'cat',
} = {}): string {
  return `<!doctype html>
    <html lang="it">
      <body>
        <main
          data-lexync-clozemaster-lesson
          data-lexync-target-language="it"
          data-lexync-reference-language="en"
        >
          <p data-lexync-expression>${expression}</p>
          <p data-lexync-translation>${translation}</p>
          ${example ? `<p data-lexync-example>${example}</p>` : ''}
          <button type="button">Continue lesson</button>
        </main>
      </body>
    </html>`;
}

function liveLessonMarkup({
  expression = 'draugas',
  post = '.',
  pre = 'Johnas yra mano geriausias ',
  translation = 'John is my best friend.',
} = {}): string {
  return `<!doctype html>
    <html>
      <body>
        <main class="stage">
          <div class="clozeable">
            <div class="sentence answered">
              <span class="pre">${pre}</span>
              <input class="input correct" name="text_input_value" value="${expression}">
              <span class="post">${post}</span>
            </div>
            <div class="translation font-size-1x">${translation}</div>
          </div>
        </main>
      </body>
    </html>`;
}

async function openClozemasterFixture(context: BrowserContext, body: string): Promise<Page> {
  await context.route('https://www.clozemaster.com/l/controlled', (route) => route.fulfill({
    body,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('https://www.clozemaster.com/l/controlled');
  return page;
}

async function openLiveClozemasterFixture(context: BrowserContext, body: string): Promise<Page> {
  await context.route('https://www.clozemaster.com/l/lit-eng', (route) => route.fulfill({
    body,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('https://www.clozemaster.com/l/lit-eng');
  return page;
}

test.describe('Clozemaster lesson capture', () => {
  test('saves an answered live lesson to the URL course Study Pair', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const coursePair = await createStudyPair(learnerClient, 'lt', 'en');
    await extensionPage.close();
    const page = await openLiveClozemasterFixture(extensionContext, liveLessonMarkup());

    await page.getByRole('button', { name: 'Add to Lexync' }).click();

    await expect(page.getByRole('status')).toHaveText('Saved to Lexync.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, study_pair_id, senses(translations(text), examples(text))')
      .single();
    expect(data).toEqual({
      expression: 'draugas',
      study_pair_id: coursePair.id,
      senses: [{
        examples: [{ text: 'Johnas yra mano geriausias draugas.' }],
        translations: [{ text: 'John is my best friend.' }],
      }],
    });
  });

  test('refreshes the live capture action when Clozemaster replaces the lesson', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'lt', 'en');
    await extensionPage.close();
    const page = await openLiveClozemasterFixture(extensionContext, '<!doctype html><html><body><main class="stage"></main></body></html>');
    const save = page.getByRole('button', { name: 'Add to Lexync' });
    await expect(save).toHaveCount(0);
    await page.locator('.stage').evaluate((stage) => {
      stage.innerHTML = `
        <div class="clozeable">
          <div class="sentence answered">
            <span class="pre">Johnas yra mano geriausias </span>
            <input class="input correct" name="text_input_value" value="draugas">
            <span class="post">.</span>
          </div>
          <div class="translation font-size-1x">John is my best friend.</div>`;
    });
    await expect(save).toBeVisible();

    await page.locator('.clozeable').evaluate((lesson) => {
      lesson.innerHTML = `
        <div class="sentence answered">
          <span class="pre">Tai yra mano </span>
          <input class="input correct" name="text_input_value" value="namas">
          <span class="post">.</span>
        </div>
        <div class="translation font-size-1x">This is my house.</div>`;
    });
    await save.click();

    await expect(page.getByRole('status')).toHaveText('Saved to Lexync.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, senses(translations(text), examples(text))')
      .single();
    expect(data).toEqual({
      expression: 'namas',
      senses: [{
        examples: [{ text: 'Tai yra mano namas.' }],
        translations: [{ text: 'This is my house.' }],
      }],
    });
  });

  test('deliberately saves displayed material to the course Study Pair', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const coursePair = await createStudyPair(learnerClient, 'it', 'en');
    const rememberedPair = await createStudyPair(learnerClient, 'it', 'uk');
    await extensionPage.evaluate(
      ([key, value]) => chrome.storage.local.set({ [key]: value }),
      ['lexync.websiteStudyPair.https://www.clozemaster.com', rememberedPair.id],
    );
    await extensionPage.close();
    const page = await openClozemasterFixture(extensionContext, lessonMarkup());

    await page.getByRole('button', { name: 'Continue lesson' }).click();
    const { count: beforeSave } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(beforeSave).toBe(0);

    await page.getByRole('button', { name: 'Add to Lexync' }).click();

    await expect(page.getByRole('status')).toHaveText('Saved to Lexync.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, study_pair_id, senses(translations(text), examples(text))')
      .single();
    expect(data).toEqual({
      expression: 'gatto',
      study_pair_id: coursePair.id,
      senses: [{
        examples: [{ text: 'Il gatto dorme sul divano.' }],
        translations: [{ text: 'cat' }],
      }],
    });
  });

  test('uses established duplicate and Sense enrichment rules', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const firstPage = await openClozemasterFixture(extensionContext, lessonMarkup());
    await firstPage.getByRole('button', { name: 'Add to Lexync' }).click();
    await expect(firstPage.getByRole('status')).toHaveText('Saved to Lexync.');
    await firstPage.close();

    const secondPage = await openClozemasterFixture(extensionContext, lessonMarkup({
      example: 'Un gatto attraversa il cortile.',
      expression: ' GATTO ',
      translation: ' cat ',
    }));
    await secondPage.getByRole('button', { name: 'Add to Lexync' }).click();
    await expect(secondPage.getByRole('status')).toHaveText('Saved to Lexync.');
    await secondPage.close();

    const thirdPage = await openClozemasterFixture(extensionContext, lessonMarkup({
      example: '',
      expression: 'gatto',
      translation: 'feline',
    }));
    await thirdPage.getByRole('button', { name: 'Add to Lexync' }).click();
    await expect(thirdPage.getByRole('status')).toHaveText('Saved to Lexync.');

    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, senses(translations(text), examples(text))');
    expect(data).toEqual([{
      expression: 'gatto',
      senses: expect.arrayContaining([
        {
          examples: [
            { text: 'Il gatto dorme sul divano.' },
            { text: 'Un gatto attraversa il cortile.' },
          ],
          translations: [{ text: 'cat' }],
        },
        {
          examples: [],
          translations: [{ text: 'feline' }],
        },
      ]),
    }]);
  });

  test('keeps material unsaved when the course Study Pair is unavailable', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'uk');
    await extensionPage.close();
    const page = await openClozemasterFixture(extensionContext, lessonMarkup());
    const save = page.getByRole('button', { name: 'Add to Lexync' });

    await save.click();

    await expect(page.getByRole('status')).toHaveText('Matching Study Pair is unavailable.');
    await expect(save).toBeEnabled();
    const { count } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });

  test('fails safely when required lesson markup changes', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const page = await openClozemasterFixture(extensionContext, `<!doctype html>
      <html>
        <body>
          <main data-lexync-clozemaster-lesson data-lexync-target-language="it">
            <p data-lexync-expression>gatto</p>
            <p data-lexync-expression>cane</p>
            <p data-lexync-translation>cat</p>
          </main>
        </body>
      </html>`);

    await expect(page.getByRole('button', { name: 'Add to Lexync' })).toHaveCount(0);
    const { count } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });

  test('removes stale capture after the displayed lesson changes', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'it', 'en');
    await extensionPage.close();
    const page = await openClozemasterFixture(extensionContext, lessonMarkup());
    const save = page.getByRole('button', { name: 'Add to Lexync' });
    await expect(save).toBeVisible();
    await page.locator('[data-lexync-translation]').evaluate((element) => element.remove());

    await expect(save).toHaveCount(0);
    const { count } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
});
