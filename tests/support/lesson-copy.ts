import { expect, type Page } from '@playwright/test';

export async function expectNoLearnerFacingTechnicalTerms(page: Page) {
  await expect(page.locator('body')).not.toContainText(/\b(?:RAG|embedding|vector|chunk|passage|similarity|threshold|model|provider|Gemini)\b/i);
}
