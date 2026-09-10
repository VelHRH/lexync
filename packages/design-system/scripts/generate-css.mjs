import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('../src/tokens.json', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/tokens.css', import.meta.url));
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const prefixes = {
  color: 'color',
  typography: 'type',
  spacing: 'space',
  radius: 'radius',
  elevation: 'elevation',
  motion: 'motion',
  focus: 'focus',
  zIndex: 'z',
  brandAsset: 'brand',
};

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function tokenName(category, key) {
  let normalizedKey = key;
  if (category === 'spacing') normalizedKey = key.replace(/^space/, '');
  if (category === 'typography') {
    normalizedKey = normalizedKey
      .replace(/^fontFamily/, 'family')
      .replace(/^fontSize/, 'size')
      .replace(/^fontWeight/, 'weight')
      .replace(/^lineHeight/, 'line');
    normalizedKey = normalizedKey.replace(/^size(?=\d)/, 'size-');
  }
  return `--lexync-${prefixes[category]}-${kebabCase(normalizedKey)}`;
}

function tokenValue(category, key, value) {
  if (category === 'brandAsset') return `url("${value}")`;
  return value;
}

const lines = [':root {', '  color-scheme: light;'];
for (const [category, values] of Object.entries(source)) {
  lines.push('');
  for (const [key, value] of Object.entries(values)) {
    lines.push(`  ${tokenName(category, key)}: ${tokenValue(category, key, value)};`);
  }
}
lines.push('}', '', ':where(button, input, select, textarea, a):focus-visible {');
lines.push('  outline: var(--lexync-focus-width) solid var(--lexync-focus-color);');
lines.push('  outline-offset: var(--lexync-focus-offset);');
lines.push('  box-shadow: var(--lexync-focus-ring);');
lines.push('}', '', '@media (prefers-reduced-motion: reduce) {');
lines.push('  *, *::before, *::after {');
lines.push('    animation-duration: 0s !important;');
lines.push('    animation-iteration-count: 1 !important;');
lines.push('    scroll-behavior: auto !important;');
lines.push('    transition-duration: 0s !important;');
lines.push('  }', '}', '');

const generated = `${lines.join('\n')}`;
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== generated) {
    process.stderr.write('packages/design-system/src/tokens.css is out of date; run pnpm generate.\n');
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generated);
}
