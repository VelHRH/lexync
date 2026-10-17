begin;

select plan(33);

select ok(
  to_regprocedure('public.vocabulary_lesson_eligible_sense_count(uuid, uuid)') is not null,
  'the canonical vocabulary Lesson eligibility RPC exists'
);
select ok(
  to_regprocedure('public.lesson_history(uuid)') is not null,
  'the canonical Lesson history RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.vocabulary_lesson_eligible_sense_count(uuid, uuid)', 'execute'),
  'authenticated clients can execute the canonical vocabulary Lesson eligibility RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.lesson_history(uuid)', 'execute'),
  'authenticated clients can execute the canonical Lesson history RPC'
);
select ok(
  not has_function_privilege('anon', 'public.vocabulary_lesson_eligible_sense_count(uuid, uuid)', 'execute'),
  'anonymous clients cannot execute the canonical vocabulary Lesson eligibility RPC'
);
select ok(
  not has_function_privilege('anon', 'public.lesson_history(uuid)', 'execute'),
  'anonymous clients cannot execute the canonical Lesson history RPC'
);
select ok(
  to_regprocedure('public.collection_practice_readiness(uuid)') is not null,
  'the Collection practice readiness RPC exists'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.collection_practice_readiness(uuid)'::regprocedure),
  'the Collection practice readiness RPC is security definer'
);
select ok(
  has_function_privilege('authenticated', 'public.collection_practice_readiness(uuid)', 'execute'),
  'authenticated clients can execute the Collection practice readiness RPC'
);
select ok(
  not has_function_privilege('anon', 'public.collection_practice_readiness(uuid)', 'execute'),
  'anonymous clients cannot execute the Collection practice readiness RPC'
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

insert into public.collections (id, learner_id, learning_language_id, name)
values (
  '11830000-0000-0000-0000-000000000001',
  '11800000-0000-0000-0000-000000000001',
  '11810000-0000-0000-0000-000000000001',
  'Travel'
);

insert into public.lessons (
  id,
  learner_id,
  learning_language_id,
  source,
  status,
  created_at,
  completed_at,
  correct_count,
  total_count,
  collection_id
)
values
  ('11820000-0000-0000-0000-000000000001', '11800000-0000-0000-0000-000000000001', '11810000-0000-0000-0000-000000000001', 'vocabulary', 'completed', '2026-09-26T09:00:00Z', '2026-09-26T09:05:00Z', 1, 1, '11830000-0000-0000-0000-000000000001'),
  ('11820000-0000-0000-0000-000000000002', '11800000-0000-0000-0000-000000000001', '11810000-0000-0000-0000-000000000002', 'vocabulary', 'completed', '2026-09-26T10:00:00Z', '2026-09-26T10:05:00Z', 0, 1, null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11800000-0000-0000-0000-000000000001', true);

select is(
  public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001'),
  0::bigint,
  'canonical vocabulary Lesson eligibility is callable'
);
select is(
  jsonb_array_length(public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'),
  2,
  'canonical Lesson history returns completed Lessons'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'sense_statistics',
  '[]'::jsonb,
  'canonical Lesson history preserves Sense statistics'
);
select ok(
  not (public.lesson_history('11810000-0000-0000-0000-000000000001') ? 'sessions'),
  'canonical Lesson history omits the obsolete sessions key'
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
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'->1->>'collection_id',
  '11830000-0000-0000-0000-000000000001',
  'canonical Lesson history carries the Collection ID for a completed Collection Lesson'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'->1->>'collection_name',
  'Travel',
  'canonical Lesson history carries the Collection name for a completed Collection Lesson'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'->0->>'collection_id',
  null,
  'canonical Lesson history carries no Collection ID for a completed whole-library Lesson'
);
select is(
  public.lesson_history('11810000-0000-0000-0000-000000000001')->'lessons'->0->>'collection_name',
  null,
  'canonical Lesson history carries no Collection name for a completed whole-library Lesson'
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

select public.create_study_pair('es', 'en');

select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'readinessPracticable' || entry_ordinal,
  'readinessPracticableTranslation' || entry_ordinal,
  null
)
from generate_series(1, 8) as entry_ordinal;

select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'readinessSuspended' || entry_ordinal,
  'readinessSuspendedTranslation' || entry_ordinal,
  null
)
from generate_series(1, 8) as entry_ordinal;

select set_config(
  'test.readiness_practicable_collection_id',
  (public.create_collection('11810000-0000-0000-0000-000000000001', 'Practicable')->>'id'),
  true
);
select set_config(
  'test.readiness_not_practicable_collection_id',
  (public.create_collection('11810000-0000-0000-0000-000000000001', 'NotPracticable')->>'id'),
  true
);

select public.add_collection_membership(
  current_setting('test.readiness_practicable_collection_id')::uuid,
  learning_vocabulary_entries.id
)
from public.learning_vocabulary_entries
where learning_vocabulary_entries.learner_id = auth.uid()
  and learning_vocabulary_entries.expression like 'readinessPracticable%';

select public.add_collection_membership(
  current_setting('test.readiness_not_practicable_collection_id')::uuid,
  learning_vocabulary_entries.id
)
from public.learning_vocabulary_entries
where learning_vocabulary_entries.learner_id = auth.uid()
  and learning_vocabulary_entries.expression like 'readinessSuspended%';

select public.set_vocabulary_entry_suspended(vocabulary_entries.id, true)
from public.vocabulary_entries
where vocabulary_entries.learner_id = auth.uid()
  and vocabulary_entries.expression like 'readinessSuspended%'
  and vocabulary_entries.expression <> 'readinessSuspended1';

select is(
  (public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->>'minimum_entries')::integer,
  8,
  'Collection practice readiness echoes the minimum Entry count'
);
select is(
  (
    select (item->>'entry_count')::bigint
    from jsonb_array_elements(public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->'collections') as item
    where item->>'collection_id' = current_setting('test.readiness_practicable_collection_id')
  ),
  8::bigint,
  'a practicable Collection reports its raw Entry count'
);
select is(
  (
    select (item->>'can_practise')::boolean
    from jsonb_array_elements(public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->'collections') as item
    where item->>'collection_id' = current_setting('test.readiness_practicable_collection_id')
  ),
  true,
  'a Collection with enough eligible Senses is ready to practise'
);
select is(
  (
    select (item->>'entry_count')::bigint
    from jsonb_array_elements(public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->'collections') as item
    where item->>'collection_id' = current_setting('test.readiness_not_practicable_collection_id')
  ),
  8::bigint,
  'a Collection with suspended Entries still reports its raw Entry count'
);
select ok(
  (
    select (item->>'eligible_sense_count')::bigint
    from jsonb_array_elements(public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->'collections') as item
    where item->>'collection_id' = current_setting('test.readiness_not_practicable_collection_id')
  ) < 2,
  'a Collection whose Entries cannot yield Questions has too few eligible Senses'
);
select is(
  (
    select (item->>'can_practise')::boolean
    from jsonb_array_elements(public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')->'collections') as item
    where item->>'collection_id' = current_setting('test.readiness_not_practicable_collection_id')
  ),
  false,
  'a Collection whose Entries cannot yield Questions is not ready to practise'
);
select lives_ok(
  $$select public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001'::uuid)$$,
  'a one-argument eligibility call still resolves without ambiguity'
);
select is(
  public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001'::uuid),
  public.vocabulary_lesson_eligible_sense_count('11810000-0000-0000-0000-000000000001'::uuid, null::uuid),
  'a one-argument eligibility call returns the whole-library count'
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
select throws_ok(
  $$select public.collection_practice_readiness('11810000-0000-0000-0000-000000000001')$$,
  '42501',
  'permission denied for function collection_practice_readiness',
  'anonymous clients cannot access the Collection practice readiness RPC'
);

select * from finish();
rollback;
