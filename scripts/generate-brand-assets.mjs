import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { alphaBounds, checksum, masters, requiredVariants } from './brand-asset-contract.mjs';

const brandRoot = path.resolve('assets/brand');
const webBrandRoot = path.resolve('apps/web/public/brand');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function assertMasters() {
  for (const master of masters) {
    const buffer = await readFile(path.join(brandRoot, master.path));
    const metadata = await sharp(buffer).metadata();

    if (checksum(buffer) !== master.sha256) {
      throw new Error(`Master checksum mismatch: ${master.path}`);
    }

    if (metadata.width !== master.width || metadata.height !== master.height || metadata.hasAlpha !== master.alpha) {
      throw new Error(`Master metadata mismatch: ${master.path}`);
    }
  }
}

async function cropVisible(input, threshold = 0) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bounds = alphaBounds(data, info.width, info.height, info.channels, threshold);

  return sharp(data, { raw: info }).extract({
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
}

async function cleanPrimary(input) {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);

  for (let index = 0; index < info.width * info.height; index += 1) {
    const sourceOffset = index * info.channels;
    const targetOffset = index * 4;
    const maximum = Math.max(data[sourceOffset], data[sourceOffset + 1], data[sourceOffset + 2]);
    const alpha = maximum <= 16 ? 0 : maximum < 48 ? Math.round(((maximum - 16) / 32) * 255) : 255;

    for (let channel = 0; channel < 3; channel += 1) {
      output[targetOffset + channel] = alpha === 0
        ? 0
        : Math.min(255, Math.round((data[sourceOffset + channel] * 255) / alpha));
    }
    output[targetOffset + 3] = alpha;
  }

  return cropVisible(await sharp(output, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer());
}

async function primaryColor(input) {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  const totals = [0, 0, 0];
  let count = 0;

  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];

    if (blue > 100 && blue > red * 1.25 && red > green * 1.3) {
      totals[0] += red;
      totals[1] += green;
      totals[2] += blue;
      count += 1;
    }
  }

  if (count === 0) {
    throw new Error('Primary purple color could not be derived');
  }

  return {
    r: Math.round(totals[0] / count),
    g: Math.round(totals[1] / count),
    b: Math.round(totals[2] / count),
  };
}

async function transparentIcon(input, canvasSize, artworkSize = canvasSize) {
  const artwork = await sharp(input)
    .resize(artworkSize, artworkSize, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  if (artworkSize === canvasSize) {
    return clampTransparency(artwork);
  }

  const padding = (canvasSize - artworkSize) / 2;
  return clampTransparency(await sharp(artwork)
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: transparent })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer());
}

async function clampTransparency(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;

    if (data[offset + 3] <= 4) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function opaqueIcon(mark, size, markRatio, background) {
  const markSize = Math.round(size * markRatio);
  const resizedMark = await sharp(mark)
    .resize(markSize, markSize, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: resizedMark, gravity: 'centre' }])
    .flatten({ background })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function adaptiveForeground(mark, size) {
  const markSize = Math.round(size * (66 / 108));
  const resizedMark = await sharp(mark)
    .resize(markSize, markSize, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background: transparent } })
    .composite([{ input: resizedMark, gravity: 'centre' }])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function solidBackground(size, background) {
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function socialPreview(wordmark, width, height, artworkWidth, background) {
  const artwork = await sharp(wordmark)
    .resize({ width: artworkWidth })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  return sharp({ create: { width, height, channels: 3, background } })
    .composite([{ input: artwork, gravity: 'centre' }])
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
}

async function assetEntry(definition, buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const metadata = await sharp(buffer).metadata();

  return {
    id: definition.id,
    role: definition.role,
    intendedBackground: definition.intendedBackground,
    path: definition.path,
    platform: definition.platform,
    width: metadata.width,
    height: metadata.height,
    sha256: checksum(buffer),
    master: false,
    alpha: metadata.hasAlpha,
    contentBox: alphaBounds(data, info.width, info.height, info.channels),
  };
}

async function writeVariant(definition, buffer) {
  const outputPath = path.join(brandRoot, definition.path);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return assetEntry(definition, buffer);
}

await assertMasters();

const primaryMaster = await readFile(path.join(brandRoot, 'masters/icon-primary-purple.png'));
const lightMarkMaster = await readFile(path.join(brandRoot, 'masters/mark-light-on-dark.png'));
const lightWordmarkMaster = await readFile(path.join(brandRoot, 'masters/wordmark-light-on-dark.png'));
const cleanedPrimary = await cleanPrimary(primaryMaster);
const croppedLightMark = await cropVisible(lightMarkMaster, 4);
const purple = await primaryColor(primaryMaster);
const generated = [];

for (const definition of requiredVariants) {
  let buffer;

  if (definition.render === 'transparent-primary') {
    buffer = await transparentIcon(cleanedPrimary, definition.width, definition.artworkSize);
  } else if (definition.render === 'adaptive-foreground') {
    buffer = await adaptiveForeground(croppedLightMark, definition.width);
  } else if (definition.render === 'solid-background') {
    buffer = await solidBackground(definition.width, purple);
  } else if (definition.render === 'opaque-mark') {
    buffer = await opaqueIcon(croppedLightMark, definition.width, definition.markRatio, purple);
  } else if (definition.render === 'social-preview') {
    buffer = await socialPreview(lightWordmarkMaster, definition.width, definition.height, definition.artworkWidth, purple);
  } else {
    throw new Error(`Unknown renderer: ${definition.render}`);
  }

  generated.push(await writeVariant(definition, buffer));
}

const catalog = {
  version: 1,
  primaryIcon: 'icon-primary-purple',
  primaryColor: `#${[purple.r, purple.g, purple.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
  assets: [...masters, ...generated],
};

await writeFile(path.join(brandRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

await mkdir(webBrandRoot, { recursive: true });
await Promise.all([
  ['masters/mark-dark-on-light.png', 'mark-dark-on-light.png'],
  ['masters/mark-light-on-dark.png', 'mark-light-on-dark.png'],
  ['masters/wordmark-dark-on-light.png', 'wordmark-dark-on-light.png'],
  ['masters/wordmark-light-on-dark.png', 'wordmark-light-on-dark.png'],
  ['platform/web/favicon-48.png', 'favicon.png'],
  ['platform/web/apple-touch-icon-180.png', 'apple-touch-icon.png'],
  ['platform/web/social-preview-1200x630.png', 'social-preview.png'],
].map(([source, destination]) => copyFile(path.join(brandRoot, source), path.join(webBrandRoot, destination))));

console.log(`Generated ${generated.length} platform brand assets`);
