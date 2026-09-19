'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type ReviewSessionQuestion = {
  id: string;
  ordinal: number;
  prompt: string;
  direction: 'recognition';
  answer_language_tag: string;
  choices: string[];
  selected_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

type ReviewSessionState = {
  id: string;
  learning_language_id: string;
  status: 'active' | 'completed';
  created_at: string;
  completed_at: string | null;
  correct_count: number | null;
  total_count: number | null;
  questions: ReviewSessionQuestion[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function unwrapSession(value: unknown): unknown {
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed[0] ?? null;
  if (!isRecord(parsed)) return parsed;
  if ('session' in parsed) return unwrapSession(parsed.session);
  if ('data' in parsed && !('id' in parsed)) return unwrapSession(parsed.data);
  return parsed;
}

function parseQuestion(value: unknown): ReviewSessionQuestion | null {
  if (!isRecord(value)) return null;
  const choices = Array.isArray(value.choices) ? value.choices.filter((choice): choice is string => typeof choice === 'string') : [];
  if (typeof value.id !== 'string' || typeof value.ordinal !== 'number' || typeof value.prompt !== 'string' || value.direction !== 'recognition' || typeof value.answer_language_tag !== 'string') return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    prompt: value.prompt,
    direction: value.direction,
    answer_language_tag: value.answer_language_tag,
    choices,
    selected_answer: typeof value.selected_answer === 'string' ? value.selected_answer : null,
    correct_answer: typeof value.correct_answer === 'string' ? value.correct_answer : null,
    is_correct: typeof value.is_correct === 'boolean' ? value.is_correct : null,
    answered_at: typeof value.answered_at === 'string' ? value.answered_at : null,
  };
}

function parseSession(value: unknown): ReviewSessionState | null {
  const candidate = unwrapSession(value);
  if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.learning_language_id !== 'string' || (candidate.status !== 'active' && candidate.status !== 'completed')) return null;
  const questions = Array.isArray(candidate.questions)
    ? candidate.questions.map(parseQuestion).filter((question): question is ReviewSessionQuestion => Boolean(question)).sort((first, second) => first.ordinal - second.ordinal)
    : [];
  return {
    id: candidate.id,
    learning_language_id: candidate.learning_language_id,
    status: candidate.status,
    created_at: typeof candidate.created_at === 'string' ? candidate.created_at : '',
    completed_at: typeof candidate.completed_at === 'string' ? candidate.completed_at : null,
    correct_count: typeof candidate.correct_count === 'number' ? candidate.correct_count : null,
    total_count: typeof candidate.total_count === 'number' ? candidate.total_count : questions.length,
    questions,
  };
}

function activeQuestion(session: ReviewSessionState) {
  return session.questions.find((question) => !question.answered_at && !question.selected_answer) ?? session.questions[0] ?? null;
}

export function ReviewSession({ learningLanguageId }: { learningLanguageId: string }) {
  const [session, setSession] = useState<ReviewSessionState | null>(null);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || currentRequestId !== requestId.current) return;
      setSession(null);
      setSelectedChoice('');
      setError('');
      setLoading(Boolean(learningLanguageId));
    });
    if (!learningLanguageId) return () => {
      cancelled = true;
    };

    void supabase.rpc('review_session_overview', { p_learning_language_id: learningLanguageId }).then(({ data, error: overviewError }) => {
      if (cancelled || currentRequestId !== requestId.current) return;
      if (overviewError) {
        setError(overviewError.message);
      } else {
        setSession(parseSession(data));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  async function startSession() {
    if (!learningLanguageId) return;
    setStarting(true);
    setError('');
    const { data, error: startError } = await supabase.rpc('start_or_resume_review_session', { p_learning_language_id: learningLanguageId });
    if (startError) {
      setError(startError.message);
    } else {
      const started = parseSession(data);
      if (!started) setError('The Review Session response was invalid.');
      else {
        setSession(started);
        setSelectedChoice(activeQuestion(started)?.selected_answer ?? '');
      }
    }
    setStarting(false);
  }

  async function refreshOverview() {
    const { data, error: overviewError } = await supabase.rpc('review_session_overview', { p_learning_language_id: learningLanguageId });
    const refreshed = parseSession(data);
    if (!overviewError && refreshed) {
      setSession(refreshed);
      setSelectedChoice(activeQuestion(refreshed)?.selected_answer ?? '');
      return refreshed;
    }
    return null;
  }

  async function submitAnswer() {
    const question = session ? activeQuestion(session) : null;
    if (!session?.id || !question || !selectedChoice) return;
    setSubmitting(true);
    setError('');
    const { data, error: submitError } = await supabase.rpc('submit_review_session_answer', {
      p_question_id: question.id,
      p_selected_choice: selectedChoice,
      p_session_id: session.id,
    });
    const submitted = parseSession(data);
    if (submitted) {
      setSession(submitted);
      setSelectedChoice(activeQuestion(submitted)?.selected_answer ?? '');
    } else if (submitError) {
      const refreshed = await refreshOverview();
      if (!refreshed) setError(submitError.message);
    } else {
      const refreshed = await refreshOverview();
      if (!refreshed) setError('The Review Session response was invalid.');
    }
    setSubmitting(false);
  }

  const question = session ? activeQuestion(session) : null;
  const isComplete = session?.status === 'completed';

  return <section className="review-session" aria-label="Review Session">
    <h2 id="review-session-heading">{isComplete ? 'Review complete' : 'Review Session'}</h2>
    {loading && <p className="form-notice" role="status">Opening Review Session…</p>}
    {!loading && error && <p className="form-notice error" role="alert">Unable to open Review Session: {error}</p>}
    {!loading && !error && !session && <>
      <p className="review-session-intro">Practise a few saved words in a focused session.</p>
      <button className="primary-button" type="button" disabled={starting} onClick={() => void startSession()}>{starting ? 'Starting…' : 'Start review session'}</button>
    </>}
    {!loading && !error && session && isComplete && <>
      <p className="form-notice" role="status">Review complete: {session.correct_count ?? 0} of {session.total_count ?? session.questions.length} correct.</p>
      {session.questions.map((reviewQuestion) => <div className="review-session-result" key={reviewQuestion.id}>
        <p className="review-session-prompt">{reviewQuestion.prompt}</p>
        <ul className="review-session-choice-list">
          {reviewQuestion.choices.map((choice) => <li className={choice === reviewQuestion.selected_answer ? 'selected' : ''} key={choice}>{choice}</li>)}
        </ul>
      </div>)}
    </>}
    {!loading && !error && session && !isComplete && question && <>
      <p className="review-session-prompt">{question.prompt}</p>
      <p className="review-session-language">Answer in {question.answer_language_tag}.</p>
      <fieldset className="review-session-choices">
        <legend>Choose the best answer.</legend>
        {question.choices.map((choice) => <label key={choice}>
          <input checked={selectedChoice === choice} disabled={submitting} name="review-session-answer" onChange={() => setSelectedChoice(choice)} type="radio" value={choice} />
          {choice}
        </label>)}
      </fieldset>
      <button className="primary-button" type="button" disabled={submitting || !selectedChoice} onClick={() => void submitAnswer()}>{submitting ? 'Submitting…' : 'Submit answer'}</button>
    </>}
    {!loading && !error && session && !isComplete && !question && <p className="form-notice" role="status">Review Session submitted.</p>}
  </section>;
}
