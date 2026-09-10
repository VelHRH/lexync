import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const productionRoots = ['apps/web', 'apps/extension'];
const legacyPalette = /#(?:19251e|f3f0e7|fbf8ef|526c48|bdd7ad|e79c6a)\b/i;
const rawColor = /#(?:[0-9a-f]{3,8})\b|\brgba?\(/i;

async function filesUnder(directory: string, patterns: string[]): Promise<string[]> {
  const relativeDirectory = path.relative(root, directory);
  const matches: string[] = [];
  for (const pattern of patterns) {
    for await (const match of glob(path.join(relativeDirectory, pattern), { cwd: root })) {
      matches.push(String(match));
    }
  }
  return matches.sort();
}

async function readFiles(files: string[]) {
  return Promise.all(files.map(async (file) => ({ file, source: await readFile(path.join(root, file), 'utf8') })));
}

function normalizedColor(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}

test.describe('Lexync semantic design contract', () => {
  test('pins the required skill inventory and exact provenance', async () => {
    const provenance = await readFile(path.join(root, '.agents/skills/PROVENANCE.md'), 'utf8');
    const [impeccable, designTaste] = await Promise.all([
      readFile(path.join(root, '.agents/skills/impeccable/SKILL.md'), 'utf8'),
      readFile(path.join(root, '.agents/skills/design-taste-frontend/SKILL.md'), 'utf8'),
    ]);

    expect(provenance).toContain('https://github.com/VelHRH/landline');
    expect(provenance).toContain('e1d86a34640c17e8678244ea57375a1f1f3db211');
    expect(provenance).toContain('.claude/skills/impeccable');
    expect(provenance).toContain('.claude/skills/design-taste-frontend');
    expect(impeccable).toMatch(/^version:\s*3\.9\.1/m);
    expect(impeccable).toContain('name: impeccable');
    expect(designTaste).toContain('name: design-taste-frontend');
  });

  test('documents semantic roles and maps them to web, extension, Compose, and SwiftUI', async () => {
    const candidates = await filesUnder(root, [
      'design-system/**/*.{md,json,ts,tsx}',
      'packages/design-system/**/*.{md,json,ts,tsx}',
      'docs/*design-system*.md',
      'docs/*design*.md',
    ]);
    const contractFiles = (await readFiles(candidates)).filter(({ source }) => /#6429f4/i.test(source));
    const contract = contractFiles.map(({ source }) => source).join('\n');

    expect(contractFiles.length).toBeGreaterThan(0);
    expect(contract).toMatch(/primary|brand/i);
    expect(contract).toMatch(/ink/i);
    expect(contract).toMatch(/white|surface/i);
    expect(contract).toMatch(/lavender/i);
    expect(contract).toMatch(/web|css/i);
    expect(contract).toMatch(/extension/i);
    expect(contract).toMatch(/compose/i);
    expect(contract).toMatch(/swiftui|swift\s*ui/i);
    expect(contract).toMatch(/#6429f4/i);
  });

  test('rejects legacy palette and raw color bypasses in scoped production surfaces', async () => {
    const files = await filesUnder(root, productionRoots.flatMap((directory) => [
      `${directory}/**/*.css`,
      `${directory}/**/*.ts`,
      `${directory}/**/*.tsx`,
    ]));
    const sources = await readFiles(files);
    const bypasses = sources.filter(({ file }) => !/(design-system|tokens|theme)/i.test(file));
    const legacy = sources.filter(({ source }) => legacyPalette.test(source));
    const raw = bypasses.filter(({ source }) => rawColor.test(source));

    expect(legacy.map(({ file }) => file)).toEqual([]);
    expect(raw.map(({ file }) => file)).toEqual([]);
  });

  test('keeps the canonical brand color in the semantic source instead of consumers', async () => {
    const files = await filesUnder(root, [
      'design-system/**/*.{css,md,json,ts,tsx}',
      'packages/design-system/**/*.{css,md,json,ts,tsx}',
      'docs/*design-system*.md',
      'docs/*design*.md',
    ]);
    const sources = await readFiles(files);
    const canonical = sources.filter(({ source }) => normalizedColor(source).includes('#6429f4'));

    expect(canonical.length).toBeGreaterThan(0);
    expect(canonical.some(({ file }) => /(contract|token|theme|design-system)/i.test(file))).toBe(true);
  });
});
