'use client';

import type { StudyPair } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';
import { EMPTY_LIBRARY_SNAPSHOT, invalidateLibrary, loadLibrary, librarySnapshot, setEntrySuspendedInStore, subscribeLibrary, type Collection, type LibraryEntry } from '../lib/libraryStore';
import { VocabularyAudioClipPlayer, VocabularyAudioClipRecorder } from './VocabularyAudioClip';
import { normalizeSearchText } from '../lib/searchText';
import { CollectionDialogs, type CollectionDialogRequest } from './CollectionDialogs';
import { SearchablePicker } from './SearchablePicker';
import { VocabularyCaptureDialog } from './VocabularyCaptureDialog';

type LearningLanguage = { id: string; languageTag: string };
type VocabularyStatus = 'active' | 'all' | 'suspended';
type DraftItem = { id: string | null; key: string; text: string };
type DraftExampleTranslation = { id: string | null; key: string; text: string; answerLanguageTag: string | null };
type DraftExample = DraftItem & { translations: DraftExampleTranslation[] };
type DraftSense = { id: string | null; key: string; translations: DraftItem[]; examples: DraftExample[] };
type EntryDraft = { id: string; expression: string; senses: DraftSense[] };

const ALL_VOCABULARY_SCOPE = '';
const NO_COLLECTION_SCOPE = 'none';

function draftKey() {
  return crypto.randomUUID();
}

function entryCountDetail(count: number) {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function toDraft(entry: LibraryEntry): EntryDraft {
  return {
    id: entry.id,
    expression: entry.expression,
    senses: entry.senses.map((sense) => ({
      id: sense.id,
      key: sense.id,
      translations: sense.translations.map((translation) => ({ ...translation, key: translation.id })),
      examples: sense.examples.map((example) => ({ ...example, key: example.id, translations: example.translations.map((translation) => ({ ...translation, key: translation.id, answerLanguageTag: translation.answer_language_tag })) })),
    })),
  };
}

export function VocabularyLibrary({ lessonInProgress, onEntriesChanged, language, pairs }: { lessonInProgress: boolean; onEntriesChanged: () => Promise<void>; language: LearningLanguage; pairs: Array<StudyPair & { learningLanguageId: string }> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeLibrary, () => librarySnapshot(language.id), () => EMPTY_LIBRARY_SNAPSHOT);
  const { entries, collections, memberships, minimumEntries } = snapshot;
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [capturedNotice, setCapturedNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VocabularyStatus>('all');
  const [suspensionNotice, setSuspensionNotice] = useState('');
  const [changingMembership, setChangingMembership] = useState('');
  const [collectionRequest, setCollectionRequest] = useState<CollectionDialogRequest | null>(null);
  const [collectionNotice, setCollectionNotice] = useState('');
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope: ALL_VOCABULARY_SCOPE, ids: [] });
  const [fileTargetId, setFileTargetId] = useState('');
  const [entryToAddId, setEntryToAddId] = useState('');
  const [filing, setFiling] = useState(false);
  const [fileNotice, setFileNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [practiceError, setPracticeError] = useState('');
  const [practiceStarting, setPracticeStarting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const online = useOnlineStatus();
  const newCollectionRef = useRef<HTMLButtonElement>(null);
  const lastSelectedIndex = useRef<number | null>(null);
  const fileIntoNewCollectionRef = useRef<HTMLButtonElement>(null);

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
    queueMicrotask(() => setSelection({ scope: ALL_VOCABULARY_SCOPE, ids: [] }));
  }, [language.id]);

  useEffect(() => {
    queueMicrotask(() => {
      if (new URLSearchParams(window.location.search).get('add') === '1') {
        setCapturedNotice('');
        setShowForm(true);
        const remaining = new URLSearchParams(window.location.search);
        remaining.delete('add');
        const remainingSearch = remaining.toString();
        window.history.replaceState(null, '', remainingSearch ? `/library?${remainingSearch}` : '/library');
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

  function updateExampleTranslationText(senseIndex: number, key: string, text: string) {
    updateSense(senseIndex, (sense) => ({
      ...sense,
      examples: sense.examples.map((item) => item.key !== key ? item : {
        ...item,
        translations: item.translations.length
          ? item.translations.map((translation, index) => index === 0 ? { ...translation, text } : translation)
          : [{ id: null, key: draftKey(), text, answerLanguageTag: null }],
      }),
    }));
  }

  function addExample(senseIndex: number) {
    updateSense(senseIndex, (sense) => ({ ...sense, examples: [...sense.examples, { id: null, key: draftKey(), text: '', translations: [] }] }));
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
      const identities = sense.translations.map((item) => normalizeSearchText(item.text));
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
        examples: sense.examples.map(({ id, text, translations }) => ({
          id,
          text,
          translations: translations.filter((item) => item.text.trim()).map(({ id, text, answerLanguageTag }) => ({ id, text, answer_language_tag: answerLanguageTag })),
        })),
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
    if (entry.audioClipPath) {
      const { count, error: countError } = await supabase.from('vocabulary_entries').select('id', { count: 'exact', head: true }).eq('learning_vocabulary_entry_id', entry.learningVocabularyEntryId);
      if (countError) {
        setNotice(`Vocabulary Entry could not be deleted. ${countError.message}`);
        return;
      }
      if ((count ?? 0) <= 1) {
        const { error: clipError } = await supabase.storage.from('vocabulary-audio-clips').remove([entry.audioClipPath]);
        if (clipError) {
          setNotice(`Vocabulary Entry could not be deleted. ${clipError.message}`);
          return;
        }
      }
    }
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
  const normalizedQuery = normalizeSearchText(query);
  const scopeParam = searchParams.get('collection') ?? '';
  const scopeIsKnown = scopeParam === ALL_VOCABULARY_SCOPE || scopeParam === NO_COLLECTION_SCOPE || collections.some((collection) => collection.id === scopeParam);
  const staleScope = !scopeIsKnown && snapshot.loadedAt !== null && !snapshot.loading && !snapshot.error;
  const selectedCollectionId = scopeIsKnown ? scopeParam : ALL_VOCABULARY_SCOPE;
  const collectedEntryIds = useMemo(() => new Set(memberships.map((membership) => membership.learning_vocabulary_entry_id)), [memberships]);

  useEffect(() => {
    if (staleScope) router.replace('/library');
  }, [router, staleScope]);

  useEffect(() => {
    queueMicrotask(() => setPracticeError(''));
  }, [selectedCollectionId]);

  function selectCollectionScope(id: string) {
    setFileTargetId('');
    setEntryToAddId('');
    setFileNotice('');
    setFileError('');
    setSelection({ scope: id, ids: [] });
    router.replace(id === ALL_VOCABULARY_SCOPE ? '/library' : `/library?collection=${encodeURIComponent(id)}`);
  }

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId);
  const selectedCollectionEntryIds = new Set(memberships.filter((membership) => membership.collection_id === selectedCollectionId).map((membership) => membership.learning_vocabulary_entry_id));
  const visibleEntries = entries.filter((entry) => {
    const matchesStatus = status === 'all' || (status === 'suspended' ? entry.suspended : !entry.suspended);
    const matchesCollection = selectedCollectionId === ALL_VOCABULARY_SCOPE || (selectedCollectionId === NO_COLLECTION_SCOPE ? !collectedEntryIds.has(entry.learningVocabularyEntryId) : selectedCollectionEntryIds.has(entry.learningVocabularyEntryId));
    const haystacks = [entry.expression, ...entry.senses.flatMap((sense) => sense.translations.map((item) => item.text))].map(normalizeSearchText);
    return matchesStatus && matchesCollection && (!normalizedQuery || haystacks.some((text) => text.includes(normalizedQuery)));
  });
  const selectedEntryIds = selection.scope === selectedCollectionId ? selection.ids : [];
  const selectedEntries = entries.filter((entry) => selectedEntryIds.includes(entry.learningVocabularyEntryId));
  const selectionAnnouncement = selectedEntries.length > 0 ? `${selectedEntries.length} ${selectedEntries.length === 1 ? 'Vocabulary Entry' : 'Vocabulary Entries'} selected` : '';
  const fileTarget = collections.find((collection) => collection.id === fileTargetId);
  const fileTargetOptions = collections.map((collection) => ({ id: collection.id, label: collection.name }));
  const addableEntryOptions = entries
    .filter((entry) => !selectedCollectionEntryIds.has(entry.learningVocabularyEntryId))
    .map((entry) => ({ id: entry.learningVocabularyEntryId, label: entry.expression, keywords: entry.senses.flatMap((sense) => sense.translations.map((item) => item.text)) }));
  const offlineReason = online ? undefined : 'library-offline-notice';
  const practiceShortfall = minimumEntries - (selectedCollection?.entryCount ?? 0);
  const practiceReason = practiceShortfall > 0
    ? `Add ${practiceShortfall} more ${practiceShortfall === 1 ? 'Vocabulary Entry' : 'Vocabulary Entries'} to practise this Collection.`
    : selectedCollection && !selectedCollection.canPractise ? 'This Collection has enough Vocabulary Entries, but fewer than two Senses are eligible. Resume suspended Vocabulary Entries or add translations to practise it.'
    : lessonInProgress ? 'Finish the Lesson in progress first.'
    : '';
  const practiceReasonId = 'library-collection-practice-reason';
  const practiceDescribedBy = lessonInProgress && offlineReason ? `${practiceReasonId} ${offlineReason}` : lessonInProgress ? practiceReasonId : offlineReason;

  function toggleEntrySelected(entry: LibraryEntry, selected: boolean) {
    setFileNotice('');
    setFileError('');
    setSelection({
      scope: selectedCollectionId,
      ids: selected ? [...selectedEntryIds, entry.learningVocabularyEntryId] : selectedEntryIds.filter((id) => id !== entry.learningVocabularyEntryId),
    });
  }

  async function fileSelectionInto(collectionId: string, name: string) {
    const filed = selectedEntries;
    setFiling(true);
    setFileNotice('');
    setFileError('');
    const unfiled: string[] = [];
    for (const entry of filed) {
      const { error } = await supabase.rpc('add_collection_membership', {
        p_collection_id: collectionId,
        p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
      });
      if (error) unfiled.push(entry.expression);
    }
    setFiling(false);
    await reload();
    if (unfiled.length) {
      setFileError(`Some Vocabulary Entries could not be filed into ${name}: ${unfiled.join(', ')}.`);
      return false;
    }
    setSelection({ scope: selectedCollectionId, ids: [] });
    setFileNotice(`Filed ${filed.length} ${filed.length === 1 ? 'Vocabulary Entry' : 'Vocabulary Entries'} into ${name}.`);
    return true;
  }

  async function addEntryToScopedCollection(learningVocabularyEntryId: string) {
    setEntryToAddId(learningVocabularyEntryId);
    const entry = entries.find((item) => item.learningVocabularyEntryId === learningVocabularyEntryId);
    if (!entry || !selectedCollection) return;
    setFiling(true);
    setFileNotice('');
    setFileError('');
    const { error } = await supabase.rpc('add_collection_membership', {
      p_collection_id: selectedCollection.id,
      p_learning_vocabulary_entry_id: entry.learningVocabularyEntryId,
    });
    setFiling(false);
    if (error) {
      setFileError(`${entry.expression} could not be filed into ${selectedCollection.name}. ${error.message}`);
      return;
    }
    setEntryToAddId('');
    await reload();
    setFileNotice(`Added ${entry.expression} to ${selectedCollection.name}.`);
  }

  async function practiseCollection(collectionId: string) {
    setPracticeError('');
    setPracticeStarting(true);
    const { data, error } = await supabase.rpc('start_or_resume_vocabulary_lesson', {
      p_collection_id: collectionId,
      p_learning_language_id: language.id,
    });
    if (error) {
      setPracticeStarting(false);
      setPracticeError(`This Collection could not be practised. ${error.message}`);
      return;
    }
    const lessonId = data && typeof data === 'object' && 'id' in data && typeof (data as { id: unknown }).id === 'string' ? (data as { id: string }).id : '';
    if (!lessonId) {
      setPracticeStarting(false);
      setPracticeError('This Collection could not be practised. A Vocabulary Lesson could not be opened right now.');
      return;
    }
    router.push(`/lessons/${lessonId}`);
  }

  function emptyStateCopy() {
    if (normalizedQuery) return { heading: 'No match in this library.', message: `No ${status === 'all' ? '' : `${status} `}Vocabulary Entries match “${query.trim()}”.` };
    if (selectedCollection) return status === 'all'
      ? { heading: 'This Collection is empty.', message: `No vocabulary entries in “${selectedCollection.name}”.` }
      : { heading: 'Nothing here right now.', message: `No ${status} Vocabulary Entries in “${selectedCollection.name}”.` };
    if (selectedCollectionId === NO_COLLECTION_SCOPE) return status === 'all'
      ? { heading: 'Nothing outside your Collections.', message: 'No Vocabulary Entries are outside a Collection.' }
      : { heading: 'Nothing here right now.', message: `No ${status} Vocabulary Entries outside a Collection.` };
    if (status === 'all' && entries.length === 0) return { heading: 'Nothing filed under this language yet.', message: 'No vocabulary entries yet. Add your first one.' };
    return { heading: 'Nothing here right now.', message: `No ${status} Vocabulary Entries yet.` };
  }

  const { heading: emptyHeading, message: noResultsMessage } = emptyStateCopy();

  function toggleSelecting() {
    setFileNotice('');
    setFileError('');
    lastSelectedIndex.current = null;
    setSelection({ scope: selectedCollectionId, ids: [] });
    setSelecting((current) => !current);
  }

  function selectRange(index: number, selected: boolean) {
    const from = lastSelectedIndex.current;
    if (from === null) return false;
    const [start, end] = from < index ? [from, index] : [index, from];
    const rangeIds = visibleEntries.slice(start, end + 1).map((entry) => entry.learningVocabularyEntryId);
    setFileNotice('');
    setFileError('');
    setSelection({
      scope: selectedCollectionId,
      ids: selected
        ? [...selectedEntryIds, ...rangeIds.filter((id) => !selectedEntryIds.includes(id))]
        : selectedEntryIds.filter((id) => !rangeIds.includes(id)),
    });
    return true;
  }

  function collectionState(collection: Collection) {
    if (collection.canPractise) return `${entryCountDetail(collection.entryCount)} · ready to practise`;
    if (collection.entryCount < minimumEntries) return `${entryCountDetail(collection.entryCount)} · needs ${minimumEntries - collection.entryCount} more`;
    return `${entryCountDetail(collection.entryCount)} · not practisable yet`;
  }

  return (
    <section className="vocabulary-library" aria-labelledby="app-heading">
      <div className="library-toolbar">
        <p className="page-lede">{entries.length === 0 ? 'Nothing filed yet.' : <>{entries.length} {entries.length === 1 ? 'expression' : 'expressions'}{visibleEntries.length === entries.length ? '' : <> · <strong>{visibleEntries.length} shown</strong></>}</>}</p>
        <div className="library-toolbar-actions">
          <button className="primary-button" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => { setNotice(''); setCapturedNotice(''); setDraft(null); setShowForm(true); }}>Add vocabulary</button>
          <button className="secondary-button" type="button" disabled={!online || snapshot.loading || snapshot.refreshing} onClick={() => void loadLibrary(language.id, pairIds, { force: true })}>{snapshot.loading || snapshot.refreshing ? 'Refreshing…' : 'Refresh library'}</button>
        </div>
      </div>
      {!online && <p className="form-notice" role="status" id="library-offline-notice">You are offline. Vocabulary and Collection changes require a connection.</p>}

      <div className="library-shelf" data-ui="collection-shelf" role="group" aria-label="Collections">
        <div className="library-shelf-track">
          <button aria-label="All vocabulary" aria-pressed={selectedCollectionId === ALL_VOCABULARY_SCOPE} className="collection-card" type="button" onClick={() => selectCollectionScope(ALL_VOCABULARY_SCOPE)}>
            <span className="collection-card-name">All vocabulary</span>
            <span className="collection-card-state">{entryCountDetail(entries.length)}</span>
          </button>
          {collections.length > 0 && <button aria-label="Not in a Collection" aria-pressed={selectedCollectionId === NO_COLLECTION_SCOPE} className="collection-card quiet" type="button" onClick={() => selectCollectionScope(NO_COLLECTION_SCOPE)}>
            <span className="collection-card-name">Not in a Collection</span>
            <span className="collection-card-state">{entryCountDetail(entries.filter((entry) => !collectedEntryIds.has(entry.learningVocabularyEntryId)).length)}</span>
          </button>}
          {collections.map((collection) => <button
            aria-label={collection.name}
            aria-pressed={selectedCollectionId === collection.id}
            className="collection-card"
            key={collection.id}
            type="button"
            onClick={() => selectCollectionScope(collection.id)}
          >
            <span className="collection-card-name">{collection.name}</span>
            <span className="collection-card-state">{collectionState(collection)}</span>
          </button>)}
          <button aria-label="New Collection" className="collection-card new" type="button" ref={newCollectionRef} disabled={!online} aria-describedby={offlineReason} onClick={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'create' }); }}>
            <span aria-hidden="true" className="collection-card-plus">+</span>
            <span className="collection-card-name">New Collection</span>
          </button>
        </div>
      </div>

      {selectedCollection && <div className="library-scope">
        <div className="library-scope-identity">
          <span role="status">Filtered by {selectedCollection.name}</span>
          {practiceReason && <span className="library-scope-reason" role="status" id={practiceReasonId}>{practiceReason}</span>}
        </div>
        <div className="library-scope-actions">
          {selectedCollection.canPractise && <button className="primary-button" data-ui="practise-collection" type="button" disabled={!online || lessonInProgress || practiceStarting} aria-describedby={practiceDescribedBy} onClick={() => void practiseCollection(selectedCollection.id)}>{practiceStarting ? 'Opening Lesson…' : 'Practise this Collection'}</button>}
          <button className="text-button" type="button" aria-label={`Rename ${selectedCollection.name}`} disabled={!online} aria-describedby={offlineReason} onClick={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'rename', collection: selectedCollection }); }}>Rename</button>
          <button className="text-button danger" type="button" aria-label={`Delete ${selectedCollection.name}`} disabled={!online} aria-describedby={offlineReason} onClick={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'delete', collection: selectedCollection }); }}>Delete</button>
        </div>
        {practiceError && <p className="form-notice error library-scope-error" role="alert">{practiceError}</p>}
      </div>}

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
        <button aria-pressed={selecting} className="secondary-button library-select-toggle" type="button" disabled={filing} onClick={toggleSelecting}>{selecting ? 'Done' : 'Select'}</button>
      </div>

      {selectedCollection && <div className="library-entry-add">
        <SearchablePicker id="library-entry-to-add" label="Vocabulary Entry to add" value={entryToAddId} options={addableEntryOptions} onChange={(id) => void addEntryToScopedCollection(id)} emptyMessage="No Vocabulary Entries match" disabled={!online || filing} describedBy={offlineReason} />
      </div>}
      <VocabularyCaptureDialog open={showForm} language={language} onCaptured={async (expression) => { setCapturedNotice(`Saved “${expression}” to your vocabulary.`); await reload(); await onEntriesChanged(); }} onClose={() => setShowForm(false)} />
      <CollectionDialogs
        languageId={language.id}
        request={collectionRequest}
        onClose={() => setCollectionRequest(null)}
        onSaved={async (name, kind, collectionId) => {
          setCollectionRequest(null);
          if (kind === 'create-and-file') {
            if (await fileSelectionInto(collectionId ?? '', name)) newCollectionRef.current?.focus();
            else fileIntoNewCollectionRef.current?.focus();
            return;
          }
          if (kind === 'create') setCollectionNotice(`Created the Collection “${name}”.`);
          await reload();
        }}
        onDeleted={async (collectionId, name) => {
          setCollectionRequest(null);
          setCollectionNotice(`Deleted the Collection “${name}”. Its Vocabulary Entries are still in your Library.`);
          if (collectionId === selectedCollectionId) router.replace('/library');
          await reload();
          newCollectionRef.current?.focus();
        }}
      />
      {snapshot.loading && <p className="collections-sr-only" role="status">Loading your vocabulary…</p>}
      {snapshot.refreshing && <p className="collections-sr-only" role="status">Refreshing your vocabulary…</p>}
      {snapshot.loading && <div className="library-skeleton" aria-hidden="true">
        <div className="skeleton library-skeleton-row" />
        <div className="skeleton library-skeleton-row" />
        <div className="skeleton library-skeleton-row" />
        <div className="skeleton library-skeleton-row" />
        <div className="skeleton library-skeleton-row" />
      </div>}
      {!snapshot.loading && visibleEntries.length === 0 && <div className="empty-state" data-ui="empty-state" role="status">
        <h3>{emptyHeading}</h3>
        <p>{noResultsMessage}</p>
      </div>}
      {suspensionNotice && <p className="form-notice" role="status">{suspensionNotice}</p>}
      {capturedNotice && <p className="form-notice" role="status">{capturedNotice}</p>}
      {collectionNotice && <p className="form-notice" role="status">{collectionNotice}</p>}
      {fileNotice && <p className="form-notice" role="status">{fileNotice}</p>}
      {fileError && <p className="form-notice error" role="alert">{fileError}</p>}
      {filing && <p className="collections-sr-only" role="status">Filing into your Collection…</p>}
      {notice && !draft && <p className="form-notice error" role="alert">{notice}</p>}
      {snapshot.error && <p className="form-notice error" role="alert">{snapshot.error}</p>}
      <p className="visually-hidden" role="status">{selectionAnnouncement}</p>
      <div className="vocabulary-entry-list" data-selecting={selecting ? 'true' : undefined}>
        {visibleEntries.map((entry, index) => <article className={`vocabulary-entry-item${entry.suspended ? ' suspended' : ''}`} key={entry.id} data-selected={selectedEntryIds.includes(entry.learningVocabularyEntryId)}>
          {selecting && <label className="vocabulary-entry-select">
            <input
              type="checkbox"
              checked={selectedEntryIds.includes(entry.learningVocabularyEntryId)}
              disabled={filing}
              aria-label={`Select ${entry.expression}`}
              onClick={(event) => { if (event.shiftKey && selectRange(index, !selectedEntryIds.includes(entry.learningVocabularyEntryId))) event.preventDefault(); }}
              onChange={(event) => { lastSelectedIndex.current = index; toggleEntrySelected(entry, event.target.checked); }}
            />
            <span className="vocabulary-entry-select-mark" aria-hidden="true" />
          </label>}
          <details className="vocabulary-entry" open={draft?.id === entry.id || undefined}>
            <summary>
              <span className="vocabulary-entry-identity">
                <h3 className="vocabulary-entry-expression"><span className="marked">{entry.expression}</span></h3>
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
                  <div className="field">
                    <label htmlFor={`translation-${item.key}`}>Sense {senseIndex + 1} translation {translationIndex + 1}</label>
                    <input id={`translation-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateTranslationText(senseIndex, item.key, event.target.value)} />
                  </div>
                  <button className="text-button danger" type="button" disabled={!online} aria-describedby={offlineReason} aria-label={`Remove translation ${translationIndex + 1} from Sense ${senseIndex + 1}`} onClick={() => removeTranslation(senseIndex, item.key)}>Remove</button>
                </div>)}
                <button className="text-button" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => addTranslation(senseIndex)}>Add translation to Sense {senseIndex + 1}</button>
                {sense.examples.map((item) => {
                  const exampleIndex = draftExamples.findIndex((exampleItem) => exampleItem.key === item.key);
                  return <div className="vocabulary-example-editor" key={item.key}>
                    <div className="field">
                      <label htmlFor={`example-text-${item.key}`}>Example {exampleIndex + 1} text</label>
                      <textarea id={`example-text-${item.key}`} value={item.text} disabled={!online} onChange={(event) => updateExampleText(senseIndex, item.key, event.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`example-translation-${item.key}`}>Example {exampleIndex + 1} translation</label>
                      <textarea id={`example-translation-${item.key}`} value={item.translations[0]?.text ?? ''} disabled={!online} onChange={(event) => updateExampleTranslationText(senseIndex, item.key, event.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor={`example-sense-${item.key}`}>Example {exampleIndex + 1} Sense</label>
                      <select id={`example-sense-${item.key}`} value={sense.key} disabled={!online} onChange={(event) => moveExample(item.key, event.target.value)}>
                        {draft.senses.map((option, optionIndex) => <option key={option.key} value={option.key}>Sense {optionIndex + 1} · {option.translations[0]?.text || 'New Sense'}</option>)}
                      </select>
                    </div>
                    <button className="text-button danger" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => removeExample(senseIndex, item.key)}>Remove Example {exampleIndex + 1}</button>
                  </div>;
                })}
                <button className="text-button" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => addExample(senseIndex)}>Add Example to Sense {senseIndex + 1}</button>
                <button className="text-button danger" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => setDraft({ ...draft, senses: draft.senses.filter((item) => item.key !== sense.key) })}>Remove Sense {senseIndex + 1}</button>
              </fieldset>)}
              <button className="secondary-button" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => setDraft({ ...draft, senses: [...draft.senses, { id: null, key: draftKey(), translations: [{ id: null, key: draftKey(), text: '' }], examples: [] }] })}>Add Sense</button>
              <VocabularyAudioClipRecorder entry={entry} languageId={language.id} online={online} onChanged={() => void reload()} />
              {notice && <p className="form-notice error" role="alert">{notice}</p>}
              <div className="vocabulary-editor-actions">
                <button className="primary-button" type="submit" disabled={saving || !online} aria-describedby={offlineReason}>{saving ? 'Saving…' : 'Save changes'}</button>
                <button className="secondary-button" type="button" disabled={saving} onClick={() => { setDraft(null); setNotice(''); }}>Cancel</button>
              </div>
            </form> : <>
              <VocabularyAudioClipPlayer entry={entry} />
              {entry.senses.map((sense, index) => <div className="vocabulary-sense" key={sense.id}>
                <h4>Sense {index + 1}</h4>
                {sense.translations.map((item) => <p key={item.id}>{item.text} <span>{item.answer_language_tag}</span></p>)}
                {sense.examples.map((item) => <div key={item.id}>
                  <p className="vocabulary-example">{item.text}</p>
                  {item.translations.map((translation) => <p className="vocabulary-example-translation" key={translation.id}>{translation.text} <span>{translation.answer_language_tag}</span></p>)}
                </div>)}
              </div>)}
              {collections.length > 0 && <fieldset className="library-collections" aria-labelledby={`entry-collections-${entry.id}`}>
                <legend id={`entry-collections-${entry.id}`}>Collections</legend>
                {collections.map((collection) => {
                  const member = memberships.some((membership) => membership.collection_id === collection.id && membership.learning_vocabulary_entry_id === entry.learningVocabularyEntryId);
                  const changing = changingMembership === `${member ? 'remove' : 'add'}:${collection.id}:${entry.learningVocabularyEntryId}`;
                  return <button className={`collection-chip${member ? ' selected' : ''}`} type="button" key={collection.id} aria-pressed={member} aria-label={member ? `Remove ${entry.expression} from ${collection.name}` : `Add ${entry.expression} to ${collection.name}`} disabled={!online || changing} aria-describedby={offlineReason} onClick={() => void changeMembership(entry, collection, member)}>{changing ? `${member ? 'Removing' : 'Adding'}…` : collection.name}</button>;
                })}
              </fieldset>}
              <div className="vocabulary-entry-actions">
                <button className="secondary-button" type="button" aria-label={`Edit ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={() => { setShowForm(false); setNotice(''); setDraft(toDraft(entry)); }}>Edit</button>
                <button className="secondary-button" type="button" aria-label={`${entry.suspended ? 'Resume' : 'Suspend'} ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={() => void setSuspended(entry, !entry.suspended)}>{entry.suspended ? 'Resume' : 'Suspend'}</button>
                <button className="secondary-button danger" type="button" aria-label={`Delete ${entry.expression}`} disabled={!online} aria-describedby={offlineReason} onClick={() => void deleteEntry(entry)}>Delete</button>
              </div>
            </>}
            </div>
          </details>
        </article>)}
      </div>
      {selectedEntries.length > 0 && <div className="library-selection" data-ui="bulk-actions" aria-busy={filing}>
        <p className="library-selection-count">{selectionAnnouncement}</p>
        <div className="library-selection-controls">
          <SearchablePicker id="library-file-target" label="Collection to file into" value={fileTargetId} options={fileTargetOptions} onChange={setFileTargetId} emptyMessage="No Collections match" disabled={!online || filing} describedBy={offlineReason} />
          <div className="library-selection-actions">
            <button className="primary-button" type="button" disabled={!online || filing || !fileTarget} aria-describedby={offlineReason} onClick={() => { if (fileTarget) void fileSelectionInto(fileTarget.id, fileTarget.name); }}>File into Collection</button>
            <button className="secondary-button" type="button" ref={fileIntoNewCollectionRef} disabled={!online || filing} aria-describedby={offlineReason} onClick={() => { setFileNotice(''); setFileError(''); setCollectionNotice(''); setCollectionRequest({ kind: 'create-and-file' }); }}>File into new Collection</button>
            <button className="text-button" type="button" disabled={filing} onClick={() => { setFileNotice(''); setFileError(''); lastSelectedIndex.current = null; setSelection({ scope: selectedCollectionId, ids: [] }); }}>Clear selection</button>
          </div>
        </div>
      </div>}
    </section>
  );
}
