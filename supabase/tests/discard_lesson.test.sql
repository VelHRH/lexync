begin;

select plan(10);

select ok(
  to_regprocedure('public.discard_lesson(uuid)') is not null,
  'the discard Lesson RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.discard_lesson(uuid)', 'execute'),
  'authenticated clients can execute the discard Lesson RPC'
);
select ok(
  not has_function_privilege('anon', 'public.discard_lesson(uuid)', 'execute'),
  'anonymous clients cannot execute the discard Lesson RPC'
);

insert into auth.users (id)
values
  ('11900000-0000-0000-0000-000000000001'),
  ('11900000-0000-0000-0000-000000000002');

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('11910000-0000-0000-0000-000000000001', '11900000-0000-0000-0000-000000000001', 'es', '2026-10-04T08:00:00Z'),
  ('11910000-0000-0000-0000-000000000002', '11900000-0000-0000-0000-000000000002', 'es', '2026-10-04T08:00:00Z');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values
  ('11920000-0000-0000-0000-000000000001', '11900000-0000-0000-0000-000000000001', '11910000-0000-0000-0000-000000000001', 'active', '2026-10-04T09:00:00Z', null, 0, 1),
  ('11920000-0000-0000-0000-000000000002', '11900000-0000-0000-0000-000000000002', '11910000-0000-0000-0000-000000000002', 'active', '2026-10-04T09:00:00Z', null, 0, 1);

insert into public.lesson_questions (id, lesson_id, learner_id, ordinal, question_type, prompt, choices, correct_answer)
values
  ('11930000-0000-0000-0000-000000000001', '11920000-0000-0000-0000-000000000001', '11900000-0000-0000-0000-000000000001', 1, 'cloze', 'Completa la ___.', array['frase', 'palabra'], 'frase');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11900000-0000-0000-0000-000000000001', true);

select is(
  public.discard_lesson('11920000-0000-0000-0000-000000000002'),
  false,
  'discarding another Learner''s Lesson reports nothing discarded'
);
select is(
  public.discard_lesson('11920000-0000-0000-0000-000000000001'),
  true,
  'discarding the Learner''s own active Lesson reports it discarded'
);
select is(
  (select count(*) from public.lessons where id = '11920000-0000-0000-0000-000000000001'),
  0::bigint,
  'a discarded Lesson is removed'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = '11920000-0000-0000-0000-000000000001'),
  0::bigint,
  'a discarded Lesson takes its Lesson Questions with it'
);
select is(
  public.discard_lesson('11920000-0000-0000-0000-000000000001'),
  false,
  'discarding an already discarded Lesson reports nothing discarded'
);

select throws_ok(
  $$select set_config('request.jwt.claim.sub', '', true), public.discard_lesson('11920000-0000-0000-0000-000000000002')$$,
  'P0001',
  'Authentication is required.',
  'the discard Lesson RPC requires authentication'
);

reset role;

select is(
  (select count(*) from public.lessons where id = '11920000-0000-0000-0000-000000000002'),
  1::bigint,
  'discarding another Learner''s Lesson leaves it untouched'
);

select * from finish();

rollback;
