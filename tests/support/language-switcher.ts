import { expect, type Locator, type Page } from '@playwright/test';

export function learningLanguageSwitcher(page: Page): Locator {
  return page.getByLabel('Active Learning Language');
}

export async function selectLearningLanguage(page: Page, learningLanguageId: string) {
  const trigger = learningLanguageSwitcher(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await trigger.click();
  await page.locator(`.language-switcher-menu [role="option"][data-value="${learningLanguageId}"]`).click();
  await expect(trigger).toHaveAttribute('data-value', learningLanguageId);
}

export async function expectActiveLearningLanguage(page: Page, learningLanguageId: string) {
  await expect(learningLanguageSwitcher(page)).toHaveAttribute('data-value', learningLanguageId);
}
