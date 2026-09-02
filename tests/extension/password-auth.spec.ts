import { createClient } from '@supabase/supabase-js';
import type { APIRequestContext } from '@playwright/test';
import { expect, extensionId, test } from './fixtures';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;

function credentials() {
  return {
    email: `learner-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  };
}

async function registerLearner(email: string, password: string) {
  if (!supabasePublishableKey) {
    throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required for extension acceptance tests.');
  }

  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signUp({ email, password });

  if (error) {
    throw error;
  }

  await client.auth.signOut();
}

async function recoveryLink(request: APIRequestContext, email: string) {
  let messageId = '';

  await expect.poll(async () => {
    const response = await request.get('http://127.0.0.1:54324/api/v1/search', {
      params: { query: `to:${email}` },
    });
    const result = await response.json() as { messages?: Array<{ ID: string }> };
    messageId = result.messages?.[0]?.ID ?? '';
    return messageId;
  }).not.toBe('');

  const response = await request.get(`http://127.0.0.1:54324/api/v1/message/${messageId}`);
  const message = await response.json() as { HTML?: string; Text?: string };
  const content = `${message.HTML ?? ''}\n${message.Text ?? ''}`.replaceAll('&amp;', '&');
  const link = content.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];

  if (!link) {
    throw new Error('The password recovery link is missing from the local email.');
  }

  return link;
}

test.describe('password authentication', () => {
  test('registers a Learner with email and password', async ({ extensionContext }) => {
    const account = credentials();
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);

    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByLabel('Confirm password').fill(account.password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText(account.email)).toBeVisible();
  });

  test('signs an existing Learner in with email and password', async ({ extensionContext }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);

    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(account.email)).toBeVisible();
  });

  test('requests a password recovery email', async ({ extensionContext }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);

    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(account.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('status')).toContainText('Check your email');
  });

  test('chooses a new password from the recovery email', async ({ extensionContext, request }) => {
    const account = credentials();
    await registerLearner(account.email, account.password);
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);

    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(account.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    const link = await recoveryLink(request, account.email);
    await page.goto(link);

    await expect(page).toHaveURL(new RegExp(`^chrome-extension://${id}/auth-callback.html`));
    await page.getByLabel('New password', { exact: true }).fill(`${account.password}-new`);
    await page.getByLabel('Confirm new password').fill(`${account.password}-new`);
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByRole('status')).toContainText('Password updated', { timeout: 15_000 });
  });
});
