begin;

select plan(96);

select ok(to_regclass('public.lessons') is not null, 'the canonical Lesson relation exists');
select ok(to_regclass('public.lesson_questions') is not null, 'the canonical Lesson Question relation exists');
select ok(to_regclass('public.lesson_attempts') is not null, 'the canonical Lesson Attempt relation exists');
select ok(to_regclass('public.review_sessions') is not null, 'the legacy Review Session relation remains available');
select ok(to_regclass('public.review_session_questions') is not null, 'the legacy Review Question relation remains available');
select ok(to_regclass('public.review_attempts') is not null, 'the legacy Review Attempt relation remains available');
select ok(to_regprocedure('public.lesson_overview(uuid)') is not null, 'the canonical Lesson overview RPC exists');
select ok(to_regprocedure('public.start_or_resume_vocabulary_lesson(uuid)') is not null, 'the canonical vocabulary Lesson start RPC exists');
select ok(to_regprocedure('public.submit_lesson_answer(uuid, uuid, text)') is not null, 'the canonical Lesson answer RPC exists');
select ok(to_regprocedure('public.continue_lesson_question(uuid, uuid)') is not null, 'the canonical Lesson continue RPC exists');

insert into auth.users (id)
values
  ('11700000-0000-0000-0000-000000000001'),
  ('11700000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11700000-0000-0000-0000-000000000001', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'casa',
  'house',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'libro',
  'book',
  null
);

select set_config(
  'test.lesson_learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'),
  true
);
select set_config('app.review_session_min_questions', '2', true);
select set_config('app.review_session_max_questions', '2', true);

select set_config(
  'test.review_id',
  (public.start_or_resume_review_session(current_setting('test.lesson_learning_language_id')::uuid)->>'id'),
  true
);
select set_config(
  'test.review_question_id',
  (select id::text from public.review_session_questions where session_id = current_setting('test.review_id')::uuid order by ordinal limit 1),
  true
);
select set_config(
  'test.lesson_id',
  (public.start_or_resume_vocabulary_lesson(current_setting('test.lesson_learning_language_id')::uuid)->>'id'),
  true
);

select is(current_setting('test.lesson_id'), current_setting('test.review_id'), 'vocabulary Lesson creation resumes the existing active Review Session');
select is((select count(*) from public.lessons where id = current_setting('test.lesson_id')::uuid and learner_id = auth.uid()), 1::bigint, 'the active Lesson is durable');
select is((select source from public.lessons where id = current_setting('test.lesson_id')::uuid), 'vocabulary', 'existing Review rows backfill to the vocabulary Lesson source');
select is((select status from public.lessons where id = current_setting('test.lesson_id')::uuid), 'active', 'an active Review row remains an active Lesson');
select is((select created_at from public.lessons where id = current_setting('test.lesson_id')::uuid), (select created_at from public.review_sessions where id = current_setting('test.review_id')::uuid), 'Lesson and legacy Review preserve the creation timestamp');
select is((select total_count from public.lessons where id = current_setting('test.lesson_id')::uuid), (select total_count from public.review_sessions where id = current_setting('test.review_id')::uuid), 'Lesson and legacy Review preserve total progress');
select is((select correct_count from public.lessons where id = current_setting('test.lesson_id')::uuid), (select correct_count from public.review_sessions where id = current_setting('test.review_id')::uuid), 'Lesson and legacy Review preserve correct progress');
select is((select prompt from public.lesson_questions where lesson_id = current_setting('test.lesson_id')::uuid order by ordinal limit 1), (select prompt from public.review_session_questions where session_id = current_setting('test.review_id')::uuid order by ordinal limit 1), 'Lesson Questions preserve legacy Review prompts');
select is((select choices::text from public.lesson_questions where lesson_id = current_setting('test.lesson_id')::uuid order by ordinal limit 1), (select choices::text from public.review_session_questions where session_id = current_setting('test.review_id')::uuid order by ordinal limit 1), 'Lesson Questions preserve legacy Review choices');
select is((select correct_answer from public.lesson_questions where lesson_id = current_setting('test.lesson_id')::uuid order by ordinal limit 1), (select correct_answer from public.review_session_questions where session_id = current_setting('test.review_id')::uuid order by ordinal limit 1), 'Lesson Questions preserve legacy Review answers');
select is((public.lesson_overview(current_setting('test.lesson_learning_language_id')::uuid)->>'id'), current_setting('test.lesson_id'), 'the canonical Lesson overview returns the active Lesson');
select is((public.review_session_overview(current_setting('test.lesson_learning_language_id')::uuid)->>'id'), current_setting('test.lesson_id'), 'the legacy Review overview returns the canonical Lesson identity');

select lives_ok(
  format(
    $$select public.submit_lesson_answer(%L::uuid, %L::uuid, %L)$$,
    current_setting('test.lesson_id'),
    current_setting('test.review_question_id'),
    (select correct_answer from public.lesson_questions where id = current_setting('test.review_question_id')::uuid)
  ),
  'the canonical Lesson answer mutation records an answer'
);
select is((select count(*) from public.lesson_attempts where lesson_id = current_setting('test.lesson_id')::uuid), 1::bigint, 'the canonical Lesson Attempt is durable');
select is((select count(*) from public.review_attempts where session_id = current_setting('test.review_id')::uuid), 1::bigint, 'the legacy Review Attempt remains readable');
select is((select selected_answer from public.lesson_attempts where lesson_id = current_setting('test.lesson_id')::uuid), (select selected_answer from public.review_attempts where session_id = current_setting('test.review_id')::uuid), 'Lesson and legacy Review preserve the submitted answer');
select is((select answered_at from public.lesson_attempts where lesson_id = current_setting('test.lesson_id')::uuid), (select answered_at from public.review_attempts where session_id = current_setting('test.review_id')::uuid), 'Lesson and legacy Review preserve the answer timestamp');
select lives_ok(
  format(
    $$select public.continue_lesson_question(%L::uuid, %L::uuid)$$,
    current_setting('test.lesson_id'),
    current_setting('test.review_question_id')
  ),
  'the canonical Lesson continue mutation remains available'
);

select public.create_study_pair('fr', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'bonjour',
  'hello',
  null
);
select set_config(
  'test.legacy_learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'fr'),
  true
);
select set_config(
  'test.legacy_sense_id',
  (select senses.id::text
   from public.senses
   join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
   where senses.learner_id = auth.uid() and vocabulary_entries.expression = 'bonjour'),
  true
);
select set_config(
  'test.legacy_vocabulary_entry_id',
  (select vocabulary_entries.id::text
   from public.vocabulary_entries
   where vocabulary_entries.learner_id = auth.uid() and vocabulary_entries.expression = 'bonjour'),
  true
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'linked',
  'connected',
  null
);
select set_config(
  'test.dynamic_linked_sense_id',
  (select senses.id::text
   from public.senses
   join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
   where senses.learner_id = auth.uid() and vocabulary_entries.expression = 'linked'),
  true
);
select set_config(
  'test.dynamic_linked_vocabulary_entry_id',
  (select vocabulary_entries.id::text
   from public.vocabulary_entries
   where vocabulary_entries.learner_id = auth.uid() and vocabulary_entries.expression = 'linked'),
  true
);
select public.create_study_pair('de', 'en');
select set_config(
  'test.view_learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'de'),
  true
);

set local role postgres;
with inserted as (
  insert into public.lessons (learner_id, learning_language_id, source)
  values ('11700000-0000-0000-0000-000000000001', current_setting('test.view_learning_language_id')::uuid, 'dynamic')
  returning id
)
select set_config('test.view_lesson_return_id', coalesce(id::text, ''), true)
from inserted;
select set_config(
  'test.view_lesson_id',
  (select id::text from public.lessons where learner_id = '11700000-0000-0000-0000-000000000001' and learning_language_id = current_setting('test.view_learning_language_id')::uuid and source = 'dynamic' order by created_at desc limit 1),
  true
);
select ok(current_setting('test.view_lesson_return_id') <> '', 'Lesson view INSERT RETURNING exposes the generated Lesson ID');
select ok(current_setting('test.view_lesson_id') <> '', 'the inserted Lesson is persisted');
select is((select count(*) from public.lessons where id = current_setting('test.view_lesson_id')::uuid), 1::bigint, 'the generated Lesson ID addresses its persisted parent');
with inserted as (
  insert into public.lesson_questions (
    lesson_id,
    learner_id,
    ordinal,
    prompt,
    question_type,
    direction,
    answer_language_tag,
    choices,
    correct_answer
  ) values (
    current_setting('test.view_lesson_id')::uuid,
    '11700000-0000-0000-0000-000000000001',
    1,
    'view dynamic prompt',
    'translation',
    'recognition',
    'en',
    array['a', 'b'],
    'a'
  )
  returning id
)
select set_config('test.view_question_return_id', coalesce(id::text, ''), true)
from inserted;
select set_config(
  'test.view_question_id',
  (select id::text from public.lesson_questions where lesson_id = current_setting('test.view_lesson_id')::uuid and prompt = 'view dynamic prompt'),
  true
);
select ok(current_setting('test.view_question_return_id') <> '', 'Lesson Question view INSERT RETURNING exposes the generated Question ID');
select is((select count(*) from public.lesson_questions where id = current_setting('test.view_question_id')::uuid and lesson_id = current_setting('test.view_lesson_id')::uuid), 1::bigint, 'the generated Question ID addresses its Lesson parent');
with inserted as (
  insert into public.lesson_attempts (
    lesson_id,
    question_id,
    learner_id,
    question_type,
    direction,
    selected_answer,
    correct_answer,
    is_correct,
    answered_at
  ) values (
    current_setting('test.view_lesson_id')::uuid,
    current_setting('test.view_question_id')::uuid,
    '11700000-0000-0000-0000-000000000001',
    'translation',
    'recognition',
    'a',
    'a',
    true,
    '2026-09-25T11:00:00Z'
  )
  returning id
)
select set_config('test.view_attempt_return_id', coalesce(id::text, ''), true)
from inserted;
select ok(current_setting('test.view_attempt_return_id') <> '', 'Lesson Attempt view INSERT RETURNING exposes the generated Attempt ID');
select is((select count(*) from public.lesson_attempts where lesson_id = current_setting('test.view_lesson_id')::uuid and question_id = current_setting('test.view_question_id')::uuid), 1::bigint, 'the generated Attempt ID addresses its Question parent');

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
values (
  '11713000-0000-0000-0000-000000000001',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.legacy_learning_language_id')::uuid,
  'completed',
  '2026-09-20T08:00:00Z',
  '2026-09-20T08:05:00Z',
  1,
  1
);
insert into public.review_session_questions (
  id,
  session_id,
  learner_id,
  sense_id,
  ordinal,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at,
  continued_at
)
values (
  '11713100-0000-0000-0000-000000000001',
  '11713000-0000-0000-0000-000000000001',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.legacy_sense_id')::uuid,
  1,
  'legacy prompt',
  'translation',
  'recognition',
  'en',
  array['hello', 'bye'],
  'hello',
  'hello',
  true,
  '2026-09-20T08:04:00Z',
  '2026-09-20T08:04:30Z'
);
insert into public.review_attempts (
  id,
  session_id,
  question_id,
  learner_id,
  sense_id,
  question_type,
  direction,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at
)
values (
  '11713200-0000-0000-0000-000000000001',
  '11713000-0000-0000-0000-000000000001',
  '11713100-0000-0000-0000-000000000001',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.legacy_sense_id')::uuid,
  'translation',
  'recognition',
  'hello',
  'hello',
  true,
  '2026-09-20T08:04:00Z'
);
select is((select source from public.review_sessions where id = '11713000-0000-0000-0000-000000000001'), 'vocabulary', 'legacy Review inserts default their Lesson source to vocabulary');
select is((select id from public.lessons where id = '11713000-0000-0000-0000-000000000001'), '11713000-0000-0000-0000-000000000001'::uuid, 'legacy Review IDs remain exact in the Lesson view');
select is((select created_at from public.review_sessions where id = '11713000-0000-0000-0000-000000000001'), '2026-09-20T08:00:00Z'::timestamptz, 'legacy Review creation timestamp remains exact');
select is((select completed_at from public.lessons where id = '11713000-0000-0000-0000-000000000001'), '2026-09-20T08:05:00Z'::timestamptz, 'legacy Lesson completion timestamp remains exact');
select is((select correct_count from public.review_sessions where id = '11713000-0000-0000-0000-000000000001'), 1, 'legacy Review correct progress remains exact');
select is((select total_count from public.lessons where id = '11713000-0000-0000-0000-000000000001'), 1, 'legacy Lesson total progress remains exact');
select is((select prompt from public.review_session_questions where id = '11713100-0000-0000-0000-000000000001'), 'legacy prompt', 'legacy Review prompts remain exact');
select is((select prompt from public.lesson_questions where id = '11713100-0000-0000-0000-000000000001'), 'legacy prompt', 'legacy Lesson prompts remain exact');
select is((select choices::text from public.review_session_questions where id = '11713100-0000-0000-0000-000000000001'), '{hello,bye}', 'legacy Review choices remain exact');
select is((select choices::text from public.lesson_questions where id = '11713100-0000-0000-0000-000000000001'), '{hello,bye}', 'legacy Lesson choices remain exact');
select is((select selected_answer from public.review_attempts where id = '11713200-0000-0000-0000-000000000001'), 'hello', 'legacy Review selected answers remain exact');
select is((select selected_answer from public.lesson_attempts where id = '11713200-0000-0000-0000-000000000001'), 'hello', 'legacy Lesson selected answers remain exact');
select is((select correct_answer from public.review_attempts where id = '11713200-0000-0000-0000-000000000001'), 'hello', 'legacy Review correct answers remain exact');
select is((select correct_answer from public.lesson_attempts where id = '11713200-0000-0000-0000-000000000001'), 'hello', 'legacy Lesson correct answers remain exact');
select is((select answered_at from public.review_session_questions where id = '11713100-0000-0000-0000-000000000001'), '2026-09-20T08:04:00Z'::timestamptz, 'legacy Review question timestamp remains exact');
select is((select answered_at from public.lesson_questions where id = '11713100-0000-0000-0000-000000000001'), '2026-09-20T08:04:00Z'::timestamptz, 'legacy Lesson question timestamp remains exact');
select is((select answered_at from public.review_attempts where id = '11713200-0000-0000-0000-000000000001'), '2026-09-20T08:04:00Z'::timestamptz, 'legacy Review Attempt timestamp remains exact');
select is((select answered_at from public.lesson_attempts where id = '11713200-0000-0000-0000-000000000001'), '2026-09-20T08:04:00Z'::timestamptz, 'legacy Lesson Attempt timestamp remains exact');
select is((public.review_session_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'id'), '11713000-0000-0000-0000-000000000001', 'legacy Review payload retains the completed Lesson ID');
select is((public.review_session_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'correct_count'), '1', 'legacy Review payload retains correct progress');
select is((public.review_session_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'total_count'), '1', 'legacy Review payload retains total progress');
select is((public.review_session_overview(current_setting('test.legacy_learning_language_id')::uuid)->'questions'->0->>'correct_answer'), 'hello', 'legacy Review payload retains the correct answer');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'source'), 'vocabulary', 'Lesson payload exposes the legacy vocabulary source');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'correct_count'), '1', 'Lesson payload retains correct progress');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->>'total_count'), '1', 'Lesson payload retains total progress');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->'questions'->0->>'prompt'), 'legacy prompt', 'Lesson payload retains the legacy prompt');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->'questions'->0->>'selected_answer'), 'hello', 'Lesson payload retains the legacy selected answer');
select is((public.lesson_overview(current_setting('test.legacy_learning_language_id')::uuid)->'questions'->0->>'correct_answer'), 'hello', 'Lesson payload retains the legacy correct answer');

select throws_ok(
  $$insert into public.lessons (id, learner_id, learning_language_id, source, status, total_count) values ('11710000-0000-0000-0000-000000000000', '11700000-0000-0000-0000-000000000001', current_setting('test.lesson_learning_language_id')::uuid, 'dynamic', 'active', 2)$$,
  '23505',
  null,
  'a Learner cannot have two active Lessons for one Learning Language'
);
insert into public.lessons (
  id,
  learner_id,
  learning_language_id,
  source,
  status,
  completed_at,
  correct_count,
  total_count
)
values (
  '11710000-0000-0000-0000-000000000001',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.lesson_learning_language_id')::uuid,
  'dynamic',
  'completed',
  '2026-09-25T10:00:02Z',
  2,
  2
);
insert into public.lesson_questions (
  id,
  lesson_id,
  learner_id,
  vocabulary_entry_id,
  sense_id,
  ordinal,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  correct_answer,
  selected_answer,
  is_correct,
  answered_at
)
values
  (
    '11711000-0000-0000-0000-000000000001',
    '11710000-0000-0000-0000-000000000001',
    '11700000-0000-0000-0000-000000000001',
    null,
    null,
    1,
    'dynamic translation prompt',
    'translation',
    'recognition',
    'en',
    array['house', 'home'],
    'house',
    'house',
    true,
    '2026-09-25T10:00:00Z'
  ),
  (
    '11711000-0000-0000-0000-000000000002',
    '11710000-0000-0000-0000-000000000001',
    '11700000-0000-0000-0000-000000000001',
    null,
    null,
    2,
    'dynamic cloze prompt',
    'cloze',
    null,
    null,
    array['casa', 'libro'],
    'casa',
    'casa',
    true,
    '2026-09-25T10:00:01Z'
  );
insert into public.lesson_attempts (
  id,
  lesson_id,
  question_id,
  learner_id,
  vocabulary_entry_id,
  sense_id,
  question_type,
  direction,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at
)
values
  (
    '11712000-0000-0000-0000-000000000001',
    '11710000-0000-0000-0000-000000000001',
    '11711000-0000-0000-0000-000000000001',
    '11700000-0000-0000-0000-000000000001',
    null,
    null,
    'translation',
    'recognition',
    'house',
    'house',
    true,
    '2026-09-25T10:00:00Z'
  );
insert into public.lesson_questions (
  id,
  lesson_id,
  learner_id,
  vocabulary_entry_id,
  sense_id,
  ordinal,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  correct_answer,
  selected_answer,
  is_correct,
  answered_at
)
values (
  '11711000-0000-0000-0000-000000000003',
  '11710000-0000-0000-0000-000000000001',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.dynamic_linked_vocabulary_entry_id')::uuid,
  current_setting('test.dynamic_linked_sense_id')::uuid,
  3,
  'dynamic linked prompt',
  'translation',
  'recognition',
  'en',
  array['connected', 'linked'],
  'connected',
  'connected',
  true,
  '2026-09-25T10:00:03Z'
);
insert into public.lesson_attempts (
  id,
  lesson_id,
  question_id,
  learner_id,
  vocabulary_entry_id,
  sense_id,
  question_type,
  direction,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at
)
values (
  '11712000-0000-0000-0000-000000000002',
  '11710000-0000-0000-0000-000000000001',
  '11711000-0000-0000-0000-000000000003',
  '11700000-0000-0000-0000-000000000001',
  current_setting('test.dynamic_linked_vocabulary_entry_id')::uuid,
  current_setting('test.dynamic_linked_sense_id')::uuid,
  'translation',
  'recognition',
  'connected',
  'connected',
  true,
  '2026-09-25T10:00:03Z'
);
select is((select count(*) from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003' and vocabulary_entry_id is not null and sense_id is not null), 1::bigint, 'Dynamic Questions may retain optional Vocabulary Entry and Sense links');
select is((select count(*) from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002' and vocabulary_entry_id is not null and sense_id is not null), 1::bigint, 'Dynamic Attempts may retain optional Vocabulary Entry and Sense links');
delete from public.vocabulary_entries where id = current_setting('test.dynamic_linked_vocabulary_entry_id')::uuid;
select is((select count(*) from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), 1::bigint, 'deleting linked Vocabulary data preserves a Dynamic Question');
select is((select count(*) from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), 1::bigint, 'deleting linked Vocabulary data preserves a Dynamic Attempt');
select is((select vocabulary_entry_id from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), null, 'deleting linked Vocabulary data nulls the Dynamic Question Vocabulary Entry link');
select is((select sense_id from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), null, 'deleting linked Vocabulary data nulls the Dynamic Question Sense link');
select is((select vocabulary_entry_id from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), null, 'deleting linked Vocabulary data nulls the Dynamic Attempt Vocabulary Entry link');
select is((select sense_id from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), null, 'deleting linked Vocabulary data nulls the Dynamic Attempt Sense link');
select is((select prompt from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), 'dynamic linked prompt', 'deleting linked Vocabulary data preserves the Dynamic prompt snapshot');
select is((select choices::text from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), '{connected,linked}', 'deleting linked Vocabulary data preserves the Dynamic choices snapshot');
select is((select selected_answer from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), 'connected', 'deleting linked Vocabulary data preserves the Dynamic selected answer snapshot');
select is((select answered_at from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), '2026-09-25T10:00:03Z'::timestamptz, 'deleting linked Vocabulary data preserves the Dynamic Question timestamp');
select is((select correct_answer from public.lesson_questions where id = '11711000-0000-0000-0000-000000000003'), 'connected', 'deleting linked Vocabulary data preserves the Dynamic correct answer snapshot');
select is((select selected_answer from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), 'connected', 'deleting linked Vocabulary data preserves the Dynamic Attempt selected answer snapshot');
select is((select correct_answer from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), 'connected', 'deleting linked Vocabulary data preserves the Dynamic Attempt correct answer snapshot');
select is((select answered_at from public.lesson_attempts where id = '11712000-0000-0000-0000-000000000002'), '2026-09-25T10:00:03Z'::timestamptz, 'deleting linked Vocabulary data preserves the Dynamic Attempt timestamp');
set local role authenticated;

select is((select source from public.lessons where id = '11710000-0000-0000-0000-000000000001'), 'dynamic', 'Dynamic Lessons retain their source discriminator');
select is((select count(*) from public.lesson_questions where lesson_id = '11710000-0000-0000-0000-000000000001' and ordinal in (1, 2) and vocabulary_entry_id is null and sense_id is null), 2::bigint, 'Dynamic Questions may omit Vocabulary Entry and Sense links');
select is((select direction from public.lesson_questions where id = '11711000-0000-0000-0000-000000000001'), 'recognition', 'Dynamic translation Questions retain direction');
select is((select answer_language_tag from public.lesson_questions where id = '11711000-0000-0000-0000-000000000001'), 'en', 'Dynamic translation Questions retain Answer Language');
select is((select direction from public.lesson_questions where id = '11711000-0000-0000-0000-000000000002'), null, 'Dynamic Cloze Questions omit direction');
select is((select answer_language_tag from public.lesson_questions where id = '11711000-0000-0000-0000-000000000002'), null, 'Dynamic Cloze Questions omit Answer Language');
select is((select prompt from public.lesson_questions where id = '11711000-0000-0000-0000-000000000001'), 'dynamic translation prompt', 'Dynamic translation prompts are snapshotted');
select is((select choices::text from public.lesson_questions where id = '11711000-0000-0000-0000-000000000002'), '{casa,libro}', 'Dynamic Cloze choices are snapshotted');
select is((select correct_answer from public.lesson_questions where id = '11711000-0000-0000-0000-000000000001'), 'house', 'Dynamic correct answers are snapshotted');

select throws_ok(
  $$insert into public.lessons (learner_id, learning_language_id, source, total_count) values (auth.uid(), current_setting('test.lesson_learning_language_id')::uuid, 'dynamic', 0)$$,
  '42501',
  'permission denied for table lessons',
  'clients cannot create Lessons directly'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, choices, correct_answer) values (current_setting('test.lesson_id')::uuid, auth.uid(), 99, 'blocked', 'translation', array['a', 'b'], 'a')$$,
  '42501',
  'permission denied for table lesson_questions',
  'clients cannot create Lesson Questions directly'
);
select throws_ok(
  $$insert into public.lesson_attempts (lesson_id, question_id, learner_id, question_type, selected_answer, correct_answer, is_correct, answered_at) values (current_setting('test.lesson_id')::uuid, current_setting('test.review_question_id')::uuid, auth.uid(), 'translation', 'a', 'a', true, now())$$,
  '42501',
  'permission denied for table lesson_attempts',
  'clients cannot create Lesson Attempts directly'
);

select set_config('request.jwt.claim.sub', '11700000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.lessons), 0::bigint, 'another Learner cannot read Lessons');
select is((select count(*) from public.lesson_questions), 0::bigint, 'another Learner cannot read Lesson Questions');
select is((select count(*) from public.lesson_attempts), 0::bigint, 'another Learner cannot read Lesson Attempts');
select throws_ok(
  format(
    $$select public.lesson_overview(%L::uuid)$$,
    current_setting('test.lesson_learning_language_id')
  ),
  'P0001',
  'Learning Language is unavailable.',
  'another Learner cannot inspect a private Lesson'
);

select * from finish();
rollback;
