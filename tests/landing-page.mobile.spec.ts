import { expect, test } from '@playwright/test';
import { expectBrandArtwork, expectBrandMetadata } from './landing-page-branding';

test('keeps the public story usable on a mobile screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Keep the words you choose.' })).toBeInViewport();
  await page.getByRole('heading', { name: 'A quieter way to build fluency.' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'A quieter way to build fluency.' })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Chromium extension' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iPhone app' })).toBeVisible();
});

test('uses compact canonical fox marks on mobile surfaces', async ({ page }) => {
  await page.goto('/');

  const lightDimensions = await expectBrandArtwork(page.getByRole('link', { name: 'Lexync home' }), 'mark-dark-on-light.png');
  const darkDimensions = await expectBrandArtwork(page.getByRole('link', { name: 'Back to the top' }), 'mark-light-on-dark.png');

  expect(lightDimensions.naturalWidth).toBe(lightDimensions.naturalHeight);
  expect(lightDimensions.width).toBeCloseTo(lightDimensions.height, 1);
  expect(darkDimensions.naturalWidth).toBe(darkDimensions.naturalHeight);
  expect(darkDimensions.width).toBeCloseTo(darkDimensions.height, 1);
});

test('publishes canonical browser, touch, and social metadata on mobile', async ({ page }) => {
  await page.goto('/');

  await expectBrandMetadata(page);
});
