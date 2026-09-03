import { execFile, spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packagePath = 'apps/extension/package.json';
const requiredVariables = [
  'CHROME_EXTENSION_ID',
  'CHROME_PUBLISHER_ID',
  'EXTENSION_SUPABASE_URL',
  'EXTENSION_SUPABASE_PUBLISHABLE_KEY',
  'EXTENSION_WEB_URL',
];
const requiredSecrets = [
  'CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL',
  'CHROME_SERVICE_ACCOUNT_PRIVATE_KEY',
];

function validateVersion(version) {
  const components = typeof version === 'string' ? version.split('.') : [];
  const valid = components.length >= 1
    && components.length <= 4
    && components.every((component) => /^(0|[1-9]\d*)$/.test(component) && Number(component) <= 65535)
    && components.some((component) => Number(component) !== 0);

  if (!valid) {
    throw new Error('Usage: pnpm extension:release -- <numeric-version> [--dry-run]');
  }

  return components.map(Number);
}

function compareVersions(left, right) {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

async function command(file, args, options = {}) {
  if (options.dryRun) {
    process.stdout.write(`${[file, ...args].join(' ')}\n`);
    return '';
  }

  if (options.inherit) {
    await new Promise((resolve, reject) => {
      const child = spawn(file, args, { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`)));
    });
    return '';
  }

  const { stdout } = await execFileAsync(file, args, { encoding: 'utf8' });
  return stdout.trim();
}

async function optionalCommand(file, args) {
  try {
    return await command(file, args);
  } catch {
    return '';
  }
}

async function requireConfiguration(kind, names, args) {
  const configured = new Set(JSON.parse(await command('gh', args)).map((entry) => entry.name));
  const missing = names.filter((name) => !configured.has(name));

  if (missing.length > 0) {
    throw new Error(`Missing GitHub ${kind}: ${missing.join(', ')}`);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForPullRequestChecks(pullRequestUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const output = await command('gh', ['pr', 'view', pullRequestUrl, '--json', 'statusCheckRollup']);
    const checks = JSON.parse(output).statusCheckRollup ?? [];

    if (checks.length > 0) {
      await command('gh', ['pr', 'checks', pullRequestUrl, '--watch', '--fail-fast'], { inherit: true });
      return;
    }

    await wait(5000);
  }

  throw new Error('Timed out waiting for pull request checks to start');
}

async function waitForPullRequestMerge(pullRequestUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const output = await command('gh', ['pr', 'view', pullRequestUrl, '--json', 'state,mergeCommit']);
    const pullRequest = JSON.parse(output);

    if (pullRequest.state === 'MERGED' && pullRequest.mergeCommit?.oid) {
      return pullRequest.mergeCommit.oid;
    }

    if (pullRequest.state === 'CLOSED') throw new Error('Release pull request was closed without merging');
    await wait(5000);
  }

  throw new Error('Timed out waiting for the release pull request to merge');
}

async function findCiRun(commit) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const output = await command('gh', [
      'run', 'list',
      '--workflow', 'ci.yml',
      '--branch', 'main',
      '--commit', commit,
      '--event', 'push',
      '--limit', '1',
      '--json', 'databaseId,status,conclusion,url',
    ]);
    const [run] = JSON.parse(output);

    if (run) {
      if (!Number.isSafeInteger(run.databaseId)) throw new Error('CI run ID is not numeric');
      return run;
    }
    await wait(5000);
  }

  throw new Error(`Timed out waiting for CI on ${commit}`);
}

const argumentsList = process.argv.slice(2);
const dryRun = argumentsList.includes('--dry-run');
const positional = argumentsList.filter((argument) => argument !== '--dry-run');

if (positional.length !== 1) {
  throw new Error('Usage: pnpm extension:release -- <numeric-version> [--dry-run]');
}

const version = positional[0];
const targetComponents = validateVersion(version);
const branch = `release/extension-v${version}`;
const tag = `v${version}`;
const planned = [
  ['git', ['fetch', 'origin', 'main', '--tags']],
  ['git', ['switch', 'main']],
  ['git', ['pull', '--ff-only', 'origin', 'main']],
  ['git', ['switch', '-c', branch]],
  ['git', ['add', packagePath]],
  ['git', ['commit', '-m', `Release extension ${tag}`]],
  ['git', ['push', '-u', 'origin', branch]],
  ['gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Release extension ${tag}`, '--body', `Bump the Chromium extension version to ${version}.`]],
  ['gh', ['pr', 'checks', '<pull-request-url>', '--watch', '--fail-fast']],
  ['gh', ['pr', 'merge', '<pull-request-url>', '--merge', '--delete-branch']],
  ['git', ['switch', 'main']],
  ['git', ['pull', '--ff-only', 'origin', 'main']],
  ['gh', ['run', 'list', '--workflow', 'ci.yml', '--branch', 'main', '--commit', '<merge-sha>', '--event', 'push', '--limit', '1', '--json', 'databaseId,status,conclusion,url']],
  ['gh', ['run', 'watch', '<ci-run-id>', '--exit-status']],
  ['git', ['tag', '-a', tag, '-m', `Lexync extension ${tag}`]],
  ['git', ['push', 'origin', tag]],
  ['gh', ['workflow', 'run', 'extension-release.yml', '--ref', 'main', '-f', `tag=${tag}`, '-f', 'run_id=<ci-run-id>']],
];

if (dryRun) {
  const extensionPackage = JSON.parse(await readFile(packagePath, 'utf8'));
  const currentComponents = validateVersion(extensionPackage.version);
  if (compareVersions(targetComponents, currentComponents) <= 0) {
    throw new Error(`Extension version must be higher than ${extensionPackage.version}`);
  }
  const trackedStatus = await command('git', ['status', '--porcelain', '--untracked-files=no']);
  if (trackedStatus) throw new Error('Tracked files contain uncommitted changes');
  process.stdout.write(`set ${packagePath} version=${version}\n`);
  for (const [file, args] of planned) await command(file, args, { dryRun: true });
  process.exit(0);
}

const trackedStatus = await command('git', ['status', '--porcelain', '--untracked-files=no']);
if (trackedStatus) throw new Error('Tracked files contain uncommitted changes');

await requireConfiguration('variables', requiredVariables, ['variable', 'list', '--json', 'name']);
await requireConfiguration('environment secrets', requiredSecrets, ['secret', 'list', '--env', 'chrome-web-store', '--json', 'name']);
await command('git', ['fetch', 'origin', 'main', '--tags'], { inherit: true });
await command('git', ['switch', 'main'], { inherit: true });
await command('git', ['pull', '--ff-only', 'origin', 'main'], { inherit: true });

const head = await command('git', ['rev-parse', 'HEAD']);
const remoteMain = await command('git', ['rev-parse', 'origin/main']);
if (head !== remoteMain) throw new Error('Local main must exactly match origin/main');

const extensionPackage = JSON.parse(await readFile(packagePath, 'utf8'));
const currentComponents = validateVersion(extensionPackage.version);
if (compareVersions(targetComponents, currentComponents) <= 0) {
  throw new Error(`Extension version must be higher than ${extensionPackage.version}`);
}

if (await optionalCommand('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`])) {
  throw new Error(`Tag already exists: ${tag}`);
}

if (await command('git', ['ls-remote', '--heads', 'origin', branch])) {
  throw new Error(`Remote release branch already exists: ${branch}`);
}

await command('git', ['switch', '-c', branch], { inherit: true });
extensionPackage.version = version;
await writeFile(packagePath, `${JSON.stringify(extensionPackage, null, 2)}\n`);
await command('git', ['add', packagePath], { inherit: true });
await command('git', ['commit', '-m', `Release extension ${tag}`], { inherit: true });
await command('git', ['push', '-u', 'origin', branch], { inherit: true });

const pullRequestOutput = await command('gh', [
  'pr', 'create',
  '--base', 'main',
  '--head', branch,
  '--title', `Release extension ${tag}`,
  '--body', `Bump the Chromium extension version to ${version}.`,
]);
const pullRequestUrl = pullRequestOutput.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
if (!pullRequestUrl) throw new Error('GitHub CLI did not return a pull request URL');
process.stdout.write(`${pullRequestUrl}\n`);
await waitForPullRequestChecks(pullRequestUrl);
await command('gh', ['pr', 'merge', pullRequestUrl, '--merge', '--delete-branch'], { inherit: true });
const mergeCommit = await waitForPullRequestMerge(pullRequestUrl);
await command('git', ['switch', 'main'], { inherit: true });
await command('git', ['pull', '--ff-only', 'origin', 'main'], { inherit: true });

const mergedHead = await command('git', ['rev-parse', 'HEAD']);
if (mergedHead !== mergeCommit) throw new Error('Local main does not match the merged pull request commit');
const mergedPackage = JSON.parse(await readFile(packagePath, 'utf8'));
if (mergedPackage.version !== version) throw new Error('Merged main does not contain the requested extension version');

const ciRun = await findCiRun(mergeCommit);
process.stdout.write(`CI: ${ciRun.url}\n`);
if (ciRun.status !== 'completed') {
  await command('gh', ['run', 'watch', String(ciRun.databaseId), '--exit-status'], { inherit: true });
} else if (ciRun.conclusion !== 'success') {
  throw new Error(`CI concluded with ${ciRun.conclusion}`);
}

await command('git', ['tag', '-a', tag, '-m', `Lexync extension ${tag}`], { inherit: true });
await command('git', ['push', 'origin', tag], { inherit: true });
await command('gh', [
  'workflow', 'run', 'extension-release.yml',
  '--ref', 'main',
  '-f', `tag=${tag}`,
  '-f', `run_id=${ciRun.databaseId}`,
], { inherit: true });
process.stdout.write(`Staged release dispatched for ${tag} with CI run ${ciRun.databaseId}.\n`);
