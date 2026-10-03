import { createClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials(prefix = 'web-design-system') {
  return {
    email: `${prefix}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function register(account: ReturnType<typeof credentials>, languages = ['es']) {
  if (!supabasePublishableKey) throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required.');
  const client = createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: account.email, password: account.password });
  if (error || !data.session) throw error ?? new Error('The local learner session is missing.');
  for (const language of languages) {
    const result = await client.rpc('create_learning_language', { p_language_tag: language });
    if (result.error) throw result.error;
  }
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectPrimaryToken(page: Page) {
  const values = await page.evaluate(() => Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules).flatMap((rule) => {
        if (!('style' in rule)) return [];
        return Array.from((rule as CSSStyleRule).style).map((property) => (rule as CSSStyleRule).style.getPropertyValue(property));
      });
    } catch {
      return [];
    }
  }));
  expect(values.map((value) => value.replace(/\s/g, '').toLowerCase())).toContain('#00207c');
}

async function expectFocusIndicator(locator: Locator) {
  const before = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow, borderColor: style.borderColor };
  });
  await locator.focus();
  await expect(locator).toBeFocused();
  const indicator = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow, borderColor: style.borderColor };
  });
  expect(indicator.outlineStyle !== 'none' || indicator.boxShadow !== 'none' || indicator.borderColor !== before.borderColor).toBe(true);
}

async function expectCustomSelect(field: Locator) {
  await expect(field).toBeVisible();
  const select = field.getByLabel('Active Learning Language');
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
  const indicator = field.locator('[data-ui="select-indicator"]');
  if (await indicator.count()) await expect(indicator).toBeVisible();
  else expect(style.backgroundImage).not.toBe('none');
  await expectFocusIndicator(select);
}

async function expectCompactSelect(field: Locator) {
  await expect(field).toBeVisible();
  const select = field.getByLabel('Active Learning Language');
  await expect(select).toBeVisible();
  const style = await select.evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      appearance: computed.getPropertyValue('appearance'),
      backgroundColor: computed.backgroundColor,
      borderRadius: Number.parseFloat(computed.borderRadius),
      borderWidth: Number.parseFloat(computed.borderTopWidth),
      height: rect.height,
      width: rect.width,
    };
  });
  expect(style.appearance).toBe('none');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.borderRadius).toBeGreaterThanOrEqual(8);
  expect(style.borderWidth).toBeGreaterThanOrEqual(1);
  expect(style.height).toBeGreaterThanOrEqual(40);
  expect(style.width).toBeGreaterThanOrEqual(32);
  await expect(field.locator('[data-ui="select-indicator"]')).toBeHidden();
  await expectFocusIndicator(select);
}

async function contrastRatio(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/);
      if (!match) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
    };
    const luminance = (value: number[]) => value.slice(0, 3).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    let current: Element | null = element;
    const foreground = parse(getComputedStyle(element).color);
    let background: number[] | null = null;
    while (current && !background) {
      const candidate = parse(getComputedStyle(current).backgroundColor);
      if (candidate && candidate[3] > 0) background = candidate;
      current = current.parentElement;
    }
    if (!foreground || !background) return null;
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  });
}

test.describe('web design system surfaces', () => {
  test('presents the fox-led public and auth visual contract with a capture loop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-ui="public-front-door"]')).toBeVisible();
    await expect(page.locator('[data-design="editorial-landing"]')).toHaveCount(0);
    await expect(page.locator('.hero-split')).toHaveCount(0);
    await expect(page.locator('[data-ui="fox-hero"]')).toBeVisible();
    await expect(page.locator('.hero-artwork-note')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Android app' })).toBeVisible();
    await expect(page.getByText(/iPhone/i)).toHaveCount(0);
    const loop = page.locator('[data-ui="learning-loop"]');
    await expect(loop).toBeVisible();
    for (const step of ['capture', 'sync', 'review']) await expect(loop.locator(`[data-loop="${step}"]`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/auth/sign-in');
    const auth = page.locator('[data-ui="auth-surface"]');
    await expect(auth).toBeVisible();
    await expect(page.locator('[data-design="auth-split"]')).toHaveCount(0);
    await expect(auth.locator('[data-ui="auth-fox-panel"]')).toBeVisible();
    await expect(auth.locator('[data-ui="auth-form-card"]')).toBeVisible();
    await expectFocusIndicator(page.getByLabel('Email'));
    await expectPrimaryToken(page);
  });

  test('gives password recovery the same non-editorial auth surface', async ({ page }) => {
    await page.goto('/auth/reset-password');
    const auth = page.locator('[data-ui="auth-surface"]');
    await expect(auth).toBeVisible();
    await expect(auth.locator('[data-ui="auth-fox-panel"]')).toBeVisible();
    await expect(auth.locator('[data-ui="auth-form-card"]')).toBeVisible();
    await expect(page.locator('[data-design="auth-recovery"]')).toHaveCount(0);
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Confirm new password')).toBeVisible();
    await expectFocusIndicator(page.getByLabel('New password', { exact: true }));
    await expectNoHorizontalOverflow(page);
  });

  test('carries brand, language, and account in one collapsible sidebar with no separate header', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    const account = credentials('web-design-system-sidebar');
    await register(account, ['es', 'fr']);
    await signIn(page, account);
    const shell = page.locator('[data-ui="product-shell"]');
    const sidebar = shell.locator('[data-ui="product-sidebar"]');
    await expect(shell).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(shell.locator('[data-ui="product-header"]')).toHaveCount(0);

    const language = sidebar.locator('[data-ui="language-switcher"]');
    const profile = sidebar.locator('[data-ui="profile-account"]');
    await expect(sidebar.locator('[data-ui="header-brand"]')).toBeVisible();
    await expect(language).toBeVisible();
    await expect(profile).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /profile/i })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /sign out/i })).toHaveCount(0);
    await expect(sidebar.getByText(/Active Learning Language/)).toHaveCount(0);

    const expanded = await sidebar.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: Math.round(element.getBoundingClientRect().height) }));
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(expanded.height).toBeGreaterThanOrEqual(viewportHeight - 1);

    await sidebar.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect.poll(async () => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(expanded.width);
    await expect(sidebar.getByRole('link', { name: 'Library', exact: true })).toBeVisible();
    await sidebar.locator('.app-sidebar-top').hover();
    await sidebar.getByRole('button', { name: 'Expand navigation' }).click();
    await expect.poll(async () => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(expanded.width);

    await expectCustomSelect(language);
    await expectNoHorizontalOverflow(page);
  });

  test('keeps one content measure so every block on a surface shares an edge', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const account = credentials('web-design-system-measure');
    await register(account, ['es']);
    await signIn(page, account);
    await page.goto('/library');
    const content = page.locator('.app-content');
    await expect(content).toBeVisible();
    await expect(content.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    const readEdges = () => content.evaluate((element) => {
      const own = element.getBoundingClientRect();
      const blocks = Array.from(element.children).map((child) => child.getBoundingClientRect()).filter((rect) => rect.width > 0);
      return { left: own.left, right: own.right, blocks: blocks.map((rect) => ({ left: rect.left, right: rect.right })) };
    });
    await expect.poll(async () => (await readEdges()).blocks.length).toBeGreaterThan(0);
    const edges = await readEdges();
    for (const block of edges.blocks) {
      expect(Math.abs(block.left - edges.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(block.right - edges.right)).toBeLessThanOrEqual(1);
    }
  });

  test('exposes task-first navigation, account grouping, and useful empty states', async ({ page }) => {
    const account = credentials('web-design-system-shell');
    await register(account, ['es']);
    await signIn(page, account);
    const shell = page.locator('[data-ui="product-shell"]');
    await expect(shell).toBeVisible();
    await expect(shell.locator('[data-ui="task-navigation"]')).toBeVisible();
    await shell.locator('[data-ui="profile-account"]').getByRole('link', { name: /profile/i }).click();
    await expect(page).toHaveURL('/profile');
    await expect(page.locator('.app-content')).toContainText(account.email);
    await page.goto('/lessons');
    await expect(page.locator('[data-ui="visual-primitive"]')).not.toHaveCount(0);
    await shell.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.locator('[data-ui="empty-state"]')).toBeVisible();
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('keeps public and authenticated surfaces responsive and accessible', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-ui="public-front-door"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectFocusIndicator(page.getByRole('link', { name: 'Sign in' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.goto('/auth/sign-in');
    const email = page.getByLabel('Email');
    await expect(email).toBeVisible();
    const emailBounds = await email.boundingBox();
    expect(emailBounds?.y).toBeLessThan(844);
  });

  test('keeps every product navigation destination visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const account = credentials('web-design-system-mobile-nav');
    await register(account, ['it']);
    await signIn(page, account);
    const shell = page.locator('[data-ui="product-shell"]');
    const navigation = shell.locator('[data-ui="task-navigation"]');
    for (const name of ['Lessons', 'Materials', 'Library', 'Collections']) {
      const link = navigation.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      const bounds = await link.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(390);
    }
    await expectCompactSelect(shell.locator('[data-ui="language-switcher"]'));
    await expectNoHorizontalOverflow(page);
  });

  test('supports readable contrast, 200 percent text scaling, and reduced motion', async ({ page }) => {
    await page.goto('/');
    const bodyContrast = await contrastRatio(page, 'body');
    const headingContrast = await contrastRatio(page, 'h1');
    if (bodyContrast !== null) expect(bodyContrast).toBeGreaterThanOrEqual(4.5);
    if (headingContrast !== null) expect(headingContrast).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
      document.body.style.fontSize = '200%';
    });
    await expectNoHorizontalOverflow(page);
    const clipping = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter((element) => {
      const style = getComputedStyle(element);
      return style.overflow === 'hidden' && element.scrollHeight > element.clientHeight;
    }).length);
    expect(clipping).toBe(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => Array.from(document.querySelectorAll('body *')).map((element) => getComputedStyle(element)).filter((style) => style.animationDuration !== '0s' || style.transitionDuration !== '0s').length);
    expect(motion).toBe(0);
  });
});
