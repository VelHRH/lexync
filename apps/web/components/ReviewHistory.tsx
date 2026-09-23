'use client';

import { languageName } from '@lexync/domain';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type ReviewQuestion = {
  ordinal: number;
  question_type: 'translation' | 'cloze';
  direction: 'recognition' | 'recall' | null;
  selected_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
};

type ReviewHistorySession = {
  id: string;
  learning_language_tag: string;
  completed_at: string;
  correct_count: number;
  total_count: number;
  questions: ReviewQuestion[];
};

type SenseStatistic = {
  sense_id: string;
  expression: string;
  practice_count: number;
  last_practiced_at: string | null;
};

type ReviewHistoryData = { sessions: ReviewHistorySession[]; senseStatistics: SenseStatistic[] };

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

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseQuestion(value: unknown): ReviewQuestion | null {
  if (!isRecord(value)) return null;
  const questionType = value.question_type === 'translation' || value.question_type === 'cloze' ? value.question_type : null;
  const direction = value.direction === 'recognition' || value.direction === 'recall' ? value.direction : value.direction === null ? null : undefined;
  if (!questionType || direction === undefined || typeof value.ordinal !== 'number') return null;
  return {
    ordinal: value.ordinal,
    question_type: questionType,
    direction,
    selected_answer: textValue(value.selected_answer),
    correct_answer: textValue(value.correct_answer),
    is_correct: typeof value.is_correct === 'boolean' ? value.is_correct : null,
    answered_at: textValue(value.answered_at),
  };
}

function parseSession(value: unknown): ReviewHistorySession | null {
  if (!isRecord(value)) return null;
  const completedAt = textValue(value.completed_at);
  const languageTag = textValue(value.learning_language_tag);
  if (!textValue(value.id) || !completedAt || !languageTag) return null;
  const rawQuestions = Array.isArray(value.questions) ? value.questions : [];
  return {
    id: value.id as string,
    learning_language_tag: languageTag,
    completed_at: completedAt,
    correct_count: Math.max(0, numberValue(value.correct_count, 0)),
    total_count: Math.max(0, numberValue(value.total_count, rawQuestions.length)),
    questions: rawQuestions.map(parseQuestion).filter((question): question is ReviewQuestion => Boolean(question)).sort((first, second) => first.ordinal - second.ordinal),
  };
}

function parseStatistic(value: unknown): SenseStatistic | null {
  if (!isRecord(value) || !textValue(value.sense_id) || !textValue(value.expression)) return null;
  return {
    sense_id: value.sense_id as string,
    expression: value.expression as string,
    practice_count: Math.max(0, numberValue(value.practice_count, 0)),
    last_practiced_at: textValue(value.last_practiced_at),
  };
}

function parseHistory(value: unknown): ReviewHistoryData {
  const parsed = parseJson(value);
  if (!isRecord(parsed)) return { sessions: [], senseStatistics: [] };
  const sessions = (Array.isArray(parsed.sessions) ? parsed.sessions : []).map(parseSession).filter((session): session is ReviewHistorySession => Boolean(session));
  const senseStatistics = (Array.isArray(parsed.sense_statistics) ? parsed.sense_statistics : []).map(parseStatistic).filter((statistic): statistic is SenseStatistic => Boolean(statistic));
  return { sessions, senseStatistics };
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function percentage(session: ReviewHistorySession): number {
  return session.total_count > 0 ? Math.round((session.correct_count / session.total_count) * 100) : 0;
}

function QuestionDetail({ question }: { question: ReviewQuestion }) {
  const typeLabel = question.question_type === 'cloze' ? 'Cloze' : 'Translation';
  return <li className="review-history-question">
    <div className="review-history-question-heading"><strong>{typeLabel}</strong>{question.direction && <span>{question.direction === 'recognition' ? 'Recognition' : 'Recall'}</span>}</div>
    <dl className="review-history-question-details">
      <div><dt>Selected answer</dt><dd>{question.selected_answer ?? 'Not answered'}</dd></div>
      <div><dt>Correct answer</dt><dd>{question.correct_answer ?? 'Unavailable'}</dd></div>
      <div><dt>Answered</dt><dd>{question.answered_at ? <time dateTime={question.answered_at}>{formatDate(question.answered_at)}</time> : 'Not answered'}</dd></div>
      <div><dt>Result</dt><dd className={question.is_correct === true ? 'review-history-result correct' : question.is_correct === false ? 'review-history-result incorrect' : 'review-history-result'}>{question.is_correct === true ? 'Correct' : question.is_correct === false ? 'Incorrect' : 'Not scored'}</dd></div>
    </dl>
  </li>;
}

export function ReviewHistory({ learningLanguageId, learningLanguageTag }: { learningLanguageId: string; learningLanguageTag: string }) {
  const [history, setHistory] = useState<ReviewHistoryData>({ sessions: [], senseStatistics: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
    });
    void supabase.rpc('review_history', { p_learning_language_id: learningLanguageId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) {
        setError(`Review history could not be loaded: ${rpcError.message}`);
        setHistory({ sessions: [], senseStatistics: [] });
      } else {
        setHistory(parseHistory(data));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  const sessions = useMemo(() => [...history.sessions].sort((first, second) => Date.parse(second.completed_at) - Date.parse(first.completed_at)), [history.sessions]);
  const selectedLanguageName = languageName(learningLanguageTag);

  return <div className="review-history" aria-busy={loading}>
    <section className="review-history-section" aria-labelledby="completed-review-sessions-heading">
      <div className="review-history-heading">
        <p className="eyebrow"><span /> Completed practice</p>
        <h2 id="completed-review-sessions-heading">Completed Review Sessions</h2>
        <p className="review-history-context">All completed sessions across your Learning Languages.</p>
      </div>
      {loading && <div className="review-history-loading" role="status"><span aria-hidden="true" />Loading Review history…</div>}
      {!loading && error && <p className="form-notice error" role="alert">{error}</p>}
      {!loading && !error && sessions.length === 0 && <p className="review-history-empty">No completed Review Sessions yet. Start a Review from Home to build your history.</p>}
      {!loading && !error && sessions.length > 0 && <div className="review-history-list">{sessions.map((session) => <details className="review-history-session" key={session.id}>
        <summary><span className="review-history-session-language">{languageName(session.learning_language_tag)} <small>{session.learning_language_tag}</small></span><time dateTime={session.completed_at}>{formatDate(session.completed_at)}</time><span className="review-history-score">{session.correct_count}/{session.total_count} · {percentage(session)}%</span></summary>
        <ol className="review-history-questions">{session.questions.map((question) => <QuestionDetail key={`${session.id}-${question.ordinal}`} question={question} />)}</ol>
      </details>)}</div>}
    </section>
    <section className="review-history-section review-history-statistics" aria-label="Per-Sense practice statistics">
      <div className="review-history-heading">
        <p className="eyebrow"><span /> Practice by Sense</p>
        <h2>Per-Sense practice</h2>
        <p className="review-history-context">Selected Learning Language: <strong>{selectedLanguageName} · {learningLanguageTag}</strong></p>
      </div>
      {!loading && !error && history.senseStatistics.length === 0 && <p className="review-history-empty">No Senses are available in this Learning Language yet. Add vocabulary to begin practising.</p>}
      {loading && <div className="review-history-statistics-skeleton" aria-hidden="true"><span /><span /><span /></div>}
      {!loading && !error && history.senseStatistics.length > 0 && <ul className="review-history-sense-list">{history.senseStatistics.map((statistic) => <li key={statistic.sense_id}>
        <strong>{statistic.expression}</strong>
        <span><span>Practice count</span> <b>{statistic.practice_count}</b></span>
        <span>{statistic.last_practiced_at ? <time dateTime={statistic.last_practiced_at}>{formatDate(statistic.last_practiced_at)}</time> : 'Not practised yet'}</span>
      </li>)}</ul>}
    </section>
  </div>;
}
