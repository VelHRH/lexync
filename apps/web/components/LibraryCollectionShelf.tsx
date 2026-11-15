'use client';

import type { RefObject } from 'react';
import type { Collection } from '../lib/libraryStore';

export const ALL_VOCABULARY_SCOPE = '';
export const NO_COLLECTION_SCOPE = 'none';

export function entryCountDetail(count: number) {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function collectionState(collection: Collection, minimumEntries: number) {
  if (collection.canPractise) return `${entryCountDetail(collection.entryCount)} · ready to practise`;
  if (collection.entryCount < minimumEntries) return `${entryCountDetail(collection.entryCount)} · needs ${minimumEntries - collection.entryCount} more`;
  return `${entryCountDetail(collection.entryCount)} · not practisable yet`;
}

export function LibraryCollectionShelf({ collections, entryCount, unfiledCount, minimumEntries, selectedCollectionId, online, offlineReason, newCollectionRef, onSelect, onCreate }: {
  collections: Collection[];
  entryCount: number;
  unfiledCount: number;
  minimumEntries: number;
  selectedCollectionId: string;
  online: boolean;
  offlineReason: string | undefined;
  newCollectionRef: RefObject<HTMLButtonElement | null>;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="library-shelf" data-ui="collection-shelf" role="group" aria-label="Collections">
      <div className="library-shelf-track">
        <button aria-label="All vocabulary" aria-pressed={selectedCollectionId === ALL_VOCABULARY_SCOPE} className="collection-card" type="button" onClick={() => onSelect(ALL_VOCABULARY_SCOPE)}>
          <span className="collection-card-name">All vocabulary</span>
          <span className="collection-card-state">{entryCountDetail(entryCount)}</span>
        </button>
        {collections.length > 0 && <button aria-label="Not in a Collection" aria-pressed={selectedCollectionId === NO_COLLECTION_SCOPE} className="collection-card quiet" type="button" onClick={() => onSelect(NO_COLLECTION_SCOPE)}>
          <span className="collection-card-name">Not in a Collection</span>
          <span className="collection-card-state">{entryCountDetail(unfiledCount)}</span>
        </button>}
        {collections.map((collection) => <button
          aria-label={collection.name}
          aria-pressed={selectedCollectionId === collection.id}
          className="collection-card"
          key={collection.id}
          type="button"
          onClick={() => onSelect(collection.id)}
        >
          <span className="collection-card-name">{collection.name}</span>
          <span className="collection-card-state">{collectionState(collection, minimumEntries)}</span>
        </button>)}
        <button aria-label="New Collection" className="collection-card new" type="button" ref={newCollectionRef} disabled={!online} aria-describedby={offlineReason} onClick={onCreate}>
          <span aria-hidden="true" className="collection-card-plus">+</span>
          <span className="collection-card-name">New Collection</span>
        </button>
      </div>
    </div>
  );
}
