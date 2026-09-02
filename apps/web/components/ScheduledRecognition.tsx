'use client';

import {
  deriveRecognitionCardSchedule,
  languageName,
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
  const [revealedCardId, setRevealedCardId] = useState('');
  const [rating, setRating] = useState<ScheduledReviewRating>('again');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  if (!currentCard) {
    return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
      <h2 id="recognition-heading">Recognition</h2>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <p>No recognition Cards are due for {languageName(language.languageTag)}.</p>
    </section>;
  }

  const revealed = revealedCardId === currentCard.id;

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
    setNotice(`Review recorded. Next review ${nextSchedule.due.toLocaleString()}.`);
    setRating('again');
    onReviewConfirmed(currentCard.id, event);
  }

  return <section className="scheduled-recognition" aria-labelledby="recognition-heading">
    <p className="eyebrow"><span /> Scheduled Review</p>
    <h2 id="recognition-heading">Recognition</h2>
    <p className="app-empty">Translate from {languageName(language.languageTag)}. Answer Language: {currentCard.answerLanguageTag}.</p>
    <p className="recognition-expression">{currentCard.expression}</p>
    {!revealed && <button className="primary-button" type="button" onClick={() => setRevealedCardId(currentCard.id)}>Reveal translation</button>}
    {revealed && <>
      <div className="recognition-answer" aria-live="polite">
        {currentCard.translations.map((translation) => <p key={translation}>{translation}</p>)}
      </div>
      <fieldset className="recognition-ratings">
        <legend>How well did you remember?</legend>
        {ratingValues.map((candidate) => <label key={candidate.rating}>
          <input
            checked={rating === candidate.rating}
            name="recognition-rating"
            onChange={() => setRating(candidate.rating)}
            type="radio"
            value={candidate.rating}
          />
          {candidate.label}
        </label>)}
      </fieldset>
      <button className="primary-button" type="button" disabled={saving} onClick={() => void confirmReview()}>{saving ? 'Recording review…' : 'Confirm review'}</button>
    </>}
    {error && <p className="form-notice error" role="alert">{error}</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
  </section>;
}
