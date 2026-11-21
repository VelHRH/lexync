'use client';

import type { RefObject } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Collection } from '../lib/libraryStore';

export const ALL_VOCABULARY_SCOPE = '';
export const NO_COLLECTION_SCOPE = 'none';

const CARD_MIN_WIDTH_REM = 9.5;

export function entryCountDetail(count: number) {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function byEntryCount(collections: Collection[]) {
  return [...collections].sort((left, right) => right.entryCount - left.entryCount || left.name.localeCompare(right.name));
}

type ShelfCard = { id: string; name: string; entryCount: number; quiet: boolean };

export function LibraryCollectionShelf({ collections, unfiledCount, selectedCollectionId, allCollectionsRef, onSelect, onOpenAll }: {
  collections: Collection[];
  unfiledCount: number;
  selectedCollectionId: string;
  allCollectionsRef: RefObject<HTMLButtonElement | null>;
  onSelect: (id: string) => void;
  onOpenAll: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(0);
  const ordered: ShelfCard[] = byEntryCount(collections).map((collection) => ({ id: collection.id, name: collection.name, entryCount: collection.entryCount, quiet: false }));
  const pinned: ShelfCard | undefined = selectedCollectionId === NO_COLLECTION_SCOPE
    ? { id: NO_COLLECTION_SCOPE, name: 'Not in a Collection', entryCount: unfiledCount, quiet: true }
    : ordered.find((card) => card.id === selectedCollectionId);
  const visible = pinned && !ordered.slice(0, capacity).some((card) => card.id === pinned.id)
    ? [pinned, ...ordered.filter((card) => card.id !== pinned.id)].slice(0, Math.max(capacity, 1))
    : ordered.slice(0, capacity);

  useLayoutEffect(() => {
    const element = track.current;
    const chip = allCollectionsRef.current;
    if (!element || !chip) return;
    const measure = () => {
      const styles = getComputedStyle(element);
      const gap = parseFloat(styles.columnGap) || 0;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const cardWidth = CARD_MIN_WIDTH_REM * rem;
      const available = element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight) - chip.offsetWidth - gap;
      setCapacity(Math.max(0, Math.floor((available + gap) / (cardWidth + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [allCollectionsRef, collections.length]);

  return (
    <div className="library-shelf" data-ui="collection-shelf" role="group" aria-label="Collections">
      <div className="library-shelf-track" ref={track}>
        {visible.map((card) => <button
          aria-label={card.name}
          aria-pressed={selectedCollectionId === card.id}
          className={card.quiet ? 'collection-card quiet' : 'collection-card'}
          key={card.id}
          type="button"
          onClick={() => onSelect(selectedCollectionId === card.id ? ALL_VOCABULARY_SCOPE : card.id)}
        >
          <span className="collection-card-name">{card.name}</span>
          <span className="collection-card-state">{entryCountDetail(card.entryCount)}</span>
        </button>)}
        <button className="collection-shelf-all" type="button" ref={allCollectionsRef} aria-haspopup="dialog" onClick={onOpenAll}>
          All collections ({collections.length})
        </button>
      </div>
    </div>
  );
}
