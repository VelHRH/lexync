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

function lessonMarkup(example = 'Le renard lit chaque soir.'): string {
  return `<!doctype html>
    <html lang="it">
      <body>
        <main
          data-lexync-duolingo-lesson
          data-lexync-target-language="fr"
          data-lexync-reference-language="en"
        >
          <p data-lexync-expression>renard</p>
          <p data-lexync-translation>fox</p>
          ${example ? `<p data-lexync-example>${example}</p>` : ''}
          <button type="button">Complete lesson item</button>
        </main>
      </body>
    </html>`;
}

async function openDuolingoFixture(context: BrowserContext, body: string): Promise<Page> {
  await context.route('https://www.duolingo.com/lesson/controlled', (route) => route.fulfill({
    body,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('https://www.duolingo.com/lesson/controlled');
  return page;
}

test.describe('Duolingo lesson capture', () => {
  test('deliberately saves displayed material to the course Study Pair', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const coursePair = await createStudyPair(learnerClient, 'fr', 'en');
    const rememberedPair = await createStudyPair(learnerClient, 'fr', 'uk');
    await extensionPage.evaluate(
      ([key, value]) => chrome.storage.local.set({ [key]: value }),
      ['lexync.websiteStudyPair.https://www.duolingo.com', rememberedPair.id],
    );
    await extensionPage.close();
    const page = await openDuolingoFixture(extensionContext, lessonMarkup());

    await page.getByRole('button', { name: 'Complete lesson item' }).click();
    const { count: beforeSave } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(beforeSave).toBe(0);

    await page.getByRole('button', { name: 'Save to Lexync' }).click();

    await expect(page.getByRole('status')).toHaveText('Saved to Lexync.');
    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, study_pair_id, senses(translations(text), examples(text))')
      .single();
    expect(data).toEqual({
      expression: 'renard',
      study_pair_id: coursePair.id,
      senses: [{
        examples: [{ text: 'Le renard lit chaque soir.' }],
        translations: [{ text: 'fox' }],
      }],
    });
  });

  test('uses established enrichment and accepts a missing Example', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'fr', 'en');
    await extensionPage.close();
    const firstPage = await openDuolingoFixture(extensionContext, lessonMarkup());
    await firstPage.getByRole('button', { name: 'Save to Lexync' }).click();
    await expect(firstPage.getByRole('status')).toHaveText('Saved to Lexync.');
    await firstPage.close();

    const secondPage = await openDuolingoFixture(extensionContext, lessonMarkup(''));
    await secondPage.getByRole('button', { name: 'Save to Lexync' }).click();
    await expect(secondPage.getByRole('status')).toHaveText('Saved to Lexync.');

    const { data } = await learnerClient
      .from('vocabulary_entries')
      .select('expression, senses(translations(text), examples(text))');
    expect(data).toEqual([{
      expression: 'renard',
      senses: [{
        examples: [{ text: 'Le renard lit chaque soir.' }],
        translations: [{ text: 'fox' }],
      }],
    }]);
  });

  test('fails safely when required lesson markup changes', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'fr', 'en');
    await extensionPage.close();
    const page = await openDuolingoFixture(extensionContext, `<!doctype html>
      <html>
        <body>
          <main data-lexync-duolingo-lesson data-lexync-target-language="fr">
            <p data-lexync-expression>renard</p>
            <p data-lexync-translation>fox</p>
          </main>
        </body>
      </html>`);

    await expect(page.getByRole('button', { name: 'Save to Lexync' })).toHaveCount(0);
    const { count } = await learnerClient
      .from('vocabulary_entries')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
});
