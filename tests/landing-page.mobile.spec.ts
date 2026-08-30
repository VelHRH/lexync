import { expect, test, type Locator } from '@playwright/test';

async function expectCompactBrand(link: Locator, assetName: string) {
  const image = link.locator('img');

  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', '');
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

  expect(dimensions.naturalWidth).toBe(dimensions.naturalHeight);
  expect(dimensions.width).toBeCloseTo(dimensions.height, 1);
}

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

  await expectCompactBrand(page.getByRole('link', { name: 'Lexync home' }), 'mark-dark-on-light.png');
  await expectCompactBrand(page.getByRole('link', { name: 'Back to the top' }), 'mark-light-on-dark.png');
});
