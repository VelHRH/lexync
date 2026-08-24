import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function filesWithin(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(entryPath) : [entryPath];
  }));
  return files.flat();
}

test('client bundles contain no secret or service-role credential', async () => {
  const roots = ['apps/extension/.output/chrome-mv3', 'apps/web/.next/static'];
  const files = (await Promise.all(roots.map(filesWithin))).flat();
  const bundle = (await Promise.all(files.map((file) => readFile(file, 'utf8').catch(() => '')))).join('\n');

  expect(bundle).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(bundle).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    expect(bundle).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
});

test('injected ordinary-page capture does not contact Supabase directly', async () => {
  const bundle = await readFile('apps/extension/.output/chrome-mv3/ordinary-capture.js', 'utf8');

  expect(bundle).not.toContain('capture_manual_entry');
  expect(bundle).not.toContain('/rest/v1');
  expect(bundle).not.toContain('127.0.0.1:54321');
});
