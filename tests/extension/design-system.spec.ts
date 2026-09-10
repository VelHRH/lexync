import { expect, extensionId, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

async function createLearningLanguage(learnerClient: SupabaseClient, languageTag: string) {
  const { data, error } = await learnerClient.rpc('create_learning_language', { p_language_tag: languageTag });
  if (error) throw error;
  return data;
}

async function expectDocumentToken(page: Page) {
  const source = await page.evaluate(() => Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
    } catch {
      return '';
    }
  }).join('\n'));
  expect(source.replace(/\s/g, '').toLowerCase()).toContain('#6429f4');
}

async function expectShadowSurface(page: Page, hostSelector: string) {
  const host = page.locator(hostSelector);
  await expect(host.locator('button:visible, input:visible, select:visible, textarea:visible, [role="dialog"]:not([hidden]):visible').first()).toBeVisible();
  const details = await host.evaluate((element) => {
    const root = element.shadowRoot;
    const style = root?.querySelector('style')?.textContent ?? '';
    const control = root?.querySelector<HTMLElement>('button, input, select, textarea');
    if (!control) return { computed: '', customProperties: [], style };
    const computed = getComputedStyle(control);
    const customProperties = Array.from(computed).filter((property) => property.startsWith('--')).map((property) => [property, computed.getPropertyValue(property)]);
    return { computed: `${computed.backgroundColor} ${computed.color}`, customProperties, style };
  });
  expect(details.style).toMatch(/var\(--[^)]*(?:primary|brand)/i);
  expect(details.customProperties.some(([name, value]) => /primary|brand/i.test(name) && value.trim())).toBe(true);
  expect(details.computed).not.toMatch(/25,\s*37,\s*30|243,\s*240,\s*231/i);
}

async function openReadingPage(context: BrowserContext, path = '/reading'): Promise<Page> {
  const origin = 'http://learning-mode.test';
  await context.route(`${origin}${path}`, (route) => route.fulfill({
    body: `<!doctype html><html lang="en"><head><title>Controlled reading</title></head><body><p>La <span id="word">scoperta</span> apre una strada nuova. Ogni scoperta cambia il viaggio e rende la giornata interessante.</p><p><label><input id="page-checkbox" type="checkbox"> <span id="unknown">meraviglia</span> accompagna il <span id="second-unknown">cammino</span> ogni giorno.</label></p><p id="plain-sentence">curiosità accompagna ogni lettore lungo questa strada.</p></body></html>`,
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto(`${origin}${path}`);
  return page;
}

async function openDuolingoPage(context: BrowserContext): Promise<Page> {
  await context.route('https://www.duolingo.com/lesson/design-system', (route) => route.fulfill({
    body: '<!doctype html><html lang="it"><body><main data-lexync-duolingo-lesson data-lexync-target-language="fr" data-lexync-reference-language="en"><p data-lexync-expression>renard</p><p data-lexync-translation>fox</p></main></body></html>',
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('https://www.duolingo.com/lesson/design-system');
  return page;
}

async function openClozemasterPage(context: BrowserContext): Promise<Page> {
  await context.route('https://www.clozemaster.com/design-system', (route) => route.fulfill({
    body: '<!doctype html><html lang="it"><body><main data-lexync-clozemaster-lesson data-lexync-target-language="it" data-lexync-reference-language="en"><p data-lexync-expression>gatto</p><p data-lexync-translation>cat</p><p data-lexync-example>Il gatto dorme.</p></main></body></html>',
    contentType: 'text/html',
  }));
  const page = await context.newPage();
  await page.goto('https://www.clozemaster.com/design-system');
  return page;
}

async function injectLearningMode(context: BrowserContext, page: Page) {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(async (url) => {
    const target = (await chrome.tabs.query({ url: `${new URL(url).origin}/*` })).find((tab) => tab.id);
    if (!target?.id) throw new Error('The controlled reading tab is unavailable.');
    await chrome.scripting.executeScript({ files: ['/learning-mode.js'], target: { tabId: target.id } });
  }, page.url());
}

test.describe('extension design system surfaces', () => {
  test('gives the popup a canonical token, identity grouping, focus, and language state', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.reload();
    await expect(extensionPage.locator('header')).toContainText(/learner-/i);
    await expect(extensionPage.getByLabel('Active Learning Language')).toBeVisible();
    await expect(extensionPage.locator('img[src*="dark-on-light"]')).toBeVisible();
    await expectDocumentToken(extensionPage);
    const control = extensionPage.getByLabel('Active Learning Language');
    await control.focus();
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-label', 'Active Learning Language');
  });

  test('keeps the auth callback status and password controls semantic and focusable', async ({ extensionContext }) => {
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`http://127.0.0.1:3000/auth/callback?extension_id=${id}&error=access_denied&error_description=Authentication%20was%20cancelled.`);
    await expect(page).toHaveURL(new RegExp(`^chrome-extension://${id}/auth-callback.html`));
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.locator('img[alt="Lexync"]')).toBeVisible();
    await expectDocumentToken(page);
    await page.evaluate(() => {
      const form = document.querySelector('form');
      if (form) form.hidden = false;
    });
    await page.getByLabel('New password', { exact: true }).focus();
    await expect(page.getByLabel('New password', { exact: true })).toBeFocused();
  });

  test('uses the token and semantic dialog states for ordinary capture and Learning Mode', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const learningLanguage = await createLearningLanguage(learnerClient, 'it');
    const page = await openReadingPage(extensionContext);
    await extensionPage.evaluate(([key, languageId]) => chrome.storage.local.set({ [key]: { enabled: true, learningLanguageId: languageId } }), [
      `lexync.learningMode.${new URL(page.url()).origin}`,
      learningLanguage.id,
    ]);
    await page.reload();
    await injectLearningMode(extensionContext, page);
    const modeStatus = page.getByRole('button', { name: 'Disable Learning Mode' });
    await expect(modeStatus).toBeVisible();
    await expectShadowSurface(page, '#lexync-learning-mode');
    await page.locator('#word').click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture).toBeVisible();
    await expectShadowSurface(page, '#lexync-ordinary-capture');
    await capture.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(capture.getByText('Translation is required.')).toBeVisible();
    await expect(capture.locator('[role="alert"], .error')).toHaveCount(1);
    await capture.getByLabel('Translation').focus();
    await expect(capture.getByLabel('Translation')).toBeFocused();
  });

  test('uses the token and semantic status state in the Duolingo Shadow DOM adapter', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createLearningLanguage(learnerClient, 'fr');
    await extensionPage.close();
    const page = await openDuolingoPage(extensionContext);
    const host = page.locator('#lexync-duolingo-capture');
    const save = host.getByRole('button', { name: 'Save to Lexync' });
    await expect(save).toBeVisible();
    await expectShadowSurface(page, '#lexync-duolingo-capture');
    await save.focus();
    await expect(save).toBeFocused();
    await save.click();
    await expect(host.getByRole('status')).toBeVisible();
  });

  test('uses the token and semantic status state in the Clozemaster Shadow DOM adapter', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.close();
    const page = await openClozemasterPage(extensionContext);
    const host = page.locator('#lexync-clozemaster-capture');
    const add = host.getByRole('button', { name: 'Add to Lexync' });
    await expect(add).toBeVisible();
    await expectShadowSurface(page, '#lexync-clozemaster-capture');
    await add.focus();
    await expect(add).toBeFocused();
    await add.click();
    await expect(host.getByRole('status')).toBeVisible();
  });
});
