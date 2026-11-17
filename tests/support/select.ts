import { expect, type Locator, type Page } from '@playwright/test';

type OptionChoice = string | { label: string };

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function themedSelect(page: Page, label: string): Locator {
  return page.getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`) });
}

export function themedSelectListbox(page: Page, label: string): Locator {
  return page.getByRole('listbox', { name: label, exact: true });
}

export async function chooseOption(page: Page, label: string, choice: OptionChoice) {
  await themedSelect(page, label).click();
  const listbox = themedSelectListbox(page, label);
  const option = typeof choice === 'string'
    ? listbox.locator(`[role="option"][data-value="${choice}"]`)
    : listbox.getByRole('option', { name: choice.label, exact: true });
  await option.click();
  await expect(listbox).toBeHidden();
}

export async function expectSelectValue(page: Page, label: string, value: string) {
  await expect(themedSelect(page, label)).toHaveAttribute('data-value', value);
}
