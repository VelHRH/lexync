import type { Locator, Page } from '@playwright/test';

async function locateWordCenter(locator: Locator, word: string) {
  return locator.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      const index = text.indexOf(target);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      node = walker.nextNode();
    }
    return null;
  }, word);
}

export async function selectWord(page: Page, locator: Locator, word: string) {
  const point = await locateWordCenter(locator, word);
  if (!point) throw new Error(`"${word}" was not found inside the element.`);
  await page.mouse.dblclick(point.x, point.y);
}

export async function selectPhrase(page: Page, locator: Locator, phrase: string) {
  const found = await locator.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? '';
      const index = text.indexOf(target);
      if (index >= 0) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + target.length);
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
      node = walker.nextNode();
    }
    return false;
  }, phrase);
  if (!found) throw new Error(`"${phrase}" was not found inside the element.`);
}
