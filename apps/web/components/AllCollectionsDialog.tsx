'use client';

import type { KeyboardEvent, RefObject } from 'react';
import { useEffect, useId, useState } from 'react';
import { useModalDialog } from '../hooks/useModalDialog';
import type { Collection } from '../lib/libraryStore';
import { normalizeSearchText } from '../lib/searchText';
import { ActionsMenu } from './ActionsMenu';
import { byEntryCount, entryCountDetail, NO_COLLECTION_SCOPE } from './LibraryCollectionShelf';

const OFFLINE_NOTICE_ID = 'all-collections-offline-notice';

export function AllCollectionsDialog({ collections, unfiledCount, selectedCollectionId, online, notice, searchRef, onSelect, onCreate, onRename, onDelete, onClose }: {
  collections: Collection[];
  unfiledCount: number;
  selectedCollectionId: string;
  online: boolean;
  notice: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
  onClose: () => void;
}) {
  const dialogRef = useModalDialog();
  const headingId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [menuCollectionId, setMenuCollectionId] = useState('');
  const normalizedQuery = normalizeSearchText(query);
  const matches = byEntryCount(collections).filter((collection) => !normalizedQuery || normalizeSearchText(collection.name).includes(normalizedQuery));
  const offlineReason = online ? undefined : OFFLINE_NOTICE_ID;

  useEffect(() => {
    searchRef.current?.focus();
  }, [searchRef]);

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')).filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <dialog className="collection-dialog all-collections-dialog" ref={dialogRef} aria-labelledby={headingId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} onKeyDown={trapFocus}>
    <div className="all-collections-header">
      <h2 id={headingId}>All collections</h2>
      <button className="all-collections-close" type="button" aria-label="Close" onClick={onClose}>
        <svg aria-hidden="true" focusable="false" height="20" viewBox="0 0 24 24" width="20"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" /></svg>
      </button>
    </div>
    <div className="all-collections-tools">
      <div className="all-collections-search">
        <label htmlFor={searchId}>Search Collections</label>
        <input id={searchId} ref={searchRef} type="search" value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
      </div>
      <button className="secondary-button all-collections-new" type="button" disabled={!online} aria-describedby={offlineReason} onClick={onCreate}>
        <span aria-hidden="true">+</span> New Collection
      </button>
    </div>
    {!online && <p className="form-notice" role="status" id={OFFLINE_NOTICE_ID}>You are offline. Collection changes require a connection.</p>}
    {notice && <p className="form-notice" role="status">{notice}</p>}
    <ul className="all-collections-list" aria-label="Collections">
      <li className="all-collections-row quiet">
        <button className="all-collections-choice" type="button" aria-pressed={selectedCollectionId === NO_COLLECTION_SCOPE} onClick={() => onSelect(NO_COLLECTION_SCOPE)}>
          <span className="all-collections-name">Not in a Collection</span>
          <span className="all-collections-count">{entryCountDetail(unfiledCount)}</span>
        </button>
      </li>
      {matches.map((collection) => <li className="all-collections-row" key={collection.id}>
        <button className="all-collections-choice" type="button" aria-pressed={selectedCollectionId === collection.id} onClick={() => onSelect(collection.id)}>
          <span className="all-collections-name">{collection.name}</span>
          <span className="all-collections-count">{entryCountDetail(collection.entryCount)}</span>
        </button>
        <ActionsMenu
          triggerLabel={`More actions for ${collection.name}`}
          menuLabel={`Actions for ${collection.name}`}
          actions={[{ key: 'rename', label: 'Rename' }, { key: 'delete', label: 'Delete', danger: true }]}
          open={menuCollectionId === collection.id}
          disabled={!online}
          describedBy={offlineReason}
          onOpenChange={(open) => setMenuCollectionId(open ? collection.id : '')}
          onAction={(key, trigger) => {
            trigger?.focus();
            if (key === 'rename') onRename(collection);
            else onDelete(collection);
          }}
        />
      </li>)}
    </ul>
    {normalizedQuery && matches.length === 0 && <p className="all-collections-empty" role="status">No Collections match “{query.trim()}”.</p>}
    {!normalizedQuery && collections.length === 0 && <p className="all-collections-empty">No Collections yet. Create one to group Vocabulary Entries.</p>}
  </dialog>;
}
