import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const rootArgument = process.argv.indexOf('--root');
const brandRoot = path.resolve(rootArgument === -1 ? 'assets/brand' : process.argv[rootArgument + 1]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function alphaBounds(data, width, height, channels) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + channels - 1] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

let catalog;

try {
  catalog = JSON.parse(await readFile(path.join(brandRoot, 'catalog.json'), 'utf8'));
} catch (error) {
  fail(`Malformed catalog: ${error.message}`);
}

if (catalog.version !== 1 || catalog.primaryIcon !== 'icon-primary-purple' || !Array.isArray(catalog.assets)) {
  fail('Malformed catalog: required brand metadata is missing');
}

const ids = new Set();

for (const asset of catalog.assets) {
  if (!asset.id || !asset.role || !asset.intendedBackground || !asset.path || ids.has(asset.id)) {
    fail(`Malformed catalog entry: ${asset.id || asset.path || 'unknown'}`);
  }

  ids.add(asset.id);
  const assetPath = path.join(brandRoot, asset.path);
  let buffer;

  try {
    buffer = await readFile(assetPath);
  } catch {
    fail(`Missing asset: ${asset.path}`);
  }

  let metadata;
  let decoded;

  try {
    metadata = await sharp(buffer).metadata();
    decoded = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    fail(`Malformed PNG: ${asset.path}`);
  }

  if (metadata.format !== 'png') {
    fail(`Malformed PNG: ${asset.path}`);
  }

  if (metadata.width !== asset.width || metadata.height !== asset.height) {
    fail(`Incorrect dimensions: ${asset.path}`);
  }

  if (metadata.hasAlpha !== asset.alpha) {
    fail(`Incorrect alpha mode: ${asset.path}`);
  }

  if (checksum(buffer) !== asset.sha256) {
    fail(`Checksum mismatch: ${asset.path}`);
  }

  if (asset.contentBox) {
    const actualBounds = alphaBounds(decoded.data, decoded.info.width, decoded.info.height, decoded.info.channels);

    if (JSON.stringify(actualBounds) !== JSON.stringify(asset.contentBox)) {
      fail(`Incorrect content bounds: ${asset.path}`);
    }
  }

  const corners = [
    0,
    (decoded.info.width - 1) * decoded.info.channels,
    decoded.info.width * (decoded.info.height - 1) * decoded.info.channels,
    (decoded.info.width * decoded.info.height - 1) * decoded.info.channels,
  ];

  if (asset.platform === 'chromium' && corners.some((offset) => decoded.data[offset + 3] !== 0)) {
    fail(`Opaque browser icon corner: ${asset.path}`);
  }

  if (!asset.master && !asset.alpha && corners.some((offset) => (
    decoded.data[offset] <= 32 && decoded.data[offset + 1] <= 32 && decoded.data[offset + 2] <= 32
  ))) {
    fail(`Black icon corner: ${asset.path}`);
  }
}

if (!ids.has(catalog.primaryIcon)) {
  fail('Malformed catalog: primary icon is missing');
}

process.stdout.write(`Brand assets are valid (${catalog.assets.length} files)\n`);
