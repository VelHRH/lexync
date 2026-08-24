import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, extensionId, test } from './fixtures';

async function createStudyPair(learnerClient: SupabaseClient, targetLanguageTag = 'it') {
  const { data, error } = await learnerClient.rpc('create_study_pair', {
    p_reference_language_tag: 'en',
    p_target_language_tag: targetLanguageTag,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function saveExpression(
  learnerClient: SupabaseClient,
  studyPairId: string,
  expression: string,
  translation: string,
  example: string,
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

async function openReadingPage(context: BrowserContext, path = '/reading', origin = 'http://127.0.0.1:54321'): Promise<Page> {
  await context.route(`${origin}${path}`, (route) => route.fulfill({
    body: `<!doctype html>
      <html lang="it">
        <head><meta charset="utf-8"><title>Italian reading</title></head>
        <body>
          <p>La scoperta apre una strada nuova. Ogni scoperta cambia il viaggio e rende la giornata interessante.</p>
          <p><span id="unknown">meraviglia</span> accompagna il <span id="second-unknown">cammino</span> ogni giorno.</p>
          <p id="plain-sentence">curiosità accompagna ogni lettore lungo questa strada.</p>
        </body>
      </html>`,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto(`${origin}${path}`);
  return page;
}

async function enableOnPage(page: Page) {
  await page.bringToFront();
  const prompt = page.getByRole('dialog', { name: 'Learning Mode' });
  await expect(prompt).toContainText('Italian');
  await prompt.getByRole('button', { name: 'Enable' }).click();
  await expect(page.getByRole('status')).toHaveText('Learning Mode is on');
}

test.describe('Learning Mode', () => {
  test('signals matching Learning Mode before requesting access to only the current site', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient);
    const page = await openReadingPage(extensionContext, '/reading', 'http://learning-mode.test');
    await expect.poll(() => extensionContext.serviceWorkers()[0].evaluate(async () => {
      const tab = (await chrome.tabs.query({ url: 'http://learning-mode.test/*' }))[0];
      return tab?.id ? {
        badge: await chrome.action.getBadgeText({ tabId: tab.id }),
        title: await chrome.action.getTitle({ tabId: tab.id }),
      } : { badge: '', title: '' };
    })).toEqual({ badge: 'NEW', title: 'Learning Mode is available' });

    await page.bringToFront();
    await extensionPage.bringToFront();
    await extensionPage.reload();
    await expect(extensionPage.getByRole('button', { name: 'Set up Learning Mode' })).toBeVisible();
    const permissions = await extensionPage.evaluate(() => chrome.permissions.getAll());
    expect(permissions.origins).not.toContain('http://learning-mode.test/*');
    expect(permissions.origins).not.toContain('http://*/*');
    expect(permissions.origins).not.toContain('https://*/*');
    await expect(page.getByRole('dialog', { name: 'Learning Mode' })).toHaveCount(0);
  });

  test('marks saved expressions, shows personal details, and keeps unknown words hover-only', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient);
    await saveExpression(learnerClient, pair.id, 'scoperta', 'discovery', 'La scoperta apre una strada nuova.');
    await saveExpression(learnerClient, pair.id, 'scoperta', 'finding', 'Ogni scoperta cambia il viaggio.');
    await learnerClient.from('vocabulary_entries').update({ suspended: true }).eq('expression_identity', 'scoperta');
    const page = await openReadingPage(extensionContext);

    await enableOnPage(page);

    const saved = page.locator('[data-lexync-saved="true"]').first();
    await expect(saved).toHaveText('scoperta');
    await expect(saved).toHaveCSS('text-decoration-line', 'underline');
    await saved.click();
    const details = page.getByRole('dialog', { name: 'Saved expression' });
    await expect(details).toContainText('discovery');
    await expect(details).toContainText('finding');
    await expect(details).toContainText('La scoperta apre una strada nuova.');
    await expect(page.locator('[data-lexync-unknown]')).toHaveCount(0);
    await page.locator('#unknown').hover();
    await expect(page.getByRole('button', { name: 'Add meraviglia' })).toBeVisible();
    await expect(page.locator('#second-unknown')).not.toHaveAttribute('data-lexync-unknown');
    await page.locator('#second-unknown').hover();
    await expect(page.locator('#unknown')).not.toHaveAttribute('data-lexync-hover');
    await page.locator('#plain-sentence').hover({ position: { x: 20, y: 10 } });
    await expect(page.getByRole('button', { name: 'Add curiosità' })).toBeVisible();
  });

  test('remembers Not now and can be enabled later from the popup', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient);
    const page = await openReadingPage(extensionContext, '/decline');
    const prompt = page.getByRole('dialog', { name: 'Learning Mode' });

    await prompt.getByRole('button', { name: 'Not now' }).click();
    await page.reload();
    await expect(prompt).toHaveCount(0);
    await page.bringToFront();
    await extensionPage.bringToFront();
    await extensionPage.reload();
    await extensionPage.getByRole('button', { name: 'Enable Learning Mode' }).click();
    await page.bringToFront();
    await expect(page.getByRole('status')).toHaveText('Learning Mode is on');
  });

  test('remains active after cancel and uses its local index when the backend is offline', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const pair = await createStudyPair(learnerClient);
    await saveExpression(learnerClient, pair.id, 'scoperta', 'discovery', '');
    const page = await openReadingPage(extensionContext);

    await enableOnPage(page);
    await expect.poll(() => extensionContext.serviceWorkers()[0].evaluate(() => chrome.scripting.getRegisteredContentScripts()))
      .toEqual(expect.arrayContaining([expect.objectContaining({ matches: ['http://127.0.0.1:54321/*'] })]));
    await page.locator('#unknown').hover();
    await page.getByRole('button', { name: 'Add meraviglia' }).click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await capture.getByLabel('Translation').fill('wonder');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await page.locator('#second-unknown').hover();
    await page.getByRole('button', { name: 'Add cammino' }).click();
    await capture.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#unknown').hover();
    await expect(page.getByRole('button', { name: 'Add meraviglia' })).toBeVisible();

    const popup = await extensionContext.newPage();
    const id = await extensionId(extensionContext);
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByRole('button', { name: 'Disable Learning Mode' }).click();
    await expect(page.locator('[data-lexync-saved="true"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await popup.getByRole('button', { name: 'Enable Learning Mode' }).click();
    await expect(page.getByRole('status')).toHaveText('Learning Mode is on');

    await extensionContext.route('http://127.0.0.1:54321/rest/v1/**', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('Learning Mode is on');
    await expect(page.locator('[data-lexync-saved="true"]').first()).toHaveText('scoperta');

    await popup.reload();
    await popup.getByRole('button', { name: 'Disable Learning Mode' }).click();
    await expect(page.locator('[data-lexync-saved="true"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Add / })).toHaveCount(0);
  });
});
