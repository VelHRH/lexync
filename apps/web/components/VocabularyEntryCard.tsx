'use client';

import type { MouseEvent, ReactNode } from 'react';
import type { Collection, LibraryEntry } from '../lib/libraryStore';
import { PROGRESS_STATE_LABELS } from '../lib/vocabularyProgress';
import { VocabularyAudioClipPlayer, VocabularyAudioClipRecorder } from './VocabularyAudioClip';

export function membershipChangeKey(member: boolean, collection: Collection, entry: LibraryEntry) {
  return `${member ? 'remove' : 'add'}:${collection.id}:${entry.learningVocabularyEntryId}`;
}

export function VocabularyEntryCard({ entry, editor, selecting, selected, filing, memberCollections, otherCollections, changingMembership, online, offlineReason, onSelectClick, onSelectChange, onChangeMembership, onEdit, onToggleSuspended, onDelete, onClipChanged }: {
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
  onEdit: () => void;
  onToggleSuspended: () => void;
  onDelete: () => void;
  onClipChanged: () => void;
}) {
  function renderCollectionChip(collection: Collection, member: boolean) {
    const changing = changingMembership === membershipChangeKey(member, collection, entry);
    return <button className={`collection-chip${member ? ' selected' : ''}`} type="button" key={collection.id} aria-pressed={member} aria-label={member ? `Remove ${entry.expression} from ${collection.name}` : `Add ${entry.expression} to ${collection.name}`} disabled={!online || changing} aria-describedby={offlineReason} onClick={() => onChangeMembership(collection, member)}>{changing ? `${member ? 'Removing' : 'Adding'}…` : collection.name}</button>;
  }

  return (
    <article className={`vocabulary-entry-item${entry.suspended ? ' suspended' : ''}`} data-selected={selected} data-has-clip={entry.audioClipPath ? 'true' : undefined}>
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
            {entry.suspended
              ? <span className="vocabulary-status-badge">Suspended</span>
              : entry.progressState && <span className="vocabulary-progress-badge" data-ui="entry-progress-state" data-state={entry.progressState}>{PROGRESS_STATE_LABELS[entry.progressState]}</span>}
            {!entry.suspended && entry.senses.length > 1 && <span className="surface-tally">{entry.senses.length}</span>}
          </span>
        </summary>
        <div>
        {editor ?? <>
          {entry.senses.map((sense, index) => <section className="vocabulary-sense" key={sense.id} role="group" aria-labelledby={`sense-${sense.id}`}>
            <h4 className={entry.senses.length > 1 ? undefined : 'visually-hidden'} id={`sense-${sense.id}`}>Sense {index + 1}</h4>
            {sense.translations.map((item) => <p key={item.id}>{item.text} <span>{item.answer_language_tag}</span></p>)}
            {sense.examples.map((item) => <div className="vocabulary-sense-example" key={item.id}>
              <p className="vocabulary-example">{item.text}</p>
              {item.translations.map((translation) => <p className="vocabulary-example-translation" key={translation.id}>{translation.text} <span>{translation.answer_language_tag}</span></p>)}
            </div>)}
          </section>)}
          <VocabularyAudioClipRecorder entry={entry} online={online} onChanged={onClipChanged} />
          {memberCollections.length + otherCollections.length > 0 && <div className="entry-collections" role="group" aria-labelledby={`entry-collections-${entry.id}`}>
            <h4 id={`entry-collections-${entry.id}`}>Collections</h4>
            {memberCollections.length > 0 && <div className="entry-collections-member">
              {memberCollections.map((collection) => renderCollectionChip(collection, true))}
            </div>}
            {otherCollections.length > 0 && <div className="entry-collections-rest">
              {otherCollections.map((collection) => renderCollectionChip(collection, false))}
            </div>}
          </div>}
          <div className="vocabulary-entry-actions">
            <div className="vocabulary-entry-actions-main">
              <button className="secondary-button" type="button" aria-label={`Edit ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={onEdit}>Edit</button>
              <button className="inline-button" type="button" aria-label={`${entry.suspended ? 'Resume' : 'Suspend'} ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={onToggleSuspended}>{entry.suspended ? 'Resume' : 'Suspend'}</button>
            </div>
            <button className="inline-button danger" type="button" aria-label={`Delete ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={onDelete}>Delete</button>
          </div>
        </>}
        </div>
      </details>
    </article>
  );
}
