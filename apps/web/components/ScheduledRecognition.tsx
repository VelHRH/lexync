'use client';

import {
  deriveRecognitionCardSchedule,
  isTypedRecallAnswerCorrect,
  languageName,
  selectRecognitionChoices,
  type RecognitionReviewEvent,
  type ScheduledReviewRating,
} from '@lexync/domain';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LearningLanguage } from './StudyPairOnboarding';

export type LearningRecognitionCard = {
  answerLanguageTag: string;
  createdAt: string;
  direction: 'recognition' | 'recall';
  events: RecognitionReviewEvent[];
  expression: string;
  id: string;
  learningLanguageId: string;
  learningLanguageTag: string;
  senseId: string;
  suspended: boolean;
  translations: string[];
};

const ratingValues: { label: string; rating: ScheduledReviewRating }[] = [
  { label: 'Again', rating: 'again' },
  { label: 'Hard', rating: 'hard' },
  { label: 'Good', rating: 'good' },
  { label: 'Easy', rating: 'easy' },
];

type ScheduledReviewSessionItem = {
  card_id: string;
  confirmed_at: string | null;
  ordinal: number;
  review_event_id: string | null;
};

type ScheduledReviewSession = {
  created_at: string;
  id: string;
  items: ScheduledReviewSessionItem[];
  learning_language_id: string;
  status: string;
};

type ScheduledReviewConfirmation = {
  already_confirmed: boolean;
  event_id: string;
  occurred_at: string;
  rating: ScheduledReviewRating;
  session_status: string;
};

export function clearScheduledReviewEnded(learningLanguageId: string) {
  if (typeof window !== 'undefined') window.localStorage.removeItem(`lexync:scheduled-review-ended:${learningLanguageId}`);
}

function scheduledReviewEndedKey(learningLanguageId: string) {
  return `lexync:scheduled-review-ended:${learningLanguageId}`;
}

function orderedDueCards(cards: LearningRecognitionCard[], languageId: string, now: number) {
  return cards
    .filter((card) => card.learningLanguageId === languageId && !card.suspended)
    .filter((card) => deriveRecognitionCardSchedule(card).due.getTime() <= now)
    .sort((first, second) => {
      const dueDifference = deriveRecognitionCardSchedule(first).due.getTime() - deriveRecognitionCardSchedule(second).due.getTime();
      return dueDifference
        || (first.direction === 'recognition' ? 0 : 1) - (second.direction === 'recognition' ? 0 : 1)
        || first.id.localeCompare(second.id);
    });
}

function parseSession(data: unknown): ScheduledReviewSession | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Partial<ScheduledReviewSession>;
  if (typeof value.id !== 'string' || typeof value.learning_language_id !== 'string' || typeof value.status !== 'string') return null;
  const items = Array.isArray(value.items) ? value.items.filter((item): item is ScheduledReviewSessionItem => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Partial<ScheduledReviewSessionItem>;
    return typeof candidate.card_id === 'string'
      && typeof candidate.ordinal === 'number'
      && (candidate.review_event_id === null || typeof candidate.review_event_id === 'string')
      && (candidate.confirmed_at === null || typeof candidate.confirmed_at === 'string');
  }) : [];
  return {
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
    id: value.id,
    items,
    learning_language_id: value.learning_language_id,
    status: value.status,
  };
}

function parseConfirmation(data: unknown): ScheduledReviewConfirmation | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Partial<ScheduledReviewConfirmation>;
  if (typeof value.event_id !== 'string' || typeof value.occurred_at !== 'string' || typeof value.rating !== 'string' || typeof value.already_confirmed !== 'boolean' || typeof value.session_status !== 'string') return null;
  return {
    already_confirmed: value.already_confirmed,
    event_id: value.event_id,
    occurred_at: value.occurred_at,
    rating: value.rating as ScheduledReviewRating,
    session_status: value.session_status,
  };
}

async function confirmScheduledReview({
  card,
  sessionId,
  onNotice,
  onReviewConfirmed,
  onSessionConfirmed,
  rating,
  setError,
  setRating,
  setSaving,
}: {
  card: LearningRecognitionCard;
  sessionId: string;
  onNotice: (notice: string) => void;
  onReviewConfirmed: (cardId: string, event: RecognitionReviewEvent) => void;
  onSessionConfirmed: (cardId: string, event: RecognitionReviewEvent, confirmation: ScheduledReviewConfirmation) => Promise<void>;
  rating: ScheduledReviewRating;
  setError: (error: string) => void;
  setRating: (rating: ScheduledReviewRating) => void;
  setSaving: (saving: boolean) => void;
}) {
  const reviewedAt = new Date();
  const eventId = crypto.randomUUID();
  const occurredAt = reviewedAt.toISOString();
  setSaving(true);
  setError('');
  const { data, error: reviewError } = await supabase.rpc('confirm_scheduled_review_session', {
    p_card_id: card.id,
    p_event_id: eventId,
    p_occurred_at: occurredAt,
    p_rating: rating,
    p_session_id: sessionId,
  });
  if (reviewError) {
    setSaving(false);
    setError(`Review could not be recorded. ${reviewError.message}`);
    return;
  }
  const confirmation = parseConfirmation(data);
  if (!confirmation) {
    setSaving(false);
    setError('Review could not be recorded. The review session response was invalid.');
    return;
  }
  const event: RecognitionReviewEvent = {
    id: confirmation.event_id,
    occurredAt: confirmation.occurred_at,
    rating: confirmation.rating,
  };
  await onSessionConfirmed(card.id, event, confirmation);
  setSaving(false);
  const nextSchedule = deriveRecognitionCardSchedule({ ...card, events: [...card.events, event] });
  onNotice(`${confirmation.already_confirmed ? 'Review was already recorded' : 'Review recorded'}. Next review ${nextSchedule.due.toLocaleString()}.`);
  setRating('again');
  onReviewConfirmed(card.id, event);
}

export function ScheduledRecognition({
  cards,
  onReviewConfirmed,
  language,
}: {
  cards: LearningRecognitionCard[];
  onReviewConfirmed: (cardId: string, event: RecognitionReviewEvent) => void;
  language: LearningLanguage;
}) {
  const [now] = useState(() => Date.now());
  const [reviewLanguageId] = useState(language.id);
  const [dueCardIds] = useState(() => orderedDueCards(cards, language.id, now).map((card) => card.id));
  const [session, setSession] = useState<ScheduledReviewSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(dueCardIds.length));
  const [sessionError, setSessionError] = useState('');
  const [notice, setNotice] = useState('');
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const ids = dueCardIds;
    if (!ids.length) return;
    let cancelled = false;
    async function loadOrStartSession() {
      setSessionLoading(true);
      setSessionError('');
      const { data: overviewData, error: overviewError } = await supabase.rpc('scheduled_review_session_overview', {
        p_learning_language_id: reviewLanguageId,
      });
      if (cancelled) return;
      if (overviewError) {
        setSessionError(overviewError.message);
        setSessionLoading(false);
        return;
      }
      const overview = parseSession(overviewData);
      if (overview) {
        clearScheduledReviewEnded(reviewLanguageId);
        setSession(overview);
        setSessionLoading(false);
        return;
      }
      if (window.localStorage.getItem(scheduledReviewEndedKey(reviewLanguageId)) === 'ended') {
        setSession({ created_at: '', id: '', items: [], learning_language_id: reviewLanguageId, status: 'ended' });
        setSessionLoading(false);
        return;
      }
      const { data: startedData, error: startedError } = await supabase.rpc('start_or_resume_scheduled_review', {
        p_card_ids: ids,
        p_learning_language_id: reviewLanguageId,
      });
      if (cancelled) return;
      if (startedError) {
        setSessionError(startedError.message);
        setSessionLoading(false);
        return;
      }
      const started = parseSession(startedData);
      if (!started) {
        setSessionError('The review session response was invalid.');
      } else {
        setSession(started);
      }
      setSessionLoading(false);
    }
    void loadOrStartSession();
    return () => {
      cancelled = true;
    };
  }, [dueCardIds, reviewLanguageId]);

  async function refreshSession() {
    if (!session?.learning_language_id) return;
    const { data, error } = await supabase.rpc('scheduled_review_session_overview', {
      p_learning_language_id: session.learning_language_id,
    });
    if (error) return;
    const refreshed = parseSession(data);
    setSession((current) => refreshed ?? (current ? { ...current, status: 'completed' } : current));
  }

  async function handleSessionConfirmed(cardId: string, event: RecognitionReviewEvent, confirmation: ScheduledReviewConfirmation) {
    setSession((current) => current ? {
      ...current,
      status: confirmation.session_status,
      items: current.items.map((item) => item.card_id === cardId
        ? { ...item, confirmed_at: event.occurredAt, review_event_id: event.id }
        : item),
    } : current);
    if (confirmation.already_confirmed) await refreshSession();
  }

  async function endReviewEarly() {
    if (!session?.id) return;
    setEnding(true);
    const { data, error } = await supabase.rpc('end_scheduled_review_session', { p_session_id: session.id });
    setEnding(false);
    if (error) {
      setSessionError(error.message);
      return;
    }
    const ended = data as { id?: unknown; status?: unknown };
    if (ended.status !== 'ended') {
      setSessionError('The review session could not be ended.');
      return;
    }
    window.localStorage.setItem(scheduledReviewEndedKey(reviewLanguageId), 'ended');
    setSession((current) => current ? { ...current, status: 'ended' } : current);
  }

  const sessionItems = [...(session?.items ?? [])].sort((first, second) => first.ordinal - second.ordinal);
  const sessionCards = sessionItems.map((item) => cards.find((card) => card.id === item.card_id)).filter((card): card is LearningRecognitionCard => Boolean(card));
  const currentItem = sessionItems.find((item) => !item.review_event_id && cards.some((card) => card.id === item.card_id));
  const currentCard = currentItem ? cards.find((card) => card.id === currentItem.card_id) : undefined;
  const total = sessionItems.length;
  const confirmed = sessionItems.filter((item) => item.review_event_id).length;
  const complete = session?.status === 'completed' || (total > 0 && confirmed === total);

  if (sessionLoading) {
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Scheduled Review</h2>
      <p className="form-notice" role="status">Opening your review session…</p>
    </section>;
  }

  if (sessionError) {
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Scheduled Review</h2>
      <p className="form-notice error" role="alert">Unable to open Scheduled Review: {sessionError}</p>
    </section>;
  }

  if (session?.status === 'ended') {
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Review ended</h2>
      <p className="form-notice" role="status">Review ended early. Confirmed reviews were retained.</p>
    </section>;
  }

  if (!session || !total || complete || !currentCard || !currentItem) {
    if (session && (complete || !currentItem)) {
      return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
        <h2 id="recognition-heading">Review complete</h2>
        <p className="form-notice" role="status">Scheduled Review complete: {confirmed} of {total}.</p>
        <p>No Scheduled Review Cards are due for {languageName(language.languageTag)}.</p>
      </section>;
    }
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Scheduled Review</h2>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <p>No Scheduled Review Cards are due for {languageName(language.languageTag)}.</p>
    </section>;
  }

  const reviewLanguage = currentCard.learningLanguageId === language.id
    ? language
    : { id: currentCard.learningLanguageId, languageTag: currentCard.learningLanguageTag };

  return <>
    <ScheduledReviewExercise
    cards={sessionCards}
    currentCard={currentCard}
    key={currentCard.id}
    language={reviewLanguage}
    notice={notice}
    onNotice={setNotice}
    onReviewConfirmed={onReviewConfirmed}
    onSessionConfirmed={handleSessionConfirmed}
    sessionId={session.id}
  />
    <div className="scheduled-review-progress" aria-live="polite">
      <p role="status">Card {currentItem.ordinal} of {total}</p>
      <button className="secondary-button" type="button" disabled={ending} onClick={() => void endReviewEarly()}>{ending ? 'Ending review…' : 'End review early'}</button>
    </div>
  </>;
}

type ScheduledReviewExerciseProps = {
  cards: LearningRecognitionCard[];
  currentCard: LearningRecognitionCard;
  language: LearningLanguage;
  notice: string;
  onNotice: (notice: string) => void;
  onReviewConfirmed: (cardId: string, event: RecognitionReviewEvent) => void;
  onSessionConfirmed: (cardId: string, event: RecognitionReviewEvent, confirmation: ScheduledReviewConfirmation) => Promise<void>;
  sessionId: string;
};

function ScheduledReviewExercise({
  currentCard,
  language,
  notice,
  onNotice,
  onReviewConfirmed,
  onSessionConfirmed,
  sessionId,
  ...props
}: ScheduledReviewExerciseProps) {
  if (currentCard.direction === 'recall') {
    return <RecallExercise
      currentCard={currentCard}
      notice={notice}
      onNotice={onNotice}
      onReviewConfirmed={onReviewConfirmed}
      onSessionConfirmed={onSessionConfirmed}
      sessionId={sessionId}
    />;
  }

  return <RecognitionChoiceExercise
    {...props}
    currentCard={currentCard}
    language={language}
    notice={notice}
    onNotice={onNotice}
    onReviewConfirmed={onReviewConfirmed}
    onSessionConfirmed={onSessionConfirmed}
    sessionId={sessionId}
  />;
}

function RecognitionChoiceExercise({
  cards,
  currentCard,
  language,
  notice,
  onNotice,
  onReviewConfirmed,
  onSessionConfirmed,
  sessionId,
}: ScheduledReviewExerciseProps) {
  const choiceCards = cards.map((card) => ({
    ...card,
    referenceLanguageTag: card.answerLanguageTag,
    studyPairId: `${card.learningLanguageId}:${card.answerLanguageTag}`,
    targetLanguageTag: card.learningLanguageTag,
  }));
  const choices = selectRecognitionChoices({
    ...currentCard,
    referenceLanguageTag: currentCard.answerLanguageTag,
    studyPairId: `${currentCard.learningLanguageId}:${currentCard.answerLanguageTag}`,
    targetLanguageTag: currentCard.learningLanguageTag,
  }, choiceCards);
  const [revealed, setRevealed] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [rating, setRating] = useState<ScheduledReviewRating>('again');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function confirmReview() {
    await confirmScheduledReview({
      card: currentCard,
      onNotice,
      onReviewConfirmed,
      onSessionConfirmed,
      rating,
      sessionId,
      setError,
      setRating,
      setSaving,
    });
  }

  return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
    <p className="eyebrow"><span /> Scheduled Review</p>
    <h2 id="recognition-heading">Recognition</h2>
    <p className="app-empty">Translate from {languageName(language.languageTag)}. Answer Language: {currentCard.answerLanguageTag}.</p>
    <p className="recognition-expression">{currentCard.expression}</p>
    {choices ? <>
      <fieldset className="recognition-choices">
        <legend>Choose the best translation.</legend>
        {choices.map((choice) => <label key={choice.senseId}>
          <input
            checked={selectedAnswer === choice.senseId}
            disabled={saving}
            name="recognition-answer"
            onChange={() => {
              setSelectedAnswer(choice.senseId);
              setRating(choice.correct ? 'good' : 'again');
            }}
            type="radio"
            value={choice.senseId}
          />
          {choice.text}
        </label>)}
      </fieldset>
      {selectedAnswer && <RatingControls rating={rating} saving={saving} setRating={setRating} onConfirm={() => void confirmReview()} />}
    </> : <>
      {!revealed && <button className="primary-button" type="button" disabled={saving} onClick={() => setRevealed(true)}>Reveal translation</button>}
      {revealed && <>
        <div className="recognition-answer" aria-live="polite">
          {currentCard.translations.map((translation) => <p key={translation}>{translation}</p>)}
        </div>
        <RatingControls rating={rating} saving={saving} setRating={setRating} onConfirm={() => void confirmReview()} />
      </>}
    </>}
    {error && <p className="form-notice error" role="alert">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}

function RecallExercise({
  currentCard,
  notice,
  onNotice,
  onReviewConfirmed,
  onSessionConfirmed,
  sessionId,
}: {
  currentCard: LearningRecognitionCard;
  notice: string;
  onNotice: (notice: string) => void;
  onReviewConfirmed: (cardId: string, event: RecognitionReviewEvent) => void;
  onSessionConfirmed: (cardId: string, event: RecognitionReviewEvent, confirmation: ScheduledReviewConfirmation) => Promise<void>;
  sessionId: string;
}) {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [rating, setRating] = useState<ScheduledReviewRating>('again');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function checkAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isCorrect = isTypedRecallAnswerCorrect(answer, currentCard.expression);
    setChecked(true);
    setCorrect(isCorrect);
    setRating(isCorrect ? 'good' : 'again');
  }

  async function confirmReview() {
    await confirmScheduledReview({
      card: currentCard,
      onNotice,
      onReviewConfirmed,
      onSessionConfirmed,
      rating,
      sessionId,
      setError,
      setRating,
      setSaving,
    });
  }

  return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
    <p className="eyebrow"><span /> Scheduled Review</p>
    <h2 id="recognition-heading">Recall</h2>
    <p className="app-empty">Answer Language: {currentCard.answerLanguageTag}. Type the Target Expression.</p>
    <div className="recognition-answer" aria-label="Translations">
      {currentCard.translations.map((translation, index) => <p key={`${translation}-${index}`}>{translation}</p>)}
    </div>
    <form className="recall-form" onSubmit={checkAnswer}>
      <label htmlFor="target-expression">Target Expression</label>
      <input id="target-expression" value={answer} disabled={saving} onChange={(event) => setAnswer(event.target.value)} />
      <button className="primary-button" type="submit" disabled={saving}>Check answer</button>
    </form>
    <div aria-live="polite">
      {checked && <p className="form-notice">{correct ? 'Correct.' : 'Incorrect.'}</p>}
    </div>
    {checked && <>
      <fieldset className="recognition-correctness">
        <legend>Was the answer correct?</legend>
        <label>
          <input checked={correct === true} disabled={saving} name="recall-correctness" onChange={() => { setCorrect(true); setRating('good'); }} type="radio" value="correct" />
          Correct
        </label>
        <label>
          <input checked={correct === false} disabled={saving} name="recall-correctness" onChange={() => { setCorrect(false); setRating('again'); }} type="radio" value="incorrect" />
          Incorrect
        </label>
      </fieldset>
      <RatingControls rating={rating} saving={saving} setRating={setRating} onConfirm={() => void confirmReview()} />
    </>}
    {error && <p className="form-notice error" role="alert">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}

function RatingControls({
  rating,
  saving,
  setRating,
  onConfirm,
}: {
  rating: ScheduledReviewRating;
  saving: boolean;
  setRating: (rating: ScheduledReviewRating) => void;
  onConfirm: () => void;
}) {
  return <>
    <fieldset className="recognition-ratings">
      <legend>How well did you remember?</legend>
      {ratingValues.map((candidate) => <label key={candidate.rating}>
        <input
          checked={rating === candidate.rating}
          disabled={saving}
          name="recognition-rating"
          onChange={() => setRating(candidate.rating)}
          type="radio"
          value={candidate.rating}
        />
        {candidate.label}
      </label>)}
    </fieldset>
    <button className="primary-button" type="button" disabled={saving} onClick={onConfirm}>{saving ? 'Recording review…' : 'Confirm review'}</button>
  </>;
}
