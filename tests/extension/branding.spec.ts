import { expect, extensionId, test } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectHighDensityArtwork(image: Locator): Promise<void> {
  const dimensions = await image.evaluate((element: HTMLImageElement) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    naturalHeight: element.naturalHeight,
    naturalWidth: element.naturalWidth,
  }));

  expect(dimensions.naturalWidth).toBeGreaterThanOrEqual(dimensions.clientWidth * 2);
  expect(dimensions.naturalHeight).toBeGreaterThanOrEqual(dimensions.clientHeight * 2);
}

test.describe('Chromium extension branding', () => {
  test('installs the purple Lexync mark at extension and toolbar icon sizes', async ({ extensionPage }) => {
    const manifest = await extensionPage.evaluate(() => chrome.runtime.getManifest());

    expect(manifest.icons).toEqual({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    });
    expect(manifest.action?.default_icon).toEqual({
      16: 'icons/icon-16.png',
      24: 'icons/icon-24.png',
      32: 'icons/icon-32.png',
    });

    const iconSizes = await extensionPage.evaluate(async (paths) => Promise.all(paths.map((iconPath) => new Promise<{
      height: number;
      path: string;
      width: number;
    }>((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve({
        height: image.naturalHeight,
        path: iconPath,
        width: image.naturalWidth,
      }));
      image.addEventListener('error', () => reject(new Error(`Could not decode ${iconPath}`)));
      image.src = chrome.runtime.getURL(iconPath);
    }))), [
      'icons/icon-16.png',
      'icons/icon-24.png',
      'icons/icon-32.png',
      'icons/icon-48.png',
      'icons/icon-128.png',
    ]);

    expect(iconSizes).toEqual([
      { height: 16, path: 'icons/icon-16.png', width: 16 },
      { height: 24, path: 'icons/icon-24.png', width: 24 },
      { height: 32, path: 'icons/icon-32.png', width: 32 },
      { height: 48, path: 'icons/icon-48.png', width: 48 },
      { height: 128, path: 'icons/icon-128.png', width: 128 },
    ]);
  });

  test('uses the full wordmark in the signed-out popup', async ({ extensionContext }) => {
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    const brand = page.getByRole('img', { name: 'Lexync' });

    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('src', /wordmark-dark-on-light/);
    await expect(page.getByText('Lx', { exact: true })).toHaveCount(0);
    await expectHighDensityArtwork(brand);
  });

  test('uses the compact mark in the authenticated popup', async ({ extensionPage }) => {
    const brand = extensionPage.getByRole('img', { name: 'Lexync' });

    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('src', /mark-dark-on-light/);
    await expect(extensionPage.getByText('Lx', { exact: true })).toHaveCount(0);
    await expectHighDensityArtwork(brand);
  });

  test('uses the full wordmark on the authentication callback surface', async ({ extensionContext }) => {
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/auth-callback.html?error=access_denied&error_description=Authentication%20was%20cancelled.`);
    const brand = page.getByRole('img', { name: 'Lexync' });

    await expect(page.getByRole('status')).toHaveText('Authentication was cancelled.');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('src', /wordmark-dark-on-light/);
    await expect(page.getByText('Lx', { exact: true })).toHaveCount(0);
    await expectHighDensityArtwork(brand);
  });
});
