begin;

select plan(16);

select ok(
  to_regprocedure('public.vocabulary_lesson_eligible_sense_count(uuid)') is not null,
  'the canonical vocabulary Lesson eligibility RPC exists'
);
select ok(
  to_regprocedure('public.lesson_history(uuid)') is not null,
  'the canonical Lesson history RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.vocabulary_lesson_eligible_sense_count(uuid)', 'execute'),
  'authenticated clients can execute the canonical vocabulary Lesson eligibility RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.lesson_history(uuid)', 'execute'),
  'authenticated clients can execute the canonical Lesson history RPC'
);
select ok(
  not has_function_privilege('anon', 'public.vocabulary_lesson_eligible_sense_count(uuid)', 'execute'),
  'anonymous clients cannot execute the canonical vocabulary Lesson eligibility RPC'
);
select ok(
  not has_function_privilege('anon', 'public.lesson_history(uuid)', 'execute'),
  'anonymous clients cannot execute the canonical Lesson history RPC'
);

insert into auth.users (id)
values
  ('11800000-0000-0000-0000-000000000001'),
  ('11800000-0000-0000-0000-000000000002');

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('11810000-0000-0000-0000-000000000001', '11800000-0000-0000-0000-000000000001', 'es', '2026-09-26T08:00:00Z'),
  ('11810000-0000-0000-0000-000000000002', '11800000-0000-0000-0000-000000000001', 'fr', '2026-09-26T08:00:01Z'),
  ('11810000-0000-0000-0000-000000000003', '11800000-0000-0000-0000-000000000002', 'es', '2026-09-26T08:00:00Z');

insert into public.review_sessions (
  id,
  learner_id,
  learning_language_id,
  status,
  created_at,
  completed_at,
  correct_count,
  total_count
)
values
  ('11820000-0000-0000-0000-000000000001', '11800000-0000-0000-0000-000000000001', '11810000-0000-0000-0000-000000000001', 'completed', '2026-09-26T09:00:00Z', '2026-09-26T09:05:00Z', 1, 1),
  ('11820000-0000-0000-0000-000000000002', '11800000-0000-0000-0000-000000000001', '11810000-0000-0000-0000-000000000002', 'completed', '2026-09-26T10:00:00Z', '2026-09-26T10:05:00Z', 0, 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11800000-0000-0000-0000-000000000001', true);

select is(
  public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001'),
  public.review_session_eligible_sense_count('11810000-0000-0000-0000-000000000001'),
  'canonical vocabulary Lesson eligibility matches legacy Review eligibility'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons',
  public.review_history('11810000-0000-0000-0000-000000000001')->'sessions',
  'canonical Lesson history maps legacy Review sessions to Lessons'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'sense_statistics',
  public.review_history('11810000-0000-0000-0000-000000000001')->'sense_statistics',
  'canonical Lesson history preserves legacy Review Sense statistics'
);
select ok(
  not (public.lesson_history('11810000-0000-0000-0000-000000000001') ? 'sessions'),
  'canonical Lesson history omits the legacy sessions key'
);
select is(
  jsonb_array_length(public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'),
  2,
  'canonical Lesson history preserves completed Lessons across Learning Languages'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'->0->>'completed_at',
  '2026-09-26T10:05:00+00:00',
  'canonical Lesson history preserves completed Lesson timestamps'
);
select throws_ok(
  $$select public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000003')$$,
  'P0001',
  'Learning Language is unavailable.',
  'canonical vocabulary Lesson eligibility rejects another Learner''s Learning Language'
);
select throws_ok(
  $$select public.lesson_history('11810000-0000-0000-0000-000000000003')$$,
  'P0001',
  'Learning Language is unavailable.',
  'canonical Lesson history rejects another Learner''s Learning Language'
);

set local role anon;
select throws_ok(
  $$select public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001')$$,
  '42501',
  'permission denied for function vocabulary_lesson_eligible_sense_count',
  'anonymous clients cannot access canonical vocabulary Lesson eligibility'
);
select throws_ok(
  $$select public.lesson_history('11810000-0000-0000-0000-000000000001')$$,
  '42501',
  'permission denied for function lesson_history',
  'anonymous clients cannot access canonical Lesson history'
);

select * from finish();
rollback;
