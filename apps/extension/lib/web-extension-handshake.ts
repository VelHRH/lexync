export const defaultWebUrl = 'http://127.0.0.1:3000';

export function webOrigin(url: string): string {
  return new URL(url).origin;
}

export function webOriginPattern(url: string): string {
  return `${webOrigin(url)}/*`;
}

export type WebExtensionHandshakeRequest = {
  protocol: 1;
  type: 'web-extension:handshake';
};

export function isWebExtensionHandshakeRequest(value: unknown): value is WebExtensionHandshakeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('protocol') || !keys.includes('type')) return false;
  const request = value as Record<string, unknown>;
  return request.protocol === 1 && request.type === 'web-extension:handshake';
}
