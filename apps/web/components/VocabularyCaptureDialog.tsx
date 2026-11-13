'use client';

import { canonicalLanguageTag } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';
import { VocabularyCaptureAudioRecorder, currentAudioClipPath, storeAudioClip, useAudioClipRecorder, type AudioClipRecording } from './VocabularyAudioClip';

export type Translation = { answer_language_tag: string; id: string; text: string };
type PendingSense = { id: string; translations: Translation[] };

export type VocabularyCaptureDraft = { answerLanguage: string; example: string; expression: string };

export function VocabularyCaptureDialog({ draft, language, onCaptured, onClose, open }: { draft?: VocabularyCaptureDraft; language: { id: string; languageTag: string }; onCaptured: (expression: string, clipNotice: string) => void | Promise<void>; onClose: () => void; open: boolean }) {
  const online = useOnlineStatus();
  const recorder = useAudioClipRecorder({ declinedNotice: 'Lexync could not use your microphone. You can still save this word without a pronunciation.' });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [expression, setExpression] = useState('');
  const [answerLanguage, setAnswerLanguage] = useState('');
  const [translation, setTranslation] = useState('');
  const [example, setExample] = useState('');
  const [exampleTranslation, setExampleTranslation] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingSenses, setPendingSenses] = useState<PendingSense[]>([]);
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen) {
    setWasOpen(true);
    setExpression(draft?.expression ?? '');
    setAnswerLanguage(draft?.answerLanguage ?? '');
    setExample(draft?.example ?? '');
    setExampleTranslation('');
    setTranslation('');
    setNotice('');
    setPendingSenses([]);
    recorder.discard();
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
    setExampleTranslation('');
    setPendingSenses([]);
    recorder.discard();
  }

  async function keepCapturedClip(entryId: string, capturedExpression: string, preview: AudioClipRecording | null) {
    if (!preview) return '';
    if (!entryId) return 'That recording could not be attached to this word. Record it again from the Library.';
    const existing = await currentAudioClipPath(entryId);
    if ('failure' in existing) return existing.failure.notice;
    if (existing.path) return `“${capturedExpression}” already had a pronunciation, so this recording was not kept. Replace it from the Library.`;
    const failure = await storeAudioClip({ durationMs: preview.durationMs, entryId, file: preview.blob, languageId: language.id, previousPath: null });
    return failure ? failure.notice : '';
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
    try {
      const recording = await recorder.finish();
      const { data, error } = await supabase.rpc('capture_learning_language_entry', {
        p_example: example,
        p_example_translation: exampleTranslation,
        p_expression: expression,
        p_translation: translation,
        p_answer_language_tag: answerTag,
        p_learning_language_id: language.id,
        p_sense_id: senseId,
        p_create_new_sense: createNewSense,
      });
      if (error) {
        setNotice(error.message);
        return;
      }
      if (data?.kind === 'needs_sense') {
        setPendingSenses(data.senses ?? []);
        return;
      }
      const capturedExpression = expression;
      const clipNotice = await keepCapturedClip(typeof data?.vocabularyEntryId === 'string' ? data.vocabularyEntryId : '', capturedExpression, recording);
      resetCaptureDraft();
      onClose();
      await onCaptured(capturedExpression, clipNotice);
    } finally {
      setSaving(false);
    }
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
        <input id="expression" value={expression} disabled={!online || saving} onChange={(event) => setExpression(event.target.value)} />
        <label htmlFor="answer-language">Answer Language</label>
        <input id="answer-language" value={answerLanguage} disabled={!online || saving} onChange={(event) => setAnswerLanguage(event.target.value)} placeholder="en or pt-BR" />
        <label htmlFor="translation">Translation</label>
        <input id="translation" value={translation} disabled={!online || saving} onChange={(event) => setTranslation(event.target.value)} />
        <label htmlFor="example">Example <span>(optional)</span></label>
        <textarea id="example" value={example} disabled={!online || saving} onChange={(event) => setExample(event.target.value)} />
        <label htmlFor="example-translation">Example translation <span>(optional)</span></label>
        <textarea id="example-translation" value={exampleTranslation} disabled={!online || saving || !example.trim()} onChange={(event) => setExampleTranslation(event.target.value)} />
        <VocabularyCaptureAudioRecorder busy={saving} online={online} recorder={recorder} />
        {saving && <p className="form-notice vocabulary-capture-pending" role="status"><span className="vocabulary-capture-spinner" aria-hidden="true" />Saving “{expression}”{recorder.preview ? ' and its recording' : ''}…</p>}
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
