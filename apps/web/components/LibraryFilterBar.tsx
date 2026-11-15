'use client';

import { PROGRESS_STATE_LABELS, VOCABULARY_PROGRESS_STATES, type VocabularyProgressState } from '../lib/vocabularyProgress';

export type VocabularyStatus = 'active' | 'all' | 'suspended';
export type ProgressFilter = VocabularyProgressState | 'all';

export function LibraryFilterBar({ query, status, progress, selecting, filing, onQueryChange, onStatusChange, onProgressChange, onToggleSelecting }: {
  query: string;
  status: VocabularyStatus;
  progress: ProgressFilter;
  selecting: boolean;
  filing: boolean;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: VocabularyStatus) => void;
  onProgressChange: (progress: ProgressFilter) => void;
  onToggleSelecting: () => void;
}) {
  return (
    <div className="vocabulary-discovery-controls">
      <div className="field">
        <label htmlFor="vocabulary-search">Search vocabulary</label>
        <input id="vocabulary-search" type="search" value={query} placeholder="expression or translation" onChange={(event) => onQueryChange(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="vocabulary-status">Vocabulary status</label>
        <select id="vocabulary-status" value={status} onChange={(event) => onStatusChange(event.target.value as VocabularyStatus)}>
          <option value="all">All entries</option>
          <option value="active">Active entries</option>
          <option value="suspended">Suspended entries</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="vocabulary-progress-state">Vocabulary Progress State</label>
        <select id="vocabulary-progress-state" value={progress} onChange={(event) => onProgressChange(event.target.value as ProgressFilter)}>
          <option value="all">All states</option>
          {VOCABULARY_PROGRESS_STATES.map((state) => <option key={state} value={state}>{PROGRESS_STATE_LABELS[state]}</option>)}
        </select>
      </div>
      <button aria-pressed={selecting} className="secondary-button library-select-toggle" type="button" disabled={filing} onClick={onToggleSelecting}>{selecting ? 'Done' : 'Select'}</button>
    </div>
  );
}
