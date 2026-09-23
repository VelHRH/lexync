begin;

select plan(39);

select ok(
  to_regprocedure('public.review_history(uuid)') is not null,
  'Review history exposes the selected Learning Language RPC'
);

insert into auth.users (id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

set local role postgres;

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', '2026-09-01T00:00:00Z'),
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fr', '2026-09-01T00:00:01Z'),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'es', '2026-09-01T00:00:00Z');

insert into public.study_pairs (id, learner_id, target_language_tag, reference_language_tag, is_primary, learning_language_id)
values
  ('a1100000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', 'en', true, 'a1000000-0000-0000-0000-000000000001'),
  ('a1100000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fr', 'en', true, 'a1000000-0000-0000-0000-000000000002'),
  ('b1100000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'es', 'en', true, 'b1000000-0000-0000-0000-000000000001');

insert into public.learning_vocabulary_entries (id, learner_id, learning_language_id, expression, suspended, created_at)
values
  ('a1200000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'casa', false, '2026-09-01T01:00:00Z'),
  ('a1200000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'libro', false, '2026-09-01T01:00:01Z'),
  ('a1200000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'mesa', false, '2026-09-01T01:00:02Z'),
  ('a1200000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'perro', false, '2026-09-01T01:00:03Z'),
  ('a1200000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000002', 'chat', false, '2026-09-01T01:00:04Z'),
  ('b1200000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'casa', false, '2026-09-01T01:00:00Z');

insert into public.vocabulary_entries (
  id, learner_id, study_pair_id, expression, created_at, learning_language_id, learning_vocabulary_entry_id, suspended
)
values
  ('a1300000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1100000-0000-0000-0000-000000000001', 'casa', '2026-09-01T02:00:00Z', 'a1000000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000001', false),
  ('a1300000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1100000-0000-0000-0000-000000000001', 'libro', '2026-09-01T02:00:01Z', 'a1000000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000002', false),
  ('a1300000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1100000-0000-0000-0000-000000000001', 'mesa', '2026-09-01T02:00:02Z', 'a1000000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000003', false),
  ('a1300000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1100000-0000-0000-0000-000000000001', 'perro', '2026-09-01T02:00:03Z', 'a1000000-0000-0000-0000-000000000001', 'a1200000-0000-0000-0000-000000000004', false),
  ('a1300000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1100000-0000-0000-0000-000000000002', 'chat', '2026-09-01T02:00:04Z', 'a1000000-0000-0000-0000-000000000002', 'a1200000-0000-0000-0000-000000000005', false),
  ('b1300000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1100000-0000-0000-0000-000000000001', 'casa', '2026-09-01T02:00:00Z', 'b1000000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', false);

insert into public.senses (id, learner_id, vocabulary_entry_id, created_at)
values
  ('a1400000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1300000-0000-0000-0000-000000000001', '2026-09-01T03:00:00Z'),
  ('a1400000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1300000-0000-0000-0000-000000000002', '2026-09-01T03:00:01Z'),
  ('a1400000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1300000-0000-0000-0000-000000000003', '2026-09-01T03:00:02Z'),
  ('a1400000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1300000-0000-0000-0000-000000000004', '2026-09-01T03:00:03Z'),
  ('a1400000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1300000-0000-0000-0000-000000000005', '2026-09-01T03:00:04Z'),
  ('b1400000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1300000-0000-0000-0000-000000000001', '2026-09-01T03:00:00Z');

insert into public.translations (id, learner_id, sense_id, text, answer_language_tag, created_at)
values
  ('a1500000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 'house', 'en', '2026-09-01T04:00:00Z'),
  ('a1500000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000002', 'book', 'en', '2026-09-01T04:00:01Z'),
  ('a1500000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000003', 'table', 'en', '2026-09-01T04:00:02Z'),
  ('a1500000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000004', 'dog', 'en', '2026-09-01T04:00:03Z'),
  ('a1500000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000005', 'cat', 'en', '2026-09-01T04:00:04Z'),
  ('b1500000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1400000-0000-0000-0000-000000000001', 'house', 'en', '2026-09-01T04:00:00Z');

insert into public.examples (id, learner_id, sense_id, text, created_at)
values
  ('a1600000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 'La casa es azul.', '2026-09-01T05:00:00Z'),
  ('a1600000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000002', 'Leo un libro.', '2026-09-01T05:00:01Z'),
  ('a1600000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000003', 'La mesa es grande.', '2026-09-01T05:00:02Z');

insert into public.review_participations (id, learner_id, card_id, occurred_at)
values
  ('a1700000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from public.cards where sense_id = 'a1400000-0000-0000-0000-000000000001' and direction = 'recognition'), '2026-09-19T08:00:00Z'),
  ('a1700000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from public.cards where sense_id = 'a1400000-0000-0000-0000-000000000003' and direction = 'recognition'), '2026-09-21T08:00:00Z');

insert into public.review_sessions (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values
  ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'completed', '2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', 0, 1),
  ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'completed', '2026-09-22T09:00:00Z', '2026-09-22T10:00:00Z', 2, 3),
  ('a2000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'completed', '2026-09-23T09:00:00Z', '2026-09-23T10:00:00Z', 0, 1),
  ('a2000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'active', '2026-09-23T11:00:00Z', null, 0, 1),
  ('a2000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000002', 'completed', '2026-09-21T09:00:00Z', '2026-09-21T10:00:00Z', 1, 1),
  ('b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'completed', '2026-09-22T09:00:00Z', '2026-09-22T10:00:00Z', 1, 1);

insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction, answer_language_tag,
  choices, choice_sense_ids, choice_vocabulary_entry_ids, selected_answer, correct_answer, is_correct, answered_at
)
values
  ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 1, 'casa', 'translation', 'recognition', 'en', array['house', 'table'], array['a1400000-0000-0000-0000-000000000001'::uuid, 'a1400000-0000-0000-0000-000000000003'::uuid], null, 'wrong', 'house', false, '2026-09-20T10:00:00Z'),
  ('a2100000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 1, 'casa', 'translation', 'recognition', 'en', array['house', 'table'], array['a1400000-0000-0000-0000-000000000001'::uuid, 'a1400000-0000-0000-0000-000000000003'::uuid], null, 'house', 'house', true, '2026-09-22T10:00:00Z'),
  ('a2100000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000002', 2, 'Leo un _____.', 'cloze', null, null, array['libro', 'mesa'], null, array['a1300000-0000-0000-0000-000000000002'::uuid, 'a1300000-0000-0000-0000-000000000003'::uuid], 'mesa', 'libro', false, '2026-09-22T10:01:00Z'),
  ('a2100000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000003', 3, 'La mesa es grande.', 'translation', 'recall', 'en', array['table', 'house'], array['a1400000-0000-0000-0000-000000000003'::uuid, 'a1400000-0000-0000-0000-000000000001'::uuid], null, 'table', 'table', true, '2026-09-22T10:02:00Z'),
  ('a2100000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000004', 1, 'perro', 'translation', 'recognition', 'en', array['dog', 'house'], array['a1400000-0000-0000-0000-000000000004'::uuid, 'a1400000-0000-0000-0000-000000000001'::uuid], null, 'wrong', 'dog', false, '2026-09-23T10:00:00Z'),
  ('a2100000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 1, 'casa', 'translation', 'recognition', 'en', array['house', 'table'], array['a1400000-0000-0000-0000-000000000001'::uuid, 'a1400000-0000-0000-0000-000000000003'::uuid], null, null, 'house', null, null),
  ('a2100000-0000-0000-0000-000000000007', 'a2000000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000005', 1, 'chat', 'translation', 'recognition', 'en', array['cat', 'house'], array['a1400000-0000-0000-0000-000000000005'::uuid, 'a1400000-0000-0000-0000-000000000001'::uuid], null, 'cat', 'cat', true, '2026-09-21T10:00:00Z'),
  ('b2100000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1400000-0000-0000-0000-000000000001', 1, 'casa', 'translation', 'recognition', 'en', array['house', 'book'], null, null, 'house', 'house', true, '2026-09-22T10:00:00Z');

insert into public.review_attempts (
  id, session_id, question_id, learner_id, sense_id, question_type, direction, selected_answer, correct_answer, is_correct, answered_at
)
values
  ('a2200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a2100000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 'translation', 'recognition', 'wrong', 'house', false, '2026-09-20T10:00:00Z'),
  ('a2200000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000001', 'translation', 'recognition', 'house', 'house', true, '2026-09-22T10:00:00Z'),
  ('a2200000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000002', 'cloze', null, 'mesa', 'libro', false, '2026-09-22T10:01:00Z'),
  ('a2200000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000002', 'a2100000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000003', 'translation', 'recall', 'table', 'table', true, '2026-09-22T10:02:00Z'),
  ('a2200000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000004', 'translation', 'recognition', 'wrong', 'dog', false, '2026-09-23T10:00:00Z'),
  ('a2200000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000005', 'a2100000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1400000-0000-0000-0000-000000000005', 'translation', 'recognition', 'cat', 'cat', true, '2026-09-21T10:00:00Z'),
  ('b2200000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1400000-0000-0000-0000-000000000001', 'translation', 'recognition', 'house', 'house', true, '2026-09-22T10:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
select set_config('test.es', 'a1000000-0000-0000-0000-000000000001', true);
select set_config('test.fr', 'a1000000-0000-0000-0000-000000000002', true);
select set_config('test.new_session', 'a2000000-0000-0000-0000-000000000002', true);
select set_config('test.empty_session', 'a2000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$select public.review_history('b1000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'Learning Language is unavailable.',
  'a Learner cannot select another Learner''s Learning Language'
);

select set_config('test.history_before', public.review_history(current_setting('test.es')::uuid)::text, true);
select is(jsonb_array_length(current_setting('test.history_before')::jsonb->'sessions'), 4, 'history returns all completed sessions across Learning Languages');
select is(current_setting('test.history_before')::jsonb->'sessions'->0->>'id', 'a2000000-0000-0000-0000-000000000003', 'completed sessions are newest first');
select is(current_setting('test.history_before')::jsonb->'sessions'->0->>'learning_language_tag', 'es', 'history identifies the Learning Language');
select is(current_setting('test.history_before')::jsonb->'sessions'->0->>'completed_at', '2026-09-23T10:00:00+00:00', 'history exposes the completion timestamp');
select is((current_setting('test.history_before')::jsonb->'sessions'->0->>'correct_count')::integer, 0, 'zero correct answers are preserved');
select is((current_setting('test.history_before')::jsonb->'sessions'->0->>'total_count')::integer, 1, 'total answer count is preserved');
select is((select jsonb_array_length(session_value->'questions') from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') session_value where session_value->>'id' = current_setting('test.new_session')), 3, 'a session exposes all surviving question details');
select is((select question_value->>'question_type' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '1'), 'translation', 'translation details expose their question type');
select is((select question_value->>'direction' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '1'), 'recognition', 'translation details expose their direction');
select is((select question_value->>'selected_answer' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '1'), 'house', 'question details expose the selected answer');
select is((select question_value->>'correct_answer' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '1'), 'house', 'question details expose the correct answer');
select is((select (question_value->>'is_correct')::boolean from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '1'), true, 'question details expose correctness');
select is((select question_value->>'question_type' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '2'), 'cloze', 'Cloze details expose their question type');
select is((select question_value->>'direction' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '2'), null, 'Cloze details expose a null direction');
select is((select question_value->>'selected_answer' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '2'), 'mesa', 'Cloze details expose the selected answer');
select is((select (question_value->>'is_correct')::boolean from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '2'), false, 'Cloze details expose correctness');
select is((select question_value->>'answered_at' from jsonb_array_elements((select session_value->'questions' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') as session_value where session_value->>'id' = current_setting('test.new_session'))) as question_value where question_value->>'ordinal' = '2'), '2026-09-22T10:01:00+00:00', 'question details expose the answer timestamp');
select is((select (session_value->>'correct_count')::integer from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') session_value where session_value->>'id' = current_setting('test.new_session')), 2, 'history reports the completed session score');
select is((select (session_value->>'total_count')::integer from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sessions') session_value where session_value->>'id' = current_setting('test.new_session')), 3, 'history reports the completed session total');
select is(jsonb_array_length(current_setting('test.history_before')::jsonb->'sense_statistics'), 4, 'statistics include surviving Senses in the selected Learning Language');
select is((select (statistic_value->>'practice_count')::integer from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sense_statistics') statistic_value where statistic_value->>'sense_id' = 'a1400000-0000-0000-0000-000000000001'), 3, 'statistics count Attempts and legacy participation');
select is((select statistic_value->>'expression' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sense_statistics') statistic_value where statistic_value->>'sense_id' = 'a1400000-0000-0000-0000-000000000001'), 'casa', 'statistics identify the Sense Expression');
select is((select statistic_value->>'last_practiced_at' from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sense_statistics') statistic_value where statistic_value->>'sense_id' = 'a1400000-0000-0000-0000-000000000001'), '2026-09-22T10:00:00+00:00', 'statistics use the latest practice timestamp');
select is((select (statistic_value->>'practice_count')::integer from jsonb_array_elements(current_setting('test.history_before')::jsonb->'sense_statistics') statistic_value where statistic_value->>'sense_id' = 'a1400000-0000-0000-0000-000000000003'), 2, 'statistics count legacy participation without correctness');
select ok(not jsonb_path_exists(current_setting('test.history_before')::jsonb, '$.sense_statistics[*] ? (@.sense_id == "a1400000-0000-0000-0000-000000000005")'), 'statistics exclude Senses from another Learning Language');

select public.set_vocabulary_entry_suspended('a1300000-0000-0000-0000-000000000003', true);
select is(public.review_history(current_setting('test.es')::uuid)->'sense_statistics', current_setting('test.history_before')::jsonb->'sense_statistics', 'suspension does not change retained history or statistics');

select public.delete_vocabulary_entry('a1300000-0000-0000-0000-000000000002');
select is((select correct_count from public.review_sessions where id = current_setting('test.new_session')::uuid), 2, 'deleting an entry recomputes the surviving correct count');
select is((select total_count from public.review_sessions where id = current_setting('test.new_session')::uuid), 2, 'deleting an entry recomputes the surviving total count');
select is((select jsonb_array_length(session_value->'questions') from jsonb_array_elements(public.review_history(current_setting('test.es')::uuid)->'sessions') session_value where session_value->>'id' = current_setting('test.new_session')), 2, 'deleted question details disappear from history');
select is((select (statistic_value->>'practice_count')::integer from jsonb_array_elements(public.review_history(current_setting('test.es')::uuid)->'sense_statistics') statistic_value where statistic_value->>'sense_id' = 'a1400000-0000-0000-0000-000000000002'), null, 'deleted entry statistics disappear');

select public.delete_vocabulary_entry('a1300000-0000-0000-0000-000000000004');
select is((select count(*) from public.review_sessions where id = current_setting('test.empty_session')::uuid), 1::bigint, 'deleting an entry retains the completed session row');
select is((select correct_count from public.review_sessions where id = current_setting('test.empty_session')::uuid), 0, 'an emptied session recomputes to zero correct answers');
select is((select total_count from public.review_sessions where id = current_setting('test.empty_session')::uuid), 0, 'an emptied session recomputes to zero total answers');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select is(jsonb_array_length(public.review_history('b1000000-0000-0000-0000-000000000001')->'sessions'), 1, 'a second Learner sees only its own completed sessions');
select ok(not jsonb_path_exists(public.review_history('b1000000-0000-0000-0000-000000000001'), '$.sessions[*] ? (@.id == "a2000000-0000-0000-0000-000000000002")'), 'a second Learner cannot see another Learner''s sessions');
select throws_ok(
  $$select public.review_history('a1000000-0000-0000-0000-000000000001')$$,
  'P0001',
  'Learning Language is unavailable.',
  'a second Learner cannot select another Learner''s history language'
);

set local role anon;
select throws_ok(
  $$select public.review_history('a1000000-0000-0000-0000-000000000001')$$,
  '42501',
  'permission denied for function review_history',
  'anonymous clients cannot access Review history'
);

select * from finish();
rollback;
