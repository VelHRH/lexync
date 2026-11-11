import type { SupabaseClient } from '@supabase/supabase-js';

export type CapturedEntry = { senseId: string; vocabularyEntryId: string };
export type ProgressState = 'new' | 'in_practice' | 'learned';
export type StateTally = { new: number; inPractice: number; learned: number };

export const LEARNED_PRACTICE_STREAK = 2;

export const PROGRESS_STATE_COPY: Record<ProgressState, string> = {
  in_practice: 'In practice',
  learned: 'Learned',
  new: 'New',
};

export const defaultVocabulary = [
  ['casa', 'house'],
  ['perro', 'dog'],
  ['nube', 'cloud'],
  ['libro', 'book'],
  ['mesa', 'table'],
  ['puerta', 'door'],
  ['agua', 'water'],
  ['camino', 'road'],
  ['ventana', 'window'],
  ['llave', 'key'],
] as const;

export async function captureEntry(client: SupabaseClient, learningLanguageId: string, expression: string, translation: string) {
  const { data, error } = await client.rpc('capture_learning_language_entry', {
    p_answer_language_tag: 'en',
    p_create_new_sense: false,
    p_example: null,
    p_expression: expression,
    p_learning_language_id: learningLanguageId,
    p_sense_id: null,
    p_translation: translation,
  });
  if (error) throw error;
  return data as CapturedEntry;
}

export async function seedEntries(
  client: SupabaseClient,
  learningLanguageId: string,
  entries: ReadonlyArray<readonly [string, string]> = defaultVocabulary,
) {
  const captured: CapturedEntry[] = [];
  for (const [expression, translation] of entries) captured.push(await captureEntry(client, learningLanguageId, expression, translation));
  return captured;
}

export async function seedCollection(client: SupabaseClient, learningLanguageId: string, name: string) {
  const { data, error } = await client.rpc('create_collection', { p_learning_language_id: learningLanguageId, p_name: name });
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function fileEntry(client: SupabaseClient, collectionId: string, learningVocabularyEntryId: string) {
  const { error } = await client.rpc('add_collection_membership', { p_collection_id: collectionId, p_learning_vocabulary_entry_id: learningVocabularyEntryId });
  if (error) throw error;
}

export async function suspendEntry(client: SupabaseClient, learningVocabularyEntryId: string, suspended = true) {
  const { data, error } = await client.from('vocabulary_entries').select('id').eq('learning_vocabulary_entry_id', learningVocabularyEntryId);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const { error: suspensionError } = await client.rpc('set_vocabulary_entry_suspended', { p_suspended: suspended, p_vocabulary_entry_id: row.id });
    if (suspensionError) throw suspensionError;
  }
}

export async function practiseCollection(
  client: SupabaseClient,
  learningLanguageId: string,
  collectionId: string,
  questionLimit = Number.POSITIVE_INFINITY,
) {
  const { data: lesson, error } = await client.rpc('start_or_resume_vocabulary_lesson', { p_collection_id: collectionId, p_learning_language_id: learningLanguageId });
  if (error) throw error;
  const lessonId = (lesson as { id: string }).id;
  const { data: questions, error: questionError } = await client.from('lesson_questions').select('id,correct_answer').eq('lesson_id', lessonId).order('ordinal');
  if (questionError) throw questionError;
  for (const question of ((questions ?? []) as Array<{ id: string; correct_answer: string }>).slice(0, questionLimit)) {
    const { error: submitError } = await client.rpc('submit_lesson_answer', { p_lesson_id: lessonId, p_question_id: question.id, p_selected_choice: question.correct_answer });
    if (submitError) throw submitError;
    const { error: continueError } = await client.rpc('continue_lesson_question', { p_lesson_id: lessonId, p_question_id: question.id });
    if (continueError) throw continueError;
  }
}

export async function practiceStreaks(client: SupabaseClient) {
  const { data, error } = await client.from('lesson_attempts').select('sense_id,is_correct').order('answered_at');
  if (error) throw error;
  const streaks = new Map<string, number>();
  for (const attempt of (data ?? []) as Array<{ sense_id: string | null; is_correct: boolean }>) {
    if (!attempt.sense_id) continue;
    streaks.set(attempt.sense_id, attempt.is_correct ? (streaks.get(attempt.sense_id) ?? 0) + 1 : 0);
  }
  return streaks;
}

export function stateOf(entry: CapturedEntry, streaks: Map<string, number>): ProgressState {
  const streak = streaks.get(entry.senseId);
  if (streak === undefined) return 'new';
  return streak >= LEARNED_PRACTICE_STREAK ? 'learned' : 'in_practice';
}

export function statesOf(entries: readonly CapturedEntry[], streaks: Map<string, number>): StateTally {
  const states = entries.map((entry) => stateOf(entry, streaks));
  return {
    inPractice: states.filter((state) => state === 'in_practice').length,
    learned: states.filter((state) => state === 'learned').length,
    new: states.filter((state) => state === 'new').length,
  };
}
