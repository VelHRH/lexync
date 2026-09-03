import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve('.');
const releaseScript = path.join(repositoryRoot, 'scripts/release-extension.mjs');

type ReleaseFixture = {
  bin: string;
  log: string;
  root: string;
};

async function createReleaseFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lexync-extension-release-command-'));
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'commands.jsonl');

  await execFileAsync('git', ['init', '-b', 'main'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'release-test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Release Test'], { cwd: root });
  await mkdir(path.join(root, 'apps', 'extension'), { recursive: true });
  await writeFile(path.join(root, 'apps', 'extension', 'package.json'), `${JSON.stringify({
    name: '@lexync/extension',
    version: '0.1.1',
  }, null, 2)}\n`);
  await execFileAsync('git', ['add', 'apps/extension/package.json'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'Initial extension state'], { cwd: root });

  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, 'git'), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
appendFileSync(process.env.LEXYNC_RELEASE_COMMAND_LOG, JSON.stringify({ command: 'git', args }) + '\\n');
const readOnlyCommands = new Set(['branch', 'config', 'diff', 'log', 'rev-parse', 'show', 'status']);
if (readOnlyCommands.has(args[0])) {
  const result = spawnSync('/usr/bin/git', args, { encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 0);
}
process.exit(0);
`);
  await writeFile(path.join(bin, 'gh'), `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
appendFileSync(process.env.LEXYNC_RELEASE_COMMAND_LOG, JSON.stringify({ command: 'gh', args }) + '\\n');
if (args[0] === 'run' && args[1] === 'list') {
  process.stdout.write(JSON.stringify([{ databaseId: 123456789, status: 'completed', conclusion: 'success' }]) + '\\n');
}
if (args[0] === 'pr' && args[1] === 'create') {
  process.stdout.write('https://github.com/VelHRH/lexync/pull/999\\n');
}
if (args[0] === 'workflow' && args[1] === 'run') {
  process.stdout.write('https://github.com/VelHRH/lexync/actions/runs/123456789\\n');
}
process.exit(0);
`);
  await chmod(path.join(bin, 'git'), 0o755);
  await chmod(path.join(bin, 'gh'), 0o755);

  return { bin, log, root } satisfies ReleaseFixture;
}

async function runRelease(fixture: ReleaseFixture, args: string[]) {
  return execFileAsync(process.execPath, [releaseScript, ...args], {
    cwd: fixture.root,
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH ?? ''}`,
      LEXYNC_RELEASE_COMMAND_LOG: fixture.log,
    },
  });
}

async function readCommands(fixture: ReleaseFixture) {
  const contents = await readFile(fixture.log, 'utf8').catch(() => '');
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { command: string; args: string[] });
}

function mutatingCommands(commands: Array<{ command: string; args: string[] }>) {
  return commands.filter(({ command, args }) => command === 'git' && [
    'add',
    'commit',
    'fetch',
    'merge',
    'pull',
    'push',
    'switch',
    'tag',
  ].includes(args[0]));
}

async function expectProtectedFlow(stdout: string, version: string) {
  expect(stdout).toMatch(/fetch\s+origin\s+main/i);
  expect(stdout).toMatch(new RegExp(`release[/-]extension[/-]v?${version.replaceAll('.', '\\.')}`));
  expect(stdout).toMatch(/apps[\\/]extension[\\/]package\.json/);
  expect(stdout).toMatch(new RegExp(`version[^\\n]*${version.replaceAll('.', '\\.')}`, 'i'));
  expect(stdout).toMatch(/git\s+add|add.*package\.json/i);
  expect(stdout).toMatch(/git\s+commit|commit/i);
  expect(stdout).toMatch(/git\s+push[^\n]*release[/-]extension/i);
  expect(stdout).toMatch(/gh\s+pr\s+create|pr\s+create/i);
  expect(stdout).toMatch(/gh\s+pr\s+checks|pr\s+checks/i);
  expect(stdout).toMatch(/gh\s+pr\s+merge[^\n]*--merge|pr\s+merge[^\n]*--merge/i);
  expect(stdout).toMatch(/git\s+switch\s+main|switch.*main/i);
  expect(stdout).toMatch(/git\s+pull[^\n]*--ff-only[^\n]*main|pull.*ff-only.*main/i);
  expect(stdout).toMatch(/gh\s+run\s+list|run\s+list/i);
  expect(stdout).toMatch(/gh\s+run\s+watch[^\n]*<ci-run-id>|run\s+watch[^\n]*<ci-run-id>/i);
  expect(stdout).toMatch(new RegExp(`git\\s+tag[^\n]*v${version.replaceAll('.', '\\.')}`));
  expect(stdout).toMatch(new RegExp(`git\\s+push[^\n]*v${version.replaceAll('.', '\\.')}`));
  expect(stdout).toMatch(/gh\s+workflow\s+run[^\n]*extension-release\.yml|workflow\s+run[^\n]*extension-release\.yml/i);
}

test.describe('root extension release command', () => {
  test('exposes the release command from the repository root', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['extension:release']).toBe('node scripts/release-extension.mjs');
  });

  test('dry-run shows the protected-main release flow and never pushes directly to main', async () => {
    const fixture = await createReleaseFixture();

    try {
      const result = await runRelease(fixture, ['1.2.4', '--dry-run']);
      const commands = await readCommands(fixture);

      await expectProtectedFlow(result.stdout, '1.2.4');
      expect(result.stdout).not.toMatch(/git\s+push\s+origin\s+main/i);
      expect(mutatingCommands(commands)).toEqual([]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('accepts untracked files while preparing a release dry-run', async () => {
    const fixture = await createReleaseFixture();

    try {
      await writeFile(path.join(fixture.root, 'notes.txt'), 'local release notes\n');
      const result = await runRelease(fixture, ['1.2.4', '--dry-run']);

      await expectProtectedFlow(result.stdout, '1.2.4');
      expect(result.stderr).not.toMatch(/dirty|uncommitted/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a tracked dirty repository before any mutation', async () => {
    const fixture = await createReleaseFixture();

    try {
      await writeFile(path.join(fixture.root, 'apps', 'extension', 'package.json'), `${JSON.stringify({
        name: '@lexync/extension',
        version: '0.1.2',
      }, null, 2)}\n`);

      await expect(runRelease(fixture, ['1.2.4', '--dry-run'])).rejects.toMatchObject({
        stderr: expect.stringMatching(/tracked|dirty|uncommitted/i),
      });
      expect(mutatingCommands(await readCommands(fixture))).toEqual([]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  for (const version of ['', 'v1.2.3', '1.02.3', '1.2.3.4.5', '1.2.3-beta']) {
    test(`rejects invalid extension version ${JSON.stringify(version)}`, async () => {
      const fixture = await createReleaseFixture();

      try {
        await expect(runRelease(fixture, [version])).rejects.toMatchObject({
          stderr: expect.stringMatching(/numeric-version|version.*higher/i),
        });
        expect(mutatingCommands(await readCommands(fixture))).toEqual([]);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    });
  }
});
