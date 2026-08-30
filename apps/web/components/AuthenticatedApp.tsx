'use client';

import type { Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const destinations = [
  ['Home', '/'],
  ['Review', '/review'],
  ['Library', '/library'],
  ['Collections', '/collections'],
  ['Settings', '/settings'],
] as const;

export function AuthenticatedApp({ section = 'Home', publicContent }: { section?: string; publicContent?: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loading && !session && !publicContent && !signingOut) window.location.assign(`/auth/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, publicContent, session, signingOut]);

  if (loading) return <main className="auth-loading" aria-busy="true">Loading your private library…</main>;
  if (!session) return <>{publicContent ?? <main className="auth-loading" aria-busy="true">Redirecting to sign in…</main>}</>;

  const activeSection = destinations.find(([label]) => label.toLowerCase() === section.toLowerCase())?.[0] ?? section;

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="auth-brand" href="/" aria-label="Lexync home">Lexync</Link>
        <button className="secondary-button" type="button" onClick={signOut}>Sign out</button>
      </header>
      <div className="app-body">
        <nav className="app-navigation" aria-label="Main navigation">
          {destinations.map(([label, href]) => <Link className={activeSection === label ? 'active' : ''} href={href} key={href}>{label}</Link>)}
        </nav>
        <section className="app-content" aria-labelledby="app-heading">
          <p className="eyebrow"><span /> Your private learning space</p>
          <h1 id="app-heading">{activeSection}</h1>
          <p className="app-empty">Your {activeSection.toLowerCase()} will appear here as you build your language library.</p>
        </section>
      </div>
    </main>
  );
}
