import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const defaults = {
  artifact: process.env.EXTENSION_ARTIFACT ?? 'artifacts/lexync-chromium.zip',
  output: process.env.RELEASE_METADATA ?? 'artifacts/release-metadata.json',
};

function parseArguments(argumentsList) {
  const options = { ...defaults };

  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!value || !['--artifact', '--output'].includes(flag)) {
      throw new Error(`Invalid argument: ${flag ?? ''}`);
    }

    options[flag.slice(2)] = value;
  }

  return options;
}

const options = parseArguments(process.argv.slice(2));
const artifact = path.resolve(options.artifact);
const output = path.resolve(options.output);
const commitSha = process.env.GITHUB_SHA ?? '';
const chromeListingId = process.env.CHROME_EXTENSION_ID ?? '';

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

const archive = await readFile(artifact);
const { stdout } = await execFileAsync('unzip', ['-p', artifact, 'manifest.json']);
const manifest = JSON.parse(stdout);
validateVersion(manifest.version);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  schemaVersion: 1,
  manifestVersion: manifest.version,
  commitSha,
  zipFilename: path.basename(artifact),
  sha256: createHash('sha256').update(archive).digest('hex'),
  chromeListingId,
}, null, 2)}\n`);

process.stdout.write(`Release metadata written to ${output}\n`);
