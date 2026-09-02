'use client';

import { canonicalLanguageTag, languageName, type RecognitionReviewEvent, type StudyPair } from '@lexync/domain';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { Suspense, type ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { StudyPairOnboarding, type LearningLanguage } from './StudyPairOnboarding';
import { ScheduledRecognition, type LearningRecognitionCard } from './ScheduledRecognition';
import { VocabularyLibrary } from './VocabularyLibrary';

const destinations = [
  ['Home', '/'],
  ['Review', '/review'],
  ['Library', '/library'],
  ['Collections', '/collections'],
  ['Settings', '/settings'],
] as const;

type LearningLanguageRow = { id: string; language_tag: string };
type CompatibilityPair = StudyPair & { learningLanguageId: string };
type LearningReviewOverview = {
  answer_language_tag: string;
  created_at: string;
  direction: 'recognition' | 'recall';
  events: RecognitionReviewEvent[];
  expression: string;
  id: string;
  learning_language_id: string;
  learning_language_tag: string;
  sense_id: string;
  suspended: boolean;
  translations: string[];
};

function toLearningLanguage(row: LearningLanguageRow): LearningLanguage {
  return { id: row.id, languageTag: row.language_tag };
}

function toReviewCard(card: LearningReviewOverview): LearningRecognitionCard {
  return {
    answerLanguageTag: card.answer_language_tag,
    createdAt: card.created_at,
    direction: card.direction,
    events: card.events,
    expression: card.expression,
    id: card.id,
    learningLanguageId: card.learning_language_id,
    learningLanguageTag: card.learning_language_tag,
    senseId: card.sense_id,
    suspended: card.suspended,
    translations: card.translations,
  };
}

export function AuthenticatedApp({ section = 'Home', publicContent, forceOnboarding = false }: { section?: string; publicContent?: ReactNode; forceOnboarding?: boolean }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  const [activeLanguageId, setActiveLanguageId] = useState('');
  const [languagesLoading, setLanguagesLoading] = useState(true);
  const [languageError, setLanguageError] = useState('');
  const [pairs, setPairs] = useState<CompatibilityPair[]>([]);
  const [recognitionCards, setRecognitionCards] = useState<LearningRecognitionCard[]>([]);
  const [recognitionLoading, setRecognitionLoading] = useState(true);
  const [recognitionError, setRecognitionError] = useState('');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageSaving, setLanguageSaving] = useState(false);
  const [removingLanguageId, setRemovingLanguageId] = useState('');
  const online = useOnlineStatus();

  const loadLanguages = useCallback(async () => {
    setLanguagesLoading(true);
    const [{ data, error }, { data: state, error: stateError }] = await Promise.all([
      supabase.from('learning_languages').select('id,language_tag').order('created_at'),
      supabase.from('learner_language_state').select('active_learning_language_id').maybeSingle(),
    ]);
    if (error || stateError) {
      setLanguageError(error?.message ?? stateError?.message ?? 'Learning Languages could not be loaded.');
      setLanguagesLoading(false);
      return;
    }
    const nextLanguages = (data ?? []).map((row) => toLearningLanguage(row));
    setLanguages(nextLanguages);
    const nextActiveId = state?.active_learning_language_id && nextLanguages.some((language) => language.id === state.active_learning_language_id)
      ? state.active_learning_language_id
      : nextLanguages[0]?.id ?? '';
    setActiveLanguageId(nextActiveId);
    setLanguageError('');
    setLanguagesLoading(false);
  }, []);

  const loadPairs = useCallback(async () => {
    const { data } = await supabase.from('study_pairs').select('id,is_primary,target_language_tag,reference_language_tag,learning_language_id').order('created_at');
    setPairs((data ?? []).map((pair) => ({
      id: pair.id,
      isPrimary: pair.is_primary,
      referenceLanguageTag: pair.reference_language_tag,
      targetLanguageTag: pair.target_language_tag,
      learningLanguageId: pair.learning_language_id,
    })));
  }, []);

  const refreshRecognitionCards = useCallback(async (learningLanguageId = activeLanguageId) => {
    if (!learningLanguageId) {
      setRecognitionCards([]);
      setRecognitionLoading(false);
      return;
    }
    setRecognitionLoading(true);
    const { data, error } = await supabase.rpc('learning_scheduled_review_overview', { p_learning_language_id: learningLanguageId });
    if (error) {
      setRecognitionError(error.message);
      setRecognitionLoading(false);
      return;
    }
    setRecognitionError('');
    setRecognitionCards((data ?? []).map((card: LearningReviewOverview) => toReviewCard(card)));
    setRecognitionLoading(false);
  }, [activeLanguageId]);

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
    queueMicrotask(() => void loadLanguages());
    queueMicrotask(() => void loadPairs());
  }, [loadLanguages, loadPairs, session]);

  useEffect(() => {
    if (!session || !activeLanguageId) return;
    queueMicrotask(() => void refreshRecognitionCards(activeLanguageId));
  }, [activeLanguageId, refreshRecognitionCards, session]);

  useEffect(() => {
    if (!session) return;
    const refresh = () => {
      void loadLanguages();
      void refreshRecognitionCards();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadLanguages, refreshRecognitionCards, session]);

  useEffect(() => {
    if (!forceOnboarding && !languagesLoading && session && languages.length === 0) window.location.assign('/onboarding/study-pair');
  }, [forceOnboarding, languages.length, languagesLoading, session]);

  useEffect(() => {
    if (!loading && !session && !publicContent && !signingOut) window.location.assign(`/auth/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, publicContent, session, signingOut]);

  if (loading) return <main className="auth-loading" aria-busy="true">Loading your private library…</main>;
  if (!session) return <>{publicContent ?? <main className="auth-loading" aria-busy="true">Redirecting to sign in…</main>}</>;
  if (forceOnboarding) return <StudyPairOnboarding onCreated={() => window.location.assign('/')} />;
  if (languagesLoading) return <main className="auth-loading" aria-busy="true">Loading your Learning Languages…</main>;
  if (languageError) return <main className="auth-loading" role="alert">Unable to load your Learning Languages: {languageError}</main>;
  if (languages.length === 0) return <main className="auth-loading" aria-busy="true">Opening onboarding…</main>;

  const activeSection = destinations.find(([label]) => label.toLowerCase() === section.toLowerCase())?.[0] ?? section;
  const activeLanguage = languages.find((language) => language.id === activeLanguageId) ?? languages[0];
  const activePairs = pairs.filter((pair) => pair.learningLanguageId === activeLanguage.id);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.assign('/');
  }

  async function setActiveLanguage(languageId: string) {
    setLanguageError('');
    const { error } = await supabase.rpc('set_active_learning_language', { p_learning_language_id: languageId });
    if (error) {
      setLanguageError(error.message);
      return;
    }
    setActiveLanguageId(languageId);
  }

  async function addLanguage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLanguageError('');
    const languageTag = canonicalLanguageTag(languageDraft);
    if (!languageTag) {
      setLanguageError('Enter a valid BCP 47 language tag.');
      return;
    }
    setLanguageSaving(true);
    const { data, error } = await supabase.rpc('create_learning_language', { p_language_tag: languageTag });
    setLanguageSaving(false);
    if (error) {
      setLanguageError(error.message.includes('already exists') ? 'This Learning Language already exists.' : error.message);
      return;
    }
    const created = toLearningLanguage(data);
    setLanguages((current) => [...current, created]);
    setLanguageDraft('');
  }

  async function removeLanguage(language: LearningLanguage) {
    setLanguageError('');
    setRemovingLanguageId(language.id);
    const { data, error } = await supabase.rpc('remove_learning_language', { p_learning_language_id: language.id });
    setRemovingLanguageId('');
    if (error) {
      setLanguageError(error.message);
      return;
    }
    const nextLanguages = languages.filter((candidate) => candidate.id !== language.id);
    setLanguages(nextLanguages);
    setActiveLanguageId(data.activeLearningLanguageId);
    await loadPairs();
  }

  function recordReview(cardId: string, event: RecognitionReviewEvent) {
    setRecognitionCards((current) => current.map((card) => card.id === cardId ? { ...card, events: [...card.events, event] } : card));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link className="auth-brand" href="/" aria-label="Lexync home">Lexync</Link>
        <div>
          <label className="pair-selector-label" htmlFor="active-learning-language">Active Learning Language</label>
          <select id="active-learning-language" aria-label="Active Learning Language" value={activeLanguage.id} onChange={(event) => void setActiveLanguage(event.target.value)}>
            {languages.map((language) => <option key={language.id} value={language.id}>{languageName(language.languageTag)} · {language.languageTag}</option>)}
          </select>
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
          {activeSection === 'Home' && !recognitionLoading && <section className="due-counts" aria-label="Scheduled Review due counts">
            <div className="due-count-row"><span>{languageName(activeLanguage.languageTag)} <strong>{recognitionCards.length} due</strong></span><Link className="secondary-button" href="/review">Start review</Link></div>
          </section>}
          {recognitionError && <p className="form-notice error" role="alert">Unable to load Scheduled Reviews: {recognitionError}</p>}
          {activeSection === 'Review' && !recognitionLoading && <ScheduledRecognition cards={recognitionCards} onReviewConfirmed={recordReview} language={activeLanguage} />}
          {activeSection === 'Library' && <Suspense fallback={<p className="app-empty">Loading your vocabulary…</p>}><VocabularyLibrary key={activeLanguage.id} onEntriesChanged={() => refreshRecognitionCards(activeLanguage.id)} language={activeLanguage} pairs={activePairs} /></Suspense>}
          {activeSection === 'Settings' && <section className="pair-management" aria-labelledby="learning-languages-heading">
            <h2 id="learning-languages-heading">Learning Languages</h2>
            <form className="web-auth-form" onSubmit={addLanguage}>
              <label htmlFor="settings-learning-language">Learning Language</label>
              <input id="settings-learning-language" value={languageDraft} onChange={(event) => setLanguageDraft(event.target.value)} placeholder="fr-CA" autoComplete="off" />
              <button className="primary-button" type="submit" disabled={!online || languageSaving}>{languageSaving ? 'Adding…' : 'Add Learning Language'}</button>
            </form>
            {languageError && <p className="form-notice error" role="alert">{languageError}</p>}
            <ul>
              {languages.map((language) => <li className="language-row" key={language.id}>
                <span>{languageName(language.languageTag)} · <span>{language.languageTag}</span>{language.id === activeLanguage.id && <strong> Active</strong>}</span>
                <button className="text-button danger" type="button" disabled={!online || languages.length === 1 || removingLanguageId === language.id} onClick={() => void removeLanguage(language)}>{removingLanguageId === language.id ? 'Removing…' : `Remove ${language.languageTag}`}</button>
              </li>)}
            </ul>
          </section>}
          {!['Home', 'Review', 'Library', 'Settings'].includes(activeSection) && <p className="app-empty">Your {activeSection.toLowerCase()} will appear here as you build your language library.</p>}
        </section>
      </div>
    </main>
  );
}
