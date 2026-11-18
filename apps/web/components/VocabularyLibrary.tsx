'use client';

import type { StudyPair } from '@lexync/domain';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';
import { EMPTY_LIBRARY_SNAPSHOT, invalidateLibrary, loadLibrary, librarySnapshot, revalidateLibrary, setEntrySuspendedInStore, subscribeLibrary, type Collection, type LibraryEntry } from '../lib/libraryStore';
import { normalizeSearchText } from '../lib/searchText';
import { CollectionDialogs, type CollectionDialogRequest } from './CollectionDialogs';
import { SearchablePicker } from './SearchablePicker';
import { VocabularyCaptureDialog } from './VocabularyCaptureDialog';
import { VocabularyEntryDeleteDialog } from './VocabularyEntryDeleteDialog';
import { PROGRESS_STATE_LABELS } from '../lib/vocabularyProgress';
import { ALL_VOCABULARY_SCOPE, LibraryCollectionShelf, NO_COLLECTION_SCOPE } from './LibraryCollectionShelf';
import { LibraryFilterBar, type ProgressFilter, type VocabularyStatus } from './LibraryFilterBar';
import { LibraryScopeBanner, PRACTICE_REASON_ID } from './LibraryScopeBanner';
import { VocabularyEntryCard, membershipChangeKey } from './VocabularyEntryCard';
import { VocabularyEntryEditor, toDraft, type EntryDraft } from './VocabularyEntryEditor';

type LearningLanguage = { id: string; languageTag: string };

export function VocabularyLibrary({ lessonInProgress, onEntriesChanged, language, pairs }: { lessonInProgress: boolean; onEntriesChanged: () => Promise<void>; language: LearningLanguage; pairs: Array<StudyPair & { learningLanguageId: string }> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeLibrary, () => librarySnapshot(language.id), () => EMPTY_LIBRARY_SNAPSHOT);
  const { entries, collections, memberships, minimumEntries } = snapshot;
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [capturedNotice, setCapturedNotice] = useState('');
  const [capturedClipError, setCapturedClipError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<VocabularyStatus>('all');
  const [progress, setProgress] = useState<ProgressFilter>('all');
  const [suspensionNotice, setSuspensionNotice] = useState('');
  const [changingMembership, setChangingMembership] = useState('');
  const [collectionRequest, setCollectionRequest] = useState<CollectionDialogRequest | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<LibraryEntry | null>(null);
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
    return loadLibrary(language.id, pairIds, { force: true });
  }, [language.id, pairIds]);

  useEffect(() => {
    void loadLibrary(language.id, pairIds);
  }, [language.id, pairIds]);

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'visible' && online) void revalidateLibrary(language.id, pairIds);
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [language.id, online, pairIds]);

  useEffect(() => {
    queueMicrotask(() => setSelection({ scope: ALL_VOCABULARY_SCOPE, ids: [] }));
  }, [language.id]);

  useEffect(() => {
    queueMicrotask(() => {
      if (new URLSearchParams(window.location.search).get('add') === '1') {
        setCapturedNotice('');
        setCapturedClipError('');
        setShowForm(true);
        const remaining = new URLSearchParams(window.location.search);
        remaining.delete('add');
        const remainingSearch = remaining.toString();
        window.history.replaceState(null, '', remainingSearch ? `/library?${remainingSearch}` : '/library');
      }
    });
  }, []);

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

  async function deleteEntry(entry: LibraryEntry): Promise<string> {
    setNotice('');
    if (entry.audioClipPath) {
      const { count, error: countError } = await supabase.from('vocabulary_entries').select('id', { count: 'exact', head: true }).eq('learning_vocabulary_entry_id', entry.learningVocabularyEntryId);
      if (countError) return `Vocabulary Entry could not be deleted. ${countError.message}`;
      if ((count ?? 0) <= 1) {
        const { error: clipError } = await supabase.storage.from('vocabulary-audio-clips').remove([entry.audioClipPath]);
        if (clipError) return `Vocabulary Entry could not be deleted. ${clipError.message}`;
      }
    }
    const { error } = await supabase.rpc('delete_vocabulary_entry', { p_vocabulary_entry_id: entry.id });
    if (error) return `Vocabulary Entry could not be deleted. ${error.message}`;
    setDraft(null);
    await reload();
    await onEntriesChanged();
    return '';
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
    if (!suspended && !entry.progressState) await loadLibrary(language.id, pairIds, { force: true });
  }

  async function changeMembership(entry: LibraryEntry, collection: Collection, member: boolean) {
    setChangingMembership(membershipChangeKey(member, collection, entry));
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

  function isMember(entry: LibraryEntry, collection: Collection) {
    return memberships.some((membership) => membership.collection_id === collection.id && membership.learning_vocabulary_entry_id === entry.learningVocabularyEntryId);
  }

  function filedIn(entry: LibraryEntry) {
    return collections.filter((collection) => isMember(entry, collection));
  }

  function notFiledIn(entry: LibraryEntry) {
    return collections.filter((collection) => !isMember(entry, collection));
  }

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
    const matchesProgress = progress === 'all' || (!entry.suspended && entry.progressState === progress);
    const matchesCollection = selectedCollectionId === ALL_VOCABULARY_SCOPE || (selectedCollectionId === NO_COLLECTION_SCOPE ? !collectedEntryIds.has(entry.learningVocabularyEntryId) : selectedCollectionEntryIds.has(entry.learningVocabularyEntryId));
    const haystacks = [entry.expression, ...entry.senses.flatMap((sense) => sense.translations.map((item) => item.text))].map(normalizeSearchText);
    return matchesStatus && matchesProgress && matchesCollection && (!normalizedQuery || haystacks.some((text) => text.includes(normalizedQuery)));
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
  const practiceDescribedBy = lessonInProgress && offlineReason ? `${PRACTICE_REASON_ID} ${offlineReason}` : lessonInProgress ? PRACTICE_REASON_ID : offlineReason;

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
    if (status === 'suspended' && progress !== 'all') return { heading: 'Nothing here right now.', message: 'A suspended Vocabulary Entry carries no Vocabulary Progress State. Resume it to see where it stands.' };
    const described = `${status === 'all' ? '' : `${status} `}${progress === 'all' ? '' : `${PROGRESS_STATE_LABELS[progress].toLowerCase()} `}`;
    const narrowed = status !== 'all' || progress !== 'all';
    if (normalizedQuery) return { heading: 'No match in this library.', message: `No ${described}Vocabulary Entries match “${query.trim()}”.` };
    if (selectedCollection) return narrowed
      ? { heading: 'Nothing here right now.', message: `No ${described}Vocabulary Entries in “${selectedCollection.name}”.` }
      : { heading: 'This Collection is empty.', message: `No vocabulary entries in “${selectedCollection.name}”.` };
    if (selectedCollectionId === NO_COLLECTION_SCOPE) return narrowed
      ? { heading: 'Nothing here right now.', message: `No ${described}Vocabulary Entries outside a Collection.` }
      : { heading: 'Nothing outside your Collections.', message: 'No Vocabulary Entries are outside a Collection.' };
    if (!narrowed && entries.length === 0) return { heading: 'Nothing filed under this language yet.', message: 'No vocabulary entries yet. Add your first one.' };
    return { heading: 'Nothing here right now.', message: `No ${described}Vocabulary Entries yet.` };
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

  return (
    <section className="vocabulary-library" aria-labelledby="app-heading">
      <div className="library-toolbar">
        <p className="page-lede">{entries.length === 0 ? 'Nothing filed yet.' : <>{entries.length} {entries.length === 1 ? 'expression' : 'expressions'}{visibleEntries.length === entries.length ? '' : <> · <strong>{visibleEntries.length} shown</strong></>}</>}</p>
        <div className="library-toolbar-actions">
          <button className="primary-button" type="button" disabled={!online} aria-describedby={offlineReason} onClick={() => { setNotice(''); setCapturedNotice(''); setCapturedClipError(''); setDraft(null); setShowForm(true); }}>Add vocabulary</button>
        </div>
      </div>
      {!online && <p className="form-notice" role="status" id="library-offline-notice">You are offline. Vocabulary and Collection changes require a connection.</p>}

      <LibraryCollectionShelf
        collections={collections}
        entryCount={entries.length}
        unfiledCount={entries.filter((entry) => !collectedEntryIds.has(entry.learningVocabularyEntryId)).length}
        minimumEntries={minimumEntries}
        selectedCollectionId={selectedCollectionId}
        online={online}
        offlineReason={offlineReason}
        newCollectionRef={newCollectionRef}
        onSelect={selectCollectionScope}
        onCreate={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'create' }); }}
      />

      {selectedCollection && <LibraryScopeBanner
        collection={selectedCollection}
        practiceReason={practiceReason}
        practiceDescribedBy={practiceDescribedBy}
        practiceError={practiceError}
        practiceStarting={practiceStarting}
        lessonInProgress={lessonInProgress}
        online={online}
        offlineReason={offlineReason}
        onPractise={() => void practiseCollection(selectedCollection.id)}
        onRename={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'rename', collection: selectedCollection }); }}
        onDelete={() => { setCollectionNotice(''); setCollectionRequest({ kind: 'delete', collection: selectedCollection }); }}
      />}

      <LibraryFilterBar
        query={query}
        status={status}
        progress={progress}
        selecting={selecting}
        filing={filing}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onProgressChange={setProgress}
        onToggleSelecting={toggleSelecting}
      />

      {selectedCollection && <div className="library-entry-add">
        <SearchablePicker id="library-entry-to-add" label="Vocabulary Entry to add" value={entryToAddId} options={addableEntryOptions} onChange={(id) => void addEntryToScopedCollection(id)} emptyMessage="No Vocabulary Entries match" disabled={!online || filing} describedBy={offlineReason} />
      </div>}
      <VocabularyCaptureDialog open={showForm} language={language} onCaptured={async (expression, clipNotice) => { setCapturedNotice(`Saved “${expression}” to your vocabulary.`); setCapturedClipError(clipNotice); await reload(); await onEntriesChanged(); }} onClose={() => setShowForm(false)} />
      {entryToDelete && <VocabularyEntryDeleteDialog entry={entryToDelete} onClose={() => setEntryToDelete(null)} onConfirm={deleteEntry} />}
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
      {capturedClipError && <p className="form-notice error" role="alert">{capturedClipError}</p>}
      {collectionNotice && <p className="form-notice" role="status">{collectionNotice}</p>}
      {fileNotice && <p className="form-notice" role="status">{fileNotice}</p>}
      {fileError && <p className="form-notice error" role="alert">{fileError}</p>}
      {filing && <p className="collections-sr-only" role="status">Filing into your Collection…</p>}
      {notice && !draft && <p className="form-notice error" role="alert">{notice}</p>}
      {snapshot.error && <p className="form-notice error" role="alert">{snapshot.error}</p>}
      <p className="visually-hidden" role="status">{selectionAnnouncement}</p>
      <div className="vocabulary-entry-list" data-selecting={selecting ? 'true' : undefined}>
        {visibleEntries.map((entry, index) => <VocabularyEntryCard
          key={entry.id}
          entry={entry}
          editor={draft?.id === entry.id ? <VocabularyEntryEditor
            entry={entry}
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            notice={notice}
            online={online}
            offlineReason={offlineReason}
            onSubmit={saveDraft}
            onCancel={() => { setDraft(null); setNotice(''); }}
            onClipChanged={() => void reload()}
          /> : null}
          selecting={selecting}
          selected={selectedEntryIds.includes(entry.learningVocabularyEntryId)}
          filing={filing}
          memberCollections={filedIn(entry)}
          otherCollections={notFiledIn(entry)}
          changingMembership={changingMembership}
          online={online}
          offlineReason={offlineReason}
          onSelectClick={(event) => { if (event.shiftKey && selectRange(index, !selectedEntryIds.includes(entry.learningVocabularyEntryId))) event.preventDefault(); }}
          onSelectChange={(selected) => { lastSelectedIndex.current = index; toggleEntrySelected(entry, selected); }}
          onChangeMembership={(collection, member) => void changeMembership(entry, collection, member)}
          onEdit={() => { setShowForm(false); setNotice(''); setDraft(toDraft(entry)); }}
          onToggleSuspended={() => void setSuspended(entry, !entry.suspended)}
          onDelete={() => { setNotice(''); setEntryToDelete(entry); }}
          onClipChanged={() => void reload()}
        />)}
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
