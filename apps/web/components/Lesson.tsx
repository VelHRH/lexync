'use client';

import { languageName } from '@lexync/domain';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type LessonQuestionType = 'translation' | 'cloze';
type LessonDirection = 'recognition' | 'recall';

type LessonQuestion = {
  id: string;
  ordinal: number;
  prompt: string;
  question_type: LessonQuestionType;
  direction: LessonDirection | null;
  answer_language_tag: string | null;
  choices: string[];
  selected_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
  continued_at: string | null;
};

type LessonState = {
  id: string;
  learning_language_id: string;
  status: 'active' | 'completed';
  created_at: string;
  completed_at: string | null;
  correct_count: number | null;
  total_count: number | null;
  questions: LessonQuestion[];
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

function unwrapLesson(value: unknown): unknown {
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) return parsed[0] ?? null;
  if (!isRecord(parsed)) return parsed;
  if ('session' in parsed) return unwrapLesson(parsed.session);
  if ('data' in parsed && !('id' in parsed)) return unwrapLesson(parsed.data);
  return parsed;
}

function parseQuestion(value: unknown): LessonQuestion | null {
  if (!isRecord(value)) return null;
  const choices = Array.isArray(value.choices) ? value.choices.filter((choice): choice is string => typeof choice === 'string') : [];
  const questionType = value.question_type === 'cloze' ? 'cloze' : value.question_type === 'translation' ? 'translation' : null;
  const direction = value.direction === 'recall' ? 'recall' : value.direction === 'recognition' ? 'recognition' : null;
  if (typeof value.id !== 'string' || typeof value.ordinal !== 'number' || typeof value.prompt !== 'string' || !questionType || (questionType === 'translation' && !direction) || (questionType === 'cloze' && value.direction !== null) || choices.length < 2) return null;
  return {
    id: value.id,
    ordinal: value.ordinal,
    prompt: value.prompt,
    question_type: questionType,
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

function parseLesson(value: unknown): LessonState | null {
  const candidate = unwrapLesson(value);
  if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.learning_language_id !== 'string' || (candidate.status !== 'active' && candidate.status !== 'completed')) return null;
  const rawQuestions = Array.isArray(candidate.questions)
    ? candidate.questions
    : Array.isArray(candidate.queue)
      ? candidate.queue
      : Array.isArray(candidate.items)
        ? candidate.items
        : [];
  const questions = rawQuestions.map(parseQuestion).filter((question): question is LessonQuestion => Boolean(question)).sort((first, second) => first.ordinal - second.ordinal);
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

function questionAnswered(question: LessonQuestion) {
  return Boolean(question.answered_at || question.selected_answer);
}

function firstPending(lesson: LessonState) {
  return lesson.questions.find((question) => !question.continued_at) ?? null;
}

function answeredCount(lesson: LessonState) {
  return lesson.questions.filter(questionAnswered).length;
}

function percentage(lesson: LessonState) {
  const total = lesson.total_count ?? lesson.questions.length;
  if (!total) return 0;
  return Math.round(((lesson.correct_count ?? 0) / total) * 100);
}

export function Lesson({ learningLanguageId, learningLanguageTag, onExit }: { learningLanguageId: string; learningLanguageTag: string; onExit: () => void }) {
  const [lesson, setLesson] = useState<LessonState | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [startingAnother, setStartingAnother] = useState(false);
  const [error, setError] = useState('');
  const lessonRequestId = useRef(0);

  function applyLesson(nextLesson: LessonState, preferredQuestionId?: string | null) {
    const nextQuestion = preferredQuestionId
      ? nextLesson.questions.find((question) => question.id === preferredQuestionId && !question.continued_at) ?? firstPending(nextLesson)
      : firstPending(nextLesson);
    setLesson(nextLesson);
    setQuestionId(nextQuestion?.id ?? null);
    setSelectedChoice(nextQuestion?.selected_answer ?? '');
  }

  useEffect(() => {
    const currentRequestId = ++lessonRequestId.current;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || currentRequestId !== lessonRequestId.current) return;
      setLoading(true);
      setError('');
      setLesson(null);
      setQuestionId(null);
      setSelectedChoice('');
    });
    if (!learningLanguageId) {
      queueMicrotask(() => {
        if (cancelled || currentRequestId !== lessonRequestId.current) return;
        setError('A Learning Language is required to open a Lesson.');
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const overview = await supabase.rpc('lesson_overview', { p_learning_language_id: learningLanguageId });
      if (cancelled || currentRequestId !== lessonRequestId.current) return;
      if (overview.error) {
        setError(overview.error.message);
        setLoading(false);
        return;
      }
      const existing = parseLesson(overview.data);
      if (existing) {
        applyLesson(existing);
        setLoading(false);
        return;
      }
      const started = await supabase.rpc('start_or_resume_vocabulary_lesson', { p_learning_language_id: learningLanguageId });
      if (cancelled || currentRequestId !== lessonRequestId.current) return;
      if (started.error) setError(started.error.message);
      else {
        const created = parseLesson(started.data);
        if (created) applyLesson(created);
        else setError('The Lesson response was invalid.');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  async function refreshOverview() {
    const { data, error: overviewError } = await supabase.rpc('lesson_overview', { p_learning_language_id: learningLanguageId });
    const refreshed = parseLesson(data);
    if (!overviewError && refreshed) return refreshed;
    return null;
  }

  async function submitAnswer(choice: string) {
    if (!lesson || !questionId || selectedChoice || submitting || advancing) return;
    const question = lesson.questions.find((candidate) => candidate.id === questionId);
    if (!question) return;
    setSelectedChoice(choice);
    setSubmitting(true);
    setError('');
    const { data, error: submitError } = await supabase.rpc('submit_lesson_answer', {
      p_question_id: question.id,
      p_selected_choice: choice,
      p_lesson_id: lesson.id,
    });
    const submitted = parseLesson(data);
    if (submitted) {
      applyLesson(submitted, question.id);
    } else if (submitError) {
      const refreshed = await refreshOverview();
      if (refreshed) applyLesson(refreshed, question.id);
      else setError(submitError.message);
    } else {
      onExit();
    }
    setSubmitting(false);
  }

  async function continueLesson() {
    if (!lesson || !questionId || advancing || submitting) return;
    setAdvancing(true);
    setError('');
    const { data, error: continueError } = await supabase.rpc('continue_lesson_question', {
      p_question_id: questionId,
      p_lesson_id: lesson.id,
    });
    if (continueError) {
      setError(continueError.message);
      setAdvancing(false);
      return;
    }
    const continued = parseLesson(data);
    if (!continued) {
      onExit();
      setAdvancing(false);
      return;
    }
    const nextQuestion = firstPending(continued);
    setLesson(continued);
    if (nextQuestion) {
      setQuestionId(nextQuestion.id);
      setSelectedChoice(nextQuestion.selected_answer ?? '');
    } else {
      setQuestionId(null);
      setSelectedChoice('');
    }
    setAdvancing(false);
  }

  async function startAnotherLesson() {
    setStartingAnother(true);
    setError('');
    const { data, error: startError } = await supabase.rpc('start_or_resume_vocabulary_lesson', { p_learning_language_id: learningLanguageId });
    if (startError) setError(startError.message);
    else {
      const nextLesson = parseLesson(data);
      if (nextLesson) applyLesson(nextLesson);
      else setError('The Lesson response was invalid.');
    }
    setStartingAnother(false);
  }

  const question = lesson && questionId ? lesson.questions.find((candidate) => candidate.id === questionId) ?? null : null;
  const pendingQuestion = lesson ? firstPending(lesson) : null;
  const isComplete = Boolean(lesson && !question && lesson.questions.length > 0 && !pendingQuestion);
  const total = lesson?.total_count ?? lesson?.questions.length ?? 0;
  const questionPosition = lesson && question ? lesson.questions.findIndex((candidate) => candidate.id === question.id) + 1 : 0;
  const progress = lesson ? Math.min(total, question ? questionPosition : answeredCount(lesson)) : 0;
  const feedback = question?.is_correct === true ? 'Correct' : question?.is_correct === false ? 'Incorrect' : '';

  return <main className="lesson-shell" aria-label="Lesson">
    <header className="lesson-header">
      <button className="lesson-exit" type="button" onClick={onExit}>Exit</button>
      <Image className="lesson-mark" src="/brand/mark-dark-on-light.png" alt="Lexync" width={44} height={44} priority unoptimized />
      <p className="lesson-language-name">{languageName(learningLanguageTag)}</p>
    </header>
    <div className="lesson-main">
      {loading && <div className="lesson-state" role="status" aria-live="polite"><span className="lesson-skeleton" aria-hidden="true" />Opening Lesson…</div>}
      {!loading && error && <div className="lesson-state lesson-error" role="alert"><p>Lesson is unavailable right now.</p><p>{error}</p><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>}
      {!loading && !error && lesson && !isComplete && question && <>
        <div className="lesson-progress-row">
          <span>Lesson question {questionPosition} of {total}</span>
          <progress aria-label="Lesson progress" max={total} value={progress} />
        </div>
        <section className="lesson-question" role="region" aria-label="Lesson question">
          <p className="lesson-direction">{question.question_type === 'cloze' ? 'Cloze' : question.direction === 'recall' ? 'Recall' : 'Recognition'}{question.question_type === 'translation' && question.answer_language_tag ? ` · ${question.answer_language_tag}` : ''}</p>
          <h1 id="lesson-question-heading">{question.prompt}</h1>
          <fieldset className="lesson-choices">
            <legend>{question.question_type === 'cloze' ? 'Choose the missing expression.' : question.direction === 'recall' ? 'Choose the matching Learning Language expression.' : 'Choose the best answer.'}</legend>
            {question.choices.map((choice) => {
              const isSelected = selectedChoice === choice || question.selected_answer === choice;
              const isCorrect = question.correct_answer === choice;
              const choiceState = question.is_correct === false && isCorrect ? ' correct' : question.is_correct === false && isSelected ? ' incorrect' : question.is_correct === true && isSelected ? ' correct' : '';
              return <label className={`lesson-choice${isSelected ? ' selected' : ''}${choiceState}`} key={choice}>
                <input checked={isSelected} disabled={Boolean(question.selected_answer || selectedChoice || submitting)} name={`lesson-answer-${question.id}`} onChange={() => void submitAnswer(choice)} type="radio" value={choice} />
                <span>{choice}</span>
                {choiceState && <span className="lesson-choice-icon" aria-hidden="true">{choiceState.includes('correct') ? '✓' : '×'}</span>}
              </label>;
            })}
          </fieldset>
          <div className={`lesson-feedback${feedback ? ` ${feedback.toLowerCase()}` : ''}`} aria-live="polite" role="status">
            {feedback && <><span className="lesson-feedback-icon" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d={feedback === 'Correct' ? 'm3 8 3 3 7-7' : 'm4 4 8 8m0-8-8 8'} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg></span><span>{feedback}</span>{feedback === 'Incorrect' && question.correct_answer && <><span className="lesson-correction-label">Correct answer</span><span>{question.correct_answer}</span></>}</>}
          </div>
        </section>
        <div className="lesson-footer"><button className="primary-button lesson-continue" type="button" disabled={!question.selected_answer && !selectedChoice || submitting || advancing} onClick={() => void continueLesson()}>{advancing ? 'Loading…' : 'Continue'}</button></div>
      </>}
      {!loading && !error && lesson && !isComplete && !question && <div className="lesson-state" role="status"><p>This Lesson has no available questions.</p><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>}
      {!loading && !error && lesson && isComplete && <section className="lesson-complete" aria-labelledby="lesson-complete-heading">
        <h1 id="lesson-complete-heading">Lesson complete</h1>
        <p className="lesson-score">{lesson.correct_count ?? 0}/{total} · {percentage(lesson)}%</p>
        {lesson.questions.some((lessonQuestion) => lessonQuestion.is_correct === false) && <section className="lesson-missed" aria-label="Missed answers">
          <h2>Missed answers</h2>
          {lesson.questions.filter((lessonQuestion) => lessonQuestion.is_correct === false).map((lessonQuestion) => <div className="lesson-missed-item" key={lessonQuestion.id}>
            <p>{lessonQuestion.prompt}</p>
            <p><span>Selected</span><strong>{lessonQuestion.selected_answer}</strong></p>
            <p><span>Correct</span><strong>{lessonQuestion.correct_answer}</strong></p>
          </div>)}
        </section>}
        <div className="lesson-complete-actions"><button className="primary-button" type="button" disabled={startingAnother} onClick={() => void startAnotherLesson()}>{startingAnother ? 'Starting…' : 'Start another lesson'}</button><button className="secondary-button" type="button" onClick={onExit}>Back to Home</button></div>
      </section>}
    </div>
  </main>;
}
