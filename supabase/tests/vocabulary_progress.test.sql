begin;

select plan(13);

select ok(
  to_regprocedure('public.vocabulary_progress(uuid)') is not null,
  'Vocabulary Progress exposes a read contract for one Learning Language'
);

insert into auth.users (id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

set local role postgres;

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('a1000000-0000-0000-0000-000100000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', '2026-09-01T00:00:01Z'),
  ('a1000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fr', '2026-09-01T00:00:02Z'),
  ('a1000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'de', '2026-09-01T00:00:03Z'),
  ('a1000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'it', '2026-09-01T00:00:04Z'),
  ('a1000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pt', '2026-09-01T00:00:05Z'),
  ('a1000000-0000-0000-0000-000600000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nl', '2026-09-01T00:00:06Z'),
  ('a1000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pl', '2026-09-01T00:00:07Z'),
  ('a1000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ja', '2026-09-01T00:00:08Z');

insert into public.study_pairs (id, learner_id, target_language_tag, reference_language_tag, is_primary, learning_language_id)
values
  ('a2000000-0000-0000-0000-000100000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', 'en', true, 'a1000000-0000-0000-0000-000100000001'),
  ('a2000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fr', 'en', true, 'a1000000-0000-0000-0000-000200000001'),
  ('a2000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'de', 'en', true, 'a1000000-0000-0000-0000-000300000001'),
  ('a2000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'it', 'en', true, 'a1000000-0000-0000-0000-000400000001'),
  ('a2000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pt', 'en', true, 'a1000000-0000-0000-0000-000500000001'),
  ('a2000000-0000-0000-0000-000600000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'nl', 'en', true, 'a1000000-0000-0000-0000-000600000001'),
  ('a2000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pl', 'en', true, 'a1000000-0000-0000-0000-000700000001'),
  ('a2000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ja', 'en', true, 'a1000000-0000-0000-0000-000800000001'),
  ('a2000000-0000-0000-0000-000800000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ja', 'uk', false, 'a1000000-0000-0000-0000-000800000001');

insert into public.learning_vocabulary_entries (id, learner_id, learning_language_id, expression, suspended, created_at)
values
  ('a3000000-0000-0000-0000-000100000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000100000001', 'casa', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000200000001', 'libro', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000300000001', 'mesa', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000400000001', 'perro', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000500000001', 'banco', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000600000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000600000001', 'vacio', false, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000700000001', 'suspendido', true, '2026-09-01T01:00:01Z'),
  ('a3000000-0000-0000-0000-000700000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000700000001', 'nuevo', false, '2026-09-01T01:00:02Z'),
  ('a3000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000800000001', 'yama', false, '2026-09-01T01:00:01Z');

insert into public.vocabulary_entries (
  id, learner_id, study_pair_id, expression, created_at, learning_language_id, learning_vocabulary_entry_id, suspended
)
values
  ('a4000000-0000-0000-0000-000100000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000100000001', 'casa', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000100000001', 'a3000000-0000-0000-0000-000100000001', false),
  ('a4000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000200000001', 'libro', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000200000001', 'a3000000-0000-0000-0000-000200000001', false),
  ('a4000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000300000001', 'mesa', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000300000001', 'a3000000-0000-0000-0000-000300000001', false),
  ('a4000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000400000001', 'perro', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000400000001', 'a3000000-0000-0000-0000-000400000001', false),
  ('a4000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000500000001', 'banco', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000500000001', 'a3000000-0000-0000-0000-000500000001', false),
  ('a4000000-0000-0000-0000-000600000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000600000001', 'vacio', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000600000001', 'a3000000-0000-0000-0000-000600000001', false),
  ('a4000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000700000001', 'suspendido', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000700000001', 'a3000000-0000-0000-0000-000700000001', true),
  ('a4000000-0000-0000-0000-000700000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000700000001', 'nuevo', '2026-09-01T02:00:02Z', 'a1000000-0000-0000-0000-000700000001', 'a3000000-0000-0000-0000-000700000002', false),
  ('a4000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000800000001', 'yama', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000800000001', 'a3000000-0000-0000-0000-000800000001', false),
  ('a4000000-0000-0000-0000-000800000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2000000-0000-0000-0000-000800000002', 'yama', '2026-09-01T02:00:02Z', 'a1000000-0000-0000-0000-000800000001', 'a3000000-0000-0000-0000-000800000001', false);

insert into public.senses (id, learner_id, vocabulary_entry_id, created_at)
values
  ('a5000000-0000-0000-0000-000100000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000100000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000200000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000200000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000300000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000300000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000400000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000400000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000500000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000500000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000500000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000500000001', '2026-09-01T03:00:02Z'),
  ('a5000000-0000-0000-0000-000700000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000700000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000700000021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000700000002', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000800000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000800000001', '2026-09-01T03:00:01Z'),
  ('a5000000-0000-0000-0000-000800000021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4000000-0000-0000-0000-000800000002', '2026-09-01T03:00:02Z');

insert into public.translations (id, learner_id, sense_id, text, answer_language_tag, created_at)
values
  ('a6000000-0000-0000-0000-000100000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000100000011', 'casa-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000200000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000200000011', 'libro-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000300000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000300000011', 'mesa-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000400000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 'perro-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000500000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000011', 'banco-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000500000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000012', 'banco-en', 'en', '2026-09-01T04:00:02Z'),
  ('a6000000-0000-0000-0000-000700000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000011', 'suspendido-en', 'en', '2026-09-01T04:00:01Z'),
  ('a6000000-0000-0000-0000-000700000021', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000021', 'nuevo-en', 'en', '2026-09-01T04:00:01Z');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values
  ('a7000000-0000-0000-0000-000100000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000100000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000200000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000300000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000400000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000500000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000600000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000600000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000700000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0),
  ('a7000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000800000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 0);

insert into public.lesson_questions (
  id, lesson_id, learner_id, sense_id, ordinal, prompt, question_type, direction, answer_language_tag,
  choices, choice_sense_ids, selected_answer, correct_answer, is_correct, answered_at
)
values
  ('a8000000-0000-0000-0000-000200000001', 'a7000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000200000011', 1, 'libro', 'translation', 'recognition', 'en', array['libro-en', 'otro'], null, 'libro-en', 'libro-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000300000001', 'a7000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000300000011', 1, 'mesa', 'translation', 'recognition', 'en', array['mesa-en', 'otro'], null, 'mesa-en', 'mesa-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000300000002', 'a7000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000300000011', 2, 'mesa', 'translation', 'recognition', 'en', array['mesa-en', 'otro'], null, 'mesa-en', 'mesa-en', true, '2026-09-20T10:02:00Z'),
  ('a8000000-0000-0000-0000-000400000001', 'a7000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 1, 'perro', 'translation', 'recognition', 'en', array['perro-en', 'otro'], null, 'perro-en', 'perro-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000400000002', 'a7000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 2, 'perro', 'translation', 'recognition', 'en', array['perro-en', 'otro'], null, 'perro-en', 'perro-en', true, '2026-09-20T10:02:00Z'),
  ('a8000000-0000-0000-0000-000400000003', 'a7000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 3, 'perro', 'translation', 'recognition', 'en', array['perro-en', 'otro'], null, 'wrong', 'perro-en', false, '2026-09-20T10:03:00Z'),
  ('a8000000-0000-0000-0000-000500000001', 'a7000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000011', 1, 'banco', 'translation', 'recognition', 'en', array['banco-en', 'otro'], null, 'banco-en', 'banco-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000500000002', 'a7000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000011', 2, 'banco', 'translation', 'recognition', 'en', array['banco-en', 'otro'], null, 'banco-en', 'banco-en', true, '2026-09-20T10:02:00Z'),
  ('a8000000-0000-0000-0000-000500000003', 'a7000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000012', 3, 'banco', 'translation', 'recognition', 'en', array['banco-en', 'otro'], null, 'banco-en', 'banco-en', true, '2026-09-20T10:03:00Z'),
  ('a8000000-0000-0000-0000-000700000001', 'a7000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000011', 1, 'suspendido', 'translation', 'recognition', 'en', array['suspendido-en', 'otro'], null, 'suspendido-en', 'suspendido-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000700000002', 'a7000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000011', 2, 'suspendido', 'translation', 'recognition', 'en', array['suspendido-en', 'otro'], null, 'suspendido-en', 'suspendido-en', true, '2026-09-20T10:02:00Z'),
  ('a8000000-0000-0000-0000-000800000001', 'a7000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000011', 1, 'yama', 'translation', 'recognition', 'en', array['yama-en', 'otro'], null, 'yama-en', 'yama-en', true, '2026-09-20T10:01:00Z'),
  ('a8000000-0000-0000-0000-000800000002', 'a7000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000011', 2, 'yama', 'translation', 'recognition', 'en', array['yama-en', 'otro'], null, 'yama-en', 'yama-en', true, '2026-09-20T10:02:00Z'),
  ('a8000000-0000-0000-0000-000800000003', 'a7000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000021', 3, 'yama', 'translation', 'recognition', 'en', array['yama-en', 'otro'], null, 'yama-en', 'yama-en', true, '2026-09-20T10:03:00Z');

insert into public.lesson_attempts (
  id, lesson_id, question_id, learner_id, sense_id, question_type, direction, selected_answer, correct_answer, is_correct, answered_at
)
values
  ('a9000000-0000-0000-0000-000200000001', 'a7000000-0000-0000-0000-000200000001', 'a8000000-0000-0000-0000-000200000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000200000011', 'translation', 'recognition', 'libro-en', 'libro-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000300000001', 'a7000000-0000-0000-0000-000300000001', 'a8000000-0000-0000-0000-000300000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000300000011', 'translation', 'recognition', 'mesa-en', 'mesa-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000300000002', 'a7000000-0000-0000-0000-000300000001', 'a8000000-0000-0000-0000-000300000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000300000011', 'translation', 'recognition', 'mesa-en', 'mesa-en', true, '2026-09-20T10:02:00Z'),
  ('a9000000-0000-0000-0000-000400000001', 'a7000000-0000-0000-0000-000400000001', 'a8000000-0000-0000-0000-000400000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 'translation', 'recognition', 'perro-en', 'perro-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000400000002', 'a7000000-0000-0000-0000-000400000001', 'a8000000-0000-0000-0000-000400000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 'translation', 'recognition', 'perro-en', 'perro-en', true, '2026-09-20T10:02:00Z'),
  ('a9000000-0000-0000-0000-000400000003', 'a7000000-0000-0000-0000-000400000001', 'a8000000-0000-0000-0000-000400000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000400000011', 'translation', 'recognition', 'wrong', 'perro-en', false, '2026-09-20T10:03:00Z'),
  ('a9000000-0000-0000-0000-000500000001', 'a7000000-0000-0000-0000-000500000001', 'a8000000-0000-0000-0000-000500000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000011', 'translation', 'recognition', 'banco-en', 'banco-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000500000002', 'a7000000-0000-0000-0000-000500000001', 'a8000000-0000-0000-0000-000500000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000011', 'translation', 'recognition', 'banco-en', 'banco-en', true, '2026-09-20T10:02:00Z'),
  ('a9000000-0000-0000-0000-000500000003', 'a7000000-0000-0000-0000-000500000001', 'a8000000-0000-0000-0000-000500000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000500000012', 'translation', 'recognition', 'banco-en', 'banco-en', true, '2026-09-20T10:03:00Z'),
  ('a9000000-0000-0000-0000-000700000001', 'a7000000-0000-0000-0000-000700000001', 'a8000000-0000-0000-0000-000700000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000011', 'translation', 'recognition', 'suspendido-en', 'suspendido-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000700000002', 'a7000000-0000-0000-0000-000700000001', 'a8000000-0000-0000-0000-000700000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000700000011', 'translation', 'recognition', 'suspendido-en', 'suspendido-en', true, '2026-09-20T10:02:00Z'),
  ('a9000000-0000-0000-0000-000800000001', 'a7000000-0000-0000-0000-000800000001', 'a8000000-0000-0000-0000-000800000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000011', 'translation', 'recognition', 'yama-en', 'yama-en', true, '2026-09-20T10:01:00Z'),
  ('a9000000-0000-0000-0000-000800000002', 'a7000000-0000-0000-0000-000800000001', 'a8000000-0000-0000-0000-000800000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000011', 'translation', 'recognition', 'yama-en', 'yama-en', true, '2026-09-20T10:02:00Z'),
  ('a9000000-0000-0000-0000-000800000003', 'a7000000-0000-0000-0000-000800000001', 'a8000000-0000-0000-0000-000800000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a5000000-0000-0000-0000-000800000021', 'translation', 'recognition', 'yama-en', 'yama-en', true, '2026-09-20T10:03:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000100000001') - 'total_count'),
  '{"new_count": 1, "in_practice_count": 0, "learned_count": 0}'::jsonb,
  'a Vocabulary Entry that has never been attempted counts as new'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000200000001') - 'total_count'),
  '{"new_count": 0, "in_practice_count": 1, "learned_count": 0}'::jsonb,
  'a Sense with one correct Lesson Attempt is in practice rather than learned'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000300000001') - 'total_count'),
  '{"new_count": 0, "in_practice_count": 0, "learned_count": 1}'::jsonb,
  'a Sense counts as learned after two correct Lesson Attempts in a row'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000400000001') - 'total_count'),
  '{"new_count": 0, "in_practice_count": 1, "learned_count": 0}'::jsonb,
  'a Sense that was learned returns to in practice once a later Lesson Attempt is incorrect'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000500000001') - 'total_count'),
  '{"new_count": 0, "in_practice_count": 1, "learned_count": 0}'::jsonb,
  'a Vocabulary Entry with one learned Sense and one unlearned Sense is not yet learned'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000600000001') - 'total_count'),
  '{"new_count": 1, "in_practice_count": 0, "learned_count": 0}'::jsonb,
  'a Vocabulary Entry with no Sense is never learned'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000700000001') - 'total_count'),
  '{"new_count": 1, "in_practice_count": 0, "learned_count": 0}'::jsonb,
  'a suspended Vocabulary Entry is counted by no state, so only the unsuspended Entry remains'
);
select is(
  (select (public.vocabulary_progress('a1000000-0000-0000-0000-000700000001')->>'total_count')::integer),
  1,
  'a suspended Vocabulary Entry lowers the total alongside the state counts'
);

select is(
  (select count(*)::integer
   from (
     select public.vocabulary_progress(learning_languages.id) as progress
     from public.learning_languages
     where learning_languages.learner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   ) as languages
   where (progress->>'new_count')::integer
     + (progress->>'in_practice_count')::integer
     + (progress->>'learned_count')::integer
     <> coalesce((progress->>'total_count')::integer, -1)),
  0,
  'the three Vocabulary Progress States sum to the total in every Learning Language'
);

select is(
  (select public.vocabulary_progress('a1000000-0000-0000-0000-000800000001') - 'total_count'),
  '{"new_count": 0, "in_practice_count": 1, "learned_count": 0}'::jsonb,
  'one Expression captured under two Answer Languages is a single Vocabulary Entry whose Senses are judged together'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select throws_ok(
  $$select public.vocabulary_progress('a1000000-0000-0000-0000-000100000001')$$,
  'P0001',
  'Learning Language is unavailable.',
  'a Learning Language that does not belong to the Learner is unavailable'
);

set local role anon;
select throws_ok(
  $$select public.vocabulary_progress('a1000000-0000-0000-0000-000100000001')$$,
  '42501',
  'permission denied for function vocabulary_progress',
  'anonymous clients cannot read Vocabulary Progress'
);

select * from finish();
rollback;
