import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

async function createStudyPair(
  page: Page,
  targetLanguage: string,
  referenceLanguage: string,
) {
  const addButton = page.getByRole('button', { name: 'Add Study Pair' });

  if (await addButton.isVisible()) {
    await addButton.click();
  }

  await page.getByLabel('Target Language').fill(targetLanguage);
  await page.getByLabel('Reference Language').fill(referenceLanguage);
  await page.getByRole('button', { name: 'Create Study Pair' }).click();
  await expect(page.getByRole('button', { name: 'Add Study Pair' })).toBeVisible();
}

test.describe('Study Pair and Expression identity', () => {
  test('keeps exactly one primary pair per Target Language and allows changing it', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'pt-br', 'en');
    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → English' })).toBeChecked();

    await createStudyPair(extensionPage, 'pt-BR', 'uk');
    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → English' })).toBeChecked();
    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → Ukrainian' })).not.toBeChecked();

    await extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → Ukrainian' }).click();
    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → Ukrainian' })).toBeChecked();
    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → English' })).not.toBeChecked();
  });

  test('rejects duplicate pairs while preserving BCP 47 variants', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'pt-br', 'en');
    await extensionPage.getByRole('button', { name: 'Add Study Pair' }).click();
    await extensionPage.getByLabel('Target Language').fill('pt-BR');
    await extensionPage.getByLabel('Reference Language').fill('en');
    await extensionPage.getByRole('button', { name: 'Create Study Pair' }).click();
    await expect(extensionPage.getByRole('status')).toContainText('already exists');

    await extensionPage.getByRole('button', { name: 'Cancel' }).click();
    await createStudyPair(extensionPage, 'pt-PT', 'en');
    await createStudyPair(extensionPage, 'zh-Hans', 'en');
    await createStudyPair(extensionPage, 'zh-Hant', 'en');

    await expect(extensionPage.getByRole('radio', { name: 'Brazilian Portuguese → English' })).toBeVisible();
    await expect(extensionPage.getByRole('radio', { name: 'European Portuguese → English' })).toBeVisible();
    await expect(extensionPage.getByRole('radio', { name: 'Simplified Chinese → English' })).toBeVisible();
    await expect(extensionPage.getByRole('radio', { name: 'Traditional Chinese → English' })).toBeVisible();
  });

  test('reuses NFC, case, trimming, and whitespace-equivalent Expressions', async ({ extensionPage }) => {
    await createStudyPair(extensionPage, 'fr', 'en');
    await extensionPage.getByLabel('Expression').fill('  CAFÉ\t AU   LAIT  ');
    await extensionPage.getByLabel('Translation').fill('coffee with milk');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await extensionPage.getByLabel('Expression').fill('cafe\u0301 au lait');
    await extensionPage.getByLabel('Translation').fill('coffee with milk');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Existing Vocabulary Entry used')).toBeVisible();

    await extensionPage.getByRole('button', { name: 'Add another entry' }).click();
    await extensionPage.getByLabel('Expression').fill('cafés au lait');
    await extensionPage.getByLabel('Translation').fill('coffees with milk');
    await extensionPage.getByRole('button', { name: 'Save Vocabulary Entry' }).click();
    await expect(extensionPage.getByText('Vocabulary Entry saved')).toBeVisible();
  });
});
