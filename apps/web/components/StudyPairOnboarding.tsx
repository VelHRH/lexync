'use client';

import { canonicalLanguageTag } from '@lexync/domain';
import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export type LearningLanguage = { id: string; languageTag: string };

export function StudyPairOnboarding({ onCreated, completeImmediately = false }: { onCreated: (language: LearningLanguage) => void; completeImmediately?: boolean }) {
  const [languageDraft, setLanguageDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [createdLanguage, setCreatedLanguage] = useState<LearningLanguage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const languageTag = canonicalLanguageTag(languageDraft);
    if (!languageTag) {
      setNotice('Enter a valid BCP 47 language tag.');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_learning_language', { p_language_tag: languageTag });
    setSubmitting(false);
    if (error) {
      setNotice(error.message.includes('already exists') ? 'This Learning Language already exists.' : error.message);
      return;
    }
    const language = { id: data.id, languageTag: data.language_tag } satisfies LearningLanguage;
    if (completeImmediately) {
      onCreated(language);
      return;
    }
    setCreatedLanguage(language);
  }

  if (createdLanguage) {
    return (
      <section className="pair-onboarding" aria-labelledby="language-ready-heading">
        <p className="eyebrow"><span /> First step</p>
        <h1 id="language-ready-heading">Your Learning Language is ready</h1>
        <p className="app-empty">{createdLanguage.languageTag} is now your active learning context.</p>
        <div className="pair-onboarding-actions">
          <button className="primary-button" type="button" onClick={() => onCreated(createdLanguage)}>Continue to dashboard</button>
          <button className="secondary-button" type="button" onClick={() => window.location.assign('/library?add=1')}>Add a Vocabulary Entry</button>
          <button className="secondary-button" type="button" onClick={() => window.location.assign('/#extension')}>Install extension</button>
        </div>
      </section>
    );
  }

  return (
    <main className="pair-onboarding">
      <p className="eyebrow"><span /> Your language context</p>
      <h1>Set up your first Learning Language</h1>
      <p className="app-empty">Choose the language you are learning. You can add more languages later.</p>
      <form className="web-auth-form" onSubmit={submit}>
        <label htmlFor="learning-language">Learning Language</label>
        <input id="learning-language" value={languageDraft} onChange={(event) => setLanguageDraft(event.target.value)} placeholder="es or pt-BR" autoComplete="off" />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Learning Language'}</button>
      </form>
    </main>
  );
}
