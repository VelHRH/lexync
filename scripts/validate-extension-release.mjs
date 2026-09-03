import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const flags = new Set([
  '--artifact',
  '--metadata',
  '--tag',
  '--expected-commit',
  '--expected-chrome-listing-id',
  '--github-release-versions',
  '--chrome-web-store-versions',
]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArguments(argumentsList) {
  const options = {};

  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!flags.has(flag) || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${flag ?? ''}`);
    }

    options[flag.slice(2).replaceAll('-', '')] = value;
  }

  return options;
}

function validateVersion(version) {
  const components = typeof version === 'string' ? version.split('.') : [];
  return components.length >= 1
    && components.length <= 4
    && components.every((component) => /^(0|[1-9]\d*)$/.test(component) && Number(component) <= 65535)
    && components.some((component) => Number(component) !== 0);
}

function parseVersions(value) {
  return value.split(',').map((version) => version.trim()).filter(Boolean);
}

let options;

try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}

const requiredOptions = [
  'artifact',
  'metadata',
  'tag',
  'expectedcommit',
  'expectedchromelistingid',
  'githubreleaseversions',
  'chromewebstoreversions',
];

if (requiredOptions.some((option) => options[option] === undefined)) {
  fail('Missing required argument');
}

let metadata;
let artifact;

try {
  metadata = JSON.parse(await readFile(options.metadata, 'utf8'));
  artifact = await readFile(options.artifact);
} catch (error) {
  fail(`Unable to read release inputs: ${error.message}`);
}

if (!metadata
  || metadata.schemaVersion !== 1
  || !validateVersion(metadata.manifestVersion)
  || typeof metadata.commitSha !== 'string'
  || !/^[a-fA-F0-9]{40}$/.test(metadata.commitSha)
  || typeof metadata.zipFilename !== 'string'
  || !metadata.zipFilename
  || typeof metadata.sha256 !== 'string'
  || !/^[a-f0-9]{64}$/.test(metadata.sha256)
  || typeof metadata.chromeListingId !== 'string'
  || !metadata.chromeListingId.trim()) {
  fail('Missing required metadata');
}

if (metadata.zipFilename !== path.basename(options.artifact)) {
  fail('ZIP filename does not match artifact');
}

const checksum = createHash('sha256').update(artifact).digest('hex');

if (metadata.sha256 !== checksum) {
  fail('Checksum mismatch');
}

if (options.tag !== `v${metadata.manifestVersion}`) {
  fail('Tag version does not match manifest version');
}

if (metadata.commitSha !== options.expectedcommit) {
  fail('Commit SHA mismatch');
}

if (metadata.chromeListingId !== options.expectedchromelistingid) {
  fail('Chrome Web Store listing ID mismatch');
}

if (parseVersions(options.githubreleaseversions).includes(metadata.manifestVersion)) {
  fail('GitHub release version already exists');
}

if (parseVersions(options.chromewebstoreversions).includes(metadata.manifestVersion)) {
  fail('Chrome Web Store version already exists');
}

process.stdout.write(`Release metadata is valid for ${metadata.manifestVersion}\n`);
