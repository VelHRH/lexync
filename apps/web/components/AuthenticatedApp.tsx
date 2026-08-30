'use client';

import { studyPairLabel, type StudyPair } from '@lexync/domain';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { StudyPairOnboarding } from './StudyPairOnboarding';

const destinations = [
  ['Home', '/'],
  ['Review', '/review'],
  ['Library', '/library'],
  ['Collections', '/collections'],
  ['Settings', '/settings'],
] as const;

export function AuthenticatedApp({ section = 'Home', publicContent, forceOnboarding = false }: { section?: string; publicContent?: ReactNode; forceOnboarding?: boolean }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [pairs, setPairs] = useState<StudyPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(true);
  const [activePairId, setActivePairId] = useState('');
  const [pairError, setPairError] = useState('');
  const [showPairForm, setShowPairForm] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void supabase.from('study_pairs').select('id,is_primary,target_language_tag,reference_language_tag').order('created_at').then(({ data, error }) => {
      if (error) {
        setPairError(error.message);
        setPairsLoading(false);
        return;
      }
      const nextPairs = (data ?? []).map((pair) => ({
        id: pair.id,
        isPrimary: pair.is_primary,
        referenceLanguageTag: pair.reference_language_tag,
        targetLanguageTag: pair.target_language_tag,
      }));
      setPairs(nextPairs);
      const remembered = window.localStorage.getItem('lexync-active-study-pair');
      setActivePairId((current) => current || (remembered && nextPairs.some((pair) => pair.id === remembered) ? remembered : nextPairs[0]?.id || ''));
      setPairsLoading(false);
    });
  }, [session]);

  useEffect(() => {
    if (!forceOnboarding && !pairsLoading && session && pairs.length === 0) window.location.assign('/onboarding/study-pair');
  }, [forceOnboarding, pairs.length, pairsLoading, section, session]);

  useEffect(() => {
    if (!loading && !session && !publicContent && !signingOut) window.location.assign(`/auth/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, publicContent, session, signingOut]);

  if (loading) return <main className="auth-loading" aria-busy="true">Loading your private library…</main>;
  if (!session) return <>{publicContent ?? <main className="auth-loading" aria-busy="true">Redirecting to sign in…</main>}</>;
  if (forceOnboarding) return <StudyPairOnboarding onCreated={() => window.location.assign('/')} />;
  if (pairsLoading) return <main className="auth-loading" aria-busy="true">Loading your Study Pairs…</main>;
  if (pairError) return <main className="auth-loading" role="alert">Unable to load your Study Pairs: {pairError}</main>;
  if (pairs.length === 0) return <main className="auth-loading" aria-busy="true">Opening onboarding…</main>;

  const activeSection = destinations.find(([label]) => label.toLowerCase() === section.toLowerCase())?.[0] ?? section;

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  async function setPrimary(pairId: string) {
    const { error } = await supabase.rpc('set_primary_study_pair', { p_study_pair_id: pairId });
    if (error) return;
    const selected = pairs.find((pair) => pair.id === pairId);
    if (!selected) return;
    setPairs((current) => current.map((pair) => ({ ...pair, isPrimary: pair.targetLanguageTag === selected.targetLanguageTag ? pair.id === pairId : pair.isPrimary })));
  }

  async function deletePair(pairId: string) {
    if (pairs.length === 1) return;
    const { count, error: countError } = await supabase.from('vocabulary_entries').select('id', { count: 'exact', head: true }).eq('study_pair_id', pairId);
    if (countError || (count ?? 0) > 0) {
      setPairError('Only empty Study Pairs can be deleted.');
      return;
    }
    const selected = pairs.find((pair) => pair.id === pairId);
    const replacement = selected?.isPrimary
      ? pairs.find((pair) => pair.id !== pairId && pair.targetLanguageTag === selected.targetLanguageTag)
      : undefined;
    if (replacement) {
      const primaryResult = await supabase.rpc('set_primary_study_pair', { p_study_pair_id: replacement.id });
      if (primaryResult.error) return;
    }
    const { error } = await supabase.from('study_pairs').delete().eq('id', pairId);
    if (error) return;
    setPairs((current) => current.filter((pair) => pair.id !== pairId).map((pair) => replacement && pair.id === replacement.id ? { ...pair, isPrimary: true } : pair));
    if (activePairId === pairId) setActivePairId(pairs.find((pair) => pair.id !== pairId)?.id ?? '');
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
          <label className="pair-selector-label" htmlFor="active-study-pair">Active Study Pair</label>
          <select id="active-study-pair" aria-label="Active Study Pair" value={activePairId} onChange={(event) => { setActivePairId(event.target.value); window.localStorage.setItem('lexync-active-study-pair', event.target.value); }}>
            {pairs.map((pair) => <option key={pair.id} value={pair.id}>{studyPairLabel(pair)}</option>)}
          </select>
          {pairError && <p className="form-notice error" role="alert">{pairError}</p>}
          <div className="pair-management">
            <button className="secondary-button" type="button" onClick={() => setShowPairForm((current) => !current)}>Add Study Pair</button>
            {pairs.map((pair) => <div className="pair-row" key={pair.id}>
              <span>{studyPairLabel(pair)} {pair.isPrimary && <strong>Primary</strong>}</span>
              <div>
                <button className="text-button" type="button" onClick={() => void setPrimary(pair.id)} disabled={pair.isPrimary}>Make primary {studyPairLabel(pair)}</button>
                <button className="text-button danger" type="button" onClick={() => void deletePair(pair.id)} disabled={pairs.length === 1} title="Only empty Study Pairs can be deleted">Delete {studyPairLabel(pair)}</button>
              </div>
            </div>)}
          </div>
          {showPairForm && <StudyPairOnboarding completeImmediately onCreated={(pair) => { setPairs((current) => [...current, pair]); setActivePairId(pair.id); window.localStorage.setItem('lexync-active-study-pair', pair.id); setShowPairForm(false); }} />}
        </section>
      </div>
    </main>
  );
}
