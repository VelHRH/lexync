'use client';

import { canonicalLanguageTag } from '@lexync/domain';
import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export type LearningLanguage = { id: string; languageTag: string };

export function StudyPairOnboarding({ onCreated }: { onCreated: (language: LearningLanguage) => void }) {
  const [languageDraft, setLanguageDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const languageTag = canonicalLanguageTag(languageDraft);
    if (!languageTag) {
      setNotice('Enter a valid BCP 47 language tag.');
      document.getElementById('learning-language')?.focus();
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_learning_language', { p_language_tag: languageTag });
    setSubmitting(false);
    if (error) {
      setNotice(error.message.includes('already exists') ? 'This Learning Language already exists.' : error.message);
      document.getElementById('learning-language')?.focus();
      return;
    }
    const language = { id: data.id, languageTag: data.language_tag } satisfies LearningLanguage;
    onCreated(language);
  }

  return (
    <main className="pair-onboarding">
      <p className="eyebrow"><span /> Your language context</p>
      <h1>Set up your first Learning Language</h1>
      <p className="app-empty">Choose the language you are learning. You can add more languages later.</p>
      <form className="web-auth-form" onSubmit={submit} aria-describedby={notice ? 'learning-language-notice' : undefined}>
        <label htmlFor="learning-language">Learning Language</label>
        <input id="learning-language" value={languageDraft} onChange={(event) => setLanguageDraft(event.target.value)} placeholder="es or pt-BR" autoComplete="off" aria-invalid={Boolean(notice)} />
        {notice && <p id="learning-language-notice" className="form-notice error" role="alert">{notice}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Learning Language'}</button>
      </form>
    </main>
  );
}
