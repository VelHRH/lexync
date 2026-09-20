'use client';

import { canonicalLanguageTag, languageName, type StudyPair } from '@lexync/domain';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { Suspense, type ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LearningLanguageOnboarding, type LearningLanguage } from './LearningLanguageOnboarding';
import { BrandArtwork } from './BrandArtwork';
import { ReviewSession } from './ReviewSession';
import { VocabularyLibrary } from './VocabularyLibrary';
import { Collections } from './Collections';
import { ExtensionRecommendation } from './ExtensionRecommendation';

const destinations = [
  ['Home', '/'],
  ['Library', '/library'],
  ['Collections', '/collections'],
  ['Settings', '/settings'],
] as const;

type LearningLanguageRow = { id: string; language_tag: string };
type CompatibilityPair = StudyPair & { learningLanguageId: string };
type ReviewSessionStatus = 'active' | 'completed';

function toLearningLanguage(row: LearningLanguageRow): LearningLanguage {
  return { id: row.id, languageTag: row.language_tag };
}

function sectionLabel(section: string) {
  if (section.toLowerCase() === 'review') return 'Review';
  return destinations.find(([label]) => label.toLowerCase() === section.toLowerCase())?.[0] ?? section;
}

function AppLoadingShell({ section, message, alert = false }: { section: string; message: string; alert?: boolean }) {
  const activeSection = sectionLabel(section);

  return <main className="app-shell" data-design="app-shell" data-ui="product-shell" aria-busy={!alert}>
    <header className="app-header" data-ui="product-header">
      <Link className="auth-brand" data-ui="header-brand" href="/" aria-label="Lexync home"><BrandArtwork background="light" /></Link>
    </header>
    <div className="app-body">
      <nav className="app-navigation app-navigation-rail" data-ui="task-navigation" aria-label="Main navigation">
        {destinations.map(([label, href]) => <Link aria-current={activeSection === label ? 'page' : undefined} className={activeSection === label ? 'active' : ''} href={href} key={href}>{label}</Link>)}
      </nav>
      <section className="app-content app-content-canvas" aria-labelledby="app-heading">
        <p className="eyebrow"><span /> Your private learning space</p>
        <h1 id="app-heading">{activeSection}</h1>
        <p className={`form-notice${alert ? ' error' : ''}`} role={alert ? 'alert' : 'status'}>{message}</p>
      </section>
    </div>
  </main>;
}

function OnboardingLoadingShell({ message, alert = false }: { message: string; alert?: boolean }) {
  return <main className="pair-onboarding onboarding-loading" aria-label="Learning Language onboarding" aria-busy={!alert}>
    <div className="onboarding-loading-skeleton" aria-hidden="true">
      <p className="eyebrow"><span /> Your language context</p>
      <div className="onboarding-loading-heading" />
      <div className="onboarding-loading-copy" />
      <div className="onboarding-loading-label" />
      <div className="onboarding-loading-field" />
      <div className="onboarding-loading-button" />
    </div>
    <p className={`onboarding-loading-message${alert ? ' form-notice error' : ''}`} role={alert ? 'alert' : 'status'}>{message}</p>
  </main>;
}

export type OnboardingPath = '/onboarding/learning-language' | '/onboarding/study-pair';

const canonicalOnboardingPath: OnboardingPath = '/onboarding/learning-language';

export function AuthenticatedApp({ section = 'Home', publicContent, onboardingPath, extensionId }: { section?: string; publicContent?: ReactNode; onboardingPath?: OnboardingPath; extensionId?: string }) {
  const activeSection = sectionLabel(section);
  const router = useRouter();
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [languages, setLanguages] = useState<LearningLanguage[]>([]);
  const [activeLanguageId, setActiveLanguageId] = useState('');
  const [languagesLoading, setLanguagesLoading] = useState(true);
  const [languageError, setLanguageError] = useState('');
  const [pairs, setPairs] = useState<CompatibilityPair[]>([]);
  const [eligibleSenseCount, setEligibleSenseCount] = useState(0);
  const [reviewSessionStatus, setReviewSessionStatus] = useState<ReviewSessionStatus | null>(null);
  const [recognitionLoading, setRecognitionLoading] = useState(true);
  const [recognitionError, setRecognitionError] = useState('');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageSaving, setLanguageSaving] = useState(false);
  const [removingLanguageId, setRemovingLanguageId] = useState('');
  const recognitionRequestId = useRef(0);
  const online = useOnlineStatus();
  const learnerId = session?.user.id;
  const loadLanguages = useCallback(async (): Promise<string | null> => {
    setLanguagesLoading(true);
    const [{ data, error }, { data: state, error: stateError }] = await Promise.all([
      supabase.from('learning_languages').select('id,language_tag').order('created_at'),
      supabase.from('learner_language_state').select('active_learning_language_id').maybeSingle(),
    ]);
    if (error || stateError) {
      setLanguageError(error?.message ?? stateError?.message ?? 'Learning Languages could not be loaded.');
      setLanguagesLoading(false);
      return null;
    }
    const nextLanguages = (data ?? []).map((row) => toLearningLanguage(row));
    setLanguages(nextLanguages);
    const nextActiveId = state?.active_learning_language_id && nextLanguages.some((language) => language.id === state.active_learning_language_id)
      ? state.active_learning_language_id
      : nextLanguages[0]?.id ?? '';
    setActiveLanguageId(nextActiveId);
    setLanguageError('');
    setLanguagesLoading(false);
    return nextActiveId;
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

  const effectiveRecognitionLanguageId = activeLanguageId;

  const refreshRecognitionCards = useCallback(async (learningLanguageId: string) => {
    const requestId = ++recognitionRequestId.current;
    if (!learningLanguageId) {
      if (requestId !== recognitionRequestId.current) return;
      setEligibleSenseCount(0);
      setReviewSessionStatus(null);
      setRecognitionLoading(false);
      return;
    }
    setRecognitionLoading(true);
    const [{ data: eligibleData, error: eligibleError }, { data: reviewData, error: reviewError }] = await Promise.all([
      supabase.rpc('review_session_eligible_sense_count', { p_learning_language_id: learningLanguageId }),
      supabase.rpc('review_session_overview', { p_learning_language_id: learningLanguageId }),
    ]);
    if (requestId !== recognitionRequestId.current) return;
    if (eligibleError || reviewError) {
      setRecognitionError(eligibleError?.message ?? reviewError?.message ?? 'Review could not be loaded.');
      setEligibleSenseCount(0);
      setReviewSessionStatus(null);
      setRecognitionLoading(false);
      return;
    }
    setRecognitionError('');
    const parsedEligibleSenseCount = typeof eligibleData === 'number' ? eligibleData : Number(eligibleData);
    setEligibleSenseCount(Number.isFinite(parsedEligibleSenseCount) ? parsedEligibleSenseCount : 0);
    const reviewPayload = reviewData && typeof reviewData === 'object' && !Array.isArray(reviewData) ? reviewData as { status?: unknown } : null;
    setReviewSessionStatus(reviewPayload?.status === 'active' || reviewPayload?.status === 'completed' ? reviewPayload.status : null);
    setRecognitionLoading(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!learnerId) return;
    queueMicrotask(() => void loadLanguages());
    queueMicrotask(() => void loadPairs());
  }, [learnerId, loadLanguages, loadPairs]);

  useEffect(() => {
    if (!session || !effectiveRecognitionLanguageId) return;
    queueMicrotask(() => void refreshRecognitionCards(effectiveRecognitionLanguageId));
  }, [effectiveRecognitionLanguageId, refreshRecognitionCards, session]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`learner-language-state:${session.user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        filter: `learner_id=eq.${session.user.id}`,
        schema: 'public',
        table: 'learner_language_state',
      }, (payload) => {
        const activeLearningLanguageId = (payload.new as { active_learning_language_id?: unknown }).active_learning_language_id;
        if (typeof activeLearningLanguageId === 'string') setActiveLanguageId(activeLearningLanguageId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    if (loading || !session || languagesLoading || languageError) return;
    if (languages.length > 0 && onboardingPath) {
      router.replace('/');
      return;
    }
    if (languages.length === 0 && (onboardingPath !== canonicalOnboardingPath || !onboardingPath)) router.replace(canonicalOnboardingPath);
  }, [languageError, languages.length, languagesLoading, loading, onboardingPath, router, session]);

  useEffect(() => {
    if (!loading && !session && !publicContent && !signingOut) router.replace(`/auth/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
  }, [loading, publicContent, router, session, signingOut]);

  if (loading) return <>{publicContent ?? (onboardingPath ? <OnboardingLoadingShell message="Opening your private learning space…" /> : <AppLoadingShell section={section} message="Opening your private library…" />)}</>;
  if (!session) return <>{publicContent ?? (onboardingPath ? <OnboardingLoadingShell message="Opening sign in…" /> : <AppLoadingShell section={section} message="Opening sign in…" />)}</>;
  if (languagesLoading) return onboardingPath ? <OnboardingLoadingShell message="Loading your Learning Languages…" /> : <AppLoadingShell section={section} message="Loading your Learning Languages..." />;
  if (languageError && languages.length === 0) return onboardingPath
    ? <OnboardingLoadingShell message={`Unable to load your Learning Languages: ${languageError}`} alert />
    : <AppLoadingShell section={section} message={`Unable to load your Learning Languages: ${languageError}`} alert />;
  if (onboardingPath === canonicalOnboardingPath && languages.length === 0) return <LearningLanguageOnboarding onCreated={() => router.replace('/')} />;
  if (onboardingPath && ((languages.length > 0) || onboardingPath !== canonicalOnboardingPath)) return <OnboardingLoadingShell message="Opening your private library…" />;
  if (languages.length === 0) return <AppLoadingShell section={section} message="Opening onboarding…" />;

  const activeLanguage = languages.find((language) => language.id === activeLanguageId) ?? languages[0];
  const displayedLanguage = activeLanguage;
  const reviewAvailable = eligibleSenseCount >= 2;
  const canLaunchReview = reviewSessionStatus === 'active' || reviewAvailable;
  const reviewLaunchLabel = reviewSessionStatus === 'active' ? 'Resume review' : 'Start review';
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

  if (activeSection === 'Review') return <ReviewSession learningLanguageId={displayedLanguage.id} learningLanguageTag={displayedLanguage.languageTag} onExit={() => router.push('/')} />;

  return (
    <main className="app-shell" data-design="app-shell" data-ui="product-shell">
      <header className="app-header" data-ui="product-header">
        <Link className="auth-brand" data-ui="header-brand" href="/" aria-label="Lexync home"><BrandArtwork background="light" /></Link>
        <div className="app-header-controls">
          <div className="language-switcher" data-ui="language-switcher">
            <label className="pair-selector-label" htmlFor="active-learning-language">Active Learning Language</label>
            <select id="active-learning-language" aria-label="Active Learning Language" value={displayedLanguage.id} disabled={activeSection === 'Review'} onChange={(event) => void setActiveLanguage(event.target.value)}>
              {languages.map((language) => <option key={language.id} value={language.id}>{languageName(language.languageTag)} · {language.languageTag}</option>)}
            </select>
          </div>
          {online ? <Link className="secondary-button" href="/library?add=1">Add vocabulary</Link> : <span className="secondary-button disabled" aria-disabled="true" aria-label="Add vocabulary unavailable offline">Add vocabulary</span>}
          <div className="profile-region" data-ui="profile-account" aria-label="Profile and account controls">
            <span className="profile-email">{session.user.email}</span>
            <button className="secondary-button" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="app-body">
        <nav className="app-navigation app-navigation-rail" data-ui="task-navigation" aria-label="Main navigation">
          {destinations.map(([label, href]) => <Link aria-current={activeSection === label ? 'page' : undefined} className={activeSection === label ? 'active' : ''} href={href} key={href}>{label}</Link>)}
        </nav>
        <section className="app-content app-content-canvas" aria-labelledby="app-heading">
          <p className="eyebrow"><span /> Your private learning space</p>
          <h1 id="app-heading">{activeSection}</h1>
          {activeSection === 'Home' && !recognitionLoading && <section className="review-availability" data-ui="visual-primitive" aria-label="Review availability">
            <div className="review-availability-row"><span>{languageName(activeLanguage.languageTag)} <strong>{eligibleSenseCount} Senses ready</strong></span>{canLaunchReview ? <Link className="secondary-button" href="/review">{reviewLaunchLabel}</Link> : <button className="secondary-button" type="button" disabled>{reviewLaunchLabel}</button>}</div>
            {!reviewAvailable && reviewSessionStatus !== 'active' && <p className="review-unavailable">Review requires at least two eligible Senses.</p>}
          </section>}
          {activeSection === 'Home' && <ExtensionRecommendation extensionId={extensionId} />}
          {recognitionError && <p className="form-notice error" role="alert">Unable to load Review: {recognitionError}</p>}
          {activeSection === 'Library' && <Suspense fallback={<p className="app-empty">Loading your vocabulary...</p>}><VocabularyLibrary key={activeLanguage.id} onEntriesChanged={async () => { await loadPairs(); await refreshRecognitionCards(activeLanguage.id); }} language={activeLanguage} pairs={activePairs} /></Suspense>}
          {activeSection === 'Collections' && <Collections key={activeLanguage.id} language={activeLanguage} />}
          {activeSection === 'Settings' && <section className="pair-management" aria-labelledby="learning-languages-heading">
            <h2 id="learning-languages-heading">Learning Languages</h2>
            <form className="web-auth-form" onSubmit={addLanguage}>
              <label htmlFor="settings-learning-language">Learning Language</label>
              <input id="settings-learning-language" value={languageDraft} onChange={(event) => setLanguageDraft(event.target.value)} placeholder="fr-CA" autoComplete="off" />
              <button className="primary-button" type="submit" disabled={!online || languageSaving}>{languageSaving ? 'Adding...' : 'Add Learning Language'}</button>
            </form>
            {languageError && <p className="form-notice error" role="alert">{languageError}</p>}
            <ul>
              {languages.map((language) => <li className="language-row" key={language.id}>
                <span>{languageName(language.languageTag)} · <span>{language.languageTag}</span>{language.id === activeLanguage.id && <strong> Active</strong>}</span>
                <button className="text-button danger" type="button" disabled={!online || languages.length === 1 || removingLanguageId === language.id} onClick={() => void removeLanguage(language)}>{removingLanguageId === language.id ? 'Removing…' : `Remove ${language.languageTag}`}</button>
              </li>)}
            </ul>
          </section>}
          {!['Home', 'Review', 'Library', 'Collections', 'Settings'].includes(activeSection) && <p className="app-empty">Your {activeSection.toLowerCase()} will appear here as you build your language library.</p>}
        </section>
      </div>
    </main>
  );
}
