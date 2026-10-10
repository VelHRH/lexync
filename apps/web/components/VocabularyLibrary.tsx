'use client';

import type { StudyPair } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';
import { EMPTY_LIBRARY_SNAPSHOT, invalidateLibrary, loadLibrary, librarySnapshot, setEntrySuspendedInStore, subscribeLibrary, type Collection, type LibraryEntry } from '../lib/libraryStore';
import { VocabularyCaptureDialog } from './VocabularyCaptureDialog';

type LearningLanguage = { id: string; languageTag: string };
type VocabularyStatus = 'active' | 'all' | 'suspended';
type DraftItem = { id: string | null; key: string; text: string };
type DraftSense = { id: string | null; key: string; translations: DraftItem[]; examples: DraftItem[] };
type EntryDraft = { id: string; expression: string; senses: DraftSense[] };

function draftKey() {
  return crypto.randomUUID();
}

function toDraft(entry: LibraryEntry): EntryDraft {
  return {
    id: entry.id,
    expression: entry.expression,
    senses: entry.senses.map((sense) => ({
      id: sense.id,
      key: sense.id,
      translations: sense.translations.map((translation) => ({ ...translation, key: translation.id })),
      examples: sense.examples.map((example) => ({ ...example, key: example.id })),
    })),
  };
}

export function VocabularyLibrary({ onEntriesChanged, language, pairs }: { onEntriesChanged: () => Promise<void>; language: LearningLanguage; pairs: Array<StudyPair & { learningLanguageId: string }> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeLibrary, () => librarySnapshot(language.id), () => EMPTY_LIBRARY_SNAPSHOT);
  const { entries, collections, memberships } = snapshot;
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [capturedNotice, setCapturedNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VocabularyStatus>('all');
  const [suspensionNotice, setSuspensionNotice] = useState('');
  const [changingMembership, setChangingMembership] = useState('');
  const online = useOnlineStatus();

  const pairIdsKey = useMemo(
    () => pairs.filter((pair) => pair.learningLanguageId === language.id).map((pair) => pair.id).sort().join(','),
    [pairs, language.id],
  );
  const pairIds = useMemo(() => (pairIdsKey ? pairIdsKey.split(',') : []), [pairIdsKey]);

  const reload = useCallback(() => {
    invalidateLibrary(language.id);
    return loadLibrary(language.id, pairIds);
  }, [language.id, pairIds]);

  useEffect(() => {
    void loadLibrary(language.id, pairIds);
  }, [language.id, pairIds]);

  useEffect(() => {
    queueMicrotask(() => {
      if (searchParams.get('add') === '1') {
        setCapturedNotice('');
        setShowForm(true);
        window.history.replaceState(null, '', '/library');
      }
    });
  }, []);

  function updateSense(index: number, update: (sense: DraftSense) => DraftSense) {
    setDraft((current) => current && ({ ...current, senses: current.senses.map((sense, senseIndex) => senseIndex === index ? update(sense) : sense) }));
  }

  function updateTranslationText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: sense.translations.map((item) => item.key === key ? { ...item, text } : item) }));
  }

  function addTranslation(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: [...sense.translations, { id: null, key: draftKey(), text: '' }] }));
  }

  function removeTranslation(senseIndex: number, key: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, translations: sense.translations.filter((item) => item.key !== key) }));
  }

  function updateExampleText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: sense.examples.map((item) => item.key === key ? { ...item, text } : item) }));
  }

  function addExample(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: [...sense.examples, { id: null, key: draftKey(), text: '' }] }));
  }

  function removeExample(senseIndex: number, key: string) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: sense.examples.filter((item) => item.key !== key) }));
  }

  function moveExample(exampleKey: string, senseKey: string) {
    setDraft((current) => {
      if (!current) return current;
      const moved = current.senses.flatMap((sense) => sense.examples).find((item) => item.key === exampleKey);
      if (!moved) return current;
      return {
        ...current,
        senses: current.senses.map((sense) => ({
          ...sense,
          examples: sense.key === senseKey
            ? [...sense.examples.filter((item) => item.key !== exampleKey), moved]
            : sense.examples.filter((item) => item.key !== exampleKey),
        })),
      };
    });
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setNotice('');
    if (!draft.expression.trim()) {
      setNotice('Expression is required.');
      return;
    }
    if (!draft.senses.length) {
      setNotice('A Vocabulary Entry needs at least one Sense.');
      return;
    }
    if (draft.senses.some((sense) => !sense.translations.length)) {
      setNotice('Each Sense needs at least one translation.');
      return;
    }
    if (draft.senses.some((sense) => sense.translations.some((item) => !item.text.trim()))) {
      setNotice('Translation is required.');
      return;
    }
    const hasDuplicateTranslation = draft.senses.some((sense) => {
      const identities = sense.translations.map((item) => item.text.normalize('NFC').trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase());
      return new Set(identities).size !== identities.length;
    });
    if (hasDuplicateTranslation) {
      setNotice('Translations in a Sense must be distinct.');
      return;
    }
    if (draft.senses.some((sense) => sense.examples.some((item) => !item.text.trim()))) {
      setNotice('Example text is required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('update_vocabulary_entry', {
      p_expression: draft.expression,
      p_senses: draft.senses.map((sense) => ({
        id: sense.id,
        translations: sense.translations.map(({ id, text }) => ({ id, text })),
        examples: sense.examples.map(({ id, text }) => ({ id, text })),
      })),
      p_vocabulary_entry_id: draft.id,
    });
    setSaving(false);
    if (error) {
      setNotice(`Changes could not be saved. ${error.message}`);
      return;
    }
    setDraft(null);
    await reload();
  }

  async function deleteEntry(entry: LibraryEntry) {
    const confirmed = window.confirm(`Delete ${entry.expression}? Senses, translations, Examples, and learning progress owned by this Vocabulary Entry will also be removed. This cannot be undone.`);
    if (!confirmed) return;
    setNotice('');
    const { error } = await supabase.rpc('delete_vocabulary_entry', { p_vocabulary_entry_id: entry.id });
    if (error) {
      setNotice(`Vocabulary Entry could not be deleted. ${error.message}`);
      return;
    }
    setDraft(null);
    await reload();
    await onEntriesChanged();
  }

  async function setSuspended(entry: LibraryEntry, suspended: boolean) {
    setNotice('');
    setSuspensionNotice('');
    const { error } = await supabase.rpc('set_vocabulary_entry_suspended', {
      p_suspended: suspended,
      p_vocabulary_entry_id: entry.id,
    });
    if (error) {
      setNotice(`${entry.expression} could not be ${suspended ? 'suspended' : 'resumed'}. ${error.message}`);
      return;
    }
    setEntrySuspendedInStore(language.id, entry.id, suspended);
    setSuspensionNotice(`${entry.expression} is ${suspended ? 'suspended' : 'active'}.`);
  }

  async function changeMembership(entry: LibraryEntry, collection: Collection, member: boolean) {
    setChangingMembership(`${member ? 'remove' : 'add'}:${collection.id}:${entry.learningVocabularyEntryId}`);
    setNotice('');
    const { error } = member
      ? await supabase.rpc('remove_collection_membership', {
        p_collection_id: collection.id,
        p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
      })
      : await supabase.rpc('add_collection_membership', {
        p_collection_id: collection.id,
        p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
      });
    setChangingMembership('');
    if (error) {
      setNotice(`Collection membership could not be ${member ? 'removed' : 'added'}. ${error.message}`);
      return;
    }
    await reload();
  }

  const draftExamples = draft?.senses.flatMap((sense) => sense.examples) ?? [];
  const normalizedQuery = query.normalize('NFC').trim().toLocaleLowerCase();
  const selectedCollectionId = searchParams.get('collection') ?? '';
  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
  const selectedCollectionEntryIds = new Set(memberships.filter((membership) => membership.collection_id === selectedCollectionId).map((membership) => membership.learning_vocabulary_entry_id));
  const visibleEntries = entries.filter((entry) => {
    const matchesStatus = status === 'all' || (status === 'suspended' ? entry.suspended : !entry.suspended);
    const matchesCollection = !selectedCollectionId || selectedCollectionEntryIds.has(entry.learningVocabularyEntryId);
    const searchableText = [entry.expression, ...entry.senses.flatMap((sense) => sense.translations.map((item) => item.text))]
      .join('\n')
      .normalize('NFC')
      .toLocaleLowerCase();
    return matchesStatus && matchesCollection && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
  const emptyHeading = selectedCollection
    ? 'This Collection is empty.'
    : normalizedQuery
    ? 'No match in this library.'
    : status === 'all' && entries.length === 0
      ? 'Nothing filed under this language yet.'
      : 'Nothing here right now.';
  const noResultsMessage = selectedCollection
    ? `No vocabulary entries in “${selectedCollection.name}”.`
    : normalizedQuery
    ? `No ${status === 'all' ? '' : `${status} `}Vocabulary Entries match “${query.trim()}”.`
    : status === 'all' && entries.length === 0
      ? 'No vocabulary entries yet. Add your first one.'
      : `No ${status} Vocabulary Entries yet.`;

  return (
    <section className="vocabulary-library" aria-labelledby="app-heading">
      <div className="library-toolbar">
        <p className="page-lede">{entries.length === 0 ? 'Nothing filed yet.' : <>{entries.length} {entries.length === 1 ? 'expression' : 'expressions'}{visibleEntries.length === entries.length ? '' : <> · <strong>{visibleEntries.length} shown</strong></>}</>}</p>
        <div className="library-toolbar-actions">
          <button className="primary-button" type="button" disabled={!online} onClick={() => { setNotice(''); setCapturedNotice(''); setDraft(null); setShowForm(true); }}>Add vocabulary</button>
          <button className="secondary-button" type="button" disabled={!online || snapshot.loading || snapshot.refreshing} onClick={() => void loadLibrary(language.id, pairIds, { force: true })}>{snapshot.loading || snapshot.refreshing ? 'Refreshing…' : 'Refresh library'}</button>
        </div>
      </div>
      {!online && <p className="form-notice" role="status">You are offline. Vocabulary changes require a connection.</p>}
      {selectedCollection && <div className="library-collection-filter" role="status"><span>Filtered by {selectedCollection.name}</span><button className="text-button" type="button" onClick={() => router.push('/library')}>Clear Collection filter</button></div>}
      <div className="vocabulary-discovery-controls">
        <div className="field">
          <label htmlFor="vocabulary-search">Search vocabulary</label>
          <input id="vocabulary-search" type="search" value={query} placeholder="expression or translation" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="vocabulary-status">Vocabulary status</label>
          <select id="vocabulary-status" value={status} onChange={(event) => setStatus(event.target.value as VocabularyStatus)}>
            <option value="all">All entries</option>
            <option value="active">Active entries</option>
            <option value="suspended">Suspended entries</option>
          </select>
        </div>
      </div>
      <VocabularyCaptureDialog open={showForm} language={language} onCaptured={async (expression) => { setCapturedNotice(`Saved “${expression}” to your vocabulary.`); await reload(); await onEntriesChanged(); }} onClose={() => setShowForm(false)} />
      {snapshot.loading && <p className="collections-sr-only" role="status">Loading your vocabulary…</p>}
      {snapshot.refreshing && <p className="collections-sr-only" role="status">Refreshing your vocabulary…</p>}
      {snapshot.loading && <div className="skeleton-list" aria-hidden="true">
        <div className="skeleton-card"><div className="skeleton-line strong wide" /><div className="skeleton-line half" /><div className="skeleton-line narrow" /></div>
        <div className="skeleton-card"><div className="skeleton-line strong narrow" /><div className="skeleton-line wide" /></div>
        <div className="skeleton-card"><div className="skeleton-line strong half" /><div className="skeleton-line wide" /></div>
      </div>}
      {!snapshot.loading && visibleEntries.length === 0 && <div className="empty-state" data-ui="empty-state" role="status">
        <h3>{emptyHeading}</h3>
        <p>{noResultsMessage}</p>
      </div>}
      {suspensionNotice && <p className="form-notice" role="status">{suspensionNotice}</p>}
      {capturedNotice && <p className="form-notice" role="status">{capturedNotice}</p>}
      {notice && !draft && <p className="form-notice error" role="alert">{notice}</p>}
      {snapshot.error && <p className="form-notice error" role="alert">{snapshot.error}</p>}
      <div className="vocabulary-entry-list">
        {visibleEntries.map((entry) => <article className={`vocabulary-entry-item${entry.suspended ? ' suspended' : ''}`} key={entry.id}>
          <details className="vocabulary-entry" open={draft?.id === entry.id || undefined}>
            <summary>
              <span className="vocabulary-entry-identity">
                <h3 className="vocabulary-entry-expression">{entry.expression}</h3>
                <span className="vocabulary-entry-gloss">{entry.senses.flatMap((sense) => sense.translations.map((item) => item.text)).join(' · ') || 'No translation yet'}</span>
              </span>
              {entry.suspended ? <span className="vocabulary-status-badge">Suspended</span> : entry.senses.length > 1 && <span className="surface-tally">{entry.senses.length}</span>}
            </summary>
            <div>
            {draft?.id === entry.id ? <form className="vocabulary-editor" onSubmit={saveDraft}>
              <label htmlFor={`edit-expression-${entry.id}`}>Expression</label>
              <input id={`edit-expression-${entry.id}`} value={draft.expression} disabled={!online} onChange={(event) => setDraft({ ...draft, expression: event.target.value })} />
              {draft.senses.map((sense, senseIndex) => <fieldset key={sense.key}>
                <legend>Sense {senseIndex + 1}</legend>
                {sense.translations.map((item, translationIndex) => <div className="vocabulary-editor-row" key={item.key}>
                  <label htmlFor={`translation-${item.key}`}>Sense {senseIndex + 1} translation {translationIndex + 1}</label>
                  <input id={`translation-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateTranslationText(senseIndex, item.key, event.target.value)} />
                  <button className="text-button danger" type="button" disabled={!online} aria-label={`Remove translation ${translationIndex + 1} from Sense ${senseIndex + 1}`} onClick={() => removeTranslation(senseIndex, item.key)}>Remove</button>
                </div>)}
                <button className="text-button" type="button" disabled={!online} onClick={() => addTranslation(senseIndex)}>Add translation to Sense {senseIndex + 1}</button>
                {sense.examples.map((item) => {
                  const exampleIndex = draftExamples.findIndex((exampleItem) => exampleItem.key === item.key);
                  return <div className="vocabulary-example-editor" key={item.key}>
                    <label htmlFor={`example-text-${item.key}`}>Example {exampleIndex + 1} text</label>
                    <textarea id={`example-text-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateExampleText(senseIndex, item.key, event.target.value)} />
                    <label htmlFor={`example-sense-${item.key}`}>Example {exampleIndex + 1} Sense</label>
                    <select id={`example-sense-${item.key}`} value={sense.key} disabled={!online} onChange={(event) => moveExample(item.key, event.target.value)}>
                      {draft.senses.map((option, optionIndex) => <option key={option.key} value={option.key}>Sense {optionIndex + 1} · {option.translations[0]?.text || 'New Sense'}</option>)}
                    </select>
                    <button className="text-button danger" type="button" disabled={!online} onClick={() => removeExample(senseIndex, item.key)}>Remove Example {exampleIndex + 1}</button>
                  </div>;
                })}
                <button className="text-button" type="button" disabled={!online} onClick={() => addExample(senseIndex)}>Add Example to Sense {senseIndex + 1}</button>
                <button className="text-button danger" type="button" disabled={!online} onClick={() => setDraft({ ...draft, senses: draft.senses.filter((item) => item.key !== sense.key) })}>Remove Sense {senseIndex + 1}</button>
              </fieldset>)}
              <button className="secondary-button" type="button" disabled={!online} onClick={() => setDraft({ ...draft, senses: [...draft.senses, { id: null, key: draftKey(), translations: [{ id: null, key: draftKey(), text: '' }], examples: [] }] })}>Add Sense</button>
              {notice && <p className="form-notice error" role="alert">{notice}</p>}
              <div className="vocabulary-editor-actions">
                <button className="primary-button" type="submit" disabled={saving || !online}>{saving ? 'Saving…' : 'Save changes'}</button>
                <button className="secondary-button" type="button" disabled={saving} onClick={() => { setDraft(null); setNotice(''); }}>Cancel</button>
              </div>
            </form> : <>
              {entry.senses.map((sense, index) => <div className="vocabulary-sense" key={sense.id}>
                <h4>Sense {index + 1}</h4>
                {sense.translations.map((item) => <p key={item.id}>{item.text} <span>{item.answer_language_tag}</span></p>)}
                {sense.examples.map((item) => <p className="vocabulary-example" key={item.id}>{item.text}</p>)}
              </div>)}
              {collections.length > 0 && <fieldset className="library-collections" aria-labelledby={`entry-collections-${entry.id}`}>
                <legend id={`entry-collections-${entry.id}`}>Collections</legend>
                {collections.map((collection) => {
                  const member = memberships.some((membership) => membership.collection_id === collection.id && membership.learning_vocabulary_entry_id === entry.learningVocabularyEntryId);
                  const changing = changingMembership === `${member ? 'remove' : 'add'}:${collection.id}:${entry.learningVocabularyEntryId}`;
                  return <button className={`collection-chip${member ? ' selected' : ''}`} type="button" key={collection.id} aria-pressed={member} aria-label={member ? `Remove ${entry.expression} from ${collection.name}` : `Add ${entry.expression} to ${collection.name}`} disabled={!online || changing} onClick={() => void changeMembership(entry, collection, member)}>{changing ? `${member ? 'Removing' : 'Adding'}…` : collection.name}</button>;
                })}
              </fieldset>}
              <div className="vocabulary-entry-actions">
                <button className="secondary-button" type="button" aria-label={`Edit ${entry.expression}`} disabled={!online} onClick={() => { setShowForm(false); setNotice(''); setDraft(toDraft(entry)); }}>Edit</button>
                <button className="secondary-button" type="button" aria-label={`${entry.suspended ? 'Resume' : 'Suspend'} ${entry.expression}`} disabled={!online} onClick={() => void setSuspended(entry, !entry.suspended)}>{entry.suspended ? 'Resume' : 'Suspend'}</button>
                <button className="secondary-button danger" type="button" aria-label={`Delete ${entry.expression}`} disabled={!online} onClick={() => void deleteEntry(entry)}>Delete</button>
              </div>
            </>}
            </div>
          </details>
        </article>)}
      </div>
    </section>
  );
}
