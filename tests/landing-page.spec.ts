import { expect, test } from '@playwright/test';
import { expectBrandArtwork, expectBrandMetadata } from './landing-page-branding';

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

    const lightDimensions = await expectBrandArtwork(home, 'wordmark-dark-on-light.png');
    const darkDimensions = await expectBrandArtwork(backToTop, 'wordmark-light-on-dark.png');

    expect(lightDimensions.naturalWidth).toBeGreaterThan(0);
    expect(lightDimensions.naturalHeight).toBeGreaterThan(0);
    expect(lightDimensions.width / lightDimensions.height).toBeCloseTo(lightDimensions.naturalWidth / lightDimensions.naturalHeight, 2);
    expect(darkDimensions.width / darkDimensions.height).toBeCloseTo(darkDimensions.naturalWidth / darkDimensions.naturalHeight, 2);
    await expect(home.getByRole('img')).toHaveCount(0);
    await expect(backToTop.getByRole('img')).toHaveCount(0);
  });

  test('publishes canonical browser, touch, and social metadata', async ({ page }) => {
    await page.goto('/');

    await expectBrandMetadata(page);
  });
});
