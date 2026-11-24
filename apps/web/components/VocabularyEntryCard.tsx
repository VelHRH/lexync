'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Collection, LibraryEntry } from '../lib/libraryStore';
import { PROGRESS_STATE_LABELS } from '../lib/vocabularyProgress';
import { SearchablePicker } from './SearchablePicker';
import { VocabularyAudioClipPlayer, VocabularyAudioClipRecorder } from './VocabularyAudioClip';

export function membershipChangeKey(member: boolean, collection: Collection, entry: LibraryEntry) {
  return `${member ? 'remove' : 'add'}:${collection.id}:${entry.learningVocabularyEntryId}`;
}

export function newCollectionChangeKey(entry: LibraryEntry) {
  return `add:new:${entry.learningVocabularyEntryId}`;
}

export function VocabularyEntryCard({ entry, editor, selecting, selected, filing, memberCollections, otherCollections, changingMembership, online, offlineReason, onSelectClick, onSelectChange, onChangeMembership, onCreateCollection, onEdit, onDelete, onClipChanged }: {
  entry: LibraryEntry;
  editor: ReactNode;
  selecting: boolean;
  selected: boolean;
  filing: boolean;
  memberCollections: Collection[];
  otherCollections: Collection[];
  changingMembership: string;
  online: boolean;
  offlineReason: string | undefined;
  onSelectClick: (event: MouseEvent<HTMLInputElement>) => void;
  onSelectChange: (selected: boolean) => void;
  onChangeMembership: (collection: Collection, member: boolean) => void;
  onCreateCollection: (name: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClipChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const adding = changingMembership.startsWith('add:') && changingMembership.endsWith(`:${entry.learningVocabularyEntryId}`);

  useEffect(() => {
    if (picking || !restoreFocus) return;
    addButton.current?.focus();
    queueMicrotask(() => setRestoreFocus(false));
  }, [picking, restoreFocus]);

  function closePicker(focusAdd: boolean) {
    setPicking(false);
    setRestoreFocus(focusAdd);
  }

  function renderMemberChip(collection: Collection) {
    const changing = changingMembership === membershipChangeKey(true, collection, entry);
    return <span className="collection-chip member" key={collection.id} data-ui="entry-collection">
      <span className="collection-chip-name">{changing ? 'Removing…' : collection.name}</span>
      <button className="collection-chip-remove" type="button" aria-label={`Remove ${entry.expression} from ${collection.name}`} disabled={!online || changing} aria-describedby={offlineReason} onClick={() => onChangeMembership(collection, true)}><span aria-hidden="true">×</span></button>
    </span>;
  }

  return (
    <article className="vocabulary-entry-item" data-selected={selected} data-has-clip={entry.audioClipPath ? 'true' : undefined}>
      {selecting && <label className="vocabulary-entry-select">
        <input
          type="checkbox"
          checked={selected}
          disabled={filing}
          aria-label={`Select ${entry.expression}`}
          onClick={onSelectClick}
          onChange={(event) => onSelectChange(event.target.checked)}
        />
        <span className="vocabulary-entry-select-mark" aria-hidden="true" />
      </label>}
      {entry.audioClipPath && <span className="vocabulary-entry-audio" data-ui="vocabulary-row-audio"><VocabularyAudioClipPlayer entry={entry} /></span>}
      <details className="vocabulary-entry" open={editor ? true : undefined}>
        <summary>
          <span className="vocabulary-entry-identity">
            <h3 className="vocabulary-entry-expression"><span className="marked">{entry.expression}</span></h3>
            <span className="vocabulary-entry-gloss">{entry.senses.flatMap((sense) => sense.translations.map((item) => item.text)).join(' · ') || 'No translation yet'}</span>
          </span>
          <span className="vocabulary-entry-marks">
            {entry.progressState && <span className="vocabulary-progress-badge" data-ui="entry-progress-state" data-state={entry.progressState}>{PROGRESS_STATE_LABELS[entry.progressState]}</span>}
            {entry.senses.length > 1 && <span className="surface-tally">{entry.senses.length}</span>}
          </span>
        </summary>
        <div>
        {editor ?? <div className="vocabulary-entry-body">
          {entry.senses.map((sense, index) => <section className="vocabulary-sense" key={sense.id} role="group" aria-labelledby={`sense-${sense.id}`}>
            <h4 className={entry.senses.length > 1 ? undefined : 'visually-hidden'} id={`sense-${sense.id}`}>Sense {index + 1}</h4>
            {sense.translations.map((item) => <p key={item.id}>{item.text} <span>{item.answer_language_tag}</span></p>)}
            {sense.examples.map((item) => <div className="vocabulary-sense-example" key={item.id}>
              <p className="vocabulary-example">{item.text}</p>
              {item.translations.map((translation) => <p className="vocabulary-example-translation" key={translation.id}>{translation.text} <span>{translation.answer_language_tag}</span></p>)}
            </div>)}
          </section>)}
          <VocabularyAudioClipRecorder entry={entry} online={online} onChanged={onClipChanged} />
          <div className="entry-collections" role="group" aria-labelledby={`entry-collections-${entry.id}`}>
            <h4 id={`entry-collections-${entry.id}`}>Collections</h4>
            <div className="entry-collections-member">
              {memberCollections.map(renderMemberChip)}
              {!picking && <button className="collection-chip add" type="button" ref={addButton} disabled={!online} aria-describedby={offlineReason} onClick={() => setPicking(true)}>{adding ? 'Adding…' : <><span aria-hidden="true">+</span> Add to collection</>}</button>}
            </div>
            {picking && <div className="entry-collections-picker">
              <SearchablePicker
                id={`entry-collection-picker-${entry.id}`}
                label={`Add ${entry.expression} to a collection`}
                value=""
                options={otherCollections.map((collection) => ({ id: collection.id, label: collection.name }))}
                emptyMessage={otherCollections.length ? 'No Collections match. Type a name to create one.' : 'Type a name to create a Collection.'}
                disabled={!online}
                describedBy={offlineReason}
                autoFocus
                onChange={(id) => {
                  const collection = otherCollections.find((item) => item.id === id);
                  closePicker(true);
                  if (collection) onChangeMembership(collection, false);
                }}
                onCreate={(name) => { closePicker(true); onCreateCollection(name); }}
                onDismiss={(reason) => closePicker(reason === 'escape')}
              />
            </div>}
          </div>
          <div className="vocabulary-entry-actions">
            <div className="vocabulary-entry-actions-main">
              <button className="secondary-button" type="button" aria-label={`Edit ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={onEdit}>Edit</button>
            </div>
            <button className="inline-button danger" type="button" aria-label={`Delete ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={onDelete}>Delete</button>
          </div>
        </div>}
        </div>
      </details>
    </article>
  );
}
