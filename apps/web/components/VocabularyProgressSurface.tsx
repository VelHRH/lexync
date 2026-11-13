'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VOCABULARY_PROGRESS_RULE, learnedHeadline, parseVocabularyProgress, type VocabularyProgress, type VocabularyProgressStates } from '../lib/vocabularyProgress';

function tallies(progress: VocabularyProgressStates) {
  return [
    { count: progress.learnedCount, label: 'Learned', state: 'learned' },
    { count: progress.inPracticeCount, label: 'In practice', state: 'in-practice' },
    { count: progress.newCount, label: 'New', state: 'new' },
  ];
}

function Breakdown({ progress }: { progress: VocabularyProgressStates }) {
  const states = tallies(progress);

  return <div className="progress-breakdown">
    <div className="progress-bar" data-ui="progress-bar" aria-hidden="true">
      {states.filter((state) => state.count > 0).map((state) => <span className="progress-bar-segment" data-state={state.state} key={state.state} style={{ flexGrow: state.count }} />)}
    </div>
    <dl className="progress-tallies">
      {states.map((state) => <div data-state={state.state} key={state.state}>
        <dt>{state.label}</dt>
        <dd>{state.count}</dd>
      </div>)}
    </dl>
  </div>;
}

export function VocabularyProgressSurface({ learningLanguageId }: { learningLanguageId: string }) {
  const [progress, setProgress] = useState<VocabularyProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');
    });

    void supabase.rpc('vocabulary_progress', { p_learning_language_id: learningLanguageId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      const parsed = rpcError ? null : parseVocabularyProgress(data);
      setError(rpcError ? `Vocabulary Progress could not be loaded: ${rpcError.message}` : '');
      setProgress(parsed);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [learningLanguageId]);

  if (loading) return <>
    <p className="visually-hidden" role="status">Loading your Vocabulary Progress…</p>
    <div className="progress-skeleton" aria-hidden="true">
      <div className="skeleton progress-skeleton-headline" />
      <div className="skeleton progress-skeleton-bar" />
      <div className="skeleton progress-skeleton-row" />
      <div className="skeleton progress-skeleton-row" />
    </div>
  </>;

  if (error) return <p className="form-notice error" role="alert">{error}</p>;
  if (!progress) return null;

  return <>
    <p className="page-lede">Where the words you have captured in this Learning Language stand — across the whole library, and inside each Collection you have grouped.</p>
    <p className="vocabulary-progress-rule">{VOCABULARY_PROGRESS_RULE}</p>
    <section className="progress-region" data-ui="vocabulary-progress-library" aria-labelledby="progress-library-heading">
      <div className="progress-region-head">
        <h2 id="progress-library-heading">Whole library</h2>
        <p className="progress-headline" data-ui="progress-headline">{progress.totalCount === 0 ? 'No words yet' : learnedHeadline(progress)}</p>
      </div>
      {progress.totalCount === 0
        ? <p className="progress-region-note">Capture a word and this surface starts reporting what you know.</p>
        : <Breakdown progress={progress} />}
    </section>
    <section className="panel" data-ui="vocabulary-progress-collections" aria-labelledby="progress-collections-heading">
      <div className="panel-header">
        <h2 id="progress-collections-heading">Collections</h2>
        {progress.collections.length > 0 && <p className="panel-header-meta">{progress.collections.length === 1 ? '1 Collection' : `${progress.collections.length} Collections`}</p>}
      </div>
      {progress.collections.length === 0
        ? <div className="empty-state">
          <h3>No Collections yet.</h3>
          <p>A Collection groups the words you want to practise together. Group a few in your Library and each one reports its own standing here.</p>
          <div className="empty-state-actions"><Link className="secondary-button" href="/library">Open your Library</Link></div>
        </div>
        : <ul className="progress-collection-list">
          {progress.collections.map((item) => <li className="progress-collection" data-collection-id={item.id} key={item.id}>
            <div className="progress-region-head">
              <h3>{item.name}</h3>
              <p className="progress-headline" data-ui="progress-headline">{item.totalCount === 0 ? 'No words filed yet' : learnedHeadline(item)}</p>
            </div>
            <Breakdown progress={item} />
          </li>)}
        </ul>}
    </section>
  </>;
}
