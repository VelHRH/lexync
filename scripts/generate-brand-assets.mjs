import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const brandRoot = path.resolve('assets/brand');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const masters = [
  {
    id: 'icon-primary-purple',
    role: 'primary-icon-source',
    intendedBackground: 'platform-controlled',
    path: 'masters/icon-primary-purple.png',
    width: 1254,
    height: 1254,
    sha256: 'ddfe3d4a5612110b2afd3db4f27e8e378f16558d033c53fdedf3c1af690ec849',
    master: true,
    alpha: false,
  },
  {
    id: 'mark-light-on-dark',
    role: 'brand-mark',
    intendedBackground: 'dark',
    path: 'masters/mark-light-on-dark.png',
    width: 1254,
    height: 1254,
    sha256: 'c75cb21a1c225c40cab7e1b03fcfb66f144060147ab4725a19af3534dc029871',
    master: true,
    alpha: true,
  },
  {
    id: 'mark-dark-on-light',
    role: 'brand-mark',
    intendedBackground: 'light',
    path: 'masters/mark-dark-on-light.png',
    width: 1254,
    height: 1254,
    sha256: 'cfe2486e0df5e8e9b759cdce4ede55fc46981127dba4e097f5ff0bb4285e758e',
    master: true,
    alpha: true,
  },
  {
    id: 'wordmark-dark-on-light',
    role: 'brand-wordmark',
    intendedBackground: 'light',
    path: 'masters/wordmark-dark-on-light.png',
    width: 2172,
    height: 724,
    sha256: '5ff5ccdaad0ea3a2212bb9364dafff14c67ee04f369e75d9983c012001c5d1e9',
    master: true,
    alpha: true,
  },
  {
    id: 'wordmark-light-on-dark',
    role: 'brand-wordmark',
    intendedBackground: 'dark',
    path: 'masters/wordmark-light-on-dark.png',
    width: 2172,
    height: 724,
    sha256: '6a64bbb858dbee1ff63e2c5b9a32c713d69ae610d61da135aed8aec1283ef9b3',
    master: true,
    alpha: true,
  },
];

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

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

function alphaBounds(data, width, height, channels, threshold = 0) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + channels - 1] > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('Asset contains no visible pixels');
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
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

async function assetEntry(definition, buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const metadata = await sharp(buffer).metadata();

  return {
    ...definition,
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
const cleanedPrimary = await cleanPrimary(primaryMaster);
const croppedLightMark = await cropVisible(lightMarkMaster, 4);
const purple = await primaryColor(primaryMaster);
const generated = [];

for (const size of [16, 24, 32, 48, 128]) {
  generated.push(await writeVariant({
    id: `chromium-icon-${size}`,
    role: size === 128 ? 'browser-store-icon' : 'browser-icon',
    intendedBackground: 'browser-controlled',
    path: `platform/chromium/icon-${size}.png`,
    platform: 'chromium',
  }, await transparentIcon(cleanedPrimary, size, size === 128 ? 96 : size)));
}

for (const size of [48, 72, 96, 144, 192]) {
  generated.push(await writeVariant({
    id: `android-legacy-icon-${size}`,
    role: 'legacy-launcher-icon',
    intendedBackground: 'launcher-controlled',
    path: `platform/android/legacy-icon-${size}.png`,
    platform: 'android',
  }, await transparentIcon(cleanedPrimary, size)));
}

generated.push(await writeVariant({
  id: 'android-adaptive-foreground-432',
  role: 'adaptive-icon-foreground',
  intendedBackground: 'primary-purple',
  path: 'platform/android/adaptive-foreground-432.png',
  platform: 'android',
}, await adaptiveForeground(croppedLightMark, 432)));

generated.push(await writeVariant({
  id: 'android-adaptive-background-432',
  role: 'adaptive-icon-background',
  intendedBackground: 'mask-controlled',
  path: 'platform/android/adaptive-background-432.png',
  platform: 'android',
}, await solidBackground(432, purple)));

generated.push(await writeVariant({
  id: 'android-play-store-icon-512',
  role: 'play-store-icon',
  intendedBackground: 'store-controlled',
  path: 'platform/android/play-store-icon-512.png',
  platform: 'android',
}, await opaqueIcon(croppedLightMark, 512, 0.7, purple)));

generated.push(await writeVariant({
  id: 'apple-app-icon-1024',
  role: 'app-icon-source',
  intendedBackground: 'system-mask-controlled',
  path: 'platform/apple/app-icon-1024.png',
  platform: 'apple',
}, await opaqueIcon(croppedLightMark, 1024, 0.7, purple)));

const catalog = {
  version: 1,
  primaryIcon: 'icon-primary-purple',
  primaryColor: `#${[purple.r, purple.g, purple.b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
  assets: [...masters, ...generated],
};

await writeFile(path.join(brandRoot, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Generated ${generated.length} platform brand assets`);
