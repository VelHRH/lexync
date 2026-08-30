import { expect, type Locator, type Page } from '@playwright/test';

export async function expectBrandArtwork(link: Locator, assetName: string) {
  const image = link.locator('img');

  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveJSProperty('complete', true);
  await expect.poll(() => image.evaluate((element) => new URL((element as HTMLImageElement).currentSrc).pathname)).toBe(`/brand/${assetName}`);

  return image.evaluate((element) => {
    const brandImage = element as HTMLImageElement;

    return {
      naturalWidth: brandImage.naturalWidth,
      naturalHeight: brandImage.naturalHeight,
      width: brandImage.getBoundingClientRect().width,
      height: brandImage.getBoundingClientRect().height,
    };
  });
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

export async function expectBrandMetadata(page: Page) {
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
}
