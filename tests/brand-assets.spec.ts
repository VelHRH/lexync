import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, cp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const brandRoot = path.resolve('assets/brand');
const catalogPath = path.join(brandRoot, 'catalog.json');

type BrandAsset = {
  id: string;
  role: string;
  intendedBackground: string;
  path: string;
  width: number;
  height: number;
  sha256: string;
  master: boolean;
  platform?: string;
  alpha: boolean;
  contentBox?: { x: number; y: number; width: number; height: number };
};

type BrandCatalog = {
  version: number;
  primaryIcon: string;
  assets: BrandAsset[];
};

async function readCatalog(root = brandRoot) {
  return JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8')) as BrandCatalog;
}

async function decodeImage(page: Page, filePath: string) {
  const source = `data:image/png;base64,${(await readFile(filePath)).toString('base64')}`;

  return page.evaluate(async (imageSource) => {
    const image = new Image();
    image.src = imageSource;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is unavailable');
    }

    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const corners = [
      0,
      (canvas.width - 1) * 4,
      (canvas.width * (canvas.height - 1)) * 4,
      (canvas.width * canvas.height - 1) * 4,
    ].map((offset) => ({
      red: pixels[offset],
      green: pixels[offset + 1],
      blue: pixels[offset + 2],
      alpha: pixels[offset + 3],
    }));

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      corners,
      contentBox: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    };
  }, source);
}

async function validate(root: string) {
  return execFileAsync(process.execPath, ['scripts/validate-brand-assets.mjs', '--root', root], {
    cwd: path.resolve('.'),
  });
}

test.describe('canonical Lexync brand assets', () => {
  test('assigns every supplied master a semantic role and preserves it exactly', async ({ page }) => {
    const catalog = await readCatalog();
    const masters = catalog.assets.filter((asset) => asset.master);

    expect(catalog.primaryIcon).toBe('icon-primary-purple');
    expect(masters.map((asset) => asset.id).sort()).toEqual([
      'icon-primary-purple',
      'mark-dark-on-light',
      'mark-light-on-dark',
      'wordmark-dark-on-light',
      'wordmark-light-on-dark',
    ]);
    expect(masters.map((asset) => asset.path)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/[0-9a-f]{8}-[0-9a-f-]{27}\.png$/)]),
    );

    for (const asset of masters) {
      const decoded = await decodeImage(page, path.join(brandRoot, asset.path));
      expect(decoded.width, asset.id).toBe(asset.width);
      expect(decoded.height, asset.id).toBe(asset.height);
      expect(asset.sha256, asset.id).toMatch(/^[0-9a-f]{64}$/);
    }

    await expect(validate(brandRoot)).resolves.toMatchObject({ stdout: expect.stringContaining('Brand assets are valid') });
  });

  test('provides light and dark marks and wordmarks for contrasting backgrounds', async () => {
    const catalog = await readCatalog();
    const roles = new Map(catalog.assets.filter((asset) => asset.master).map((asset) => [asset.id, asset]));

    expect(roles.get('mark-dark-on-light')?.intendedBackground).toBe('light');
    expect(roles.get('wordmark-dark-on-light')?.intendedBackground).toBe('light');
    expect(roles.get('mark-light-on-dark')?.intendedBackground).toBe('dark');
    expect(roles.get('wordmark-light-on-dark')?.intendedBackground).toBe('dark');
  });

  test('provides distortion-free platform variants with role-specific geometry', async ({ page }) => {
    const catalog = await readCatalog();
    const variants = catalog.assets.filter((asset) => !asset.master);
    const chromiumSizes = variants
      .filter((asset) => asset.platform === 'chromium')
      .map((asset) => asset.width)
      .sort((left, right) => left - right);

    expect(chromiumSizes).toEqual([16, 24, 32, 48, 128]);

    for (const asset of variants) {
      const decoded = await decodeImage(page, path.join(brandRoot, asset.path));
      expect(decoded.width, asset.id).toBe(asset.width);
      expect(decoded.height, asset.id).toBe(asset.height);

      if (asset.role !== 'social-sharing-image') {
        expect(decoded.width, asset.id).toBe(decoded.height);
      }

      if (asset.platform === 'chromium') {
        expect(decoded.corners.every((corner) => corner.alpha === 0), asset.id).toBe(true);
      }

      if (asset.contentBox) {
        expect(decoded.contentBox, asset.id).toEqual(asset.contentBox);
      }

      if (!asset.alpha) {
        expect(decoded.corners.every((corner) => corner.alpha === 255), asset.id).toBe(true);
        expect(
          decoded.corners.every((corner) => corner.red > 32 || corner.green > 32 || corner.blue > 32),
          asset.id,
        ).toBe(true);
      }
    }
  });

  test('rejects missing, incorrectly sized, malformed, and altered assets', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'lexync-brand-assets-'));

    try {
      await cp(brandRoot, fixtureRoot, { recursive: true });
      const catalog = await readCatalog(fixtureRoot);
      const target = catalog.assets.find((asset) => !asset.master);

      expect(target).toBeDefined();
      const targetPath = path.join(fixtureRoot, target!.path);
      const original = await readFile(targetPath);

      await rm(targetPath);
      await expect(validate(fixtureRoot)).rejects.toMatchObject({ stderr: expect.stringContaining('Missing asset') });

      await writeFile(targetPath, original.subarray(0, 32));
      await expect(validate(fixtureRoot)).rejects.toMatchObject({ stderr: expect.stringContaining('Malformed PNG') });

      await writeFile(targetPath, original);
      const targetIndex = catalog.assets.findIndex((asset) => asset.id === target!.id);
      const [removedTarget] = catalog.assets.splice(targetIndex, 1);
      await writeFile(path.join(fixtureRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
      await expect(validate(fixtureRoot)).rejects.toMatchObject({
        stderr: expect.stringContaining('Missing required catalog entry'),
      });

      catalog.assets.splice(targetIndex, 0, removedTarget);
      await writeFile(path.join(fixtureRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
      await sharp(original).resize(target!.width + 1, target!.height, { fit: 'fill' }).png().toFile(targetPath);
      await expect(validate(fixtureRoot)).rejects.toMatchObject({ stderr: expect.stringContaining('Incorrect dimensions') });

      await writeFile(targetPath, original);
      const master = catalog.assets.find((asset) => asset.master)!;
      const masterPath = path.join(fixtureRoot, master.path);
      const altered = Buffer.concat([await readFile(masterPath), Buffer.from([0])]);
      await writeFile(masterPath, altered);
      await expect(validate(fixtureRoot)).rejects.toMatchObject({ stderr: expect.stringContaining('Checksum mismatch') });
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
