import { canonicalLanguageTag, studyPairLabel, type ManualCapture, type StudyPair } from '@lexync/domain';
import type { Session } from '@supabase/supabase-js';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type PairRow = {
  id: string;
  reference_language_tag: string;
  target_language_tag: string;
};

function toStudyPair(row: PairRow): StudyPair {
  return {
    id: row.id,
    referenceLanguageTag: row.reference_language_tag,
    targetLanguageTag: row.target_language_tag,
  };
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [studyPairs, setStudyPairs] = useState<StudyPair[]>([]);
  const [selectedPairId, setSelectedPairId] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [referenceLanguage, setReferenceLanguage] = useState('');
  const [expression, setExpression] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [savedCapture, setSavedCapture] = useState<ManualCapture | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  }, []);

  const loadStudyPairs = useCallback(async () => {
    const { data, error } = await supabase
      .from('study_pairs')
      .select('id, target_language_tag, reference_language_tag')
      .order('created_at');

    if (error) {
      setNotice(error.message);
      return;
    }

    const pairs = (data as PairRow[]).map(toStudyPair);
    setStudyPairs(pairs);
    setSelectedPairId((current) => current || pairs[0]?.id || '');
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
    }
  }, [loadStudyPairs, session]);

  async function signInWithApple() {
    setNotice('');
    const callback = new URL('/auth/callback', import.meta.env.WXT_PUBLIC_WEB_URL);
    callback.searchParams.set('extension_id', browser.runtime.id);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      setNotice(error?.message ?? 'Apple sign-in could not start.');
      return;
    }

    setNotice('Waiting for Apple…');
    await browser.tabs.create({ url: data.url });
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
    const { data, error } = await supabase
      .from('study_pairs')
      .insert({ target_language_tag: targetTag, reference_language_tag: referenceTag })
      .select('id, target_language_tag, reference_language_tag')
      .single();
    setSubmitting(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    const pair = toStudyPair(data as PairRow);
    setStudyPairs((current) => [...current, pair]);
    setSelectedPairId(pair.id);
    setTargetLanguage('');
    setReferenceLanguage('');
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
      setNotice(error.message);
      return;
    }

    setSavedCapture(data as ManualCapture);
  }

  if (loading) {
    return <main className="shell"><p className="status">Opening your private library…</p></main>;
  }

  if (!session) {
    return (
      <main className="shell signed-out">
        <div className="brand"><span>Lx</span>lexync</div>
        <p className="eyebrow">Private by design</p>
        <h1>Keep what<br />you notice.</h1>
        <p className="intro">Sign in to capture an exact word or phrase into your personal learning loop.</p>
        <button className="primary apple" type="button" onClick={signInWithApple}>Sign in with Apple</button>
        {notice && <p className="notice" role="status">{notice}</p>}
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
        <div className="success-mark">✓</div>
        <p className="eyebrow">Vocabulary Entry saved</p>
        <h1>{savedCapture.expression}</h1>
        <p className="pair-label">{studyPairLabel(pair)}</p>
        <section className="sense-card" aria-label="Saved Sense">
          <span>Sense 01</span>
          <strong>{savedCapture.translation}</strong>
          <p>{savedCapture.example ?? 'No Example added'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header>
        <div className="brand"><span>Lx</span>lexync</div>
        <p className="identity">{session.user.email}</p>
      </header>

      <section className="panel">
        <p className="eyebrow">Study Pair</p>
        {studyPairs.length > 0 && (
          <label>
            Active Study Pair
            <select value={selectedPairId} onChange={(event) => setSelectedPairId(event.target.value)}>
              {studyPairs.map((pair) => <option key={pair.id} value={pair.id}>{studyPairLabel(pair)}</option>)}
            </select>
          </label>
        )}
        {studyPairs.length === 0 && (
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
            <button className="secondary" disabled={submitting} type="submit">Create Study Pair</button>
          </form>
        )}
      </section>

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

      {notice && <p className="notice" role="status">{notice}</p>}
    </main>
  );
}
