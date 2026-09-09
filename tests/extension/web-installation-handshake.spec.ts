import type { Session } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { expect, extensionId, test } from './fixtures';

async function establishWebSession(page: Page, session: Session) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('lexync.web.auth.session', JSON.stringify(value));
  }, session);
  await page.goto('http://127.0.0.1:3000/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}

async function sendExternalMessage(page: Page, id: string, message: unknown) {
  return page.evaluate(async ({ extensionId, message }) => {
    type RuntimeApi = { sendMessage: (extensionId: string, message: unknown) => Promise<unknown> };
    const runtime = (globalThis as typeof globalThis & { chrome?: { runtime?: RuntimeApi } }).chrome?.runtime;
    if (!runtime) return { kind: 'unavailable' as const };
    try {
      return { kind: 'response' as const, value: await runtime.sendMessage(extensionId, message) };
    } catch {
      return { kind: 'rejected' as const };
    }
  }, { extensionId: id, message });
}

test.describe('web-to-extension installation handshake', () => {
  test('detects the loaded extension with a narrow public response and suppresses the recommendation', async ({ extensionContext, learnerClient }) => {
    const { error } = await learnerClient.rpc('create_learning_language', { p_language_tag: 'es' });
    if (error) throw error;
    const { data } = await learnerClient.auth.getSession();
    if (!data.session) throw new Error('The test Learner session is unavailable.');
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await establishWebSession(page, data.session);
    await expect(page.getByRole('region', { name: /Add the Lexync extension/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: /Add the Lexync extension/i })).toHaveCount(0);

    const handshake = await sendExternalMessage(page, id, { type: 'web-extension:handshake', protocol: 1 });
    expect(handshake.kind).toBe('response');
    if (handshake.kind !== 'response' || !handshake.value || typeof handshake.value !== 'object') throw new Error('The extension handshake did not return a public payload.');
    const payload = handshake.value as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({ version: expect.any(String), capabilities: expect.any(Array) }));
    expect(Object.keys(payload).every((key) => ['type', 'version', 'capabilities'].includes(key))).toBe(true);
    expect(Object.keys(payload).some((key) => /account|token|language|vocab|url|page|content|session/i.test(key))).toBe(false);
  });

  test('does not answer the handshake from an unallowlisted web origin', async ({ extensionContext }) => {
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    const response = await page.goto('http://localhost:3000/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Keep the words you choose.' })).toBeVisible();
    const result = await sendExternalMessage(page, id, { type: 'web-extension:handshake', protocol: 1 });
    if (result.kind === 'response') {
      expect(result.value).toBeUndefined();
    } else {
      expect(['unavailable', 'rejected']).toContain(result.kind);
    }
  });

  test('does not expose a privileged result to an unexpected external request', async ({ extensionContext, extensionPage }) => {
    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto('http://127.0.0.1:3000/');
    await extensionPage.close();
    const result = await sendExternalMessage(page, id, { type: 'web-extension:private-data', accountId: 'probe' });
    if (result.kind === 'response') {
      expect(result.value).toBeUndefined();
    } else {
      expect(['unavailable', 'rejected']).toContain(result.kind);
    }
  });
});
