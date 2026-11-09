export type VocabularyProgressStates = {
  newCount: number;
  inPracticeCount: number;
  learnedCount: number;
  totalCount: number;
};

export type CollectionProgress = VocabularyProgressStates & { id: string; name: string };

export type VocabularyProgress = VocabularyProgressStates & { collections: CollectionProgress[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStates(record: Record<string, unknown>): VocabularyProgressStates | null {
  const newCount = Number(record.new_count);
  const inPracticeCount = Number(record.in_practice_count);
  const learnedCount = Number(record.learned_count);
  const totalCount = Number(record.total_count);
  if (![newCount, inPracticeCount, learnedCount, totalCount].every((count) => Number.isFinite(count))) return null;
  return { inPracticeCount, learnedCount, newCount, totalCount };
}

function parseCollection(value: unknown): CollectionProgress | null {
  if (!isRecord(value)) return null;
  const states = parseStates(value);
  if (!states || typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  return { ...states, id: value.id, name: value.name };
}

export function parseVocabularyProgress(value: unknown): VocabularyProgress | null {
  if (!isRecord(value)) return null;
  const states = parseStates(value);
  if (!states) return null;
  const collections = (Array.isArray(value.collections) ? value.collections : [])
    .map(parseCollection)
    .filter((collection): collection is CollectionProgress => Boolean(collection));
  return { ...states, collections };
}

export function learnedHeadline(progress: VocabularyProgressStates): string {
  return `${progress.learnedCount} of ${progress.totalCount} learned`;
}
