begin;

select plan(45);

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

set local role postgres;
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
set local role authenticated;

select is((select source from public.lessons where id = '11710000-0000-0000-0000-000000000001'), 'dynamic', 'Dynamic Lessons retain their source discriminator');
select is((select count(*) from public.lesson_questions where lesson_id = '11710000-0000-0000-0000-000000000001' and vocabulary_entry_id is null and sense_id is null), 2::bigint, 'Dynamic Questions may omit Vocabulary Entry and Sense links');
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
