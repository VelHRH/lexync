'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { LessonInProgressActions } from './LessonInProgressActions';

type DynamicLessonResponse = { lesson?: { id: string; source: string; status: string }; insufficientMaterial?: boolean; answerLanguageRequired?: boolean; error?: unknown };

class DynamicLessonRequestError extends Error {}

const starters = [
  'Practise the past tense the way it is used in my reading',
  'Work on the long sentences I keep losing track of',
  'Drill the words I keep mixing up',
];

export function DynamicLessonRequest({ accessToken, learningLanguageId, readyMaterialCount, activeLessonId, onLessonCreated, onLessonDiscarded }: { accessToken: string; learningLanguageId: string; readyMaterialCount: number | null; activeLessonId: string | null; onLessonCreated: () => void; onLessonDiscarded: () => void }) {
  const online = useOnlineStatus();
  const router = useRouter();
  const [practiceRequest, setPracticeRequest] = useState('');
  const [answerLanguageTag, setAnswerLanguageTag] = useState('');
  const [answerLanguageRequired, setAnswerLanguageRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [insufficientMaterial, setInsufficientMaterial] = useState('');
  const [error, setError] = useState('');
  const requestId = useRef(0);

  function safeApiError(payload: { error?: unknown }, fallback: string) {
    return typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || readyMaterialCount === null || readyMaterialCount === 0 || submitting || activeLessonId) return;
    const currentRequestId = ++requestId.current;
    setSubmitting(true);
    setError('');
    setInsufficientMaterial('');
    try {
      const response = await fetch('/api/dynamic-lessons', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ learningLanguageId, practiceRequest, ...(answerLanguageTag.trim() ? { answerLanguageTag } : {}) }),
      });
      let payload: DynamicLessonResponse;
      try {
        payload = await response.json() as DynamicLessonResponse;
      } catch {
        throw new Error('A Lesson could not be created right now. Please try again.');
      }
      if (currentRequestId !== requestId.current) return;
      if (payload.answerLanguageRequired) {
        setAnswerLanguageRequired(true);
        setError(safeApiError(payload, 'Choose the language you want to answer in.'));
        return;
      }
      if (payload.insufficientMaterial) {
        setInsufficientMaterial(safeApiError(payload, 'Your Learning Materials do not contain enough about that yet. Try describing what you want to practise differently, or add another Learning Material.'));
        return;
      }
      if (!response.ok || typeof payload.error === 'string' && payload.error.trim()) throw new DynamicLessonRequestError(safeApiError(payload, 'A Lesson could not be created right now. Please try again.'));
      if (!payload.lesson) throw new Error('A Lesson could not be created right now. Please try again.');
      onLessonCreated();
      router.push(`/lessons/${payload.lesson.id}`);
    } catch (requestError) {
      if (currentRequestId !== requestId.current) return;
      setError(requestError instanceof DynamicLessonRequestError ? requestError.message : 'A Lesson could not be created right now. Please try again.');
    } finally {
      if (currentRequestId === requestId.current) setSubmitting(false);
    }
  }

  const blocked = !online || readyMaterialCount === null || readyMaterialCount === 0 || submitting;

  return <section className="dynamic-lesson-request" data-ui="dynamic-lesson-request" aria-labelledby="dynamic-lesson-heading" aria-busy={submitting || undefined}>
    <div className="dynamic-lesson-request-heading">
      <h2 id="dynamic-lesson-heading">{activeLessonId ? 'Finish your Lesson first' : 'What do you want to practise?'}</h2>
      <p>{activeLessonId
        ? 'Lexync keeps one Lesson at a time, so this one is waiting for you before a new one can be built.'
        : 'Lexync builds a Lesson from everything you have been reading in this Learning Language.'}</p>
    </div>
    {activeLessonId ? <div className="dynamic-lesson-blocked" data-ui="dynamic-lesson-blocked">
      <p role="status">You have a Lesson in progress.</p>
      <LessonInProgressActions lessonId={activeLessonId} onDiscarded={onLessonDiscarded} />
    </div>
    : submitting ? <div className="dynamic-lesson-building" data-ui="dynamic-lesson-building">
      <span className="dynamic-lesson-spinner" aria-hidden="true" />
      <p className="dynamic-lesson-generating" role="status" aria-live="polite">Building your Lesson from your Learning Materials…</p>
      <p className="composer-help">This takes a few seconds. Keep this page open.</p>
      {practiceRequest.trim() && <p className="dynamic-lesson-building-request">{practiceRequest.trim()}</p>}
    </div>
    : <form className="dynamic-lesson-request-form" onSubmit={submitRequest}>
      <div className="composer">
        <label className="visually-hidden" htmlFor="practice-request">What do you want to practise?</label>
        <textarea id="practice-request" aria-describedby="practice-request-help" placeholder="The past tense in the article I saved yesterday…" rows={2} value={practiceRequest} onChange={(event) => setPracticeRequest(event.target.value)} disabled={!online} />
        <button className="composer-send" type="submit" aria-label="Create lesson" disabled={blocked}>
          <span aria-hidden="true">↑</span>
        </button>
      </div>
      <p className="composer-help" id="practice-request-help">Describe it in your own words, for example the ideas or wording you want to work on.</p>
      <ul className="composer-starters" aria-label="Request ideas">
        {starters.map((starter) => <li key={starter}>
          <button className="composer-starter" type="button" disabled={!online} onClick={() => setPracticeRequest(starter)}>{starter}</button>
        </li>)}
      </ul>
      {answerLanguageRequired && <div className="composer-field">
        <label htmlFor="practice-answer-language">Language you want to answer in</label>
        <input id="practice-answer-language" aria-describedby="practice-answer-language-help" value={answerLanguageTag} onChange={(event) => setAnswerLanguageTag(event.target.value)} disabled={!online} />
        <p className="composer-help" id="practice-answer-language-help">Enter a language tag such as en or uk.</p>
      </div>}
    </form>}
    {!activeLessonId && !submitting && (!online ? <p className="form-notice" role="status">You are offline. Creating a Lesson from your Learning Materials requires a connection.</p>
      : readyMaterialCount === 0 ? <p className="form-notice" role="status">Add a Learning Material and wait for it to be ready before creating a Lesson from it. <Link className="text-link" href="/materials">Open Learning Materials</Link></p>
      : null)}
    {insufficientMaterial && <p className="form-notice" role="status">{insufficientMaterial}</p>}
    {error && <p className="form-notice error" role="alert">{error}</p>}
  </section>;
}
