'use client';

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'implicit',
      persistSession: true,
      storageKey: 'lexync.web.auth.session',
    },
  },
);
