'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

type DynamicLessonResponse = { lesson?: { id: string; source: string; status: string }; insufficientMaterial?: boolean; answerLanguageRequired?: boolean; error?: unknown };

class DynamicLessonRequestError extends Error {}

export function DynamicLessonRequest({ accessToken, learningLanguageId, learningLanguageLabel, readyMaterialCount, activeLesson, onLessonCreated }: { accessToken: string; learningLanguageId: string; learningLanguageLabel: string; readyMaterialCount: number | null; activeLesson: boolean; onLessonCreated: () => void }) {
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
    if (!online || readyMaterialCount === null || readyMaterialCount === 0 || submitting || activeLesson) return;
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
      router.push('/lesson');
    } catch (requestError) {
      if (currentRequestId !== requestId.current) return;
      setError(requestError instanceof DynamicLessonRequestError ? requestError.message : 'A Lesson could not be created right now. Please try again.');
    } finally {
      if (currentRequestId === requestId.current) setSubmitting(false);
    }
  }

  return <section className="dynamic-lesson-request" aria-labelledby="dynamic-lesson-heading">
    <div className="dynamic-lesson-request-heading">
      <div>
        <h2 id="dynamic-lesson-heading">Practise from your Learning Materials</h2>
        <p>Describe what you want to practise and Lexync builds a Lesson from your own reading.</p>
      </div>
      <span className="dynamic-lesson-request-language">{learningLanguageLabel}</span>
    </div>
    <form className="dynamic-lesson-request-form" onSubmit={submitRequest}>
      <label htmlFor="practice-request">What do you want to practise?</label>
      <textarea id="practice-request" aria-describedby="practice-request-help" value={practiceRequest} onChange={(event) => setPracticeRequest(event.target.value)} disabled={!online || submitting || activeLesson} />
      <p className="dynamic-lesson-request-help" id="practice-request-help">Describe it in your own words, for example the ideas or wording you want to work on.</p>
      {answerLanguageRequired && <>
        <label htmlFor="practice-answer-language">Language you want to answer in</label>
        <input id="practice-answer-language" aria-describedby="practice-answer-language-help" value={answerLanguageTag} onChange={(event) => setAnswerLanguageTag(event.target.value)} disabled={!online || submitting || activeLesson} />
        <p className="dynamic-lesson-request-help" id="practice-answer-language-help">Enter a language tag such as en or uk.</p>
      </>}
      <button className="primary-button" type="submit" disabled={!online || readyMaterialCount === null || readyMaterialCount === 0 || submitting || activeLesson}>{submitting ? 'Creating lesson…' : 'Create lesson'}</button>
    </form>
    {!online ? <p className="form-notice" role="status">You are offline. Creating a Lesson from your Learning Materials requires a connection.</p>
      : activeLesson ? <p className="form-notice" role="status">You have a Lesson in progress.</p>
      : readyMaterialCount === 0 ? <p className="form-notice" role="status">Add a Learning Material and wait for it to be ready before creating a Lesson from it.</p>
      : null}
    {submitting && <><p className="dynamic-lesson-generating" role="status" aria-live="polite">Building your Lesson from your Learning Materials…</p><span className="lesson-skeleton" aria-hidden="true" /></>}
    {insufficientMaterial && <p className="form-notice" role="status">{insufficientMaterial}</p>}
    {error && <p className="form-notice error" role="alert">{error}</p>}
  </section>;
}
