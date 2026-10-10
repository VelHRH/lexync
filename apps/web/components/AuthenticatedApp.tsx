'use client';

import { canonicalLanguageTag, languageName, type StudyPair } from '@lexync/domain';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import { Suspense, type ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { clearLibraryStore } from '../lib/libraryStore';
import { supabase } from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LearningLanguageOnboarding, type LearningLanguage } from './LearningLanguageOnboarding';
import { BrandArtwork } from './BrandArtwork';
import { NavigationIcon } from './NavigationIcon';
import { VocabularyLibrary } from './VocabularyLibrary';
import { Collections } from './Collections';
import { ExtensionRecommendation } from './ExtensionRecommendation';
import { LessonHistory } from './LessonHistory';
import { LearningMaterials } from './LearningMaterials';
import { DynamicLessonRequest } from './DynamicLessonRequest';
import { LessonInProgressActions } from './LessonInProgressActions';
import { LanguageSwitcher } from './LanguageSwitcher';

const destinations = [
  ['Lessons', '/lessons'],
  ['Learning Materials', '/materials'],
  ['Library', '/library'],
  ['Collections', '/collections'],
] as const;

const navigationShortLabels: Record<string, string> = { 'Learning Materials': 'Materials' };

const navigationCollapsedCookie = 'lexync_nav_collapsed';
const navigationCollapsedListeners = new Set<() => void>();

function subscribeNavigationCollapsed(listener: () => void) {
  navigationCollapsedListeners.add(listener);
  return () => {
    navigationCollapsedListeners.delete(listener);
  };
}

function navigationCollapsedSnapshot() {
  return document.cookie.split('; ').includes(`${navigationCollapsedCookie}=true`);
}

function storeNavigationCollapsed(collapsed: boolean) {
  document.cookie = `${navigationCollapsedCookie}=${collapsed ? 'true' : 'false'}; path=/; max-age=31536000; samesite=lax`;
  for (const listener of navigationCollapsedListeners) listener();
}

type LearningLanguageRow = { id: string; language_tag: string };
type CompatibilityPair = StudyPair & { learningLanguageId: string };
type ActiveLesson = { id: string; source: string };

function toLearningLanguage(row: LearningLanguageRow): LearningLanguage {
  return { id: row.id, languageTag: row.language_tag };
}

const lessonsSurfaces = new Set(['Lessons', 'Dynamic Lesson', 'Lesson history']);

function railSection(activeSection: string) {
  return lessonsSurfaces.has(activeSection) ? 'Lessons' : activeSection;
}

function lessonSourceLabel(source: string) {
  if (source === 'dynamic') return 'Dynamic Lesson';
  if (source === 'vocabulary') return 'Vocabulary Lesson';
  return 'Lesson';
}

function sectionLabel(section: string) {
  const normalized = section.toLowerCase();
  if (normalized === 'lessons') return 'Lessons';
  if (normalized === 'dynamic') return 'Dynamic Lesson';
  if (normalized === 'history') return 'Lesson history';
  if (normalized === 'materials') return 'Learning Materials';
  if (normalized === 'profile') return 'Profile';
  if (normalized === 'settings') return 'Settings';
  return destinations.find(([label]) => label.toLowerCase() === normalized)?.[0] ?? section;
}

function AppNavigation({ activeSection }: { activeSection: string }) {
  const current = railSection(activeSection);

  return <nav className="app-navigation app-navigation-rail" data-ui="task-navigation" aria-label="Main navigation">
    {destinations.map(([label, href]) => <Link aria-current={current === label ? 'page' : undefined} className={current === label ? 'active' : ''} href={href} key={href} title={label}>
      <NavigationIcon name={label} />
      <span className="app-navigation-label">{label}</span>
      <span className="app-navigation-label-short">{navigationShortLabels[label] ?? label}</span>
    </Link>)}
  </nav>;
}

function AppSidebar({ activeSection, collapsed, onToggle, children }: { activeSection: string; collapsed: boolean; onToggle?: () => void; children?: ReactNode }) {
  return <div className="app-sidebar" data-ui="product-sidebar" data-collapsed={collapsed ? 'true' : undefined}>
    <div className="app-sidebar-top">
      <Link className="auth-brand" data-ui="header-brand" href="/" aria-label="Lexync home">
        {collapsed
          ? <Image alt="" className="app-sidebar-mark" height={1254} src="/brand/mark-dark-on-light.png" width={1254} unoptimized />
          : <BrandArtwork background="light" />}
      </Link>
      {onToggle && <button aria-expanded={!collapsed} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="app-sidebar-toggle" type="button" onClick={onToggle}>
        <NavigationIcon name="panel" />
      </button>}
    </div>
    <AppNavigation activeSection={activeSection} />
    {children && <div className="app-sidebar-bottom">{children}</div>}
  </div>;
}

function AppLoadingShell({ section, message, alert = false, collapsed = false }: { section: string; message: string; alert?: boolean; collapsed?: boolean }) {
  const activeSection = sectionLabel(section);

  return <main className="app-shell" data-design="app-shell" data-ui="product-shell" aria-busy={!alert}>
    <AppSidebar activeSection={activeSection} collapsed={collapsed} />
    <div className="app-main">
      <section className="app-content app-content-canvas" aria-labelledby="app-heading">
        <div className="page-heading"><div className="page-heading-text"><h1 id="app-heading">{activeSection}</h1></div></div>
        <p className={`form-notice${alert ? ' error' : ''}`} role={alert ? 'alert' : 'status'}>{message}</p>
      </section>
    </div>
  </main>;
}

function OnboardingLoadingShell({ message, alert = false }: { message: string; alert?: boolean }) {
  return <main className="pair-onboarding onboarding-loading" aria-label="Learning Language onboarding" aria-busy={!alert}>
    <div className="onboarding-loading-skeleton" aria-hidden="true">
      <div className="onboarding-loading-label" />
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

export function AuthenticatedApp({ section = 'dynamic', publicContent, onboardingPath, extensionId, navigationCollapsed: navigationCollapsedDefault = false }: { section?: string; publicContent?: ReactNode; onboardingPath?: OnboardingPath; extensionId?: string; navigationCollapsed?: boolean }) {
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
  const [activeLesson, setActiveLesson] = useState<ActiveLesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [lessonError, setLessonError] = useState('');
  const [languageDraft, setLanguageDraft] = useState('');
  const [languageSaving, setLanguageSaving] = useState(false);
  const [removingLanguageId, setRemovingLanguageId] = useState('');
  const [readyMaterialCount, setReadyMaterialCount] = useState<number | null>(null);

  const lessonRequestId = useRef(0);
  const materialRequestId = useRef(0);
  const navigationCollapsed = useSyncExternalStore(subscribeNavigationCollapsed, navigationCollapsedSnapshot, () => navigationCollapsedDefault);
  const toggleNavigation = useCallback(() => storeNavigationCollapsed(!navigationCollapsedSnapshot()), []);

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

  const effectiveLessonLanguageId = activeLanguageId;

  const refreshReadyMaterialCount = useCallback(async (learningLanguageId: string) => {
    const requestId = ++materialRequestId.current;
    if (!learningLanguageId) {
      if (requestId === materialRequestId.current) setReadyMaterialCount(0);
      return;
    }
    const { count, error } = await supabase
      .from('learning_materials')
      .select('id', { count: 'exact', head: true })
      .eq('learning_language_id', learningLanguageId)
      .eq('status', 'ready');
    if (requestId !== materialRequestId.current) return;
    setReadyMaterialCount(error ? 0 : count ?? 0);
  }, []);

  const refreshLessonState = useCallback(async (learningLanguageId: string) => {
    const requestId = ++lessonRequestId.current;
    if (!learningLanguageId) {
      if (requestId !== lessonRequestId.current) return;
      setEligibleSenseCount(0);
      setActiveLesson(null);
      setLessonLoading(false);
      return;
    }
    setLessonLoading(true);
    const [{ data: eligibleData, error: eligibleError }, { data: lessonData, error: lessonError }] = await Promise.all([
      supabase.rpc('vocabulary_lesson_eligible_sense_count', { p_learning_language_id: learningLanguageId }),
      supabase.rpc('lesson_overview', { p_learning_language_id: learningLanguageId }),
    ]);
    if (requestId !== lessonRequestId.current) return;
    if (eligibleError || lessonError) {
      setLessonError(eligibleError?.message ?? lessonError?.message ?? 'Lesson could not be loaded.');
      setEligibleSenseCount(0);
      setActiveLesson(null);
      setLessonLoading(false);
      return;
    }
    setLessonError('');
    const parsedEligibleSenseCount = typeof eligibleData === 'number' ? eligibleData : Number(eligibleData);
    setEligibleSenseCount(Number.isFinite(parsedEligibleSenseCount) ? parsedEligibleSenseCount : 0);
    const lessonPayload = lessonData && typeof lessonData === 'object' && !Array.isArray(lessonData) ? lessonData as { id?: unknown; source?: unknown; status?: unknown } : null;
    setActiveLesson(lessonPayload?.status === 'active' && typeof lessonPayload.id === 'string'
      ? { id: lessonPayload.id, source: typeof lessonPayload.source === 'string' ? lessonPayload.source : '' }
      : null);
    setLessonLoading(false);
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
    if (!session || !effectiveLessonLanguageId) return;
    queueMicrotask(() => void refreshLessonState(effectiveLessonLanguageId));
    queueMicrotask(() => void refreshReadyMaterialCount(effectiveLessonLanguageId));
  }, [effectiveLessonLanguageId, refreshLessonState, refreshReadyMaterialCount, session]);

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

  if (loading) return <>{publicContent ?? (onboardingPath ? <OnboardingLoadingShell message="Opening your private learning space…" /> : <AppLoadingShell collapsed={navigationCollapsed} section={section} message="Opening your private library…" />)}</>;
  if (!session) return <>{publicContent ?? (onboardingPath ? <OnboardingLoadingShell message="Opening sign in…" /> : <AppLoadingShell collapsed={navigationCollapsed} section={section} message="Opening sign in…" />)}</>;
  if (languagesLoading) return onboardingPath ? <OnboardingLoadingShell message="Loading your Learning Languages…" /> : <AppLoadingShell collapsed={navigationCollapsed} section={section} message="Loading your Learning Languages..." />;
  if (languageError && languages.length === 0) return onboardingPath
    ? <OnboardingLoadingShell message={`Unable to load your Learning Languages: ${languageError}`} alert />
    : <AppLoadingShell collapsed={navigationCollapsed} section={section} message={`Unable to load your Learning Languages: ${languageError}`} alert />;
  if (onboardingPath === canonicalOnboardingPath && languages.length === 0) return <LearningLanguageOnboarding onCreated={() => router.replace('/')} />;
  if (onboardingPath && ((languages.length > 0) || onboardingPath !== canonicalOnboardingPath)) return <OnboardingLoadingShell message="Opening your private library…" />;
  if (languages.length === 0) return <AppLoadingShell collapsed={navigationCollapsed} section={section} message="Opening onboarding…" />;

  const activeLanguage = languages.find((language) => language.id === activeLanguageId) ?? languages[0];
  const displayedLanguage = activeLanguage;
  const languageLabel = `${languageName(displayedLanguage.languageTag)} · ${displayedLanguage.languageTag}`;
  const lessonAvailable = eligibleSenseCount >= 2;
  const lessonInProgress = activeLesson !== null;
  const vocabularyTileBlocked = lessonInProgress || (!lessonLoading && !lessonAvailable);
  const dynamicTileBlocked = lessonInProgress || readyMaterialCount === 0;
  const vocabularyTileState = lessonLoading
    ? 'Checking availability…'
    : lessonInProgress ? 'Finish the Lesson in progress first'
    : lessonAvailable ? `${eligibleSenseCount} Senses ready`
    : 'Needs at least two eligible Senses';
  const dynamicTileState = readyMaterialCount === null
    ? 'Checking your Learning Materials…'
    : lessonInProgress ? 'Finish the Lesson in progress first'
    : readyMaterialCount === 0 ? 'Add a Learning Material first'
    : `${readyMaterialCount} Learning Materials ready`;
  const activePairs = pairs.filter((pair) => pair.learningLanguageId === activeLanguage.id);

  async function signOut() {
    setSigningOut(true);
    clearLibraryStore();
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

  return (
    <main className="app-shell" data-design="app-shell" data-ui="product-shell">
      <AppSidebar activeSection={activeSection} collapsed={navigationCollapsed} onToggle={toggleNavigation}>
        <LanguageSwitcher languages={languages} value={displayedLanguage.id} onChange={(languageId) => void setActiveLanguage(languageId)} />
        <div className="profile-region" data-ui="profile-account" aria-label="Profile and account controls">
          <Link aria-current={activeSection === 'Profile' ? 'page' : undefined} aria-label="Profile" className="profile-button" href="/profile">
            <span aria-hidden="true" className="profile-initial">{(session.user.email ?? '?').trim().charAt(0).toUpperCase()}</span>
            <span className="profile-button-label">Profile</span>
          </Link>
        </div>
      </AppSidebar>
      <div className="app-main">
        <section className={`app-content app-content-canvas${activeSection === 'Dynamic Lesson' ? ' app-content-focused' : ''}`} aria-labelledby="app-heading">
          {activeSection === 'Dynamic Lesson' ? <h1 className="visually-hidden" id="app-heading">{activeSection}</h1> : <div className="page-heading">
            <div className="page-heading-text">
              <h1 id="app-heading">{activeSection}</h1>
              <p className="eyebrow">{languageLabel}</p>
            </div>
          </div>}
          {activeSection === 'Dynamic Lesson' && <>
            <DynamicLessonRequest key={`dynamic-lesson-${activeLanguage.id}`} accessToken={session.access_token} learningLanguageId={activeLanguage.id} readyMaterialCount={readyMaterialCount} activeLessonId={activeLesson?.id ?? null} onLessonCreated={() => void refreshLessonState(activeLanguage.id)} onLessonDiscarded={() => void refreshLessonState(activeLanguage.id)} />
            <ExtensionRecommendation extensionId={extensionId} />
          </>}
          {activeSection === 'Lessons' && activeLesson && <section className="lesson-progress-banner" data-ui="lesson-in-progress" aria-labelledby="lesson-in-progress-heading">
            <div className="lesson-progress-banner-text">
              <h2 id="lesson-in-progress-heading">Lesson in progress</h2>
              <p>{lessonSourceLabel(activeLesson.source)} · finish it before starting another one.</p>
            </div>
            <LessonInProgressActions lessonId={activeLesson.id} onDiscarded={() => void refreshLessonState(activeLanguage.id)} />
          </section>}
          {activeSection === 'Lessons' && <div className="lesson-tiles" data-ui="visual-primitive">
            <Link className="lesson-tile" data-ui="lesson-tile-dynamic" href="/lessons/dynamic" aria-disabled={dynamicTileBlocked || undefined} tabIndex={dynamicTileBlocked ? -1 : undefined}>
              <h2>Dynamic Lesson</h2>
              <p>Describe what you want to practise and Lexync builds a Lesson from your own reading.</p>
              <p className="lesson-tile-state">{dynamicTileState}</p>
            </Link>
            <Link className="lesson-tile" data-ui="lesson-tile-vocabulary" href="/lessons/vocabulary" aria-disabled={vocabularyTileBlocked || undefined} tabIndex={vocabularyTileBlocked ? -1 : undefined}>
              <h2>Vocabulary Lesson</h2>
              <p>Practise the Senses you have already captured in this Learning Language.</p>
              <p className="lesson-tile-state">{vocabularyTileState}</p>
            </Link>
            <Link className="lesson-tile" data-ui="lesson-tile-history" href="/lessons/history">
              <h2>History</h2>
              <p>Everything you have practised in this Learning Language, and how it went.</p>
              <p className="lesson-tile-state">Open history</p>
            </Link>
          </div>}
          {activeSection === 'Learning Materials' && <>
            <p className="page-lede">Learning Materials are the private reading texts your Dynamic Lessons are built from. Add one here, then ask for practice on <Link className="text-link" href="/lessons/dynamic">Dynamic Lesson</Link>.</p>
            <LearningMaterials key={`learning-materials-${activeLanguage.id}`} accessToken={session.access_token} learningLanguageId={activeLanguage.id} onMaterialsChanged={setReadyMaterialCount} />
          </>}
          {activeSection === 'Profile' && <section className="panel" aria-labelledby="profile-heading">
            <div className="panel-header"><h2 id="profile-heading">Account</h2></div>
            <div className="panel-body">
              <dl className="detail-list">
                <div><dt>Signed in as</dt><dd className="profile-email">{session.user.email}</dd></div>
                <div><dt>Active Learning Language</dt><dd>{languageLabel}</dd></div>
              </dl>
              <div className="panel-actions">
                <Link className="secondary-button" href="/settings">Settings</Link>
                <button className="secondary-button danger" type="button" onClick={signOut}>Sign out</button>
              </div>
            </div>
          </section>}
          {lessonError && activeSection === 'Lessons' && <p className="form-notice error" role="alert">Unable to load Lesson: {lessonError}</p>}
          {activeSection === 'Library' && <Suspense fallback={<div className="skeleton-list" aria-hidden="true"><div className="skeleton-card"><div className="skeleton-line strong wide" /><div className="skeleton-line half" /></div><div className="skeleton-card"><div className="skeleton-line strong narrow" /><div className="skeleton-line wide" /></div></div>}><VocabularyLibrary key={activeLanguage.id} onEntriesChanged={async () => { await loadPairs(); await refreshLessonState(activeLanguage.id); }} language={activeLanguage} pairs={activePairs} /></Suspense>}
          {activeSection === 'Collections' && <Collections key={activeLanguage.id} language={activeLanguage} />}
          {activeSection === 'Lesson history' && <LessonHistory key={activeLanguage.id} learningLanguageId={activeLanguage.id} learningLanguageTag={activeLanguage.languageTag} />}
          {activeSection === 'Settings' && <section className="panel pair-management" aria-labelledby="learning-languages-heading">
            <div className="panel-header"><h2 id="learning-languages-heading">Learning Languages</h2></div>
            <div className="panel-body">
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
            </div>
          </section>}
          {!['Dynamic Lesson', 'Lesson history', 'Lessons', 'Learning Materials', 'Library', 'Collections', 'Profile', 'Settings'].includes(activeSection) && <p className="app-empty">Your {activeSection.toLowerCase()} will appear here as you build your language library.</p>}
        </section>
      </div>
    </main>
  );
}
