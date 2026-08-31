'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

function getClient() {
  if (client) return client;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required to use the web client.');
  client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321', publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'implicit',
      persistSession: true,
      storageKey: 'lexync.web.auth.session',
    },
  });
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const resolvedClient = getClient();
    const value = Reflect.get(resolvedClient, property, resolvedClient);
    return typeof value === 'function' ? value.bind(resolvedClient) : value;
  },
});
