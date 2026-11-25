'use client';

import { useState } from 'react';
import type { Collection } from '../lib/libraryStore';

export const PRACTICE_REASON_ID = 'library-collection-practice-reason';
const PRACTICE_LOCK_ID = 'library-collection-practice-lock';

export function LibraryScopeBanner({ collection, minimumEntries, practiceReason, practiceDescribedBy, practiceError, practiceStarting, lessonInProgress, online, onPractise, onClear }: {
  collection: Collection;
  minimumEntries: number;
  practiceReason: string;
  practiceDescribedBy: string | undefined;
  practiceError: string;
  practiceStarting: boolean;
  lessonInProgress: boolean;
  online: boolean;
  onPractise: () => void;
  onClear: () => void;
}) {
  const [lockShown, setLockShown] = useState(false);
  const locked = !collection.canPractise;
  const describedBy = locked ? [PRACTICE_LOCK_ID, practiceDescribedBy].filter(Boolean).join(' ') : practiceDescribedBy;

  return (
    <div className="library-scope">
      <div className="library-scope-identity">
        <span role="status">Filtered by {collection.name}</span>
        {practiceReason && <span className="library-scope-reason" role="status" id={PRACTICE_REASON_ID}>{practiceReason}</span>}
      </div>
      <div className="library-scope-actions">
        <span className="library-scope-practise" onMouseEnter={() => locked && setLockShown(true)} onMouseLeave={() => setLockShown(false)}>
          <button
            className="primary-button"
            data-ui="practise-collection"
            type="button"
            disabled={!locked && (!online || lessonInProgress || practiceStarting)}
            aria-disabled={locked || undefined}
            aria-describedby={describedBy}
            onFocus={() => locked && setLockShown(true)}
            onBlur={() => setLockShown(false)}
            onKeyDown={(event) => { if (event.key === 'Escape' && lockShown) { event.stopPropagation(); setLockShown(false); } }}
            onClick={() => { if (!locked) onPractise(); }}
          >{practiceStarting ? 'Opening Lesson…' : 'Practise'}</button>
          {locked && <span className="library-scope-lock" role="tooltip" id={PRACTICE_LOCK_ID} hidden={!lockShown}>Practice unlocks at {minimumEntries} entries</span>}
        </span>
        <button className="library-scope-clear" type="button" aria-label={`Clear the ${collection.name} filter`} onClick={onClear}>
          <svg aria-hidden="true" focusable="false" height="20" viewBox="0 0 24 24" width="20"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
        </button>
      </div>
      {practiceError && <p className="form-notice error library-scope-error" role="alert">{practiceError}</p>}
    </div>
  );
}
