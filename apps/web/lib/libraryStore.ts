'use client';

import type { Translation } from '../components/VocabularyCaptureDialog';
import { normalizeSearchText } from './searchText';
import { supabase } from './supabase';

export type Example = { id: string; text: string };
export type Sense = { id: string; translations: Translation[]; examples: Example[] };
export type LibraryEntry = { id: string; learningVocabularyEntryId: string; expression: string; senses: Sense[]; suspended: boolean };
export type Collection = { id: string; name: string };
export type Membership = { collection_id: string; learning_vocabulary_entry_id: string };

export type LibrarySnapshot = {
  entries: LibraryEntry[];
  collections: Collection[];
  memberships: Membership[];
  loadedAt: number | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
};

export const LIBRARY_STALE_AFTER_MS = 60_000;

export const EMPTY_LIBRARY_SNAPSHOT: LibrarySnapshot = Object.freeze({
  entries: [],
  collections: [],
  memberships: [],
  loadedAt: null,
  loading: false,
  refreshing: false,
  error: '',
});

type InternalSnapshot = LibrarySnapshot & { pairIdsKey: string };

const library = new Map<string, InternalSnapshot>();
const listeners = new Set<() => void>();
const inflight = new Map<string, { key: string; promise: Promise<void> }>();
const versions = new Map<string, number>();

function notifyLibrary() {
  for (const listener of listeners) listener();
}

function setSnapshot(languageId: string, snapshot: InternalSnapshot) {
  library.set(languageId, snapshot);
  notifyLibrary();
}

export function subscribeLibrary(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function librarySnapshot(languageId: string): LibrarySnapshot {
  return library.get(languageId) ?? EMPTY_LIBRARY_SNAPSHOT;
}

export function invalidateLibrary(languageId: string) {
  const current = library.get(languageId);
  if (!current) return;
  setSnapshot(languageId, { ...current, loadedAt: 0 });
}

export function setEntrySuspendedInStore(languageId: string, entryId: string, suspended: boolean) {
  const current = library.get(languageId);
  if (!current) return;
  setSnapshot(languageId, { ...current, entries: current.entries.map((entry) => entry.id === entryId ? { ...entry, suspended } : entry) });
}

export function clearLibraryStore() {
  library.clear();
  inflight.clear();
  versions.clear();
  notifyLibrary();
}

function pairIdsKey(pairIds: string[]) {
  return [...pairIds].sort().join(',');
}

async function fetchEntries(pairIds: string[]): Promise<{ entries: LibraryEntry[] } | { error: string }> {
  if (!pairIds.length) return { entries: [] };
  const { data, error } = await supabase.from('vocabulary_entries').select('id,learning_vocabulary_entry_id,expression,suspended,study_pair_id').in('study_pair_id', pairIds).order('created_at');
  if (error) return { error: error.message };
  const entryIds = (data ?? []).map((entry) => entry.id);
  const { data: senses, error: sensesError } = entryIds.length
    ? await supabase.from('senses').select('id,vocabulary_entry_id').in('vocabulary_entry_id', entryIds).order('created_at')
    : { data: [], error: null };
  if (sensesError) return { error: sensesError.message };
  const senseIds = (senses ?? []).map((sense) => sense.id);
  const [{ data: translations, error: translationsError }, { data: examples, error: examplesError }] = senseIds.length
    ? await Promise.all([
      supabase.from('translations').select('id,sense_id,text,answer_language_tag').in('sense_id', senseIds).order('created_at'),
      supabase.from('examples').select('id,sense_id,text').in('sense_id', senseIds).order('created_at'),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (translationsError || examplesError) return { error: translationsError?.message ?? examplesError?.message ?? 'Vocabulary details could not be loaded.' };
  const merged = new Map<string, LibraryEntry>();
  for (const entry of data ?? []) {
    const key = normalizeSearchText(entry.expression);
    const nextSenses = (senses ?? []).filter((sense) => sense.vocabulary_entry_id === entry.id).map((sense) => ({
      id: sense.id,
      translations: (translations ?? []).filter((item) => item.sense_id === sense.id),
      examples: (examples ?? []).filter((item) => item.sense_id === sense.id),
    }));
    const existing = merged.get(key);
    if (existing) {
      existing.senses = [...existing.senses, ...nextSenses];
      existing.suspended = existing.suspended && entry.suspended;
    } else {
      merged.set(key, { id: entry.id, learningVocabularyEntryId: entry.learning_vocabulary_entry_id, expression: entry.expression.trim(), suspended: entry.suspended, senses: nextSenses });
    }
  }
  return { entries: [...merged.values()] };
}

async function fetchCollections(languageId: string): Promise<{ collections: Collection[]; memberships: Membership[] } | { error: string }> {
  const { data: collectionData, error: collectionError } = await supabase.from('collections').select('id,name').eq('learning_language_id', languageId).order('created_at');
  if (collectionError) return { error: collectionError.message };
  const nextCollections = (collectionData ?? []) as Collection[];
  const collectionIds = nextCollections.map((collection) => collection.id);
  const { data: membershipData, error: membershipError } = collectionIds.length
    ? await supabase.from('collection_memberships').select('collection_id,learning_vocabulary_entry_id').in('collection_id', collectionIds)
    : { data: [], error: null };
  if (membershipError) return { error: membershipError.message };
  return { collections: nextCollections, memberships: (membershipData ?? []) as Membership[] };
}

function commitError(languageId: string, version: number, message: string) {
  if (versions.get(languageId) !== version) return;
  const current = library.get(languageId) ?? { ...EMPTY_LIBRARY_SNAPSHOT, pairIdsKey: '' };
  setSnapshot(languageId, { ...current, loading: false, refreshing: false, error: message });
}

function commitSuccess(languageId: string, version: number, key: string, entries: LibraryEntry[], collections: Collection[], memberships: Membership[]) {
  if (versions.get(languageId) !== version) return;
  setSnapshot(languageId, { entries, collections, memberships, loadedAt: Date.now(), loading: false, refreshing: false, error: '', pairIdsKey: key });
}

async function fetchLibrary(languageId: string, pairIds: string[], key: string, version: number) {
  const entriesResult = await fetchEntries(pairIds);
  if ('error' in entriesResult) {
    commitError(languageId, version, entriesResult.error);
    return;
  }
  const collectionsResult = await fetchCollections(languageId);
  if ('error' in collectionsResult) {
    commitError(languageId, version, collectionsResult.error);
    return;
  }
  commitSuccess(languageId, version, key, entriesResult.entries, collectionsResult.collections, collectionsResult.memberships);
}

export async function loadLibrary(languageId: string, pairIds: string[], options: { force?: boolean } = {}): Promise<void> {
  const force = options.force ?? false;
  const key = pairIdsKey(pairIds);
  const current = library.get(languageId);
  const hasCommittedData = Boolean(current) && current!.loadedAt !== null;
  const matchesCommittedPairIds = !pairIds.length || current?.pairIdsKey === key;
  const isFresh = hasCommittedData && matchesCommittedPairIds && Date.now() - current!.loadedAt! < LIBRARY_STALE_AFTER_MS;
  if (!force && isFresh) return;
  const existingLoad = inflight.get(languageId);
  if (!force && existingLoad && existingLoad.key === key) return existingLoad.promise;
  const version = (versions.get(languageId) ?? 0) + 1;
  versions.set(languageId, version);
  const base: InternalSnapshot = current ?? { ...EMPTY_LIBRARY_SNAPSHOT, pairIdsKey: '' };
  setSnapshot(languageId, { ...base, loading: base.loadedAt === null, refreshing: base.loadedAt !== null, error: '' });
  const promise = fetchLibrary(languageId, pairIds, key, version);
  inflight.set(languageId, { key, promise });
  try {
    await promise;
  } finally {
    const stored = inflight.get(languageId);
    if (stored && stored.promise === promise) inflight.delete(languageId);
  }
}
