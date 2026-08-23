import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const supabaseUrl = process.env.LEXYNC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabasePublishableKey = process.env.LEXYNC_SUPABASE_PUBLISHABLE_KEY;
const extensionPath = path.resolve('apps/extension/.output/chrome-mv3');
const authStorageKey = 'lexync.auth.session';

type Fixtures = {
  extensionContext: BrowserContext;
  extensionPage: Page;
  learnerClient: SupabaseClient;
};

async function createLearner(): Promise<{ client: SupabaseClient; session: Session }> {
  if (!supabasePublishableKey) {
    throw new Error('LEXYNC_SUPABASE_PUBLISHABLE_KEY is required for extension acceptance tests.');
  }

  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const suffix = `${Date.now()}-${crypto.randomUUID()}`;
  const { data, error } = await client.auth.signUp({
    email: `learner-${suffix}@example.test`,
    password: `Lexync-${crypto.randomUUID()}-test`,
  });

  if (error || !data.session) {
    throw error ?? new Error('Local Supabase did not create a test Learner session.');
  }

  return { client, session: data.session };
}

export async function extensionId(context: BrowserContext): Promise<string> {
  let worker = context.serviceWorkers()[0];
  worker ??= await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

async function establishSession(page: Page, session: Session): Promise<void> {
  await page.evaluate(
    ([key, value]) => chrome.storage.local.set({ [key]: value }),
    [authStorageKey, JSON.stringify(session)],
  );
  await page.reload();
  await expect(page.getByText(session.user.email ?? '')).toBeVisible();
}

export const test = base.extend<Fixtures>({
  extensionContext: async ({}, use) => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'lexync-extension-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
  learnerClient: async ({}, use) => {
    const { client } = await createLearner();
    await use(client);
    await client.from('study_pairs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await client.auth.signOut();
  },
  extensionPage: async ({ extensionContext, learnerClient }, use) => {
    const { data } = await learnerClient.auth.getSession();
    const session = data.session;

    if (!session) {
      throw new Error('The test Learner session is unavailable.');
    }

    const id = await extensionId(extensionContext);
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await establishSession(page, session);
    await use(page);
  },
});

export { expect };
