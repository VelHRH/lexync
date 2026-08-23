import { createClient } from '@supabase/supabase-js';

export const authStorageKey = 'lexync.auth.session';

const chromeStorage = {
  async getItem(key: string): Promise<string | null> {
    const values = await browser.storage.local.get(key);
    const value = values[key];
    return typeof value === 'string' ? value : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await browser.storage.local.remove(key);
  },
};

export const supabase = createClient(
  import.meta.env.WXT_PUBLIC_SUPABASE_URL,
  import.meta.env.WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: chromeStorage,
      storageKey: authStorageKey,
    },
  },
);
