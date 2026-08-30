import { canonicalLanguageTag, studyPairLabel, type ManualCapture, type StudyPair } from '@lexync/domain';
import type { Session } from '@supabase/supabase-js';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { LearningModeSiteState } from '../../lib/learning-mode-messages';
import { type PairRow, toStudyPair } from '../../lib/study-pairs';
import { supabase } from '../../lib/supabase';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <img
      alt="Lexync"
      className={`brand ${compact ? 'brand-mark' : 'brand-wordmark'}`}
      src={`/brand/${compact ? 'mark' : 'wordmark'}-dark-on-light.png`}
    />
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [studyPairs, setStudyPairs] = useState<StudyPair[]>([]);
  const [selectedPairId, setSelectedPairId] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [referenceLanguage, setReferenceLanguage] = useState('');
  const [showPairForm, setShowPairForm] = useState(false);
  const [expression, setExpression] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'success'>('error');
  const [savedCapture, setSavedCapture] = useState<ManualCapture | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [learningSite, setLearningSite] = useState<LearningModeSiteState | null>(null);

  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  }, []);

  const loadStudyPairs = useCallback(async () => {
    const { data, error } = await supabase
      .from('study_pairs')
      .select('id, is_primary, target_language_tag, reference_language_tag')
      .order('created_at');

    if (error) {
      setNotice(error.message);
      return;
    }

    const pairs = (data as PairRow[]).map(toStudyPair);
    setStudyPairs(pairs);
    setSelectedPairId((current) => current || pairs[0]?.id || '');
    setShowPairForm(pairs.length === 0);
  }, []);

  const loadLearningSite = useCallback(async () => {
    const state = await browser.runtime.sendMessage({ type: 'learning-mode:popup-state' }) as LearningModeSiteState;
    setLearningSite(state.origin ? state : null);
  }, []);

  useEffect(() => {
    void loadSession();
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    const receiveAuth = (message: unknown) => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'auth-complete') {
        void loadSession();
      }
    };
    browser.runtime.onMessage.addListener(receiveAuth);

    return () => {
      data.subscription.unsubscribe();
      browser.runtime.onMessage.removeListener(receiveAuth);
    };
  }, [loadSession]);

  useEffect(() => {
    if (session) {
      void loadStudyPairs();
      void loadLearningSite();
    }
  }, [loadLearningSite, loadStudyPairs, session]);

  function authenticationCallback() {
    const callback = new URL('/auth/callback', import.meta.env.WXT_PUBLIC_WEB_URL);
    callback.searchParams.set('extension_id', browser.runtime.id);
    return callback.toString();
  }

  function showAuthMode(mode: AuthMode) {
    setAuthMode(mode);
    setPassword('');
    setConfirmPassword('');
    setNotice('');
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setNotice('');
    setNoticeTone('error');

    if (!normalizedEmail) {
      setNotice('Email is required.');
      return;
    }

    if (authMode !== 'forgot-password' && password.length < 6) {
      setNotice('Password must contain at least 6 characters.');
      return;
    }

    if (authMode === 'sign-up' && password !== confirmPassword) {
      setNotice('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      if (authMode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: authenticationCallback(),
        });

        if (error) {
          setNotice(error.message);
          return;
        }

        setNoticeTone('success');
        setNotice('Check your email for a password reset link.');
        return;
      }

      if (authMode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: authenticationCallback() },
        });

        if (error) {
          setNotice(error.message);
          return;
        }

        if (!data.session) {
          setNoticeTone('success');
          setNotice('Check your email to confirm your account.');
        }

        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setNotice(error.message);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function createStudyPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const targetTag = canonicalLanguageTag(targetLanguage);
    const referenceTag = canonicalLanguageTag(referenceLanguage);
    const nextErrors: Record<string, string> = {};

    if (!targetTag) {
      nextErrors.targetLanguage = 'Enter a valid BCP 47 language tag.';
    }

    if (!referenceTag) {
      nextErrors.referenceLanguage = 'Enter a valid BCP 47 language tag.';
    }

    setErrors(nextErrors);

    if (!targetTag || !referenceTag) {
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_study_pair', {
      p_reference_language_tag: referenceTag,
      p_target_language_tag: targetTag,
    });
    setSubmitting(false);

    if (error) {
      setNoticeTone('error');
      setNotice(error.code === '23505' ? 'This Study Pair already exists.' : error.message);
      return;
    }

    const pair = toStudyPair(data as PairRow);
    setStudyPairs((current) => [...current, pair]);
    setSelectedPairId(pair.id);
    setTargetLanguage('');
    setReferenceLanguage('');
    setShowPairForm(false);
  }

  async function setPrimaryStudyPair(pairId: string) {
    setNotice('');
    setSubmitting(true);
    const { error } = await supabase.rpc('set_primary_study_pair', {
      p_study_pair_id: pairId,
    });
    setSubmitting(false);

    if (error) {
      setNoticeTone('error');
      setNotice(error.message);
      return;
    }

    const selectedPair = studyPairs.find((pair) => pair.id === pairId);

    if (!selectedPair) {
      return;
    }

    setStudyPairs((current) => current.map((pair) => ({
      ...pair,
      isPrimary: pair.targetLanguageTag === selectedPair.targetLanguageTag
        ? pair.id === selectedPair.id
        : pair.isPrimary,
    })));
  }

  async function saveVocabularyEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const nextErrors: Record<string, string> = {};

    if (!expression.trim()) {
      nextErrors.expression = 'Expression is required.';
    }

    if (!translation.trim()) {
      nextErrors.translation = 'Translation is required.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !selectedPairId) {
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('capture_manual_entry', {
      p_example: example || null,
      p_expression: expression,
      p_study_pair_id: selectedPairId,
      p_translation: translation,
    });
    setSubmitting(false);

    if (error) {
      setNoticeTone('error');
      setNotice(error.message);
      return;
    }

    setSavedCapture(data as ManualCapture);
  }

  async function setUpLearningMode() {
    if (!learningSite?.origin || !learningSite.tabId) {
      return;
    }

    const granted = await browser.permissions.request({ origins: [`${learningSite.origin}/*`] });

    if (!granted) {
      setNoticeTone('error');
      setNotice('Site access was not granted.');
      return;
    }

    await browser.runtime.sendMessage({
      origin: learningSite.origin,
      tabId: learningSite.tabId,
      type: 'learning-mode:permission-granted',
    });
    setLearningSite({ ...learningSite, permitted: true });
    setNoticeTone('success');
    setNotice('Site access granted');
  }

  async function disableLearningMode() {
    if (!learningSite?.origin) {
      return;
    }

    await browser.runtime.sendMessage({
      enabled: false,
      origin: learningSite.origin,
      studyPairId: learningSite.selectedStudyPairId,
      type: 'learning-mode:set-site',
    });
    setLearningSite({ ...learningSite, decided: true, enabled: false });
    setNoticeTone('success');
    setNotice('Learning Mode disabled for this site.');
  }

  async function enableLearningMode() {
    if (!learningSite?.origin || !learningSite.selectedStudyPairId || !learningSite.tabId) {
      return;
    }

    await browser.runtime.sendMessage({
      enabled: true,
      origin: learningSite.origin,
      studyPairId: learningSite.selectedStudyPairId,
      type: 'learning-mode:set-site',
    });
    await browser.runtime.sendMessage({
      origin: learningSite.origin,
      tabId: learningSite.tabId,
      type: 'learning-mode:permission-granted',
    });
    setLearningSite({ ...learningSite, decided: true, enabled: true });
    setNoticeTone('success');
    setNotice('Learning Mode enabled for this site.');
  }

  if (loading) {
    return (
      <main className="shell loading">
        <Brand compact />
        <p className="status">Opening your private library…</p>
      </main>
    );
  }

  if (!session) {
    const heading = authMode === 'sign-up'
      ? 'Create your account.'
      : authMode === 'forgot-password'
        ? 'Reset your password.'
        : 'Welcome back.';
    const submitLabel = authMode === 'sign-up'
      ? 'Create account'
      : authMode === 'forgot-password'
        ? 'Send reset link'
        : 'Sign in';

    return (
      <main className="shell signed-out">
        <Brand />
        <p className="eyebrow">Private by design</p>
        <h1>{heading}</h1>
        <p className="intro">
          {authMode === 'forgot-password'
            ? 'Enter your email and we will send you a link to choose a new password.'
            : 'Use your email and password to access your private learning loop.'}
        </p>
        <form className="auth-form" onSubmit={authenticate} noValidate>
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {authMode !== 'forgot-password' && (
            <label>
              Password
              <input
                autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          {authMode === 'sign-up' && (
            <label>
              Confirm password
              <input
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          )}
          <button className="primary" disabled={submitting} type="submit">{submitLabel}</button>
        </form>
        <div className="auth-switches">
          {authMode === 'sign-in' && (
            <>
              <button type="button" onClick={() => showAuthMode('forgot-password')}>Forgot password?</button>
              <button type="button" onClick={() => showAuthMode('sign-up')}>Create account</button>
            </>
          )}
          {authMode !== 'sign-in' && (
            <button type="button" onClick={() => showAuthMode('sign-in')}>Back to sign in</button>
          )}
        </div>
        {notice && <p className={`notice ${noticeTone}`} role="status">{notice}</p>}
      </main>
    );
  }

  if (savedCapture) {
    const pair = {
      targetLanguageTag: savedCapture.targetLanguageTag,
      referenceLanguageTag: savedCapture.referenceLanguageTag,
    };

    return (
      <main className="shell saved">
        <Brand compact />
        <div className="success-mark">✓</div>
        <p className="eyebrow">
          {savedCapture.vocabularyEntryCreated ? 'Vocabulary Entry saved' : 'Existing Vocabulary Entry used'}
        </p>
        <h1>{savedCapture.expression}</h1>
        <p className="pair-label">{studyPairLabel(pair)}</p>
        <section className="sense-card" aria-label="Saved Sense">
          <span>{savedCapture.senseCreated ? 'New Sense added' : 'Existing Sense enriched'}</span>
          <strong>{savedCapture.translation}</strong>
          <p>{savedCapture.example ?? 'No Example added'}</p>
        </section>
        <button
          className="secondary another-entry"
          type="button"
          onClick={() => {
            setSavedCapture(null);
            setExpression('');
            setTranslation('');
            setExample('');
          }}
        >
          Add another entry
        </button>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <Brand compact />
        <p className="identity">{session.user.email}</p>
      </header>

      <section className="panel">
        <p className="eyebrow">Study Pair</p>
        {studyPairs.length > 0 && (
          <>
            <label>
              Active Study Pair
              <select value={selectedPairId} onChange={(event) => setSelectedPairId(event.target.value)}>
                {studyPairs.map((pair) => <option key={pair.id} value={pair.id}>{studyPairLabel(pair)}</option>)}
              </select>
            </label>
            <fieldset className="primary-pairs">
              <legend>Primary Study Pairs</legend>
              {studyPairs.map((pair) => (
                <label key={pair.id}>
                  <input
                    checked={pair.isPrimary}
                    disabled={submitting}
                    name={`primary-${pair.targetLanguageTag}`}
                    type="radio"
                    onChange={() => void setPrimaryStudyPair(pair.id)}
                  />
                  <span>{studyPairLabel(pair)}</span>
                </label>
              ))}
            </fieldset>
            {!showPairForm && (
              <button className="secondary" type="button" onClick={() => setShowPairForm(true)}>Add Study Pair</button>
            )}
          </>
        )}
        {showPairForm && (
          <form onSubmit={createStudyPair} noValidate>
            <div className="language-grid">
              <label>
                Target Language
                <input value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} placeholder="it" />
                {errors.targetLanguage && <span className="field-error">{errors.targetLanguage}</span>}
              </label>
              <label>
                Reference Language
                <input value={referenceLanguage} onChange={(event) => setReferenceLanguage(event.target.value)} placeholder="en" />
                {errors.referenceLanguage && <span className="field-error">{errors.referenceLanguage}</span>}
              </label>
            </div>
            <div className="pair-form-actions">
              <button className="secondary" disabled={submitting} type="submit">Create Study Pair</button>
              {studyPairs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPairForm(false);
                    setTargetLanguage('');
                    setReferenceLanguage('');
                    setErrors({});
                    setNotice('');
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>

      {learningSite && (
        <section className="panel learning-mode-panel">
          <p className="eyebrow">Learning Mode</p>
          <h2>{new URL(learningSite.origin!).hostname}</h2>
          <p>
            {learningSite.enabled
              ? 'Saved expressions are highlighted and new words can be added while you read.'
              : learningSite.permitted
                ? 'Site access is ready. Return to the page to enable Learning Mode.'
                : 'Lexync found a language that matches one of your Study Pairs.'}
          </p>
          {learningSite.enabled ? (
            <button className="secondary" type="button" onClick={() => void disableLearningMode()}>
              Disable Learning Mode
            </button>
          ) : !learningSite.permitted ? (
            <button className="secondary" type="button" onClick={() => void setUpLearningMode()}>
              Set up Learning Mode
            </button>
          ) : learningSite.selectedStudyPairId ? (
            <button className="secondary" type="button" onClick={() => void enableLearningMode()}>
              Enable Learning Mode
            </button>
          ) : null}
        </section>
      )}

      {studyPairs.length > 0 && (
        <section className="panel capture-panel">
          <p className="eyebrow">Manual entry</p>
          <form onSubmit={saveVocabularyEntry} noValidate>
            <label>
              Expression
              <input value={expression} onChange={(event) => setExpression(event.target.value)} placeholder="incontro" />
              {errors.expression && <span className="field-error">{errors.expression}</span>}
            </label>
            <label>
              Translation
              <input value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="meeting" />
              {errors.translation && <span className="field-error">{errors.translation}</span>}
            </label>
            <label>
              Example <span className="optional">Optional</span>
              <textarea value={example} onChange={(event) => setExample(event.target.value)} rows={3} placeholder="A sentence worth keeping" />
            </label>
            <button className="primary" disabled={submitting} type="submit">Save Vocabulary Entry</button>
          </form>
        </section>
      )}

      {notice && <p className={`notice ${noticeTone}`} role="status">{notice}</p>}
    </main>
  );
}
