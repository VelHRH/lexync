import { execFile } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaults = {
  source: 'apps/extension/.output/chrome-mv3',
  output: 'artifacts/lexync-chromium.zip',
  permissions: 'apps/extension/manifest-permissions.json',
};

function parseArguments(argumentsList) {
  const options = { ...defaults };

  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!value || !['--source', '--output', '--permissions'].includes(flag)) {
      throw new Error(`Invalid argument: ${flag ?? ''}`);
    }

    options[flag.slice(2)] = value;
  }

  return options;
}

function arraysMatch(left = [], right = []) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function validateVersion(version) {
  const components = typeof version === 'string' ? version.split('.') : [];
  const valid = components.length >= 1
    && components.length <= 4
    && components.every((component) => /^(0|[1-9]\d*)$/.test(component) && Number(component) <= 65535)
    && components.some((component) => Number(component) !== 0);

  if (!valid) {
    throw new Error(`Invalid extension version: ${version ?? ''}`);
  }
}

function manifestAssets(manifest) {
  const assets = new Set();
  const add = (value) => {
    if (typeof value === 'string') {
      assets.add(value);
    }
  };
  const addValues = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(add);
    }
  };

  addValues(manifest.icons);
  addValues(manifest.action?.default_icon);
  add(manifest.action?.default_popup);
  add(manifest.background?.service_worker);
  add(manifest.options_ui?.page);
  add(manifest.side_panel?.default_path);
  manifest.content_scripts?.forEach((entry) => [...(entry.js ?? []), ...(entry.css ?? [])].forEach(add));
  manifest.web_accessible_resources?.forEach((entry) => (entry.resources ?? []).forEach(add));

  return [...assets];
}

async function filesWithin(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Extension build contains a symbolic link: ${relativePath}`);
    }

    if (entry.isDirectory()) {
      files.push(...await filesWithin(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

async function validateBuild(source, permissionsPath) {
  const manifestPath = path.join(source, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const baseline = JSON.parse(await readFile(permissionsPath, 'utf8'));

  validateVersion(manifest.version);

  if (!arraysMatch(manifest.permissions, baseline.permissions)
    || !arraysMatch(manifest.host_permissions, baseline.hostPermissions)) {
    throw new Error('Manifest permissions differ from the approved baseline');
  }

  for (const asset of manifestAssets(manifest)) {
    const assetPath = path.resolve(source, asset);
    const sourcePath = `${path.resolve(source)}${path.sep}`;

    if (!assetPath.startsWith(sourcePath) || !(await lstat(assetPath).catch(() => null))?.isFile()) {
      throw new Error(`Missing manifest asset: ${asset}`);
    }
  }

  const files = await filesWithin(source);
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  for (const file of files) {
    const content = await readFile(path.join(source, file));
    const text = content.toString('utf8');

    if (/SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9_-]+|"role"\s*:\s*"service_role"/.test(text)
      || (secret && content.includes(secret))) {
      throw new Error(`Server-side credential found in extension build: ${file}`);
    }
  }

  return { files, manifest };
}

async function createArchive(source, output, files) {
  const stagingRoot = await mkdtemp(path.join(tmpdir(), 'lexync-extension-package-'));
  const fixedTime = new Date('1980-01-01T00:00:00.000Z');

  try {
    for (const file of files) {
      const target = path.join(stagingRoot, file);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(source, file), target);
      await utimes(target, fixedTime, fixedTime);
    }

    await mkdir(path.dirname(output), { recursive: true });
    await rm(output, { force: true });
    await execFileAsync('zip', ['-X', '-q', path.resolve(output), ...files], { cwd: stagingRoot });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

const options = parseArguments(process.argv.slice(2));
const source = path.resolve(options.source);
const output = path.resolve(options.output);
const permissions = path.resolve(options.permissions);
const { files, manifest } = await validateBuild(source, permissions);

await createArchive(source, output, files);
process.stdout.write(`${JSON.stringify({ output, version: manifest.version, files: files.length })}\n`);
