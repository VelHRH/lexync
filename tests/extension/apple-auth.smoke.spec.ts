import { expect, test } from '@playwright/test';
import path from 'node:path';

test('returns the same Apple Learner identity to the extension', async ({ playwright }) => {
  test.skip(process.env.LEXYNC_APPLE_SMOKE !== 'true', 'Requires configured Apple and Supabase OAuth credentials.');

  const profilePath = process.env.LEXYNC_APPLE_PROFILE_PATH;
  const expectedEmail = process.env.LEXYNC_APPLE_LEARNER_EMAIL;

  if (!profilePath || !expectedEmail) {
    throw new Error('LEXYNC_APPLE_PROFILE_PATH and LEXYNC_APPLE_LEARNER_EMAIL are required.');
  }

  const extensionPath = path.resolve('apps/extension/.output/chrome-mv3');
  const context = await playwright.chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('button', { name: 'Sign in with Apple' }).click();

  await expect(popup.getByText(expectedEmail)).toBeVisible({ timeout: 180_000 });
  await context.close();
});
