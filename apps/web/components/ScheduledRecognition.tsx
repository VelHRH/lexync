'use client';

import {
  deriveRecognitionCardSchedule,
  languageName,
  selectRecognitionChoices,
  type RecognitionReviewEvent,
  type ScheduledReviewRating,
} from '@lexync/domain';
import { useState } from 'react';
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
  const dueCards = cards
    .filter((card) => card.learningLanguageId === language.id && !card.suspended)
    .filter((card) => deriveRecognitionCardSchedule(card).due.getTime() <= now)
    .sort((first, second) => deriveRecognitionCardSchedule(first).due.getTime() - deriveRecognitionCardSchedule(second).due.getTime());
  const currentCard = dueCards[0];
  const [notice, setNotice] = useState('');

  if (!currentCard) {
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Recognition</h2>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <p>No recognition Cards are due for {languageName(language.languageTag)}.</p>
    </section>;
  }

  return <RecognitionExercise
    cards={cards}
    currentCard={currentCard}
    key={currentCard.id}
    language={language}
    notice={notice}
    onNotice={setNotice}
    onReviewConfirmed={onReviewConfirmed}
  />;
}

function RecognitionExercise({
  cards,
  currentCard,
  language,
  notice,
  onNotice,
  onReviewConfirmed,
}: {
  cards: LearningRecognitionCard[];
  currentCard: LearningRecognitionCard;
  language: LearningLanguage;
  notice: string;
  onNotice: (notice: string) => void;
  onReviewConfirmed: (cardId: string, event: RecognitionReviewEvent) => void;
}) {
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
    const reviewedAt = new Date();
    const event: RecognitionReviewEvent = {
      id: crypto.randomUUID(),
      occurredAt: reviewedAt.toISOString(),
      rating,
    };
    setSaving(true);
    setError('');
    const { error: reviewError } = await supabase.rpc('confirm_scheduled_review', {
      p_card_id: currentCard.id,
      p_event_id: event.id,
      p_occurred_at: event.occurredAt,
      p_rating: rating,
    });
    setSaving(false);
    if (reviewError) {
      setError(`Review could not be recorded. ${reviewError.message}`);
      return;
    }
    const nextSchedule = deriveRecognitionCardSchedule({ ...currentCard, events: [...currentCard.events, event] });
    onNotice(`Review recorded. Next review ${nextSchedule.due.toLocaleString()}.`);
    setRating('again');
    onReviewConfirmed(currentCard.id, event);
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
