export type VocabularyProgressStates = {
  newCount: number;
  inPracticeCount: number;
  learnedCount: number;
  totalCount: number;
};

export type CollectionProgress = VocabularyProgressStates & { id: string; name: string };

export const VOCABULARY_PROGRESS_STATES = ['new', 'in-practice', 'learned'] as const;

export type VocabularyProgressState = (typeof VOCABULARY_PROGRESS_STATES)[number];

export const VOCABULARY_PROGRESS_RULE = 'A word counts as learned once every one of its meanings has been answered correctly twice in a row. A wrong answer resets that count.';

export const PROGRESS_STATE_LABELS: Record<VocabularyProgressState, string> = {
  'in-practice': 'In practice',
  learned: 'Learned',
  new: 'New',
};

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

const PROGRESS_STATE_BY_CONTRACT: Record<string, VocabularyProgressState> = {
  in_practice: 'in-practice',
  learned: 'learned',
  new: 'new',
};

export function parseVocabularyProgressStates(value: unknown): Map<string, VocabularyProgressState> {
  const rows = isRecord(value) && Array.isArray(value.entries) ? value.entries : [];
  const states = new Map<string, VocabularyProgressState>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.learning_vocabulary_entry_id !== 'string' || typeof row.state !== 'string') continue;
    const state = PROGRESS_STATE_BY_CONTRACT[row.state];
    if (state) states.set(row.learning_vocabulary_entry_id, state);
  }
  return states;
}
