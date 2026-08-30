import { fileURLToPath } from 'node:url';
import { defineWxtModule } from 'wxt/modules';

const brandAssets = [
  ['../../../assets/brand/platform/chromium/icon-16.png', 'icons/icon-16.png'],
  ['../../../assets/brand/platform/chromium/icon-24.png', 'icons/icon-24.png'],
  ['../../../assets/brand/platform/chromium/icon-32.png', 'icons/icon-32.png'],
  ['../../../assets/brand/platform/chromium/icon-48.png', 'icons/icon-48.png'],
  ['../../../assets/brand/platform/chromium/icon-128.png', 'icons/icon-128.png'],
  ['../../../assets/brand/masters/mark-dark-on-light.png', 'brand/mark-dark-on-light.png'],
  ['../../../assets/brand/masters/wordmark-dark-on-light.png', 'brand/wordmark-dark-on-light.png'],
] as const;

export default defineWxtModule((wxt) => {
  wxt.hook('build:publicAssets', (_, assets) => {
    for (const [source, destination] of brandAssets) {
      assets.push({
        absoluteSrc: fileURLToPath(new URL(source, import.meta.url)),
        relativeDest: destination,
      });
    }
  });
});
