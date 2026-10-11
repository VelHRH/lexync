'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { invalidateLibrary } from '../lib/libraryStore';
import { supabase } from '../lib/supabase';
import { CollectionDialogs, type CollectionDialogRequest } from './CollectionDialogs';

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
  const [collectionRequest, setCollectionRequest] = useState<CollectionDialogRequest | null>(null);
  const [openAddCollectionId, setOpenAddCollectionId] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<Record<string, string>>({});
  const [changingMembership, setChangingMembership] = useState('');

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
    invalidateLibrary(language.id);
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
    invalidateLibrary(language.id);
    await loadCollections();
  }

  return <section className="collections-page" aria-labelledby="app-heading">
    <div className="collections-toolbar">
      <div>
        <p className="collections-intro">Keep related vocabulary together for the way you study.</p>
      </div>
      {online
        ? <button className="primary-button" type="button" onClick={() => setCollectionRequest({ kind: 'create' })}>Add collection</button>
        : <span className="secondary-button disabled" aria-disabled="true" aria-label="Add collection unavailable offline">Add collection</span>}
    </div>
    {!online && <p className="form-notice" role="status">{offlineMessage}</p>}
    {notice && <p className="form-notice error" role="alert">{notice}</p>}
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
    {!loading && collections.length === 0 && <div className="empty-state" role="status"><h3>No shelves yet.</h3><p>No Collections yet. Add one to organize this Learning Language.</p></div>}
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
              <button className="text-button" type="button" aria-label={`Rename ${collection.name}`} disabled={!online} onClick={() => setCollectionRequest({ kind: 'rename', collection })}>Rename</button>
              <button className="text-button danger" type="button" aria-label={`Delete ${collection.name}`} disabled={!online} onClick={() => setCollectionRequest({ kind: 'delete', collection })}>Delete</button>
            </div>
          </div>
          {members.length > 0
            ? <ul className="collection-members">{members.map((entry) => <li key={entry.id}><span>{entry.expression}</span><button className="text-button danger" type="button" aria-label={`Remove ${entry.expression} from ${collection.name}`} disabled={!online || changingMembership === `remove:${collection.id}:${entry.id}`} onClick={() => void removeMembership(collection, entry.id)}>Remove</button></li>)}</ul>
            : <p className="collection-empty" role="status">No entries in this Collection yet.</p>}
          <div className="collection-card-controls">
          {eligibleEntries.length > 0 && <div className="collection-add-entry">
            <button className="secondary-button" type="button" aria-label={`Add entry to ${collection.name}`} disabled={!online} onClick={() => setOpenAddCollectionId((current) => current === collection.id ? '' : collection.id)}>Add entry</button>
            {openAddCollectionId === collection.id && <div className="collection-add-form">
              <label htmlFor={`collection-entry-${collection.id}`}>Vocabulary entry for {collection.name}</label>
              <select id={`collection-entry-${collection.id}`} value={selectedEntries[collection.id] ?? ''} disabled={!online || adding} onChange={(event) => setSelectedEntries((current) => ({ ...current, [collection.id]: event.target.value }))}>
                <option value="">Choose an entry</option>
                {eligibleEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.expression}</option>)}
              </select>
              <button className="primary-button" type="button" disabled={!online || !selectedEntries[collection.id] || adding} onClick={() => void addMembership(collection)}>{adding ? 'Adding…' : `Add ${eligibleEntries.find((entry) => entry.id === selectedEntries[collection.id])?.expression ?? 'entry'} to ${collection.name}`}</button>
            </div>}
          </div>}
          <button className="secondary-button collection-filter-button" type="button" aria-label={`Filter by ${collection.name}`} onClick={() => router.push(`/library?collection=${encodeURIComponent(collection.id)}`)}>Filter in Library</button>
          </div>
        </article>;
      })}
    </div>}
    <CollectionDialogs
      languageId={language.id}
      request={collectionRequest}
      onClose={() => setCollectionRequest(null)}
      onSaved={async () => { setCollectionRequest(null); invalidateLibrary(language.id); await loadCollections(); }}
      onDeleted={async () => { setCollectionRequest(null); invalidateLibrary(language.id); await loadCollections(); }}
    />
  </section>;
}
