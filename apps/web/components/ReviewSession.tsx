'use client';

import { languageName } from '@lexync/domain';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type ReviewDirection = 'recognition' | 'recall';

type ReviewSessionQuestion = {
  id: string;
  ordinal: number;
  prompt: string;
  direction: ReviewDirection;
  answer_language_tag: string | null;
  choices: string[];
  selected_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
  continued_at: string | null;
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
  const direction = value.direction === 'recall' ? 'recall' : value.direction === 'recognition' ? 'recognition' : null;
  if (typeof value.id !== 'string' || typeof value.ordinal !== 'number' || typeof value.prompt !== 'string' || !direction || choices.length < 2) return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    prompt: value.prompt,
    direction,
    answer_language_tag: typeof value.answer_language_tag === 'string' ? value.answer_language_tag : null,
    choices,
    selected_answer: typeof value.selected_answer === 'string' ? value.selected_answer : null,
    correct_answer: typeof value.correct_answer === 'string' ? value.correct_answer : null,
    is_correct: typeof value.is_correct === 'boolean' ? value.is_correct : null,
    answered_at: typeof value.answered_at === 'string' ? value.answered_at : null,
    continued_at: typeof value.continued_at === 'string' ? value.continued_at : null,
  };
}

function parseSession(value: unknown): ReviewSessionState | null {
  const candidate = unwrapSession(value);
  if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.learning_language_id !== 'string' || (candidate.status !== 'active' && candidate.status !== 'completed')) return null;
  const rawQuestions = Array.isArray(candidate.questions)
    ? candidate.questions
    : Array.isArray(candidate.queue)
      ? candidate.queue
      : Array.isArray(candidate.items)
        ? candidate.items
        : [];
  const questions = rawQuestions.map(parseQuestion).filter((question): question is ReviewSessionQuestion => Boolean(question)).sort((first, second) => first.ordinal - second.ordinal);
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

function questionAnswered(question: ReviewSessionQuestion) {
  return Boolean(question.answered_at || question.selected_answer);
}

function firstPending(session: ReviewSessionState) {
  return session.questions.find((question) => !question.continued_at) ?? null;
}

function answeredCount(session: ReviewSessionState) {
  return session.questions.filter(questionAnswered).length;
}

function percentage(session: ReviewSessionState) {
  const total = session.total_count ?? session.questions.length;
  if (!total) return 0;
  return Math.round(((session.correct_count ?? 0) / total) * 100);
}

export function ReviewSession({ learningLanguageId, learningLanguageTag, onExit }: { learningLanguageId: string; learningLanguageTag: string; onExit: () => void }) {
  const [session, setSession] = useState<ReviewSessionState | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [startingAnother, setStartingAnother] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  function applySession(nextSession: ReviewSessionState, preferredQuestionId?: string | null) {
    const nextQuestion = preferredQuestionId
      ? nextSession.questions.find((question) => question.id === preferredQuestionId && !question.continued_at) ?? firstPending(nextSession)
      : firstPending(nextSession);
    setSession(nextSession);
    setQuestionId(nextQuestion?.id ?? null);
    setSelectedChoice(nextQuestion?.selected_answer ?? '');
  }

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || currentRequestId !== requestId.current) return;
      setLoading(true);
      setError('');
      setSession(null);
      setQuestionId(null);
      setSelectedChoice('');
    });
    if (!learningLanguageId) {
      queueMicrotask(() => {
        if (cancelled || currentRequestId !== requestId.current) return;
        setError('A Learning Language is required to open Review.');
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const overview = await supabase.rpc('review_session_overview', { p_learning_language_id: learningLanguageId });
      if (cancelled || currentRequestId !== requestId.current) return;
      if (overview.error) {
        setError(overview.error.message);
        setLoading(false);
        return;
      }
      const existing = parseSession(overview.data);
      if (existing) {
        applySession(existing);
        setLoading(false);
        return;
      }
      const started = await supabase.rpc('start_or_resume_review_session', { p_learning_language_id: learningLanguageId });
      if (cancelled || currentRequestId !== requestId.current) return;
      if (started.error) setError(started.error.message);
      else {
        const created = parseSession(started.data);
        if (created) applySession(created);
        else setError('The Review Session response was invalid.');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  async function refreshOverview() {
    const { data, error: overviewError } = await supabase.rpc('review_session_overview', { p_learning_language_id: learningLanguageId });
    const refreshed = parseSession(data);
    if (!overviewError && refreshed) return refreshed;
    return null;
  }

  async function submitAnswer(choice: string) {
    if (!session || !questionId || selectedChoice || submitting || advancing) return;
    const question = session.questions.find((candidate) => candidate.id === questionId);
    if (!question) return;
    setSelectedChoice(choice);
    setSubmitting(true);
    setError('');
    const { data, error: submitError } = await supabase.rpc('submit_review_session_answer', {
      p_question_id: question.id,
      p_selected_choice: choice,
      p_session_id: session.id,
    });
    const submitted = parseSession(data);
    if (submitted) {
      applySession(submitted, question.id);
    } else if (submitError) {
      const refreshed = await refreshOverview();
      if (refreshed) applySession(refreshed, question.id);
      else setError(submitError.message);
    } else {
      onExit();
    }
    setSubmitting(false);
  }

  async function continueReview() {
    if (!session || !questionId || advancing || submitting) return;
    setAdvancing(true);
    setError('');
    const { data, error: continueError } = await supabase.rpc('continue_review_session_question', {
      p_question_id: questionId,
      p_session_id: session.id,
    });
    if (continueError) {
      setError(continueError.message);
      setAdvancing(false);
      return;
    }
    const continued = parseSession(data);
    if (!continued) {
      onExit();
      setAdvancing(false);
      return;
    }
    const nextQuestion = firstPending(continued);
    setSession(continued);
    if (nextQuestion) {
      setQuestionId(nextQuestion.id);
      setSelectedChoice(nextQuestion.selected_answer ?? '');
    } else {
      setQuestionId(null);
      setSelectedChoice('');
    }
    setAdvancing(false);
  }

  async function startAnotherReview() {
    setStartingAnother(true);
    setError('');
    const { data, error: startError } = await supabase.rpc('start_or_resume_review_session', { p_learning_language_id: learningLanguageId });
    if (startError) setError(startError.message);
    else {
      const nextSession = parseSession(data);
      if (nextSession) applySession(nextSession);
      else setError('The Review Session response was invalid.');
    }
    setStartingAnother(false);
  }

  const question = session && questionId ? session.questions.find((candidate) => candidate.id === questionId) ?? null : null;
  const pendingQuestion = session ? firstPending(session) : null;
  const isComplete = Boolean(session && !question && session.questions.length > 0 && !pendingQuestion);
  const total = session?.total_count ?? session?.questions.length ?? 0;
  const questionPosition = session && question ? session.questions.findIndex((candidate) => candidate.id === question.id) + 1 : 0;
  const progress = session ? Math.min(total, question ? questionPosition : answeredCount(session)) : 0;
  const feedback = question?.is_correct === true ? 'Correct' : question?.is_correct === false ? 'Incorrect' : '';

  return <main className="review-session-shell" aria-label="Review Session">
    <header className="review-session-header">
      <button className="review-session-exit" type="button" onClick={onExit}>Exit</button>
      <Image className="review-session-mark" src="/brand/mark-dark-on-light.png" alt="Lexync" width={44} height={44} priority unoptimized />
      <p className="review-session-language-name">{languageName(learningLanguageTag)}</p>
    </header>
    <div className="review-session-main">
      {loading && <div className="review-session-state" role="status" aria-live="polite"><span className="review-session-skeleton" aria-hidden="true" />Opening Review…</div>}
      {!loading && error && <div className="review-session-state review-session-error" role="alert"><p>Review is unavailable right now.</p><p>{error}</p><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>}
      {!loading && !error && session && !isComplete && question && <>
        <div className="review-session-progress-row">
          <span>Question {questionPosition} of {total}</span>
          <progress aria-label="Review progress" max={total} value={progress} />
        </div>
        <section className="review-session-question" role="region" aria-label="Review question">
          <p className="review-session-direction">{question.direction === 'recall' ? 'Recall' : 'Recognition'}{question.answer_language_tag ? ` · ${question.answer_language_tag}` : ''}</p>
          <h1 id="review-session-question-heading">{question.prompt}</h1>
          <fieldset className="review-session-choices">
            <legend>{question.direction === 'recall' ? 'Choose the matching Learning Language expression.' : 'Choose the best answer.'}</legend>
            {question.choices.map((choice) => {
              const isSelected = selectedChoice === choice || question.selected_answer === choice;
              const isCorrect = question.correct_answer === choice;
              const choiceState = question.is_correct === false && isCorrect ? ' correct' : question.is_correct === false && isSelected ? ' incorrect' : question.is_correct === true && isSelected ? ' correct' : '';
              return <label className={`review-session-choice${isSelected ? ' selected' : ''}${choiceState}`} key={choice}>
                <input checked={isSelected} disabled={Boolean(question.selected_answer || selectedChoice || submitting)} name={`review-session-answer-${question.id}`} onChange={() => void submitAnswer(choice)} type="radio" value={choice} />
                <span>{choice}</span>
                {choiceState && <span className="review-session-choice-icon" aria-hidden="true">{choiceState.includes('correct') ? '✓' : '×'}</span>}
              </label>;
            })}
          </fieldset>
          <div className={`review-session-feedback${feedback ? ` ${feedback.toLowerCase()}` : ''}`} aria-live="polite" role="status">
            {feedback && <><span className="review-session-feedback-icon" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d={feedback === 'Correct' ? 'm3 8 3 3 7-7' : 'm4 4 8 8m0-8-8 8'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></span><span>{feedback}</span>{feedback === 'Incorrect' && question.correct_answer && <><span className="review-session-correction-label">Correct answer</span><span>{question.correct_answer}</span></>}</>}
          </div>
        </section>
        <div className="review-session-footer"><button className="primary-button review-session-continue" type="button" disabled={!question.selected_answer && !selectedChoice || submitting || advancing} onClick={() => void continueReview()}>{advancing ? 'Loading…' : 'Continue'}</button></div>
      </>}
      {!loading && !error && session && !isComplete && !question && <div className="review-session-state" role="status"><p>This Review has no available questions.</p><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>}
      {!loading && !error && session && isComplete && <section className="review-session-complete" aria-labelledby="review-session-complete-heading">
        <h1 id="review-session-complete-heading">Review complete</h1>
        <p className="review-session-score">{session.correct_count ?? 0}/{total} · {percentage(session)}%</p>
        {session.questions.some((reviewQuestion) => reviewQuestion.is_correct === false) && <section className="review-session-missed" aria-label="Missed answers">
          <h2>Missed answers</h2>
          {session.questions.filter((reviewQuestion) => reviewQuestion.is_correct === false).map((reviewQuestion) => <div className="review-session-missed-item" key={reviewQuestion.id}>
            <p>{reviewQuestion.prompt}</p>
            <p><span>Selected</span><strong>{reviewQuestion.selected_answer}</strong></p>
            <p><span>Correct</span><strong>{reviewQuestion.correct_answer}</strong></p>
          </div>)}
        </section>}
        <div className="review-session-complete-actions"><button className="primary-button" type="button" disabled={startingAnother} onClick={() => void startAnotherReview()}>{startingAnother ? 'Starting…' : 'Start another review'}</button><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>
      </section>}
    </div>
  </main>;
}
