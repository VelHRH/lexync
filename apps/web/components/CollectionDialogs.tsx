'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { Collection } from '../lib/libraryStore';
import { supabase } from '../lib/supabase';

export type CollectionDialogRequest =
  | { kind: 'create' }
  | { kind: 'rename'; collection: Collection }
  | { kind: 'delete'; collection: Collection };

type CollectionDialogProps = { languageId: string; request: CollectionDialogRequest | null; onClose: () => void; onSaved: (name: string, kind: 'create' | 'rename') => Promise<void> | void; onDeleted: (collectionId: string, name: string) => Promise<void> | void };

function useCollectionDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      returnFocus.current = null;
    };
  }, []);

  return dialogRef;
}

function CollectionFormDialog({ languageId, collection, onClose, onSaved }: { languageId: string; collection: Collection | null; onClose: () => void; onSaved: CollectionDialogProps['onSaved'] }) {
  const online = useOnlineStatus();
  const [collectionName, setCollectionName] = useState(collection?.name ?? '');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useCollectionDialog();

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) {
      setNotice('Collection name is required.');
      return;
    }
    setSaving(true);
    setNotice('');
    const result = collection
      ? await supabase.rpc('rename_collection', { p_collection_id: collection.id, p_name: name })
      : await supabase.rpc('create_collection', { p_learning_language_id: languageId, p_name: name });
    setSaving(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    await onSaved(name, collection ? 'rename' : 'create');
  }

  const nameDescribedBy = [notice ? 'collection-name-error' : '', online ? '' : 'collection-dialog-offline-notice'].filter(Boolean).join(' ');

  return <dialog className="collection-dialog" ref={dialogRef} aria-labelledby="collection-dialog-heading" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <form onSubmit={saveCollection}>
      <h2 id="collection-dialog-heading">{collection ? 'Rename Collection' : 'Create Collection'}</h2>
      <label htmlFor="collection-name">Collection name</label>
      <input id="collection-name" value={collectionName} autoFocus aria-invalid={Boolean(notice)} aria-describedby={nameDescribedBy || undefined} onChange={(event) => setCollectionName(event.target.value)} disabled={saving || !online} />
      <div className="collection-dialog-notice">
        {notice && <p className="form-notice error" role="alert" id="collection-name-error">{notice}</p>}
        {!online && <p className="form-notice" role="status" id="collection-dialog-offline-notice">You are offline. Collection changes require a connection.</p>}
      </div>
      <div className="collection-dialog-actions">
        <button className="primary-button" type="submit" disabled={saving || !online} aria-describedby={online ? undefined : 'collection-dialog-offline-notice'}>{saving ? 'Saving…' : collection ? 'Save Collection' : 'Create Collection'}</button>
        <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </dialog>;
}

function DeleteCollectionDialog({ collection, onClose, onDeleted }: { collection: Collection; onClose: () => void; onDeleted: CollectionDialogProps['onDeleted'] }) {
  const online = useOnlineStatus();
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useCollectionDialog();

  async function deleteCollection() {
    setDeleting(true);
    setNotice('');
    const { error } = await supabase.rpc('delete_collection', { p_collection_id: collection.id });
    setDeleting(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await onDeleted(collection.id, collection.name);
  }

  return <dialog className="pair-delete-dialog collection-dialog" ref={dialogRef} aria-labelledby="delete-collection-heading" aria-describedby="delete-collection-description" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <h2 id="delete-collection-heading">Delete Collection</h2>
    <p id="delete-collection-description">Delete “{collection.name}”? Vocabulary Entries will stay in your Library.</p>
    {!online && <p className="form-notice" role="status" id="collection-dialog-offline-notice">You are offline. Collection changes require a connection.</p>}
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
    <div>
      <button className="secondary-button danger" type="button" disabled={!online || deleting} aria-describedby={online ? undefined : 'collection-dialog-offline-notice'} onClick={() => void deleteCollection()}>{deleting ? 'Deleting…' : 'Delete Collection'}</button>
      <button className="secondary-button" type="button" disabled={deleting} onClick={onClose}>Cancel</button>
    </div>
  </dialog>;
}

export function CollectionDialogs({ languageId, request, onClose, onSaved, onDeleted }: CollectionDialogProps) {
  if (!request) return null;
  const dialogKey = `${request.kind}:${request.kind === 'create' ? '' : request.collection.id}`;
  if (request.kind === 'delete') return <DeleteCollectionDialog key={dialogKey} collection={request.collection} onClose={onClose} onDeleted={onDeleted} />;
  return <CollectionFormDialog key={dialogKey} languageId={languageId} collection={request.kind === 'rename' ? request.collection : null} onClose={onClose} onSaved={onSaved} />;
}
