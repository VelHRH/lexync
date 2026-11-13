'use client';

import { useState } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { LibraryEntry } from '../lib/libraryStore';

export function VocabularyEntryDeleteDialog({ entry, onClose, onConfirm }: { entry: LibraryEntry; onClose: () => void; onConfirm: (entry: LibraryEntry) => Promise<string> }) {
  const online = useOnlineStatus();
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useModalDialog();

  async function confirmDeletion() {
    setDeleting(true);
    setNotice('');
    const failure = await onConfirm(entry);
    setDeleting(false);
    if (failure) {
      setNotice(failure);
      return;
    }
    onClose();
  }

  return <dialog
    className="pair-delete-dialog vocabulary-delete-dialog"
    data-ui="vocabulary-delete-dialog"
    ref={dialogRef}
    aria-labelledby="delete-entry-heading"
    aria-describedby="delete-entry-description"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClose={onClose}
  >
    <h2 id="delete-entry-heading">Delete Vocabulary Entry</h2>
    <p id="delete-entry-description">Delete “{entry.expression}”? Senses, translations, Examples, and learning progress owned by this Vocabulary Entry will also be removed. This cannot be undone.</p>
    {!online && <p className="form-notice" role="status" id="delete-entry-offline-notice">You are offline. Deleting a Vocabulary Entry requires a connection.</p>}
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
    <div>
      <button
        className="secondary-button danger"
        type="button"
        disabled={!online || deleting}
        aria-describedby={online ? undefined : 'delete-entry-offline-notice'}
        onClick={() => void confirmDeletion()}
      >{deleting ? 'Deleting…' : 'Delete Vocabulary Entry'}</button>
      <button className="secondary-button" type="button" disabled={deleting} onClick={onClose}>Cancel</button>
    </div>
  </dialog>;
}
