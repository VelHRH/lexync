'use client';

import { Select } from '@lexync/design-system/select';
import { PROGRESS_STATE_LABELS, VOCABULARY_PROGRESS_STATES, type VocabularyProgressState } from '../lib/vocabularyProgress';

export type VocabularyStatus = 'active' | 'all' | 'suspended';
export type ProgressFilter = VocabularyProgressState | 'all';

const STATUS_OPTIONS: { value: VocabularyStatus; label: string }[] = [
  { value: 'all', label: 'All entries' },
  { value: 'active', label: 'Active entries' },
  { value: 'suspended', label: 'Suspended entries' },
];

const PROGRESS_OPTIONS: { value: ProgressFilter; label: string }[] = [
  { value: 'all', label: 'All states' },
  ...VOCABULARY_PROGRESS_STATES.map((state) => ({ value: state, label: PROGRESS_STATE_LABELS[state] })),
];

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
        <label id="vocabulary-status-label">Vocabulary status</label>
        <Select id="vocabulary-status" labelId="vocabulary-status-label" options={STATUS_OPTIONS} value={status} onChange={onStatusChange} />
      </div>
      <div className="field">
        <label id="vocabulary-progress-state-label">Vocabulary Progress State</label>
        <Select id="vocabulary-progress-state" labelId="vocabulary-progress-state-label" options={PROGRESS_OPTIONS} value={progress} onChange={onProgressChange} />
      </div>
      <button aria-pressed={selecting} className="secondary-button library-select-toggle" type="button" disabled={filing} onClick={onToggleSelecting}>{selecting ? 'Done' : 'Select'}</button>
    </div>
  );
}
