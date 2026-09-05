'use client';

import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function CompleteAuth({ code, type }: { code?: string; type?: string }) {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const recovery = type === 'recovery' || hash.get('type') === 'recovery';
    if (!code && (!accessToken || !refreshToken)) {
      window.location.assign('/auth/sign-in');
      return;
    }
    const complete = code
      ? supabase.auth.exchangeCodeForSession(code)
      : supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });
    void complete.then(({ error }) => {
      window.location.assign(error ? '/auth/sign-in' : recovery ? '/auth/reset-password' : '/');
    });
  }, [code, type]);

  return <main className="auth-page">
    <section className="auth-card" aria-busy="true">
      <p className="auth-intro" role="status">Completing authentication…</p>
    </section>
  </main>;
}
