'use client';

import { canonicalLanguageTag } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

export type Translation = { answer_language_tag: string; id: string; text: string };
type PendingSense = { id: string; translations: Translation[] };

export type VocabularyCaptureDraft = { answerLanguage: string; example: string; expression: string };

export function VocabularyCaptureDialog({ draft, language, onCaptured, onClose, open }: { draft?: VocabularyCaptureDraft; language: { id: string; languageTag: string }; onCaptured: (expression: string) => void | Promise<void>; onClose: () => void; open: boolean }) {
  const online = useOnlineStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [expression, setExpression] = useState('');
  const [answerLanguage, setAnswerLanguage] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingSenses, setPendingSenses] = useState<PendingSense[]>([]);
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    setExpression(draft?.expression ?? '');
    setAnswerLanguage(draft?.answerLanguage ?? '');
    setExample(draft?.example ?? '');
    setTranslation('');
    setNotice('');
    setPendingSenses([]);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function resetCaptureDraft() {
    setExpression('');
    setAnswerLanguage('');
    setTranslation('');
    setExample('');
    setPendingSenses([]);
  }

  async function capture(senseId: string | null = null, createNewSense = false) {
    setNotice('');
    const answerTag = canonicalLanguageTag(answerLanguage);
    const missing = [!expression.trim() ? 'Expression is required.' : '', !answerTag ? 'Enter a valid BCP 47 Answer Language tag.' : '', !translation.trim() ? 'Translation is required.' : ''].filter(Boolean);
    if (missing.length) {
      setNotice(missing.join(' '));
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('capture_learning_language_entry', {
      p_example: example,
      p_expression: expression,
      p_translation: translation,
      p_answer_language_tag: answerTag,
      p_learning_language_id: language.id,
      p_sense_id: senseId,
      p_create_new_sense: createNewSense,
    });
    setSaving(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (data?.kind === 'needs_sense') {
      setPendingSenses(data.senses ?? []);
      return;
    }
    const capturedExpression = expression;
    resetCaptureDraft();
    await onCaptured(capturedExpression);
    onClose();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await capture();
  }

  function cancel() {
    resetCaptureDraft();
    setNotice('');
    onClose();
  }

  if (!open) return null;

  return (
    <dialog className="pair-delete-dialog vocabulary-capture-dialog" data-ui="vocabulary-capture-dialog" ref={dialogRef} aria-labelledby="vocabulary-capture-heading" onCancel={(event) => { event.preventDefault(); cancel(); }} onClose={() => cancel()}>
      <h2 id="vocabulary-capture-heading">Add vocabulary</h2>
      <form className="web-auth-form vocabulary-form" onSubmit={save}>
        <label htmlFor="expression">Expression</label>
        <input id="expression" value={expression} disabled={!online} onChange={(event) => setExpression(event.target.value)} />
        <label htmlFor="answer-language">Answer Language</label>
        <input id="answer-language" value={answerLanguage} disabled={!online} onChange={(event) => setAnswerLanguage(event.target.value)} placeholder="en or pt-BR" />
        <label htmlFor="translation">Translation</label>
        <input id="translation" value={translation} disabled={!online} onChange={(event) => setTranslation(event.target.value)} />
        <label htmlFor="example">Example <span>(optional)</span></label>
        <textarea id="example" value={example} disabled={!online} onChange={(event) => setExample(event.target.value)} />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <div className="vocabulary-editor-actions">
          <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Save Vocabulary Entry'}</button>
          <button className="secondary-button" type="button" disabled={saving} onClick={cancel}>Cancel</button>
        </div>
        {pendingSenses.length > 0 && <fieldset aria-labelledby="sense-choice-heading">
          <legend id="sense-choice-heading">Choose an existing Sense or create a new Sense</legend>
          {pendingSenses.map((sense, index) => <button className="secondary-button" key={sense.id} type="button" disabled={saving || !online} onClick={() => void capture(sense.id)}>
            Choose existing Sense {index + 1}: {sense.translations.map((item) => `${item.text} (${item.answer_language_tag})`).join(', ') || 'No translations'}
          </button>)}
          <button className="secondary-button" type="button" disabled={saving || !online} onClick={() => void capture(null, true)}>Create a new Sense</button>
        </fieldset>}
      </form>
    </dialog>
  );
}
