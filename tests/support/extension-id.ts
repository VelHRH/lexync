import { createHash } from 'node:crypto';
import path from 'node:path';

export function unpackedExtensionId(extensionPath = path.resolve('apps/extension/.output/chrome-mv3')) {
  return createHash('sha256')
    .update(extensionPath)
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (nibble) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(nibble, 16)));
}
