'use client';

import { canonicalLanguageTag, studyPairLabel, type StudyPair } from '@lexync/domain';
import { type FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export function StudyPairOnboarding({ onCreated, completeImmediately = false }: { onCreated: (pair: StudyPair) => void; completeImmediately?: boolean }) {
  const [targetLanguage, setTargetLanguage] = useState('');
  const [referenceLanguage, setReferenceLanguage] = useState('');
  const [notice, setNotice] = useState('');
  const [createdPair, setCreatedPair] = useState<StudyPair | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    const targetTag = canonicalLanguageTag(targetLanguage);
    const referenceTag = canonicalLanguageTag(referenceLanguage);
    if (!targetTag || !referenceTag) {
      setNotice('Enter a valid BCP 47 language tag.');
      return;
    }
    if (targetTag === referenceTag) {
      setNotice('Target and Reference Languages must be different.');
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc('create_study_pair', {
      p_reference_language_tag: referenceTag,
      p_target_language_tag: targetTag,
    });
    setSubmitting(false);
    if (error) {
      setNotice(error.code === '23505' ? 'This Study Pair already exists.' : error.message);
      return;
    }
    const pair = {
      id: data.id,
      isPrimary: data.is_primary,
      referenceLanguageTag: data.reference_language_tag,
      targetLanguageTag: data.target_language_tag,
    } satisfies StudyPair;
    if (completeImmediately) {
      onCreated(pair);
      return;
    }
    setCreatedPair(pair);
  }

  if (createdPair) {
    return (
      <section className="pair-onboarding" aria-labelledby="pair-ready-heading">
        <p className="eyebrow"><span /> First step</p>
        <h1 id="pair-ready-heading">Your Study Pair is ready</h1>
        <p className="app-empty">{studyPairLabel(createdPair)} is now your active learning context.</p>
        <div className="pair-onboarding-actions">
          <button className="primary-button" type="button" onClick={() => onCreated(createdPair)}>Continue to dashboard</button>
          <button className="secondary-button" type="button" onClick={() => window.location.assign(`/library?add=1&studyPair=${createdPair.id}`)}>Add a Vocabulary Entry</button>
          <button className="secondary-button" type="button" onClick={() => window.location.assign('/#extension')}>Install extension</button>
        </div>
      </section>
    );
  }

  return (
    <main className="pair-onboarding">
      <p className="eyebrow"><span /> Your language context</p>
      <h1>Set up your first Study Pair</h1>
      <p className="app-empty">Choose the language you are learning as Target and the language you use as Reference. You can add more pairs later.</p>
      <form className="web-auth-form" onSubmit={submit}>
        <label htmlFor="target-language">Target Language</label>
        <input id="target-language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} placeholder="es or pt-BR" autoComplete="off" />
        <label htmlFor="reference-language">Reference Language</label>
        <input id="reference-language" value={referenceLanguage} onChange={(event) => setReferenceLanguage(event.target.value)} placeholder="en" autoComplete="off" />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create Study Pair'}</button>
      </form>
    </main>
  );
}
