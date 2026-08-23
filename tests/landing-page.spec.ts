import { expect, test } from '@playwright/test';

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
});
