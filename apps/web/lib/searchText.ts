export function normalizeSearchText(value: string): string {
  return value.normalize('NFC').trim().replaceAll(/\s+/gu, ' ').toLocaleLowerCase();
}
