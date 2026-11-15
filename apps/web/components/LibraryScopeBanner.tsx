'use client';

import type { Collection } from '../lib/libraryStore';

export const PRACTICE_REASON_ID = 'library-collection-practice-reason';

export function LibraryScopeBanner({ collection, practiceReason, practiceDescribedBy, practiceError, practiceStarting, lessonInProgress, online, offlineReason, onPractise, onRename, onDelete }: {
  collection: Collection;
  practiceReason: string;
  practiceDescribedBy: string | undefined;
  practiceError: string;
  practiceStarting: boolean;
  lessonInProgress: boolean;
  online: boolean;
  offlineReason: string | undefined;
  onPractise: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="library-scope">
      <div className="library-scope-identity">
        <span role="status">Filtered by {collection.name}</span>
        {practiceReason && <span className="library-scope-reason" role="status" id={PRACTICE_REASON_ID}>{practiceReason}</span>}
      </div>
      <div className="library-scope-actions">
        {collection.canPractise && <button className="primary-button" data-ui="practise-collection" type="button" disabled={!online || lessonInProgress || practiceStarting} aria-describedby={practiceDescribedBy} onClick={onPractise}>{practiceStarting ? 'Opening Lesson…' : 'Practise this Collection'}</button>}
        <button className="text-button" type="button" aria-label={`Rename ${collection.name}`} disabled={!online} aria-describedby={offlineReason} onClick={onRename}>Rename</button>
        <button className="text-button danger" type="button" aria-label={`Delete ${collection.name}`} disabled={!online} aria-describedby={offlineReason} onClick={onDelete}>Delete</button>
      </div>
      {practiceError && <p className="form-notice error library-scope-error" role="alert">{practiceError}</p>}
    </div>
  );
}
