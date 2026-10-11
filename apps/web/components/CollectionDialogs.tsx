'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

type Collection = { id: string; name: string };

export type CollectionDialogRequest =
  | { kind: 'create' }
  | { kind: 'rename'; collection: Collection }
  | { kind: 'delete'; collection: Collection };

type CollectionDialogProps = { languageId: string; request: CollectionDialogRequest; onClose: () => void; onSaved: () => Promise<void> | void; onDeleted: (collectionId: string) => Promise<void> | void };

function CollectionRequestDialog({ languageId, request, onClose, onSaved, onDeleted }: CollectionDialogProps) {
  const online = useOnlineStatus();
  const [collectionName, setCollectionName] = useState(request.kind === 'rename' ? request.collection.name : '');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      returnFocus.current?.focus();
      returnFocus.current = null;
    };
  }, []);

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.kind === 'delete') return;
    const name = collectionName.trim();
    if (!name) {
      setNotice('Collection name is required.');
      return;
    }
    setSaving(true);
    setNotice('');
    const result = request.kind === 'rename'
      ? await supabase.rpc('rename_collection', { p_collection_id: request.collection.id, p_name: name })
      : await supabase.rpc('create_collection', { p_learning_language_id: languageId, p_name: name });
    setSaving(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    await onSaved();
  }

  async function deleteCollection() {
    if (request.kind !== 'delete') return;
    setDeleting(true);
    setNotice('');
    const { error } = await supabase.rpc('delete_collection', { p_collection_id: request.collection.id });
    setDeleting(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    await onDeleted(request.collection.id);
  }

  if (request.kind === 'delete') return <dialog className="pair-delete-dialog collection-dialog" ref={dialogRef} aria-labelledby="delete-collection-heading" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <h2 id="delete-collection-heading">Delete Collection</h2>
    <p>Delete “{request.collection.name}”? Vocabulary entries will stay in your Library.</p>
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
    <div>
      <button className="secondary-button danger" type="button" disabled={!online || deleting} onClick={() => void deleteCollection()}>{deleting ? 'Deleting…' : 'Delete Collection'}</button>
      <button className="secondary-button" type="button" disabled={deleting} onClick={onClose}>Cancel</button>
    </div>
  </dialog>;

  return <dialog className="collection-dialog" ref={dialogRef} aria-labelledby="collection-dialog-heading" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <form onSubmit={saveCollection}>
      <h2 id="collection-dialog-heading">{request.kind === 'rename' ? 'Rename Collection' : 'Create Collection'}</h2>
      <label htmlFor="collection-name">Collection name</label>
      <input id="collection-name" value={collectionName} autoFocus onChange={(event) => setCollectionName(event.target.value)} disabled={saving || !online} />
      {notice && <p className="form-notice error" role="alert">{notice}</p>}
      <div className="collection-dialog-actions">
        <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : request.kind === 'rename' ? 'Save Collection' : 'Create Collection'}</button>
        <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>Cancel</button>
      </div>
    </form>
  </dialog>;
}

export function CollectionDialogs({ languageId, request, onClose, onSaved, onDeleted }: Omit<CollectionDialogProps, 'request'> & { request: CollectionDialogRequest | null }) {
  if (!request) return null;
  return <CollectionRequestDialog key={`${request.kind}:${request.kind === 'create' ? '' : request.collection.id}`} languageId={languageId} request={request} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />;
}
