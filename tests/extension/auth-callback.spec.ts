import { expect, extensionId, test } from './fixtures';

test('returns the web authentication response to the loaded extension', async ({ extensionContext }) => {
  const id = await extensionId(extensionContext);
  const page = await extensionContext.newPage();
  const callback = new URL('http://127.0.0.1:3000/auth/callback');
  callback.searchParams.set('extension_id', id);
  callback.searchParams.set('error', 'access_denied');
  callback.searchParams.set('error_description', 'Authentication was cancelled.');

  await page.goto(callback.toString());

  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${id}/auth-callback.html`));
  await expect(page.getByText('Authentication was cancelled.')).toBeVisible();
});
