'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { learnedHeadline, parseVocabularyProgress, type VocabularyProgress } from '../lib/vocabularyProgress';

export function VocabularyProgressPlaque({ learningLanguageId }: { learningLanguageId: string }) {
  const [progress, setProgress] = useState<VocabularyProgress | null>(null);

  useEffect(() => {
    if (!learningLanguageId) return;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase.rpc('vocabulary_progress', { p_learning_language_id: learningLanguageId });
      if (cancelled || error) return;
      setProgress(parseVocabularyProgress(data));
    })();

    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  if (!progress) return null;

  return <Link className="progress-plaque" data-ui="vocabulary-progress-plaque" href="/progress" aria-labelledby="vocabulary-progress-heading">
    <h2 id="vocabulary-progress-heading">Vocabulary Progress</h2>
    {progress.totalCount === 0
      ? <>
        <p className="progress-plaque-headline">No words yet</p>
        <p className="progress-plaque-detail">Capture a word to start tracking what you know.</p>
      </>
      : <>
        <p className="progress-plaque-headline">{learnedHeadline(progress)}</p>
        <progress aria-label="Learned Vocabulary Entries" max={progress.totalCount} value={progress.learnedCount} />
        <p className="progress-plaque-detail">{progress.inPracticeCount} in practice</p>
      </>}
  </Link>;
}
