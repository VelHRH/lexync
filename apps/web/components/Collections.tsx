'use client';

import { languageName } from '@lexync/domain';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';

type LearningLanguage = { id: string; languageTag: string };
type Collection = { id: string; name: string };
type CollectionEntry = { id: string; expression: string };
type Membership = { collection_id: string; learning_vocabulary_entry_id: string };

const offlineMessage = 'You are offline. Collection changes require a connection.';

export function Collections({ language }: { language: LearningLanguage }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState<Collection | null>(null);
  const [openAddCollectionId, setOpenAddCollectionId] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<Record<string, string>>({});
  const [changingMembership, setChangingMembership] = useState('');
  const collectionDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const collectionReturnFocus = useRef<HTMLElement | null>(null);
  const deleteReturnFocus = useRef<HTMLElement | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setNotice('');
    const [{ data: collectionData, error: collectionError }, { data: entryData, error: entryError }] = await Promise.all([
      supabase.from('collections').select('id,name').eq('learning_language_id', language.id).order('created_at'),
      supabase.from('learning_vocabulary_entries').select('id,expression').eq('learning_language_id', language.id).order('created_at'),
    ]);
    if (collectionError || entryError) {
      setNotice(collectionError?.message ?? entryError?.message ?? 'Collections could not be loaded.');
      setCollections([]);
      setEntries([]);
      setMemberships([]);
      setLoading(false);
      return;
    }
    const nextCollections = (collectionData ?? []) as Collection[];
    const collectionIds = nextCollections.map((collection) => collection.id);
    const { data: membershipData, error: membershipError } = collectionIds.length
      ? await supabase.from('collection_memberships').select('collection_id,learning_vocabulary_entry_id').in('collection_id', collectionIds)
      : { data: [], error: null };
    if (membershipError) {
      setNotice(membershipError.message);
      setLoading(false);
      return;
    }
    setCollections(nextCollections);
    setEntries((entryData ?? []) as CollectionEntry[]);
    setMemberships((membershipData ?? []) as Membership[]);
    setLoading(false);
  }, [language.id]);

  useEffect(() => {
    queueMicrotask(() => void loadCollections());
  }, [loadCollections]);

  useEffect(() => {
    const dialog = collectionDialogRef.current;
    if (!showCollectionForm || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      collectionReturnFocus.current?.focus();
      collectionReturnFocus.current = null;
    };
  }, [showCollectionForm]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!deletingCollection || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      deleteReturnFocus.current?.focus();
      deleteReturnFocus.current = null;
    };
  }, [deletingCollection]);

  function openCreateForm() {
    collectionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice('');
    setEditingCollection(null);
    setCollectionName('');
    setShowCollectionForm(true);
  }

  function openRenameForm(collection: Collection) {
    collectionReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice('');
    setEditingCollection(collection);
    setCollectionName(collection.name);
    setShowCollectionForm(true);
  }

  function openDeleteDialog(collection: Collection) {
    deleteReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDeletingCollection(collection);
  }

  async function saveCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) {
      setNotice('Collection name is required.');
      return;
    }
    setSaving(true);
    setNotice('');
    const result = editingCollection
      ? await supabase.rpc('rename_collection', { p_collection_id: editingCollection.id, p_name: name })
      : await supabase.rpc('create_collection', { p_learning_language_id: language.id, p_name: name });
    setSaving(false);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setShowCollectionForm(false);
    setEditingCollection(null);
    setCollectionName('');
    await loadCollections();
  }

  async function deleteCollection() {
    if (!deletingCollection) return;
    setChangingMembership(`delete:${deletingCollection.id}`);
    setNotice('');
    const { error } = await supabase.rpc('delete_collection', { p_collection_id: deletingCollection.id });
    setChangingMembership('');
    if (error) {
      setNotice(error.message);
      return;
    }
    setDeletingCollection(null);
    await loadCollections();
  }

  function memberIds(collectionId: string) {
    return new Set(memberships.filter((membership) => membership.collection_id === collectionId).map((membership) => membership.learning_vocabulary_entry_id));
  }

  async function addMembership(collection: Collection) {
    const entryId = selectedEntries[collection.id];
    if (!entryId) return;
    setChangingMembership(`add:${collection.id}:${entryId}`);
    setNotice('');
    const { error } = await supabase.rpc('add_collection_membership', {
      p_collection_id: collection.id,
      p_learning_vocabulary_entry_id: entryId,
    });
    setChangingMembership('');
    if (error) {
      setNotice(error.message);
      return;
    }
    setOpenAddCollectionId('');
    setSelectedEntries((current) => ({ ...current, [collection.id]: '' }));
    await loadCollections();
  }

  async function removeMembership(collection: Collection, entryId: string) {
    setChangingMembership(`remove:${collection.id}:${entryId}`);
    setNotice('');
    const { error } = await supabase.rpc('remove_collection_membership', {
      p_collection_id: collection.id,
      p_learning_vocabulary_entry_id: entryId,
    });
    setChangingMembership('');
    if (error) {
      setNotice(error.message);
      return;
    }
    await loadCollections();
  }

  return <section className="collections-page" aria-labelledby="collections-heading">
    <div className="collections-toolbar">
      <div>
        <p className="eyebrow"><span /> {languageName(language.languageTag)}</p>
        <h2 id="collections-heading">Collections</h2>
        <p className="collections-intro">Keep related vocabulary together for the way you study.</p>
      </div>
      {online
        ? <button className="primary-button" type="button" onClick={openCreateForm}>Add collection</button>
        : <span className="secondary-button disabled" aria-disabled="true" aria-label="Add collection unavailable offline">Add collection</span>}
    </div>
    {!online && <p className="form-notice" role="status">{offlineMessage}</p>}
    {notice && !showCollectionForm && <p className="form-notice error" role="alert">{notice}</p>}
    {loading && <>
      <p className="collections-sr-only" role="status">Loading your Collections…</p>
      <div className="collection-list collection-list-skeleton" aria-hidden="true">
        {[0, 1].map((item) => <div className="collection-card collection-card-skeleton" key={item}>
          <div className="collection-card-header"><div><span className="collection-skeleton-heading" /><span className="collection-skeleton-meta" /></div><span className="collection-skeleton-actions" /></div>
          <span className="collection-skeleton-line" />
          <span className="collection-skeleton-control" />
        </div>)}
      </div>
    </>}
    {!loading && collections.length === 0 && <p className="app-empty" role="status">No Collections yet. Add one to organize this Learning Language.</p>}
    {!loading && <div className="collection-list">
      {collections.map((collection) => {
        const ids = memberIds(collection.id);
        const members = entries.filter((entry) => ids.has(entry.id));
        const eligibleEntries = entries.filter((entry) => !ids.has(entry.id));
        const adding = changingMembership.startsWith(`add:${collection.id}:`);
        return <article className="collection-card" key={collection.id} role="region" aria-label={`Collection ${collection.name}`}>
          <div className="collection-card-header">
            <div>
              <h3 id={`collection-heading-${collection.id}`}>{collection.name}</h3>
              <p>{members.length} {members.length === 1 ? 'entry' : 'entries'}</p>
            </div>
            <div className="collection-card-actions">
              <button className="text-button" type="button" disabled={!online || saving} onClick={() => openRenameForm(collection)}>Rename {collection.name}</button>
              <button className="text-button danger" type="button" disabled={!online || changingMembership === `delete:${collection.id}`} onClick={() => openDeleteDialog(collection)}>Delete {collection.name}</button>
            </div>
          </div>
          {members.length > 0
            ? <ul className="collection-members">{members.map((entry) => <li key={entry.id}><span>{entry.expression}</span><button className="text-button danger" type="button" disabled={!online || changingMembership === `remove:${collection.id}:${entry.id}`} onClick={() => void removeMembership(collection, entry.id)}>Remove {entry.expression} from {collection.name}</button></li>)}</ul>
            : <p className="app-empty collection-empty" role="status">No entries in this Collection yet.</p>}
          {eligibleEntries.length > 0 && <div className="collection-add-entry">
            <button className="secondary-button" type="button" disabled={!online} onClick={() => setOpenAddCollectionId((current) => current === collection.id ? '' : collection.id)}>Add entry to {collection.name}</button>
            {openAddCollectionId === collection.id && <div className="collection-add-form">
              <label htmlFor={`collection-entry-${collection.id}`}>Vocabulary entry for {collection.name}</label>
              <select id={`collection-entry-${collection.id}`} value={selectedEntries[collection.id] ?? ''} disabled={!online || adding} onChange={(event) => setSelectedEntries((current) => ({ ...current, [collection.id]: event.target.value }))}>
                <option value="">Choose an entry</option>
                {eligibleEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.expression}</option>)}
              </select>
              <button className="primary-button" type="button" disabled={!online || !selectedEntries[collection.id] || adding} onClick={() => void addMembership(collection)}>{adding ? 'Adding…' : `Add ${eligibleEntries.find((entry) => entry.id === selectedEntries[collection.id])?.expression ?? 'entry'} to ${collection.name}`}</button>
            </div>}
          </div>}
          <button className="secondary-button collection-filter-button" type="button" onClick={() => router.push(`/library?collection=${encodeURIComponent(collection.id)}`)}>Filter by {collection.name}</button>
        </article>;
      })}
    </div>}
    {showCollectionForm && <dialog className="collection-dialog" ref={collectionDialogRef} aria-labelledby="collection-dialog-heading" onCancel={(event) => { event.preventDefault(); setShowCollectionForm(false); }} onClose={() => setShowCollectionForm(false)}>
      <form onSubmit={saveCollection}>
        <h2 id="collection-dialog-heading">{editingCollection ? 'Rename Collection' : 'Create Collection'}</h2>
        <label htmlFor="collection-name">Collection name</label>
        <input id="collection-name" value={collectionName} autoFocus onChange={(event) => setCollectionName(event.target.value)} disabled={saving || !online} />
        {notice && <p className="form-notice error" role="alert">{notice}</p>}
        <div className="collection-dialog-actions">
          <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : editingCollection ? 'Save Collection' : 'Create Collection'}</button>
          <button className="secondary-button" type="button" disabled={saving} onClick={() => setShowCollectionForm(false)}>Cancel</button>
        </div>
      </form>
    </dialog>}
    {deletingCollection && <dialog className="pair-delete-dialog collection-dialog" ref={deleteDialogRef} aria-labelledby="delete-collection-heading" onCancel={(event) => { event.preventDefault(); setDeletingCollection(null); }} onClose={() => setDeletingCollection(null)}>
      <h2 id="delete-collection-heading">Delete Collection</h2>
      <p>Delete “{deletingCollection.name}”? Vocabulary entries will stay in your Library.</p>
      <div>
        <button className="secondary-button danger" type="button" disabled={!online || changingMembership === `delete:${deletingCollection.id}`} onClick={() => void deleteCollection()}>{changingMembership === `delete:${deletingCollection.id}` ? 'Deleting…' : 'Delete Collection'}</button>
        <button className="secondary-button" type="button" disabled={changingMembership === `delete:${deletingCollection.id}`} onClick={() => setDeletingCollection(null)}>Cancel</button>
      </div>
    </dialog>}
  </section>;
}
