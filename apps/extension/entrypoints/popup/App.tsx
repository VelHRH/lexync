import { canonicalLanguageTag, languageName } from '@lexync/domain';
import type { Session } from '@supabase/supabase-js';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { LearningModeSiteState } from '../../lib/learning-mode-messages';
import type {
  CaptureLearningLanguageNeedsSense,
  CaptureLearningLanguageSaved,
  LearningLanguageOption,
  LearningLanguageSnapshot,
} from '../../lib/learning-language-messages';
import { supabase } from '../../lib/supabase';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

function Brand({ compact = false }: { compact?: boolean }) {
  return <img alt="Lexync" className={`brand ${compact ? 'brand-mark' : 'brand-wordmark'}`} src={`/brand/${compact ? 'mark' : 'wordmark'}-dark-on-light.png`} />;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [languages, setLanguages] = useState<LearningLanguageOption[]>([]);
  const [activeLanguageId, setActiveLanguageId] = useState('');
  const [expression, setExpression] = useState('');
  const [translation, setTranslation] = useState('');
  const [answerLanguage, setAnswerLanguage] = useState('');
  const [example, setExample] = useState('');
  const [senseDecision, setSenseDecision] = useState<{ response: CaptureLearningLanguageNeedsSense; selected?: string; createNew: boolean }>();
  const [savedCapture, setSavedCapture] = useState<CaptureLearningLanguageSaved>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'error' | 'success'>('error');
  const [submitting, setSubmitting] = useState(false);
  const [learningSite, setLearningSite] = useState<LearningModeSiteState | null>(null);

  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  }, []);

  const loadSnapshot = useCallback(async () => {
    const { data, error } = await supabase.rpc('account_learning_snapshot');
    if (error) {
      setNoticeTone('error');
      setNotice(error.message);
      return;
    }
    const snapshot = data as LearningLanguageSnapshot;
    const nextLanguages = snapshot.learningLanguages.map(({ id, languageTag, preferredAnswerLanguageTag }) => ({ id, languageTag, preferredAnswerLanguageTag }));
    setLanguages(nextLanguages);
    const nextActive = snapshot.activeLearningLanguageId ?? nextLanguages[0]?.id ?? '';
    setActiveLanguageId(nextActive);
    setAnswerLanguage(nextLanguages.find((language) => language.id === nextActive)?.preferredAnswerLanguageTag ?? '');
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
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'auth-complete') void loadSession();
    };
    browser.runtime.onMessage.addListener(receiveAuth);
    return () => {
      data.subscription.unsubscribe();
      browser.runtime.onMessage.removeListener(receiveAuth);
    };
  }, [loadSession]);

  useEffect(() => {
    if (session) {
      void loadSnapshot();
      void loadLearningSite();
    }
  }, [loadLearningSite, loadSnapshot, session]);

  function authenticationCallback() {
    const callback = new URL('/auth/callback', import.meta.env.WXT_PUBLIC_WEB_URL);
    callback.searchParams.set('extension_id', browser.runtime.id);
    return callback.toString();
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNoticeTone('error');
    setNotice('');
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return setNotice('Email is required.');
    if (authMode !== 'forgot-password' && password.length < 6) return setNotice('Password must contain at least 6 characters.');
    if (authMode === 'sign-up' && password !== confirmPassword) return setNotice('Passwords do not match.');
    setSubmitting(true);
    try {
      if (authMode === 'forgot-password') {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: authenticationCallback() });
        if (error) setNotice(error.message); else { setNoticeTone('success'); setNotice('Check your email for a password reset link.'); }
      } else if (authMode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password, options: { emailRedirectTo: authenticationCallback() } });
        if (error) setNotice(error.message); else if (!data.session) { setNoticeTone('success'); setNotice('Check your email to confirm your account.'); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) setNotice(error.message);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Authentication could not be completed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function selectActiveLanguage(id: string) {
    setActiveLanguageId(id);
    const selected = languages.find((language) => language.id === id);
    setAnswerLanguage(selected?.preferredAnswerLanguageTag ?? '');
    setSubmitting(true);
    const { error } = await supabase.rpc('set_active_learning_language', { p_learning_language_id: id });
    setSubmitting(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setNoticeTone('success');
    setNotice('Active Learning Language updated.');
  }

  async function saveVocabularyEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNoticeTone('error');
    setNotice('');
    const nextErrors: Record<string, string> = {};
    if (!expression.trim()) nextErrors.expression = 'Expression is required.';
    if (!translation.trim()) nextErrors.translation = 'Translation is required.';
    if (!canonicalLanguageTag(answerLanguage)) nextErrors.answerLanguage = 'Enter a valid BCP 47 language tag.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !activeLanguageId) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('capture_learning_language_entry', {
      p_answer_language_tag: answerLanguage,
      p_create_new_sense: senseDecision?.createNew ?? false,
      p_example: example || null,
      p_expression: expression,
      p_learning_language_id: activeLanguageId,
      p_sense_id: senseDecision?.selected ?? null,
      p_translation: translation,
    });
    setSubmitting(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if ((data as { kind?: string }).kind === 'needs_sense') {
      setSenseDecision({ response: data as CaptureLearningLanguageNeedsSense, createNew: false });
      return;
    }
    setSavedCapture(data as CaptureLearningLanguageSaved);
    setSenseDecision(undefined);
  }

  async function setUpLearningMode() {
    if (!learningSite?.origin || !learningSite.tabId) return;
    const granted = await browser.permissions.request({ origins: [`${learningSite.origin}/*`] });
    if (!granted) { setNotice('Site access was not granted.'); return; }
    await browser.runtime.sendMessage({ origin: learningSite.origin, tabId: learningSite.tabId, type: 'learning-mode:permission-granted' });
    setLearningSite({ ...learningSite, permitted: true });
    setNoticeTone('success');
    setNotice('Site access granted');
  }

  async function setLearningMode(enabled: boolean) {
    if (!learningSite?.origin) return;
    await browser.runtime.sendMessage({ enabled, learningLanguageId: learningSite.selectedLearningLanguageId, origin: learningSite.origin, type: 'learning-mode:set-site' });
    setLearningSite({ ...learningSite, decided: true, enabled });
    setNoticeTone('success');
    setNotice(enabled ? 'Learning Mode enabled for this site.' : 'Learning Mode disabled for this site.');
  }

  if (loading) return <main className="shell loading"><Brand compact /><p className="status">Opening your private library…</p></main>;
  if (!session) {
    const heading = authMode === 'sign-up' ? 'Create your account.' : authMode === 'forgot-password' ? 'Reset your password.' : 'Welcome back.';
    const submitLabel = authMode === 'sign-up' ? 'Create account' : authMode === 'forgot-password' ? 'Send reset link' : 'Sign in';
    return <main className="shell signed-out"><div className="auth-brand"><Brand /><span>Personal language practice</span></div><div className="auth-heading"><p className="eyebrow">Lexync account</p><h1>{heading}</h1><p className="intro">{authMode === 'forgot-password' ? 'Enter your email and we will send you a link to choose a new password.' : 'Your private learning loop, ready wherever you read.'}</p></div><form className="auth-form" onSubmit={authenticate} noValidate><label>Email<input autoComplete="email" inputMode="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{authMode !== 'forgot-password' && <label>Password<input autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}{authMode === 'sign-up' && <label>Confirm password<input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>}<button className="primary" disabled={submitting} type="submit">{submitLabel}</button></form><div className="auth-switches">{authMode === 'sign-in' && <><button type="button" onClick={() => setAuthMode('forgot-password')}>Forgot password?</button><button type="button" onClick={() => setAuthMode('sign-up')}>Create account</button></>}{authMode !== 'sign-in' && <button type="button" onClick={() => setAuthMode('sign-in')}>Back to sign in</button>}</div>{notice && <p className={`notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{notice}</p>}</main>;
  }
  if (savedCapture) return <main className="shell saved"><div className="saved-header"><Brand compact /><span>Library updated</span></div><div className="success-mark">✓</div><p className="eyebrow">Vocabulary entry saved</p><h1>{savedCapture.expression}</h1><p className="pair-label">{languageName(savedCapture.answerLanguageTag)}</p><section className="sense-card" aria-label="Saved Sense"><span>{savedCapture.senseCreated ? 'New Sense added' : 'Existing Sense enriched'}</span><strong>{savedCapture.translation}</strong><p>{savedCapture.example ?? 'No Example added'}</p></section><button className="secondary another-entry" type="button" onClick={() => { setSavedCapture(undefined); setExpression(''); setTranslation(''); setExample(''); }}>Add another entry</button></main>;

  const detectedLanguage = learningSite?.detectedLearningLanguageTag;
  return <main className="shell command-center" data-design="popup-command-center"><header className="popup-header"><div className="popup-identity"><Brand compact /><div><strong>Lexync</strong><span>Reading companion</span></div></div><p className="identity">{session.user.email}</p></header><div className="workspace-label"><span>Workspace</span><strong>Today’s language loop</strong></div><section className="panel language-panel"><div className="panel-heading"><div><p className="eyebrow">Context</p><h2>Learning language</h2></div><span className="panel-index">01</span></div><label>Active Learning Language<select aria-label="Active Learning Language" disabled={submitting} value={activeLanguageId} onChange={(event) => void selectActiveLanguage(event.target.value)}>{languages.map((language) => <option key={language.id} value={language.id}>{languageName(language.languageTag)}</option>)}</select></label>{languages.length === 0 && <p className="panel-note">Add a learning language in your Lexync library to start capturing words.</p>}</section><section className="panel learning-mode-panel"><div className="panel-heading"><div><p className="eyebrow">On this page</p><h2>{learningSite?.origin ? new URL(learningSite.origin).hostname : 'Ready when you are'}</h2></div><span className="panel-index">02</span></div>{learningSite ? <><p>{learningSite.enabled ? 'Learning Mode is active. Saved expressions are highlighted as you read.' : learningSite.permitted ? 'Site access is ready. Return to the page to enable Learning Mode.' : `Lexync found ${detectedLanguage ? languageName(detectedLanguage) : 'a language'} on this site.`}</p>{learningSite.enabled ? <button className="secondary" type="button" onClick={() => void setLearningMode(false)}>Disable Learning Mode</button> : !learningSite.permitted ? <button className="secondary" type="button" onClick={() => void setUpLearningMode()}>Set up Learning Mode</button> : learningSite.selectedLearningLanguageId ? <button className="secondary" type="button" onClick={() => void setLearningMode(true)}>Enable Learning Mode</button> : null}</> : <p className="panel-note">Open a reading page and Lexync will bring its language tools here.</p>}</section><section className="panel capture-panel"><div className="panel-heading"><div><p className="eyebrow">Quick capture</p><h2>Save a new word</h2></div><span className="panel-index">03</span></div>{languages.length > 0 ? <form onSubmit={saveVocabularyEntry} noValidate><div className="capture-fields"><label>Expression<input value={expression} onChange={(event) => setExpression(event.target.value)} placeholder="incontro" />{errors.expression && <span className="field-error">{errors.expression}</span>}</label><label>Translation<input value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="meeting" />{errors.translation && <span className="field-error">{errors.translation}</span>}</label></div><div className="capture-fields"><label>Answer Language<input value={answerLanguage} onChange={(event) => setAnswerLanguage(event.target.value)} placeholder="en" />{errors.answerLanguage && <span className="field-error">{errors.answerLanguage}</span>}</label><label>Example <span className="optional">Optional</span><textarea value={example} onChange={(event) => setExample(event.target.value)} rows={2} placeholder="A sentence worth keeping" /></label></div>{senseDecision && <fieldset className="sense-choice"><legend>Choose a Sense</legend>{senseDecision.response.senses.map((sense) => <label key={sense.id}><input checked={senseDecision.selected === sense.id} name="sense" type="radio" onChange={() => setSenseDecision({ ...senseDecision, selected: sense.id })} />{sense.translations.map((item) => `${item.text} (${item.answerLanguageTag})`).join(' · ') || 'Existing Sense'}</label>)}<label><input checked={senseDecision.createNew} name="sense" type="radio" onChange={() => setSenseDecision({ ...senseDecision, selected: undefined, createNew: true })} />Create a new Sense</label></fieldset>}<button className="primary" disabled={submitting || Boolean(senseDecision && !senseDecision.selected && !senseDecision.createNew)} type="submit">Save Vocabulary Entry</button></form> : <p className="panel-note">Your quick capture form will appear after you add a learning language.</p>}</section>{notice && <p className={`notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{notice}</p>}</main>;
}
