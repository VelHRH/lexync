import { createHash } from 'node:crypto';

export const masters = [
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

export const requiredVariants = [
  ...[16, 24, 32, 48, 128].map((size) => ({
    id: `chromium-icon-${size}`,
    role: size === 128 ? 'browser-store-icon' : 'browser-icon',
    intendedBackground: 'browser-controlled',
    path: `platform/chromium/icon-${size}.png`,
    platform: 'chromium',
    width: size,
    height: size,
    master: false,
    alpha: true,
    render: 'transparent-primary',
    artworkSize: size === 128 ? 96 : size,
  })),
  ...[48, 72, 96, 144, 192].map((size) => ({
    id: `android-legacy-icon-${size}`,
    role: 'legacy-launcher-icon',
    intendedBackground: 'launcher-controlled',
    path: `platform/android/legacy-icon-${size}.png`,
    platform: 'android',
    width: size,
    height: size,
    master: false,
    alpha: true,
    render: 'transparent-primary',
    artworkSize: size,
  })),
  {
    id: 'android-adaptive-foreground-432',
    role: 'adaptive-icon-foreground',
    intendedBackground: 'primary-purple',
    path: 'platform/android/adaptive-foreground-432.png',
    platform: 'android',
    width: 432,
    height: 432,
    master: false,
    alpha: true,
    render: 'adaptive-foreground',
  },
  {
    id: 'android-adaptive-background-432',
    role: 'adaptive-icon-background',
    intendedBackground: 'mask-controlled',
    path: 'platform/android/adaptive-background-432.png',
    platform: 'android',
    width: 432,
    height: 432,
    master: false,
    alpha: false,
    render: 'solid-background',
  },
  {
    id: 'android-play-store-icon-512',
    role: 'play-store-icon',
    intendedBackground: 'store-controlled',
    path: 'platform/android/play-store-icon-512.png',
    platform: 'android',
    width: 512,
    height: 512,
    master: false,
    alpha: false,
    render: 'opaque-mark',
    markRatio: 0.7,
  },
  {
    id: 'apple-app-icon-1024',
    role: 'app-icon-source',
    intendedBackground: 'system-mask-controlled',
    path: 'platform/apple/app-icon-1024.png',
    platform: 'apple',
    width: 1024,
    height: 1024,
    master: false,
    alpha: false,
    render: 'opaque-mark',
    markRatio: 0.7,
  },
];

export function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function alphaBounds(data, width, height, channels, threshold = 0) {
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
