import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

async function createExtensionFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lexync-extension-release-'));
  const source = path.join(root, 'extension');
  const baseline = path.join(root, 'manifest-permissions.json');

  await mkdir(path.join(source, 'icons'), { recursive: true });
  await writeFile(path.join(source, 'background.js'), 'globalThis.lexync = true;\n');
  await writeFile(path.join(source, 'icons/icon-16.png'), 'icon');
  await writeFile(path.join(source, 'popup.html'), '<!doctype html><title>Lexync</title>\n');
  await writeFile(path.join(source, 'manifest.json'), `${JSON.stringify({
    manifest_version: 3,
    name: 'Lexync',
    version: '1.2.3',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://example.supabase.co/*'],
    icons: { 16: 'icons/icon-16.png' },
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'background.js' },
  }, null, 2)}\n`);
  await writeFile(baseline, `${JSON.stringify({
    permissions: ['activeTab', 'storage'],
    hostPermissions: ['https://example.supabase.co/*'],
    optionalPermissions: [],
    optionalHostPermissions: [],
    contentScriptMatches: [],
    webAccessibleResourceMatches: [],
    externallyConnectableMatches: [],
  }, null, 2)}\n`);

  return { baseline, root, source };
}

async function packageExtension(source: string, output: string, baseline: string) {
  return execFileAsync(process.execPath, [
    'scripts/package-extension.mjs',
    '--source', source,
    '--output', output,
    '--permissions', baseline,
  ], { cwd: path.resolve('.') });
}

test.describe('Chromium extension release artifact', () => {
  test('creates a byte-identical ZIP from the same validated build', async () => {
    const fixture = await createExtensionFixture();

    try {
      const first = path.join(fixture.root, 'first.zip');
      const second = path.join(fixture.root, 'second.zip');

      await packageExtension(fixture.source, first, fixture.baseline);
      await packageExtension(fixture.source, second, fixture.baseline);

      const firstArchive = await readFile(first);
      const secondArchive = await readFile(second);

      expect(firstArchive.subarray(0, 2).toString()).toBe('PK');
      expect(createHash('sha256').update(firstArchive).digest('hex')).toBe(
        createHash('sha256').update(secondArchive).digest('hex'),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects invalid versions, missing assets, permission drift, and secret credentials', async () => {
    const fixture = await createExtensionFixture();

    try {
      const output = path.join(fixture.root, 'extension.zip');
      const manifestPath = path.join(fixture.source, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        version: string;
        permissions: string[];
        optional_host_permissions?: string[];
      };

      manifest.version = '1.02.3';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Invalid extension version'),
      });

      manifest.version = '1.2.3';
      manifest.permissions.push('bookmarks');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Manifest permissions differ'),
      });

      manifest.permissions.pop();
      manifest.optional_host_permissions = ['https://unexpected.example/*'];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Manifest permissions differ'),
      });

      delete manifest.optional_host_permissions;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await rm(path.join(fixture.source, 'icons/icon-16.png'));
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Missing manifest asset'),
      });

      await writeFile(path.join(fixture.source, 'icons/icon-16.png'), 'icon');
      await writeFile(path.join(fixture.source, 'background.js'), 'const key = "sb_secret_release";\n');
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Server-side credential'),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
