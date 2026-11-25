'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { learnedCount, parseVocabularyProgress, practicePercent, type VocabularyProgress } from '../lib/vocabularyProgress';
import { VocabularyProgressStatesInfo } from './VocabularyProgressStatesInfo';

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

  return <section className="progress-plaque" data-ui="vocabulary-progress-plaque" aria-labelledby="vocabulary-progress-heading">
    <div className="progress-plaque-heading">
      <h2 id="vocabulary-progress-heading"><Link className="progress-plaque-link" href="/progress">Vocabulary Progress</Link></h2>
      <VocabularyProgressStatesInfo />
    </div>
    {progress.totalCount === 0
      ? <>
        <p className="progress-plaque-headline">No words yet</p>
        <p className="progress-plaque-detail">Capture a word to start tracking what you know.</p>
      </>
      : <>
        <p className="progress-plaque-headline"><span>{practicePercent(progress)}%</span> · <span>{learnedCount(progress)}</span> · <span>{progress.inPracticeCount} in practice</span></p>
        <progress aria-label="Practice Progress" aria-valuetext={`${practicePercent(progress)}%`} max={100} value={practicePercent(progress)} />
      </>}
  </section>;
}
