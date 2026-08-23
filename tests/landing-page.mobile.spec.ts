import { expect, test } from '@playwright/test';

test('keeps the public story usable on a mobile screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Keep the words you choose.' })).toBeInViewport();
  await page.getByRole('heading', { name: 'A quieter way to build fluency.' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'A quieter way to build fluency.' })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Chromium extension' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'iPhone app' })).toBeVisible();
});
