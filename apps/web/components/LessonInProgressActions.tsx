'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

export function LessonInProgressActions({ lessonId, onDiscarded }: { lessonId: string; onDiscarded: () => void }) {
  const online = useOnlineStatus();
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardNotice, setDiscardNotice] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const setDialogRef = useCallback((dialog: HTMLDialogElement | null) => {
    dialogRef.current = dialog;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function openConfirm() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDiscardNotice('');
    setConfirming(true);
  }

  function closeConfirm(restoreFocus = true) {
    dialogRef.current?.close();
    setConfirming(false);
    setDiscardNotice('');
    if (restoreFocus) returnFocus.current?.focus();
  }

  async function discardLesson() {
    setDiscarding(true);
    setDiscardNotice('');
    const { error } = await supabase.rpc('discard_lesson', { p_lesson_id: lessonId });
    setDiscarding(false);
    if (error) {
      setDiscardNotice('The Lesson could not be discarded right now. Please try again.');
      return;
    }
    closeConfirm(false);
    onDiscarded();
  }

  return <div className="lesson-progress-actions">
    <Link className="primary-button" data-ui="resume-lesson" href={`/lessons/${lessonId}`}>Resume Lesson</Link>
    <button className="secondary-button danger" data-ui="discard-lesson" type="button" disabled={!online || discarding} onClick={openConfirm}>Discard Lesson</button>
    {confirming && <dialog className="pair-delete-dialog" ref={setDialogRef} aria-labelledby="discard-lesson-heading" aria-describedby="discard-lesson-description" onCancel={(event) => { event.preventDefault(); if (!discarding) closeConfirm(); }}>
      <h2 id="discard-lesson-heading">Discard this Lesson?</h2>
      <p id="discard-lesson-description">The Lesson and the answers you have given in it are deleted, and it will not appear in your history. This cannot be undone.</p>
      {discardNotice && <p className="form-notice error" role="alert">{discardNotice}</p>}
      <div>
        <button className="secondary-button danger" type="button" disabled={!online || discarding} onClick={() => void discardLesson()}>{discarding ? 'Discarding…' : 'Discard Lesson'}</button>
        <button className="secondary-button" type="button" disabled={discarding} onClick={() => closeConfirm()}>Cancel</button>
      </div>
    </dialog>}
  </div>;
}
