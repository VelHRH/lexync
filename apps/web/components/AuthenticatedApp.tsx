'use client';

import { canonicalLanguageTag, studyPairLabel, type StudyPair } from '@lexync/domain';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { Suspense, type ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { StudyPairOnboarding } from './StudyPairOnboarding';
import { VocabularyLibrary } from './VocabularyLibrary';

const destinations = [
  ['Home', '/'],
  ['Review', '/review'],
  ['Library', '/library'],
  ['Collections', '/collections'],
  ['Settings', '/settings'],
] as const;

type ManagedStudyPair = StudyPair & { entryCount: number };
type StudyPairOverview = { entry_count: number; id: string; is_primary: boolean; reference_language_tag: string; target_language_tag: string };

function toManagedStudyPair(pair: StudyPairOverview): ManagedStudyPair {
  return {
    entryCount: pair.entry_count,
    id: pair.id,
    isPrimary: pair.is_primary,
    referenceLanguageTag: pair.reference_language_tag,
    targetLanguageTag: pair.target_language_tag,
  };
}

export function AuthenticatedApp({ section = 'Home', publicContent, forceOnboarding = false }: { section?: string; publicContent?: ReactNode; forceOnboarding?: boolean }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [pairs, setPairs] = useState<ManagedStudyPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(true);
  const [activePairId, setActivePairId] = useState('');
  const [pairError, setPairError] = useState('');
  const [showPairForm, setShowPairForm] = useState(false);
  const [editingPairId, setEditingPairId] = useState('');
  const [targetLanguageDraft, setTargetLanguageDraft] = useState('');
  const [referenceLanguageDraft, setReferenceLanguageDraft] = useState('');
  const [pairSaving, setPairSaving] = useState(false);
  const [deletingPairId, setDeletingPairId] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const online = useOnlineStatus();

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
    void supabase.rpc('study_pair_overview').then(({ data, error }) => {
      if (error) {
        setPairError(error.message);
        setPairsLoading(false);
        return;
      }
      const nextPairs: ManagedStudyPair[] = (data ?? []).map((pair: StudyPairOverview) => toManagedStudyPair(pair));
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

  async function refreshEntryCounts() {
    const { data, error } = await supabase.rpc('study_pair_overview');
    if (error) {
      setPairError(error.message);
      return;
    }
    setPairs((data ?? []).map((pair: StudyPairOverview) => toManagedStudyPair(pair)));
  }

  function editPair(pair: ManagedStudyPair) {
    setPairError('');
    setEditingPairId(pair.id);
    setTargetLanguageDraft(pair.targetLanguageTag);
    setReferenceLanguageDraft(pair.referenceLanguageTag);
  }

  async function savePairLanguages(pair: ManagedStudyPair) {
    const targetTag = canonicalLanguageTag(targetLanguageDraft);
    const referenceTag = canonicalLanguageTag(referenceLanguageDraft);
    if (!targetTag || !referenceTag) {
      setPairError('Enter a valid BCP 47 language tag.');
      return;
    }
    if (targetTag === referenceTag) {
      setPairError('Target and Reference Languages must be different.');
      return;
    }
    setPairSaving(true);
    setPairError('');
    const { data, error } = await supabase.rpc('update_empty_study_pair_languages', {
      p_reference_language_tag: referenceTag,
      p_study_pair_id: pair.id,
      p_target_language_tag: targetTag,
    });
    setPairSaving(false);
    if (error) {
      setPairError(error.message);
      return;
    }
    const oldReplacement = pair.isPrimary && pair.targetLanguageTag !== data.target_language_tag
      ? pairs.find((candidate) => candidate.id !== pair.id && candidate.targetLanguageTag === pair.targetLanguageTag)
      : undefined;
    setPairs((current) => current.map((candidate) => {
      if (candidate.id === pair.id) return {
        ...candidate,
        isPrimary: data.is_primary,
        referenceLanguageTag: data.reference_language_tag,
        targetLanguageTag: data.target_language_tag,
      };
      if (oldReplacement && candidate.id === oldReplacement.id) return { ...candidate, isPrimary: true };
      if (data.is_primary && candidate.targetLanguageTag === data.target_language_tag) return { ...candidate, isPrimary: false };
      return candidate;
    }));
    setEditingPairId('');
  }

  function beginDeletePair(pairId: string) {
    setDeletingPairId(pairId);
    setDeleteConfirmation('');
    setDeleteError('');
  }

  async function deletePair(pair: ManagedStudyPair, confirmation = deleteConfirmation) {
    const label = studyPairLabel(pair);
    if (confirmation !== label) return;
    setPairSaving(true);
    setDeleteError('');
    const { error } = await supabase.rpc('delete_study_pair', {
      p_confirmation: `${pair.targetLanguageTag} → ${pair.referenceLanguageTag}`,
      p_study_pair_id: pair.id,
    });
    setPairSaving(false);
    if (error) {
      setDeleteError(`Study Pair could not be deleted. ${error.message}`);
      return;
    }
    const remainingPairs = pairs.filter((candidate) => candidate.id !== pair.id);
    const replacement = pair.isPrimary
      ? remainingPairs.find((candidate) => candidate.targetLanguageTag === pair.targetLanguageTag)
      : undefined;
    const nextPairs = remainingPairs.map((candidate) => replacement && candidate.id === replacement.id ? { ...candidate, isPrimary: true } : candidate);
    const nextActivePairId = activePairId === pair.id ? nextPairs[0]?.id ?? '' : activePairId;
    setPairs(nextPairs);
    setActivePairId(nextActivePairId);
    if (nextActivePairId) window.localStorage.setItem('lexync-active-study-pair', nextActivePairId);
    else window.localStorage.removeItem('lexync-active-study-pair');
    setDeletingPairId('');
    setDeleteConfirmation('');
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="auth-brand" href="/" aria-label="Lexync home">Lexync</Link>
        <div>
          {online ? <Link className="secondary-button" href="/library?add=1">Add vocabulary</Link> : <span className="secondary-button disabled" aria-disabled="true" aria-label="Add vocabulary unavailable offline">Add vocabulary</span>}
          <button className="secondary-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-navigation" aria-label="Main navigation">
          {destinations.map(([label, href]) => <Link className={activeSection === label ? 'active' : ''} href={href} key={href}>{label}</Link>)}
        </nav>
        <section className="app-content" aria-labelledby="app-heading">
          <p className="eyebrow"><span /> Your private learning space</p>
          <h1 id="app-heading">{activeSection}</h1>
          <p className="app-empty">Your {activeSection.toLowerCase()} will appear here as you build your language library.</p>
          {activeSection === 'Library' && <Suspense fallback={<p className="app-empty">Loading your vocabulary…</p>}><VocabularyLibrary key={(pairs.find((pair) => pair.id === activePairId) ?? pairs[0]).id} onEntriesChanged={refreshEntryCounts} pair={pairs.find((pair) => pair.id === activePairId) ?? pairs[0]} pairs={pairs} /></Suspense>}
          <label className="pair-selector-label" htmlFor="active-study-pair">Active Study Pair</label>
          <select id="active-study-pair" aria-label="Active Study Pair" value={activePairId} onChange={(event) => { setActivePairId(event.target.value); window.localStorage.setItem('lexync-active-study-pair', event.target.value); }}>
            {pairs.map((pair) => <option key={pair.id} value={pair.id}>{studyPairLabel(pair)}</option>)}
          </select>
          {pairError && <p className="form-notice error" role="alert">{pairError}</p>}
          {!online && <p className="form-notice" role="status">Study Pair repair requires a connection.</p>}
          <div className="pair-management">
            <button className="secondary-button" type="button" disabled={!online} onClick={() => setShowPairForm((current) => !current)}>Add Study Pair</button>
            {pairs.map((pair) => <div className="pair-row" key={pair.id}>
              <div className="pair-row-heading">
                <span>{studyPairLabel(pair)} {pair.isPrimary && <strong>Primary</strong>}</span>
                {pair.entryCount > 0 && <p className="app-empty">Languages are locked because this Study Pair owns Vocabulary Entries.</p>}
              </div>
              {editingPairId === pair.id ? <form className="pair-language-form" onSubmit={(event) => { event.preventDefault(); void savePairLanguages(pair); }}>
                <label htmlFor={`pair-target-${pair.id}`}>Target Language for {studyPairLabel(pair)}</label>
                <input id={`pair-target-${pair.id}`} value={targetLanguageDraft} onChange={(event) => setTargetLanguageDraft(event.target.value)} />
                <label htmlFor={`pair-reference-${pair.id}`}>Reference Language for {studyPairLabel(pair)}</label>
                <input id={`pair-reference-${pair.id}`} value={referenceLanguageDraft} onChange={(event) => setReferenceLanguageDraft(event.target.value)} />
                <div>
                  <button className="text-button" type="submit" disabled={pairSaving}>Save languages</button>
                  <button className="text-button" type="button" onClick={() => setEditingPairId('')}>Cancel</button>
                </div>
              </form> : <div className="pair-row-actions">
                <button className="text-button" type="button" onClick={() => editPair(pair)} disabled={!online || pair.entryCount > 0}>Edit languages for {studyPairLabel(pair)}</button>
                <button className="text-button" type="button" onClick={() => void setPrimary(pair.id)} disabled={!online || pair.isPrimary}>Make primary {studyPairLabel(pair)}</button>
                <button className="text-button danger" type="button" onClick={() => beginDeletePair(pair.id)} disabled={!online || pairs.length === 1}>Delete {studyPairLabel(pair)}</button>
              </div>}
            </div>)}
          </div>
          {showPairForm && <StudyPairOnboarding completeImmediately onCreated={(pair) => { setPairs((current) => [...current, { ...pair, entryCount: 0 }]); setActivePairId(pair.id); window.localStorage.setItem('lexync-active-study-pair', pair.id); setShowPairForm(false); }} />}
          {deletingPairId && (() => {
            const pair = pairs.find((candidate) => candidate.id === deletingPairId);
            if (!pair) return null;
            const label = studyPairLabel(pair);
            return <section className="pair-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="pair-delete-heading">
              <h2 id="pair-delete-heading">Delete {label}</h2>
              <p>Vocabulary Entries, private Senses, translations, Examples, Collections, and learning progress will be permanently deleted.</p>
              <label htmlFor="pair-delete-confirmation">Type {label} to confirm</label>
              <input id="pair-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
              {deleteError && <p className="form-notice error" role="alert">{deleteError}</p>}
              <div>
                <button className="secondary-button danger" type="button" disabled={pairSaving || deleteConfirmation !== label} onClick={() => void deletePair(pair)}>Delete Study Pair</button>
                <button className="secondary-button" type="button" disabled={pairSaving} onClick={() => { setDeletingPairId(''); setDeleteConfirmation(''); setDeleteError(''); }}>Cancel</button>
              </div>
            </section>;
          })()}
        </section>
      </div>
    </main>
  );
}
