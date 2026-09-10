import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

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
  return client;
}

async function signIn(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/auth/sign-in');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL('/');
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    scrollWidth: expect.any(Number),
  }));
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
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
  expect(values.map((value) => value.replace(/\s/g, '').toLowerCase())).toContain('#6429f4');
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
  test('presents the public and auth surfaces with canonical artwork and semantic controls', async ({ page }) => {
    await page.goto('/');
    const homeLink = page.getByRole('link', { name: 'Lexync home' });
    await expect(homeLink).toBeVisible();
    const homeArtwork = homeLink.locator('img');
    await expect(homeArtwork).toBeVisible();
    const expectedArtwork = (page.viewportSize()?.width ?? 0) <= 560 ? 'mark-dark-on-light.png' : 'wordmark-dark-on-light.png';
    await expect.poll(() => homeArtwork.evaluate((element) => new URL((element as HTMLImageElement).currentSrc).pathname)).toBe(`/brand/${expectedArtwork}`);
    await expectPrimaryToken(page);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/auth/sign-in');
    await expect(page.getByRole('heading', { name: /sign in|welcome back/i })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    const email = page.getByLabel('Email');
    await email.focus();
    await expect(email).toBeFocused();
    const focusStyle = await email.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none' || style.borderColor !== getComputedStyle(element).backgroundColor;
    });
    expect(focusStyle).toBe(true);
  });

  test('groups the active language selector, profile identity, and sign-out controls', async ({ page }) => {
    const account = credentials('web-design-system-identity');
    await register(account, ['es', 'fr']);
    await signIn(page, account);

    const header = page.locator('header').first();
    await expect(header.getByLabel('Active Learning Language')).toBeVisible();
    await expect(header).toContainText(account.email);
    await expect(header.getByRole('button', { name: /sign out/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
    await expectPrimaryToken(page);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page).toHaveURL('/library');
    await expect(page.getByRole('heading', { name: 'Library', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /add vocabulary/i })).toBeVisible();
    await page.getByRole('button', { name: /add vocabulary/i }).click();
    const capture = page.locator('form').filter({ has: page.getByLabel('Expression', { exact: true }) }).last();
    await expect(capture.getByLabel('Translation', { exact: true })).toBeVisible();
    await capture.getByRole('button', { name: /save vocabulary entry|save/i }).click();
    await expect(capture.getByRole('alert')).toBeVisible();
    await capture.getByLabel('Expression', { exact: true }).fill('casa');
    await capture.getByLabel('Translation', { exact: true }).fill('house');
    await capture.getByRole('button', { name: /save vocabulary entry|save/i }).click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.getByRole('link', { name: 'Review', exact: true }).click();
    await expect(page).toHaveURL('/review');
    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();
    await expect(page.locator('main')).toContainText(/Spanish|English|Answer Language|Translation/i);
  });

  test('keeps desktop and mobile public presentation within the viewport', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('main')).toBeVisible();
    const visibleText = await page.locator('body').innerText();
    expect(visibleText).toContain('Lexync');
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
