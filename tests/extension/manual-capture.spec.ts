import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function createStudyPair(page: Page) {
  await page.getByLabel('Target Language').fill('it');
  await page.getByLabel('Reference Language').fill('en');
  await page.getByRole('button', { name: 'Create Study Pair' }).click();
  await expect(page.getByLabel('Active Study Pair')).toContainText('Italian → English');
}

test.describe('manual extension capture', () => {
  test('creates a private Vocabulary Entry with a Sense, translation, and Example', async ({ extensionPage }) => {
    await createStudyPair(extensionPage);
    await extensionPage.getByLabel('Expression').fill('incontro');
    await extensionPage.getByLabel('Translation').fill('meeting');
    await extensionPage.getByLabel('Example').fill('La città gli veniva incontro.');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'incontro' })).toBeVisible();
    await expect(extensionPage.getByText('Italian → English')).toBeVisible();
    await expect(extensionPage.getByText('meeting', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('La città gli veniva incontro.')).toBeVisible();
  });

  test('accepts an entry without an Example', async ({ extensionPage }) => {
    await createStudyPair(extensionPage);
    await extensionPage.getByLabel('Expression').fill('svolta');
    await extensionPage.getByLabel('Translation').fill('turning point');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();

    await expect(extensionPage.getByRole('heading', { name: 'svolta' })).toBeVisible();
    await expect(extensionPage.getByText('turning point', { exact: true })).toBeVisible();
    await expect(extensionPage.getByText('No Example added')).toBeVisible();
  });

  test('rejects invalid language tags and incomplete material', async ({ extensionPage }) => {
    await extensionPage.getByLabel('Target Language').fill('not_a_tag');
    await extensionPage.getByLabel('Reference Language').fill('en');
    await extensionPage.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(extensionPage.getByText('Enter a valid BCP 47 language tag.')).toBeVisible();

    await extensionPage.getByLabel('Target Language').fill('it');
    await extensionPage.getByRole('button', { name: 'Create Study Pair' }).click();
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Expression is required.')).toBeVisible();
    await expect(extensionPage.getByText('Translation is required.')).toBeVisible();
  });
});
