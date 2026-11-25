import { expect, type Locator } from '@playwright/test';

export function entryCollectionPicker(entry: Locator, expression: string) {
  return entry.getByRole('combobox', { name: `Add ${expression} to a collection` });
}

export function removeFromCollectionButton(entry: Locator, expression: string, collection: string) {
  return entry.getByRole('button', { name: `Remove ${expression} from ${collection}` });
}

export async function openEntryCollectionPicker(entry: Locator, expression: string) {
  await entry.getByRole('button', { name: 'Add to collection' }).click();
  const picker = entryCollectionPicker(entry, expression);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveAttribute('aria-expanded', 'true');
  return picker;
}

export async function addEntryToCollection(entry: Locator, expression: string, collection: string) {
  const picker = await openEntryCollectionPicker(entry, expression);
  await picker.fill(collection);
  await entry.getByRole('option', { name: collection, exact: true }).click();
  await expect(removeFromCollectionButton(entry, expression, collection)).toBeVisible();
}

export async function createCollectionFromEntry(entry: Locator, expression: string, collection: string) {
  const picker = await openEntryCollectionPicker(entry, expression);
  await picker.fill(collection);
  await entry.getByRole('option', { name: `Create “${collection}”` }).click();
  await expect(removeFromCollectionButton(entry, expression, collection)).toBeVisible();
}
