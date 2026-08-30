import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectUndistortedBrand(link: Locator, assetName: string) {
  const image = link.locator('img');

  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => new URL((element as HTMLImageElement).currentSrc).pathname)).toBe(`/brand/${assetName}`);
  const dimensions = await image.evaluate((element) => {
    const brandImage = element as HTMLImageElement;

    return {
      naturalWidth: brandImage.naturalWidth,
      naturalHeight: brandImage.naturalHeight,
      width: brandImage.getBoundingClientRect().width,
      height: brandImage.getBoundingClientRect().height,
    };
  });

  expect(dimensions.naturalWidth).toBeGreaterThan(0);
  expect(dimensions.naturalHeight).toBeGreaterThan(0);
  expect(dimensions.width / dimensions.height).toBeCloseTo(dimensions.naturalWidth / dimensions.naturalHeight, 2);
}

async function expectPng(page: Page, href: string, width: number, height: number) {
  const assetPath = new URL(href, page.url()).pathname;
  const response = await page.request.get(assetPath);

  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  await expect.poll(() => page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, assetPath)).toEqual({ width, height });
}

test.describe('Lexync public landing page', () => {
  test('explains the private learning loop without authentication', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Keep the words you choose.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capture with intention' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stay in sync' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Practice offline' })).toBeVisible();
  });

  test('distinguishes the extension and iPhone app from the public website', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Chromium extension' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'iPhone app' })).toBeVisible();
    await expect(page.getByText('This website is the front door, not another study surface.')).toBeVisible();
  });

  test('uses canonical wordmarks on light and dark surfaces without distortion', async ({ page }) => {
    await page.goto('/');

    const home = page.getByRole('link', { name: 'Lexync home' });
    const backToTop = page.getByRole('link', { name: 'Back to the top' });

    await expectUndistortedBrand(home, 'wordmark-dark-on-light.png');
    await expectUndistortedBrand(backToTop, 'wordmark-light-on-dark.png');
    await expect(home.getByRole('img')).toHaveCount(0);
    await expect(backToTop.getByRole('img')).toHaveCount(0);
  });

  test('publishes canonical browser, touch, and social metadata', async ({ page }) => {
    await page.goto('/');

    const icon = await page.locator('link[rel="icon"]').getAttribute('href');
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const openGraphImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute('content');

    expect(new URL(icon!, page.url()).pathname).toBe('/brand/favicon.png');
    expect(new URL(touchIcon!, page.url()).pathname).toBe('/brand/apple-touch-icon.png');
    expect(new URL(openGraphImage!, page.url()).pathname).toBe('/brand/social-preview.png');
    expect(twitterImage).toBe(openGraphImage);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', 'Lexync — Keep the words you choose');
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expectPng(page, icon!, 48, 48);
    await expectPng(page, touchIcon!, 180, 180);
    await expectPng(page, openGraphImage!, 1200, 630);
  });
});
