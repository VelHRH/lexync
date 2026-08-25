import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, extensionId, test } from './fixtures';

async function createStudyPair(learnerClient: SupabaseClient, targetLanguageTag = 'it', referenceLanguageTag = 'en') {
  const { data, error } = await learnerClient.rpc('create_study_pair', {
    p_reference_language_tag: referenceLanguageTag,
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

async function openReadingPage(
  context: BrowserContext,
  path = '/reading',
  origin = 'http://127.0.0.1:54321',
  content = `
    <p>La scoperta apre una strada nuova. Ogni scoperta cambia il viaggio e rende la giornata interessante.</p>
    <p><label><input id="page-checkbox" type="checkbox"> <span id="unknown">meraviglia</span> accompagna il <span id="second-unknown">cammino</span> ogni giorno.</label></p>
    <p id="plain-sentence">curiosità accompagna ogni lettore lungo questa strada.</p>`,
): Promise<Page> {
  await context.route(`${origin}${path}`, (route) => route.fulfill({
    body: `<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>Italian reading</title></head>
        <body>
          ${content}
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
  await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');
}

test.describe('Learning Mode', () => {
  test('offers Learning Mode from visible page text instead of the declared HTML language', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient, 'lt');
    const page = await openReadingPage(extensionContext, '/reading', 'http://learning-mode.test', `
      <p>Vilniaus universiteto leidykla pristato lietuvių kalbos vadovėlį.</p>
      <p>Knygoje pateikiami pokalbiai, klausomi ir skaitomi tekstai.</p>
      <p>Vadovėlio užduočių atsakymus galite atsisiųsti čia.</p>
      <p>Ši knyga padeda mokytis lietuvių kalbos ir geriau suprasti kasdienius pokalbius.</p>`);
    await expect(page.getByRole('dialog', { name: 'Learning Mode' })).toContainText('Lithuanian');
    await expect.poll(() => extensionContext.serviceWorkers()[0].evaluate(async () => {
      const tab = (await chrome.tabs.query({ url: 'http://learning-mode.test/*' }))[0];
      return tab?.id ? {
        badge: await chrome.action.getBadgeText({ tabId: tab.id }),
        title: await chrome.action.getTitle({ tabId: tab.id }),
      } : { badge: '', title: '' };
    })).toEqual({ badge: 'NEW', title: 'Learning Mode is available' });

    await extensionPage.bringToFront();
    await extensionPage.reload();
    await expect(extensionPage.getByRole('button', { name: 'Enable Learning Mode' })).toBeVisible();
    await expect(extensionPage.getByRole('button', { name: 'Capture from this page' })).toHaveCount(0);
    const permissions = await extensionPage.evaluate(() => chrome.permissions.getAll());
    expect(permissions.origins).toContain('http://*/*');
    expect(permissions.origins).toContain('https://*/*');
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
    await saved.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('discovery');
    await expect(tooltip).toContainText('finding');
    await saved.click();
    const details = page.getByRole('dialog', { name: 'Saved expression' });
    await expect(details).toContainText('discovery');
    await expect(details).toContainText('finding');
    await expect(details).toContainText('La scoperta apre una strada nuova.');
    await expect(page.getByRole('dialog', { name: 'Capture Expression' })).toHaveCount(0);
    await details.getByRole('button', { name: 'Close' }).click();
    await page.locator('#unknown').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "meraviglia"');
    await page.locator('#unknown').click();
    await expect(page.locator('#page-checkbox')).not.toBeChecked();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture.getByLabel('Expression')).toHaveValue('meraviglia');
    await capture.getByRole('button', { name: 'Cancel' }).click();
    await saved.click();
    await expect(details).toBeVisible();
    await expect(capture).toHaveCount(0);
    await details.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-lexync-unknown]')).toHaveCount(0);
    await page.locator('#unknown').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "meraviglia"');
    await expect(page.locator('#second-unknown')).not.toHaveAttribute('data-lexync-unknown');
    await page.locator('#second-unknown').hover();
    await expect(page.locator('#unknown')).not.toHaveAttribute('data-lexync-hover');
    await page.locator('#plain-sentence').hover({ position: { x: 20, y: 10 } });
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "curiosità"');
  });

  test('treats an expression from another Study Pair for the same Target Language as saved', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const primaryPair = await createStudyPair(learnerClient, 'it', 'en');
    await saveExpression(learnerClient, primaryPair.id, 'viaggio', 'journey', 'Ogni viaggio apre una strada nuova.');
    const page = await openReadingPage(extensionContext, '/cross-pair', 'http://127.0.0.1:54321', `
      <p>La scoperta apre una strada nuova e cambia il modo in cui osserviamo il mondo.</p>
      <p>Ogni scoperta accompagna il viaggio, rende interessante la giornata e invita a continuare.</p>
      <p>Leggere, ascoltare e parlare ogni giorno aiuta a imparare nuove parole italiane.</p>`);

    await enableOnPage(page);
    const ukrainianPair = await createStudyPair(learnerClient, 'it', 'uk');
    await saveExpression(learnerClient, ukrainianPair.id, 'Scoperta', 'відкриття', 'Una scoperta cambia il viaggio.');
    await page.getByRole('button', { name: 'Disable Learning Mode' }).click();
    await page.bringToFront();
    await extensionPage.bringToFront();
    await extensionPage.reload();
    await extensionPage.getByRole('button', { name: 'Enable Learning Mode' }).click();
    await page.bringToFront();
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toBeVisible();
    const saved = page.locator('[data-lexync-saved="true"]', { hasText: 'scoperta' }).first();
    await expect(saved).toBeVisible();
    await saved.hover();
    await expect(page.getByRole('tooltip')).toContainText('відкриття');
    await saved.click();
    await expect(page.getByRole('dialog', { name: 'Saved expression' })).toContainText('відкриття');
    await expect(page.getByRole('tooltip', { name: /Click to add/i })).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');
  });

  test('disables Learning Mode from the page status control and keeps it off after reload', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createStudyPair(learnerClient);
    await extensionPage.close();
    const page = await openReadingPage(extensionContext, '/status-disable');

    await enableOnPage(page);
    const disableButton = page.getByRole('button', { name: 'Disable Learning Mode' });
    await expect(disableButton).toHaveText('Learning Mode is on');
    await disableButton.click();
    await expect(disableButton).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Learning Mode' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveCount(0);
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
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "meraviglia"');
    await page.locator('#unknown').click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await capture.getByLabel('Translation').fill('wonder');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(page.locator('[data-lexync-saved="true"]', { hasText: 'meraviglia' })).toBeVisible();
    await page.locator('#second-unknown').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "cammino"');
    await page.locator('#second-unknown').click();
    await capture.getByRole('button', { name: 'Cancel' }).click();
    await page.locator('#plain-sentence').hover({ position: { x: 20, y: 10 } });
    await expect(page.getByRole('tooltip')).toHaveText('Click to add "curiosità"');

    const popup = await extensionContext.newPage();
    const id = await extensionId(extensionContext);
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByRole('button', { name: 'Disable Learning Mode' }).click();
    await expect(page.locator('[data-lexync-saved="true"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveCount(0);
    await popup.getByRole('button', { name: 'Enable Learning Mode' }).click();
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');

    await extensionContext.route('http://127.0.0.1:54321/rest/v1/**', (route) => route.abort());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveText('Learning Mode is on');
    await expect(page.locator('[data-lexync-saved="true"]').first()).toHaveText('scoperta');

    await popup.reload();
    await popup.getByRole('button', { name: 'Disable Learning Mode' }).click();
    await expect(page.locator('[data-lexync-saved="true"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Add / })).toHaveCount(0);
  });
});
