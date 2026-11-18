import { expect, extensionId, test } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { glob, readFile } from 'node:fs/promises';
import { themedSelect, themedSelectListbox } from '../support/select';

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
  expect(source.replace(/\s/g, '').toLowerCase()).toContain('#00207c');
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

async function expectVisibleFocusIndicator(locator: ReturnType<Page['locator']>) {
  const result = await locator.evaluate((element) => {
    const before = getComputedStyle(element);
    (element as HTMLElement).focus();
    const root = element.getRootNode() as Document | ShadowRoot;
    const style = getComputedStyle(element);
    return {
      focused: root.activeElement === element,
      indicator: style.outlineStyle !== 'none' || style.boxShadow !== 'none' || style.borderColor !== before.borderColor,
    };
  });
  expect(result.focused).toBe(true);
  expect(result.indicator).toBe(true);
}

async function expectThemedSelect(page: Page, field: ReturnType<Page['locator']>, label: string, selected: string) {
  await expect(field).toBeVisible();
  await expect(field.locator('select')).toHaveCount(0);
  const trigger = themedSelect(page, label);
  await expect(trigger).toHaveAccessibleName(`${label} ${selected}`);
  await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  const style = await trigger.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderRadius: Number.parseFloat(computed.borderRadius),
      borderWidth: Number.parseFloat(computed.borderTopWidth),
      height: element.getBoundingClientRect().height,
    };
  });
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.borderRadius).toBeGreaterThanOrEqual(8);
  expect(style.borderWidth).toBeGreaterThanOrEqual(1);
  expect(style.height).toBeGreaterThanOrEqual(44);
  await expect(field.locator('[data-ui="select-indicator"]')).toBeVisible();
  await expectVisibleFocusIndicator(trigger);
  await trigger.click();
  const listbox = themedSelectListbox(page, label);
  await expect(listbox).toBeVisible();
  const option = listbox.getByRole('option', { name: selected, exact: true });
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect(option.locator('[data-ui="select-check"]')).toBeVisible();
  const bounds = await listbox.boundingBox();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden();
}

async function selectScheme(select: ReturnType<Page['locator']>) {
  return select.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { backgroundColor: computed.backgroundColor, color: computed.color, colorScheme: computed.colorScheme };
  });
}

async function expectStyledSelect(select: ReturnType<Page['locator']>) {
  await expect(select).toBeVisible();
  const style = await select.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      appearance: computed.getPropertyValue('appearance'),
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      borderRadius: Number.parseFloat(computed.borderRadius),
      borderWidth: Number.parseFloat(computed.borderTopWidth),
      paddingInlineEnd: Number.parseFloat(computed.paddingInlineEnd),
    };
  });
  expect(style.appearance).toBe('none');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.borderRadius).toBeGreaterThanOrEqual(8);
  expect(style.borderWidth).toBeGreaterThanOrEqual(1);
  expect(style.paddingInlineEnd).toBeGreaterThanOrEqual(32);
  await expectVisibleFocusIndicator(select);
}

async function expectWithinViewport(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const elements = page.locator(selector).filter({ visible: true });
    await expect(elements.first()).toBeVisible();
    const bounds = await elements.evaluateAll((targets) => targets.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    for (const bound of bounds) {
      expect(bound.left, `${selector} left edge`).toBeGreaterThanOrEqual(0);
      expect(bound.right, `${selector} right edge`).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    }
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectActionDock(page: Page, hostSelector: string, expression: string, translation: string) {
  const host = page.locator(hostSelector);
  const dock = host.locator('.action-bar');
  await expect(dock).toBeVisible();
  await expect(dock.locator('.context-detail')).toContainText(new RegExp(`${expression}.*${translation}`, 'i'));
  const desktop = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { columns: style.gridTemplateColumns.trim().split(/\s+/).length, width: rect.width, viewport: window.innerWidth };
  });
  if (desktop.viewport >= 520) expect(desktop.columns).toBeGreaterThan(1);
  await page.setViewportSize({ width: 500, height: 800 });
  await expect.poll(() => dock.evaluate((element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
  test('gives the popup task-first grouping, a custom language control, and useful empty state', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.reload();
    const popup = extensionPage.locator('[data-ui="extension-popup"]');
    await expect(popup).toBeVisible();
    await expect(extensionPage.locator('[data-design="popup-command-center"]')).toHaveCount(0);
    await expect(popup.locator('[data-ui="popup-header"]')).toBeVisible();
    await expect(popup.locator('[data-ui="profile-account"]')).toContainText(/learner-/i);
    await expect(popup.locator('[data-ui="task-first-panel"]')).toHaveCount(3);
    await expect(popup.locator('[data-ui="empty-state"]')).toBeVisible();
    await expect(extensionPage.locator('img[src*="dark-on-light"]')).toBeVisible();
    await expectDocumentToken(extensionPage);
    await expectThemedSelect(extensionPage, popup.locator('[data-ui="language-switcher"]'), 'Active Learning Language', 'Italian');
    await expect(extensionPage.locator('select')).toHaveCount(0);
    const sources: string[] = [];
    for await (const file of glob('apps/extension/entrypoints/popup/**/*.tsx')) sources.push(await readFile(String(file), 'utf8'));
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.filter((source) => /<select[\s>]/.test(source))).toHaveLength(0);
    const headingTypography = await popup.getByRole('heading', { level: 2 }).last().evaluate((element) => ({
      actual: getComputedStyle(element).fontFamily,
      expected: getComputedStyle(document.documentElement).getPropertyValue('--lexync-type-family-body'),
    }));
    expect(headingTypography.actual.replace(/["']/g, '')).toContain(headingTypography.expected.split(',')[0].replace(/["']/g, '').trim());
  });

  test('offers a direct setup action instead of an unusable capture field without a language', async ({ extensionPage }) => {
    await expect(extensionPage.getByLabel('Expression')).toHaveCount(0);
    const setup = extensionPage.getByRole('link', { name: /add a learning language/i });
    await expect(setup).toBeVisible();
    await expect(setup).toHaveAttribute('href', /settings/);
  });

  test('keeps popup controls usable at narrow widths and under reduced motion', async ({ extensionPage, learnerClient }) => {
    await createLearningLanguage(learnerClient, 'it');
    await extensionPage.reload();
    await extensionPage.setViewportSize({ width: 420, height: 720 });
    await expect(extensionPage.locator('[data-ui="extension-popup"]')).toBeVisible();
    await expect.poll(() => extensionPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectVisibleFocusIndicator(extensionPage.getByLabel('Expression'));
    await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await extensionPage.evaluate(() => Array.from(document.querySelectorAll('body *')).map((element) => getComputedStyle(element)).filter((style) => style.animationDuration !== '0s' || style.transitionDuration !== '0s').length);
    expect(motion).toBe(0);
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
    await expect(page.locator('#lexync-learning-mode .status-tab')).toBeVisible();
    await expect(page.locator('#lexync-learning-mode .detail-sheet')).toHaveCount(1);
    await expectShadowSurface(page, '#lexync-learning-mode');
    await page.locator('#word').click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture).toBeVisible();
    await expect(page.locator('#lexync-ordinary-capture .capture-sheet')).toBeVisible();
    await expect(capture.locator('header')).toBeVisible();
    await expectStyledSelect(capture.getByLabel('Learning Language'));
    await expect(capture.locator('.actions')).toHaveClass(/sheet-actions/);
    await expectShadowSurface(page, '#lexync-ordinary-capture');
    await expectVisibleFocusIndicator(capture.getByLabel('Translation', { exact: true }));
    await expectVisibleFocusIndicator(modeStatus);
    const modeCard = page.locator('#lexync-learning-mode .card');
    await modeCard.evaluate((element) => { (element as HTMLElement).hidden = false; });
    const modeLabel = modeCard.locator('label').filter({ hasText: 'Learning Language' });
    await modeLabel.evaluate((element) => { (element as HTMLElement).hidden = false; });
    await expectStyledSelect(modeLabel.getByRole('combobox'));
  });

  test('styles the injected selects dark in dark mode without inheriting host page styles', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const learningLanguage = await createLearningLanguage(learnerClient, 'it');
    const page = await openReadingPage(extensionContext);
    await page.addStyleTag({ content: 'select { background: rgb(255, 0, 0) !important; color: rgb(0, 255, 0) !important; color-scheme: light !important; }' });
    await extensionPage.evaluate(([key, languageId]) => chrome.storage.local.set({ [key]: { enabled: true, learningLanguageId: languageId } }), [
      `lexync.learningMode.${new URL(page.url()).origin}`,
      learningLanguage.id,
    ]);
    await page.emulateMedia({ colorScheme: 'dark' });
    await injectLearningMode(extensionContext, page);
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toBeVisible();
    await page.locator('#word').click();
    const capture = page.getByRole('dialog', { name: 'Capture Expression' });
    await expect(capture).toBeVisible();
    const modeCard = page.locator('#lexync-learning-mode .card');
    await modeCard.evaluate((element) => { (element as HTMLElement).hidden = false; });
    const modeLabel = modeCard.locator('label').filter({ hasText: 'Learning Language' });
    await modeLabel.evaluate((element) => { (element as HTMLElement).hidden = false; });
    const selects = [capture.getByLabel('Learning Language'), modeLabel.getByRole('combobox')];

    const dark = { backgroundColor: 'rgb(19, 26, 46)', color: 'rgb(233, 236, 247)', colorScheme: 'dark' };
    for (const select of selects) {
      await expect.poll(() => selectScheme(select)).toEqual(dark);
      await expectStyledSelect(select);
    }

    await page.emulateMedia({ colorScheme: 'light' });
    await page.addStyleTag({ content: ':root { color-scheme: dark; }' });
    const light = { backgroundColor: 'rgb(255, 255, 255)', color: 'rgb(21, 33, 63)', colorScheme: 'light' };
    for (const select of selects) await expect.poll(() => selectScheme(select)).toEqual(light);

    const hostSelect = await page.evaluate(() => {
      const computed = getComputedStyle(document.body.appendChild(document.createElement('select')));
      return { backgroundColor: computed.backgroundColor, colorScheme: computed.colorScheme };
    });
    expect(hostSelect).toEqual({ backgroundColor: 'rgb(255, 0, 0)', colorScheme: 'light' });
  });

  test('keeps ordinary capture and Learning Mode inside an RTL tablet viewport', async ({
    extensionContext,
    extensionPage,
    learnerClient,
  }) => {
    const learningLanguage = await createLearningLanguage(learnerClient, 'it');
    const page = await openReadingPage(extensionContext);
    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await extensionPage.evaluate(([key, languageId]) => chrome.storage.local.set({ [key]: { enabled: true, learningLanguageId: languageId } }), [
      `lexync.learningMode.${new URL(page.url()).origin}`,
      learningLanguage.id,
    ]);
    await page.setViewportSize({ width: 768, height: 900 });
    await injectLearningMode(extensionContext, page);
    await expect(page.getByRole('button', { name: 'Disable Learning Mode' })).toBeVisible();
    await expectWithinViewport(page, ['#lexync-learning-mode .mode-status']);
    await page.locator('#word').click();
    await expect(page.getByRole('dialog', { name: 'Capture Expression' })).toBeVisible();
    await expectWithinViewport(page, ['#lexync-learning-mode .mode-status', '#lexync-ordinary-capture .dialog']);
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
    await expect(host.locator('.action-bar')).toBeVisible();
    await expect(host.locator('.action-bar')).toContainText('Save to Lexync');
    await expectActionDock(page, '#lexync-duolingo-capture', 'renard', 'fox');
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
    await expect(host.locator('.action-bar')).toBeVisible();
    await expect(host.locator('.action-bar')).toContainText('Add to Lexync');
    await expectActionDock(page, '#lexync-clozemaster-capture', 'gatto', 'cat');
    await expectShadowSurface(page, '#lexync-clozemaster-capture');
    await add.focus();
    await expect(add).toBeFocused();
    await add.click();
    await expect(host.getByRole('status')).toBeVisible();
  });
});
