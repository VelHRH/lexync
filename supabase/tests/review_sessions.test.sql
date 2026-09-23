create extension if not exists dblink;

begin;

select plan(150);

insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'casa',
  'house',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'nube',
  'cloud',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'árbol',
  'tree',
  null
);

select is((select count(*) from public.cards where learner_id = auth.uid()), 6::bigint, 'Cards exist before unscheduled Review');
select is((select count(*) from public.review_participations where learner_id = auth.uid()), 0::bigint, 'historical participation records start empty');

select set_config(
  'test.learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'),
  true
);
select set_config('test.legacy_cards', (select count(*)::text from public.cards where learner_id = auth.uid()), true);
select set_config('test.legacy_participations', (select count(*)::text from public.review_participations where learner_id = auth.uid()), true);
select set_config('app.review_session_min_questions', '2', true);
select set_config('app.review_session_max_questions', '2', true);
select is(public.review_session_eligible_sense_count(current_setting('test.learning_language_id')::uuid), 3::bigint, 'eligible Sense count is distinct and requires legal distractors');

select is(public.review_session_overview(current_setting('test.learning_language_id')::uuid), null, 'no Review Session exists before start');
select lives_ok(
  $$select public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)$$,
  'eligible material starts a Review Session'
);
select set_config(
  'test.session_id',
  (public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)->>'id'),
  true
);
select set_config(
  'test.question_id',
  (select id::text from public.review_session_questions where session_id = current_setting('test.session_id')::uuid and ordinal = 1),
  true
);
select set_config(
  'test.question_two_id',
  (select id::text from public.review_session_questions where session_id = current_setting('test.session_id')::uuid and ordinal = 2),
  true
);
select set_config(
  'test.vocabulary_entry_id',
  (select vocabulary_entry_id::text from public.senses where id = (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)),
  true
);

select is((select count(*) from public.review_sessions where learner_id = auth.uid()), 1::bigint, 'one session is persisted');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.session_id')::uuid), 2::bigint, 'the capped queue contains one question per eligible Sense');
select is((select status from public.review_sessions where id = current_setting('test.session_id')::uuid), 'active', 'a new session is active');
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->>'id'), current_setting('test.session_id'), 'overview returns the active session');
select is(jsonb_array_length(public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'), 2, 'overview returns the full capped queue');
select ok((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'direction') in ('recognition', 'recall'), 'the first direction is randomized');
select is(
  (public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'direction') <> (public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->1->>'direction'),
  true,
  'directions strictly alternate'
);
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'question_type'), 'translation', 'the question type is translation');
select ok((select sense_id is not null from public.review_session_questions where id = current_setting('test.question_id')::uuid), 'the question retains its Sense relationship');
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'correct_answer'), null, 'an unanswered question hides its correct answer');
select ok(
  (select cardinality(choices) >= 2 from public.review_session_questions where id = current_setting('test.question_id')::uuid),
  'the question has at least two choices'
);
select ok(
  (select count(*) = cardinality(choices)
   from public.review_session_questions
   cross join lateral unnest(choices) as choice(text)
   where id = current_setting('test.question_id')::uuid
   group by choices),
  'the question choices are normalized-distinct'
);
select is(
  (select cardinality(choice_sense_ids) from public.review_session_questions where id = current_setting('test.question_id')::uuid),
  (select cardinality(choices) from public.review_session_questions where id = current_setting('test.question_id')::uuid),
  'the first question persists aligned choice provenance'
);
select is(
  (select cardinality(choice_sense_ids) from public.review_session_questions where id = current_setting('test.question_two_id')::uuid),
  (select cardinality(choices) from public.review_session_questions where id = current_setting('test.question_two_id')::uuid),
  'the second question persists aligned choice provenance'
);
select ok(
  (select correct_answer = any(choices) from public.review_session_questions where id = current_setting('test.question_id')::uuid),
  'the first question includes its correct answer'
);
select ok(
  (select correct_answer = any(choices) from public.review_session_questions where id = current_setting('test.question_two_id')::uuid),
  'the second question includes its correct answer'
);

select is((public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)->>'id'), current_setting('test.session_id'), 'repeated starts resume the active session');
select is((select count(*) from public.review_sessions where learner_id = auth.uid() and status = 'active'), 1::bigint, 'repeated starts leave at most one active session');
select set_config('test.snapshot_prompt', (select prompt from public.review_session_questions where id = current_setting('test.question_id')::uuid), true);
select set_config('test.snapshot_choices', (select choices::text from public.review_session_questions where id = current_setting('test.question_id')::uuid), true);
select is((select prompt from public.review_session_questions where id = current_setting('test.question_id')::uuid), current_setting('test.snapshot_prompt'), 'the persisted prompt is stable');
select is((select choices::text from public.review_session_questions where id = current_setting('test.question_id')::uuid), current_setting('test.snapshot_choices'), 'the persisted choices are stable');

set local role postgres;
update public.vocabulary_entries
set expression = expression || '-edited'
where learner_id = '11111111-1111-1111-1111-111111111111';
update public.translations
set text = text || '-edited'
where learner_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select is((select prompt from public.review_session_questions where id = current_setting('test.question_id')::uuid), current_setting('test.snapshot_prompt'), 'source Expression edits do not change the prompt snapshot');
select is((select choices::text from public.review_session_questions where id = current_setting('test.question_id')::uuid), current_setting('test.snapshot_choices'), 'source Translation edits do not change the choices snapshot');

select set_config(
  'test.correct_answer',
  (select correct_answer from public.review_session_questions where id = current_setting('test.question_id')::uuid),
  true
);
select lives_ok(
  format(
    $$select public.submit_review_session_answer(%L::uuid, %L::uuid, %L)$$,
    current_setting('test.session_id'),
    current_setting('test.question_id'),
    current_setting('test.correct_answer')
  ),
  'the first answer is recorded while the queue remains active'
);
select set_config('test.answered_at', (public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'answered_at'), true);
select is((select status from public.review_sessions where id = current_setting('test.session_id')::uuid), 'active', 'a partial queue remains active');
select is((select correct_count from public.review_sessions where id = current_setting('test.session_id')::uuid), 1, 'the partial correctness result is durable');
select is((select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 1::bigint, 'one durable Attempt is recorded');
select is((select sense_id from public.review_attempts where session_id = current_setting('test.session_id')::uuid), (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid), 'the Attempt retains the practiced Sense');
select is((select question_type from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 'translation', 'the Attempt snapshots its question type');
select ok((select direction in ('recognition', 'recall') from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 'the Attempt snapshots its direction');
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'correct_answer'), current_setting('test.correct_answer'), 'active overview exposes the persisted correct answer');
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'answered_at'), current_setting('test.answered_at'), 'active overview preserves the first answer timestamp');
select is((public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'->0->>'continued_at'), null, 'answered questions remain uncontinued after submission');

select is(
  (public.submit_review_session_answer(current_setting('test.session_id')::uuid, current_setting('test.question_id')::uuid, 'not-the-first-answer')->'questions'->0->>'selected_answer'),
  current_setting('test.correct_answer'),
  'retry returns the first durable answer'
);
select is((select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 1::bigint, 'retry does not duplicate the Attempt');
select is((public.submit_review_session_answer(current_setting('test.session_id')::uuid, current_setting('test.question_id')::uuid, 'not-the-first-answer')->'questions'->0->>'answered_at'), current_setting('test.answered_at'), 'retry preserves the first timestamp');
select set_config(
  'test.continued_at',
  (public.continue_review_session_question(current_setting('test.session_id')::uuid, current_setting('test.question_id')::uuid)->'questions'->0->>'continued_at'),
  true
);
select ok(current_setting('test.continued_at') <> '', 'Continue persists its boundary timestamp');
select is((select status from public.review_sessions where id = current_setting('test.session_id')::uuid), 'active', 'continuing a non-final question leaves the session active');
select is(
  (public.continue_review_session_question(current_setting('test.session_id')::uuid, current_setting('test.question_id')::uuid)->'questions'->0->>'continued_at'),
  current_setting('test.continued_at'),
  'repeated Continue preserves the first boundary timestamp'
);
select set_config(
  'test.correct_answer_two',
  (select correct_answer from public.review_session_questions where id = current_setting('test.question_two_id')::uuid),
  true
);
select lives_ok(
  format(
    $$select public.submit_review_session_answer(%L::uuid, %L::uuid, %L)$$,
    current_setting('test.session_id'),
    current_setting('test.question_two_id'),
    current_setting('test.correct_answer_two')
  ),
  'the final answer remains active until Continue'
);
select is((select status from public.review_sessions where id = current_setting('test.session_id')::uuid), 'active', 'the final answer leaves the session active');
select is((public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)->>'id'), current_setting('test.session_id'), 'an answered but uncontinued session resumes unchanged');
select is((select correct_count from public.review_sessions where id = current_setting('test.session_id')::uuid), 2, 'the final correctness result is durable before Continue');
select is((select total_count from public.review_sessions where id = current_setting('test.session_id')::uuid), 2, 'the final total is durable before Continue');
select is((select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 2::bigint, 'both Attempts are durable');
select lives_ok(
  format(
    $$select public.continue_review_session_question(%L::uuid, %L::uuid)$$,
    current_setting('test.session_id'),
    current_setting('test.question_two_id')
  ),
  'Continue on the final answered question completes the queue'
);
select is((select status from public.review_sessions where id = current_setting('test.session_id')::uuid), 'completed', 'the completed status is durable after Continue');
select ok((select completed_at is not null from public.review_sessions where id = current_setting('test.session_id')::uuid), 'completion records its Continue timestamp');
select is((select count(*) from public.review_participations where learner_id = auth.uid()), current_setting('test.legacy_participations')::bigint, 'Review Session submission does not append historical participation records');
select is((select count(*) from public.cards where learner_id = auth.uid()), current_setting('test.legacy_cards')::bigint, 'Review Session submission does not change Cards');
set local role postgres;
insert into public.senses (id, learner_id, vocabulary_entry_id)
select '11140000-0000-0000-0000-000000000001', learner_id, vocabulary_entry_id
from public.senses
where id = (select sense_id from public.review_session_questions where id = current_setting('test.question_two_id')::uuid);
insert into public.translations (id, learner_id, sense_id, text, answer_language_tag)
values ('11140000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '11140000-0000-0000-0000-000000000001', 'sibling', 'en');
set local role authenticated;
select set_config(
  'test.repeat_session_id',
  (public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)->>'id'),
  true
);
select isnt(current_setting('test.repeat_session_id'), current_setting('test.session_id'), 'a completed session permits an immediate repeat');
select is((select count(*) from public.review_sessions where learner_id = auth.uid() and status = 'active'), 1::bigint, 'the repeated session is the only active session');

set local role postgres;
select dblink_connect(
  'review_fixture',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_exec(
  'review_fixture',
  $fixture$
    insert into auth.users (id) values ('33333333-3333-3333-3333-333333333333');
    insert into public.learning_languages (id, learner_id, language_tag)
    values ('33330000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'es');
    insert into public.study_pairs (id, learner_id, target_language_tag, reference_language_tag, is_primary, learning_language_id)
    values ('33330000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'es', 'en', true, '33330000-0000-0000-0000-000000000001');
    insert into public.learning_vocabulary_entries (id, learner_id, learning_language_id, expression, suspended)
    values ('33330000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000001', 'casa', false);
    insert into public.vocabulary_entries (id, learner_id, study_pair_id, expression, learning_language_id, learning_vocabulary_entry_id, suspended)
    values ('33330000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000002', 'casa', '33330000-0000-0000-0000-000000000001', '33330000-0000-0000-0000-000000000003', false);
    insert into public.senses (id, learner_id, vocabulary_entry_id)
    values
      ('33330000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000004'),
      ('33330000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000004');
    insert into public.translations (id, learner_id, sense_id, text, answer_language_tag)
    values
      ('33330000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000005', 'house', 'en'),
      ('33330000-0000-0000-0000-000000000008', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000006', 'cloud', 'en');
    insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
    values ('33330000-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', '33330000-0000-0000-0000-000000000001', 'active', 1);
    insert into public.review_session_questions (
      id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
      answer_language_tag, choices, correct_answer
    ) values (
      '33330000-0000-0000-0000-000000000012',
      '33330000-0000-0000-0000-000000000011',
      '33333333-3333-3333-3333-333333333333',
      '33330000-0000-0000-0000-000000000005',
      1,
      'casa',
      'translation',
      'recognition',
      'en',
      array['house', 'cloud'],
      'house'
    );
  $fixture$
);
select dblink_disconnect('review_fixture');

select dblink_connect(
  'review_submit_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_connect(
  'review_submit_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_exec('review_submit_a', 'begin');
select dblink_exec(
  'review_submit_a',
  'update public.review_sessions set created_at = created_at where id = ''33330000-0000-0000-0000-000000000011''::uuid'
);
select dblink_exec('review_submit_a', 'set role authenticated');
select dblink_exec('review_submit_a', 'set request.jwt.claim.sub = ''33333333-3333-3333-3333-333333333333''');
select dblink_exec('review_submit_b', 'set role authenticated');
select dblink_exec('review_submit_b', 'set request.jwt.claim.sub = ''33333333-3333-3333-3333-333333333333''');
select dblink_send_query(
  'review_submit_b',
  'select public.submit_review_session_answer(''33330000-0000-0000-0000-000000000011''::uuid, ''33330000-0000-0000-0000-000000000012''::uuid, ''house'')'
);
select * from dblink(
  'review_submit_a',
  'select public.submit_review_session_answer(''33330000-0000-0000-0000-000000000011''::uuid, ''33330000-0000-0000-0000-000000000012''::uuid, ''house'')'
) as result(payload jsonb);
select dblink_exec('review_submit_a', 'commit');
select * from dblink_get_result('review_submit_b') as result(payload jsonb);
select dblink_disconnect('review_submit_a');
select dblink_disconnect('review_submit_b');

select is((select count(*) from public.review_attempts where session_id = '33330000-0000-0000-0000-000000000011'), 1::bigint, 'concurrent submissions create exactly one Attempt');
select is((select count(distinct selected_answer) from public.review_attempts where session_id = '33330000-0000-0000-0000-000000000011'), 1::bigint, 'concurrent submissions preserve one answer');
select is((select count(distinct answered_at) from public.review_attempts where session_id = '33330000-0000-0000-0000-000000000011'), 1::bigint, 'concurrent submissions preserve one timestamp');
select is((select count(*) from public.review_sessions where id = '33330000-0000-0000-0000-000000000011' and status = 'active' and completed_at is null and correct_count = 1), 1::bigint, 'concurrent submissions leave the session active');
select is((select count(*) from public.review_session_questions where id = '33330000-0000-0000-0000-000000000012' and selected_answer = 'house' and continued_at is null), 1::bigint, 'concurrent submissions leave the answer uncontinued');

select dblink_connect(
  'review_continue_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_connect(
  'review_continue_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_exec('review_continue_a', 'begin');
select dblink_exec(
  'review_continue_a',
  'update public.review_sessions set created_at = created_at where id = ''33330000-0000-0000-0000-000000000011''::uuid'
);
select dblink_exec('review_continue_a', 'set role authenticated');
select dblink_exec('review_continue_a', 'set request.jwt.claim.sub = ''33333333-3333-3333-3333-333333333333''');
select dblink_exec('review_continue_b', 'set role authenticated');
select dblink_exec('review_continue_b', 'set request.jwt.claim.sub = ''33333333-3333-3333-3333-333333333333''');
select dblink_send_query(
  'review_continue_b',
  'select public.continue_review_session_question(''33330000-0000-0000-0000-000000000011''::uuid, ''33330000-0000-0000-0000-000000000012''::uuid)'
);
select * from dblink(
  'review_continue_a',
  'select public.continue_review_session_question(''33330000-0000-0000-0000-000000000011''::uuid, ''33330000-0000-0000-0000-000000000012''::uuid)'
) as result(payload jsonb);
select dblink_exec('review_continue_a', 'commit');
select * from dblink_get_result('review_continue_b') as result(payload jsonb);
select dblink_disconnect('review_continue_a');
select dblink_disconnect('review_continue_b');

select is((select count(*) from public.review_sessions where id = '33330000-0000-0000-0000-000000000011' and status = 'completed' and completed_at is not null and correct_count = 1), 1::bigint, 'concurrent Continue calls complete the session once');
select is((select count(*) from public.review_session_questions where id = '33330000-0000-0000-0000-000000000012' and continued_at is not null), 1::bigint, 'concurrent Continue calls persist one boundary timestamp');

select dblink_connect(
  'review_fixture_cleanup',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
select dblink_exec(
  'review_fixture_cleanup',
  $$delete from auth.users where id = '33333333-3333-3333-3333-333333333333'$$
);
select dblink_disconnect('review_fixture_cleanup');
set local role authenticated;

select public.set_vocabulary_entry_suspended(current_setting('test.vocabulary_entry_id')::uuid, true);
select is((select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 2::bigint, 'suspension preserves recorded Attempts');
select public.review_session_overview(current_setting('test.learning_language_id')::uuid);
select is(
  (select count(*)
   from public.review_session_questions
   where session_id = current_setting('test.repeat_session_id')::uuid
     and selected_answer is null
     and sense_id = (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)),
  0::bigint,
  'overview prunes the suspended Sense as a question owner'
);
select is(
  (select count(*)
   from public.review_session_questions as questions
   cross join lateral unnest(questions.choice_sense_ids) as choice(sense_id)
   where questions.session_id = current_setting('test.repeat_session_id')::uuid
     and questions.selected_answer is null
     and choice.sense_id = (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)),
  0::bigint,
  'overview prunes the suspended Sense from unanswered provenance'
);
select is(
  (select total_count from public.review_sessions where id = current_setting('test.repeat_session_id')::uuid),
  (select count(*)::integer from public.review_session_questions where session_id = current_setting('test.repeat_session_id')::uuid),
  'pruning synchronizes the queue total with remaining questions'
);
select ok(
  coalesce((select total_count >= 1 from public.review_sessions where id = current_setting('test.repeat_session_id')::uuid), true),
  'pruning leaves a valid queue when the repeated session survives'
);
select ok(
  exists (
    select 1
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices, questions.choice_sense_ids) as choice(text, sense_id)
    where questions.id = (
      select id
      from public.review_session_questions
      where session_id = current_setting('test.repeat_session_id')::uuid
        and sense_id <> (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)
      order by ordinal
      limit 1
    )
      and choice.sense_id <> questions.sense_id
      and choice.text like '%-edited'
  ),
  'edited distractor snapshots remain after source edits'
);
select ok(
  not exists (
    select 1
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choice_sense_ids) as choice(sense_id)
    join public.senses as reviewed_senses on reviewed_senses.id = questions.sense_id
    join public.senses as choice_senses on choice_senses.id = choice.sense_id
    where questions.session_id = current_setting('test.repeat_session_id')::uuid
      and choice.sense_id <> questions.sense_id
      and reviewed_senses.vocabulary_entry_id = choice_senses.vocabulary_entry_id
  ),
  'sibling Senses are excluded from distractors'
);
select ok(
  not exists (
    select 1
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices, questions.choice_sense_ids) as choice(text, sense_id)
    join public.translations as reviewed_translations
      on reviewed_translations.sense_id = questions.sense_id
      and reviewed_translations.translation_identity = public.translation_identity(choice.text)
    where questions.session_id = current_setting('test.repeat_session_id')::uuid
      and questions.direction = 'recognition'
      and choice.sense_id <> questions.sense_id
  ),
  'duplicate normalized translations are excluded from distractors'
);
set local role postgres;
delete from public.review_sessions where id = current_setting('test.repeat_session_id')::uuid;
insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
values ('11130000-0000-0000-0000-000000000001', auth.uid(), current_setting('test.learning_language_id')::uuid, 'active', 2);
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000002',
  '11130000-0000-0000-0000-000000000001',
  learner_id,
  sense_id,
  1,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_id')::uuid;
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000008',
  '11130000-0000-0000-0000-000000000001',
  learner_id,
  sense_id,
  2,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_two_id')::uuid;
set local role authenticated;
select lives_ok(
  $$select public.submit_review_session_answer('11130000-0000-0000-0000-000000000001'::uuid, '11130000-0000-0000-0000-000000000002'::uuid, 'stale')$$,
  'a suspended stale question returns a refreshed payload'
);
select is((select count(*) from public.review_session_questions where id = '11130000-0000-0000-0000-000000000002'), 0::bigint, 'a suspended stale question is pruned');
select is((select count(*) from public.review_attempts where session_id = '11130000-0000-0000-0000-000000000001'), 0::bigint, 'a suspended stale question creates no Attempt');
set local role postgres;
delete from public.review_sessions where id = '11130000-0000-0000-0000-000000000001';
insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
values ('11130000-0000-0000-0000-000000000003', auth.uid(), current_setting('test.learning_language_id')::uuid, 'active', 1);
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000004',
  '11130000-0000-0000-0000-000000000003',
  learner_id,
  sense_id,
  1,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_two_id')::uuid;
select set_config(
  'test.direct_removed_choice',
  (
    select choice.text
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices, questions.choice_sense_ids) as choice(text, sense_id)
    where questions.id = '11130000-0000-0000-0000-000000000004'
      and choice.sense_id = (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)
  ),
  true
);
set local role authenticated;
select set_config(
  'test.removed_choice_payload',
  public.submit_review_session_answer(
    '11130000-0000-0000-0000-000000000003'::uuid,
    '11130000-0000-0000-0000-000000000004'::uuid,
    current_setting('test.direct_removed_choice')
  )::text,
  true
);
select ok(
  not exists (
    select 1
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices) as choice(text)
    where questions.id = '11130000-0000-0000-0000-000000000004'
      and choice.text = current_setting('test.direct_removed_choice')
  ),
  'a provenance-removed stale distractor is pruned from the payload'
);
select is((select count(*) from public.review_attempts where session_id = '11130000-0000-0000-0000-000000000003'), 0::bigint, 'a removed stale distractor creates no Attempt');
set local role postgres;
delete from public.review_sessions where id = '11130000-0000-0000-0000-000000000003';
insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
values ('11130000-0000-0000-0000-000000000005', auth.uid(), current_setting('test.learning_language_id')::uuid, 'active', 2);
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000006',
  '11130000-0000-0000-0000-000000000005',
  learner_id,
  sense_id,
  1,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_two_id')::uuid;
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000007',
  '11130000-0000-0000-0000-000000000005',
  learner_id,
  sense_id,
  2,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_two_id')::uuid;
set local role authenticated;
select lives_ok(
  $$select public.submit_review_session_answer('11130000-0000-0000-0000-000000000005'::uuid, '11130000-0000-0000-0000-000000000006'::uuid, (select correct_answer from public.review_session_questions where id = current_setting('test.question_two_id')::uuid))$$,
  'the Continue fixture records its current answer'
);
select lives_ok(
  $$select public.submit_review_session_answer('11130000-0000-0000-0000-000000000005'::uuid, '11130000-0000-0000-0000-000000000007'::uuid, (select correct_answer from public.review_session_questions where id = current_setting('test.question_two_id')::uuid))$$,
  'the Continue fixture keeps a second answered question uncontinued'
);
select set_config(
  'test.continue_payload',
  public.continue_review_session_question('11130000-0000-0000-0000-000000000005'::uuid, '11130000-0000-0000-0000-000000000006'::uuid)::text,
  true
);
select is(current_setting('test.continue_payload')::jsonb->>'status', 'active', 'Continue leaves another answered question active until its boundary');
select is(jsonb_array_length(current_setting('test.continue_payload')::jsonb->'questions'), 2, 'Continue returns the unanswered-boundary queue');
select set_config(
  'test.continue_payload',
  public.continue_review_session_question('11130000-0000-0000-0000-000000000005'::uuid, '11130000-0000-0000-0000-000000000007'::uuid)::text,
  true
);
select is(current_setting('test.continue_payload')::jsonb->>'status', 'completed', 'Continue completes after every answered question crosses its boundary');
select is(jsonb_array_length(current_setting('test.continue_payload')::jsonb->'questions'), 2, 'final Continue returns both answered questions');
set local role postgres;
delete from public.review_sessions where id = '11130000-0000-0000-0000-000000000005';
insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
values ('11130000-0000-0000-0000-000000000011', auth.uid(), current_setting('test.learning_language_id')::uuid, 'active', 1);
insert into public.review_session_questions (
  id, session_id, learner_id, sense_id, ordinal, prompt, question_type, direction,
  answer_language_tag, choices, choice_sense_ids, correct_answer
)
select
  '11130000-0000-0000-0000-000000000012',
  '11130000-0000-0000-0000-000000000011',
  learner_id,
  sense_id,
  1,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  correct_answer
from public.review_session_questions
where id = current_setting('test.question_id')::uuid;
set local role authenticated;
select set_config(
  'test.attempts_before_final_delete',
  (select count(*)::text from public.review_attempts where session_id = current_setting('test.session_id')::uuid),
  true
);
select set_config(
  'test.owned_attempts_before_final_delete',
  (
    select count(*)::text
    from public.review_attempts as attempts
    join public.senses on senses.id = attempts.sense_id and senses.learner_id = attempts.learner_id
    where attempts.session_id = current_setting('test.session_id')::uuid
      and senses.vocabulary_entry_id = current_setting('test.vocabulary_entry_id')::uuid
  ),
  true
);
set local role postgres;
delete from public.vocabulary_entries
where id = current_setting('test.vocabulary_entry_id')::uuid
  and learner_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select is(
  (select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid),
  current_setting('test.attempts_before_final_delete')::bigint - current_setting('test.owned_attempts_before_final_delete')::bigint,
  'deleting a Vocabulary Entry removes exactly its owned Attempt details'
);
select lives_ok(
  $$select public.submit_review_session_answer('11130000-0000-0000-0000-000000000011'::uuid, '11130000-0000-0000-0000-000000000012'::uuid, 'stale')$$,
  'a deleted stale question returns null'
);
select is((select count(*) from public.review_sessions where id = '11130000-0000-0000-0000-000000000011'), 0::bigint, 'a deleted stale question retires its empty session');
select is((select count(*) from public.review_attempts where session_id = '11130000-0000-0000-0000-000000000011'), 0::bigint, 'a deleted stale question creates no Attempt');
set local role postgres;
delete from public.vocabulary_entries
where id = (
  select vocabulary_entry_id
  from public.senses
  where id = (
    select sense_id
    from public.review_session_questions
    where id = current_setting('test.question_two_id')::uuid
  )
)
and learner_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select is((select count(*) from public.review_attempts where session_id = current_setting('test.session_id')::uuid), 0::bigint, 'deleting each Vocabulary Entry removes its owned Attempt details');

set local role postgres;
insert into auth.users (id)
values ('44444444-4444-4444-4444-444444444444');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.create_study_pair('fr', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'casa',
  'house',
  'Ma casa est grande.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'CAFÉ',
  'coffee',
  U&'Un cafe\0301 est chaud.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'NUBE',
  'cloud',
  'La nube se mueve.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'sol',
  'sun',
  'La luz brilla.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'pez',
  'fish',
  'Un pez y otro pez.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'fr'),
  'pan',
  'bread',
  'El pantalon es azul.'
);
select set_config(
  'test.cloze_learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'fr'),
  true
);
select set_config('app.review_session_min_questions', '6', true);
select set_config('app.review_session_max_questions', '6', true);
select is(public.review_session_eligible_sense_count(current_setting('test.cloze_learning_language_id')::uuid), 6::bigint, 'Cloze fixture has six eligible Senses');
select lives_ok(
  $$select public.start_or_resume_review_session(current_setting('test.cloze_learning_language_id')::uuid)$$,
  'Cloze fixture starts through the Review RPC'
);
select set_config(
  'test.cloze_session_id',
  (public.start_or_resume_review_session(current_setting('test.cloze_learning_language_id')::uuid)->>'id'),
  true
);
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid), 6::bigint, 'Cloze fixture creates the requested session size');
select is((select count(distinct sense_id) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid), 6::bigint, 'a Sense appears at most once in the mixed queue');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'cloze'), 3::bigint, 'Cloze allocation targets half the session');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'translation'), 3::bigint, 'the mixed queue retains translation Questions');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'cloze' and direction is null and answer_language_tag is null), 3::bigint, 'Cloze Questions have no translation direction or Answer Language');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'translation' and direction in ('recognition', 'recall') and answer_language_tag = 'en'), 3::bigint, 'translation Questions retain direction and Answer Language');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'translation' and choice_vocabulary_entry_ids is null), 3::bigint, 'translation Questions use Sense choice provenance');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'cloze' and choice_sense_ids is null), 3::bigint, 'Cloze Questions use Vocabulary Entry choice provenance');
select ok(
  not exists (
    select 1
    from (
      select direction, row_number() over (order by ordinal) as translation_ordinal
      from public.review_session_questions
      where session_id = current_setting('test.cloze_session_id')::uuid
        and question_type = 'translation'
    ) as translations
    join (
      select direction, row_number() over (order by ordinal) as translation_ordinal
      from public.review_session_questions
      where session_id = current_setting('test.cloze_session_id')::uuid
        and question_type = 'translation'
    ) as previous_translations
      on previous_translations.translation_ordinal = translations.translation_ordinal - 1
    where translations.direction = previous_translations.direction
  ),
  'translation directions alternate when Cloze Questions are ignored'
);
select is(
  (
    select count(*)
    from public.review_session_questions as questions
    join public.senses on senses.id = questions.sense_id
    join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
    where questions.session_id = current_setting('test.cloze_session_id')::uuid
      and questions.question_type = 'cloze'
      and vocabulary_entries.expression in ('casa', 'CAFÉ', 'NUBE')
  ),
  3::bigint,
  'Cloze eligibility accepts case and canonical Unicode variants'
);
select is(
  (
    select count(*)
    from public.review_session_questions as questions
    join public.senses on senses.id = questions.sense_id
    join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
    where questions.session_id = current_setting('test.cloze_session_id')::uuid
      and questions.question_type = 'cloze'
      and vocabulary_entries.expression in ('sol', 'pez', 'pan')
  ),
  0::bigint,
  'Cloze eligibility rejects missing, repeated, and partial-word Examples'
);
select ok(
  (
    select coalesce(bool_and(prompt like '%_____%'), false)
    from public.review_session_questions
    where session_id = current_setting('test.cloze_session_id')::uuid
      and question_type = 'cloze'
  ),
  'Cloze prompts persist a blanked Example'
);
select ok(
  (
    select coalesce(bool_and(cardinality(choices) between 2 and 4), false)
    from public.review_session_questions
    where session_id = current_setting('test.cloze_session_id')::uuid
      and question_type = 'cloze'
  ),
  'Cloze choices have two to four options'
);
select ok(
  (
    select coalesce(bool_and(cardinality(choice_vocabulary_entry_ids) = cardinality(choices)), false)
    from public.review_session_questions
    where session_id = current_setting('test.cloze_session_id')::uuid
      and question_type = 'cloze'
  ),
  'Cloze choices persist aligned Vocabulary Entry provenance'
);
select ok(
  not exists (
    select 1
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choice_vocabulary_entry_ids) as choice(vocabulary_entry_id)
    where questions.session_id = current_setting('test.cloze_session_id')::uuid
      and questions.question_type = 'cloze'
    group by questions.id
    having count(*) <> count(distinct choice.vocabulary_entry_id)
  ),
  'Cloze choice provenance is distinct'
);
select ok(
  (
    select coalesce(bool_and(correct_answer = any(choices)), false)
    from public.review_session_questions
    where session_id = current_setting('test.cloze_session_id')::uuid
      and question_type = 'cloze'
  ),
  'Cloze choices include the reviewed Expression'
);
select is(
  (
    select count(*)
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices, questions.choice_vocabulary_entry_ids) as choice(text, vocabulary_entry_id)
    join public.vocabulary_entries on vocabulary_entries.id = choice.vocabulary_entry_id
    where questions.session_id = current_setting('test.cloze_session_id')::uuid
      and questions.question_type = 'cloze'
      and (vocabulary_entries.learning_language_id <> current_setting('test.cloze_learning_language_id')::uuid or vocabulary_entries.suspended)
  ),
  0::bigint,
  'Cloze choices stay within the active Learning Language'
);
select is(
  (
    select count(*)
    from public.review_session_questions as questions
    join public.senses on senses.id = questions.sense_id
    cross join lateral unnest(questions.choices, questions.choice_vocabulary_entry_ids) as choice(text, vocabulary_entry_id)
    join public.vocabulary_entries on vocabulary_entries.id = choice.vocabulary_entry_id
    where questions.session_id = current_setting('test.cloze_session_id')::uuid
      and questions.question_type = 'cloze'
      and choice.vocabulary_entry_id <> senses.vocabulary_entry_id
      and public.expression_identity(vocabulary_entries.expression) = public.expression_identity(questions.correct_answer)
  ),
  0::bigint,
  'Cloze choices exclude same-entry and equivalent-expression distractors'
);
select set_config('test.cloze_question_id', (select id::text from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'cloze' order by ordinal limit 1), true);
select set_config('test.cloze_entry_id', (select vocabulary_entry_id::text from public.senses join public.review_session_questions on review_session_questions.sense_id = senses.id where review_session_questions.id = current_setting('test.cloze_question_id')::uuid), true);
select set_config('test.cloze_prompt', (select prompt from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), true);
select set_config('test.cloze_choices', (select choices::text from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), true);
select set_config('test.cloze_correct_answer', (select correct_answer from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), true);
select is((public.start_or_resume_review_session(current_setting('test.cloze_learning_language_id')::uuid)->>'id'), current_setting('test.cloze_session_id'), 'resuming preserves the mixed Cloze snapshot');
select is((select question_type from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), 'cloze', 'resuming preserves the Cloze question type');
select is((select choices::text from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), current_setting('test.cloze_choices'), 'resuming preserves Cloze choices');
select is((select correct_answer from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), current_setting('test.cloze_correct_answer'), 'resuming preserves the Cloze correct answer');
set local role postgres;
update public.examples
set text = text || ' edited'
where sense_id = (select sense_id from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid);
update public.vocabulary_entries
set expression = expression || '-edited'
where id = current_setting('test.cloze_entry_id')::uuid;
set local role authenticated;
select is((select prompt from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), current_setting('test.cloze_prompt'), 'source Example edits do not change the Cloze prompt snapshot');
select is((select question_type from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), 'cloze', 'source Expression edits do not change the Cloze question type');
select is((select choices::text from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), current_setting('test.cloze_choices'), 'source Expression edits do not change the Cloze choices snapshot');
select is((select correct_answer from public.review_session_questions where id = current_setting('test.cloze_question_id')::uuid), current_setting('test.cloze_correct_answer'), 'source Expression edits do not change the Cloze correct answer snapshot');
select lives_ok(
  format(
    $$select public.submit_review_session_answer(%L::uuid, %L::uuid, %L)$$,
    current_setting('test.cloze_session_id'),
    current_setting('test.cloze_question_id'),
    current_setting('test.cloze_correct_answer')
  ),
  'a Cloze answer is submitted through the existing Review RPC'
);
select is((select count(*) from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), 1::bigint, 'a Cloze submission creates one Attempt');
select is((select question_type from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), 'cloze', 'the Cloze Attempt stores its question type');
select is((select direction from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), null, 'the Cloze Attempt stores no translation direction');
select is((select is_correct from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), true, 'the Cloze Attempt scores the correct Expression');
select is(
  (
    select question->>'selected_answer'
    from jsonb_array_elements(
      public.submit_review_session_answer(
        current_setting('test.cloze_session_id')::uuid,
        current_setting('test.cloze_question_id')::uuid,
        'wrong'
      )->'questions'
    ) as question
    where question->>'id' = current_setting('test.cloze_question_id')
  ),
  current_setting('test.cloze_correct_answer'),
  'retrying a Cloze submission preserves the first answer'
);
select is((select count(*) from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), 1::bigint, 'retrying a Cloze submission is idempotent');
select set_config('test.unanswered_cloze_question_id', (select id::text from public.review_session_questions where session_id = current_setting('test.cloze_session_id')::uuid and question_type = 'cloze' and selected_answer is null and id <> current_setting('test.cloze_question_id')::uuid order by ordinal limit 1), true);
select set_config('test.unanswered_cloze_entry_id', (select vocabulary_entry_id::text from public.senses join public.review_session_questions on review_session_questions.sense_id = senses.id where review_session_questions.id = current_setting('test.unanswered_cloze_question_id')::uuid), true);
select public.set_vocabulary_entry_suspended(current_setting('test.unanswered_cloze_entry_id')::uuid, true);
select public.review_session_overview(current_setting('test.cloze_learning_language_id')::uuid);
select is((select count(*) from public.review_session_questions where id = current_setting('test.unanswered_cloze_question_id')::uuid), 0::bigint, 'suspending an unanswered Cloze owner prunes its question');
select is((select count(*) from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), 1::bigint, 'suspension preserves the submitted Cloze Attempt');
set local role postgres;
delete from public.vocabulary_entries where id = current_setting('test.cloze_entry_id')::uuid;
set local role authenticated;
select is((select count(*) from public.review_attempts where session_id = current_setting('test.cloze_session_id')::uuid and question_id = current_setting('test.cloze_question_id')::uuid), 0::bigint, 'deleting a Cloze Vocabulary Entry removes its Attempt');
select public.create_study_pair('de', 'en');
select public.capture_manual_entry((select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'de'), 'haus', 'house', 'Das haus haus ist alt.');
select public.capture_manual_entry((select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'de'), 'baum', 'tree', 'Der wald ist grün.');
select public.capture_manual_entry((select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'de'), 'stern', 'star', 'Der sternenhimmel ist hell.');
select set_config('test.fallback_language_id', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'de'), true);
select set_config('app.review_session_min_questions', '3', true);
select set_config('app.review_session_max_questions', '3', true);
select lives_ok($$select public.start_or_resume_review_session(current_setting('test.fallback_language_id')::uuid)$$, 'insufficient Cloze material falls back to translation Review');
select is((select count(*) from public.review_session_questions where session_id = (select id from public.review_sessions where learner_id = auth.uid() and learning_language_id = current_setting('test.fallback_language_id')::uuid and status = 'active')), 3::bigint, 'fallback Review retains eligible translation Questions');
select is((select count(*) from public.review_session_questions where session_id = (select id from public.review_sessions where learner_id = auth.uid() and learning_language_id = current_setting('test.fallback_language_id')::uuid and status = 'active') and question_type = 'cloze'), 0::bigint, 'invalid or insufficient Examples produce no Cloze Questions');
select is((select count(*) from public.review_session_questions where session_id = (select id from public.review_sessions where learner_id = auth.uid() and learning_language_id = current_setting('test.fallback_language_id')::uuid and status = 'active') and question_type = 'translation'), 3::bigint, 'fallback Questions remain translations');

select public.create_study_pair('it', 'en');
select public.capture_manual_entry((select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'it'), 'sole', 'sun', 'Il sole splende.');
select public.capture_manual_entry((select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'it'), 'luna', 'moon', null);
select set_config('test.adaptive_cloze_language_id', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'it'), true);
select set_config('app.review_session_min_questions', '2', true);
select set_config('app.review_session_max_questions', '2', true);
select is(public.review_session_eligible_sense_count(current_setting('test.adaptive_cloze_language_id')::uuid), 2::bigint, 'adaptive Cloze fixture has two translation-eligible Senses');
select lives_ok($$select public.start_or_resume_review_session(current_setting('test.adaptive_cloze_language_id')::uuid)$$, 'adaptive Cloze fixture starts a Review Session');
select set_config('test.adaptive_cloze_session_id', (public.start_or_resume_review_session(current_setting('test.adaptive_cloze_language_id')::uuid)->>'id'), true);
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.adaptive_cloze_session_id')::uuid), 2::bigint, 'adaptive Cloze fixture creates two Questions');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.adaptive_cloze_session_id')::uuid and question_type = 'cloze'), 1::bigint, 'adaptive Cloze allocation includes one Cloze Question');
select is((select count(*) from public.review_session_questions where session_id = current_setting('test.adaptive_cloze_session_id')::uuid and question_type = 'translation'), 1::bigint, 'adaptive Cloze allocation retains one translation Question');
select is((select cardinality(choices) from public.review_session_questions where session_id = current_setting('test.adaptive_cloze_session_id')::uuid and question_type = 'cloze'), 2, 'a two-Entry Learning Language adapts Cloze choices to two');
select is((select cardinality(choice_vocabulary_entry_ids) from public.review_session_questions where session_id = current_setting('test.adaptive_cloze_session_id')::uuid and question_type = 'cloze'), 2, 'adaptive Cloze choices retain both Entry provenance values');
select ok(
  (
    select count(*) = 2
      and count(distinct choice.vocabulary_entry_id) = 2
      and bool_and(
        not vocabulary_entries.suspended
        and not learning_vocabulary_entries.suspended
        and vocabulary_entries.learning_language_id = current_setting('test.adaptive_cloze_language_id')::uuid
        and learning_vocabulary_entries.learning_language_id = current_setting('test.adaptive_cloze_language_id')::uuid
      )
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choice_vocabulary_entry_ids) as choice(vocabulary_entry_id)
    join public.vocabulary_entries on vocabulary_entries.id = choice.vocabulary_entry_id
    join public.learning_vocabulary_entries on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    where questions.session_id = current_setting('test.adaptive_cloze_session_id')::uuid
      and questions.question_type = 'cloze'
  ),
  'adaptive Cloze provenance identifies distinct active Entries'
);
select ok(
  (
    select correct_answer = any(choices)
    from public.review_session_questions
    where session_id = current_setting('test.adaptive_cloze_session_id')::uuid
      and question_type = 'cloze'
  ),
  'adaptive Cloze choices include the reviewed Expression'
);
select ok(
  (
    select cardinality(choices) >= 2
    from public.review_session_questions
    where session_id = current_setting('test.adaptive_cloze_session_id')::uuid
      and question_type = 'translation'
  ),
  'the mixed adaptive session retains a valid translation choice set'
);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('app.review_session_min_questions', '2', true);
select set_config('app.review_session_max_questions', '2', true);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'sol',
  'sun',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid() and target_language_tag = 'es'),
  'pez',
  'fish',
  null
);
set local role postgres;
insert into public.review_sessions (id, learner_id, learning_language_id, status, total_count)
values ('11130000-0000-0000-0000-000000000010', auth.uid(), current_setting('test.learning_language_id')::uuid, 'active', 0);
set local role authenticated;
select is(public.review_session_overview(current_setting('test.learning_language_id')::uuid), null, 'an empty active queue is absent from overview');
select is((select count(*) from public.review_sessions where id = '11130000-0000-0000-0000-000000000010'), 0::bigint, 'pruning retires the empty active session');
select set_config(
  'test.fresh_session_id',
  (public.start_or_resume_review_session(current_setting('test.learning_language_id')::uuid)->>'id'),
  true
);
select isnt(current_setting('test.fresh_session_id'), '11130000-0000-0000-0000-000000000010', 'a fresh session starts after empty queue retirement');
select set_config(
  'test.fresh_question_id',
  (
    select id::text
    from public.review_session_questions
    where session_id = current_setting('test.fresh_session_id')::uuid
    order by ordinal
    limit 1
  ),
  true
);
select set_config(
  'test.fresh_entry_id',
  (
    select vocabulary_entry_id::text
    from public.senses
    where id = (select sense_id from public.review_session_questions where id = current_setting('test.fresh_question_id')::uuid)
  ),
  true
);
select lives_ok(
  format(
    $$select public.submit_review_session_answer(%L::uuid, %L::uuid, (select correct_answer from public.review_session_questions where id = %L::uuid))$$,
    current_setting('test.fresh_session_id'),
    current_setting('test.fresh_question_id'),
    current_setting('test.fresh_question_id')
  ),
  'a correct answer can be continued before source deletion'
);
select lives_ok(
  format(
    $$select public.continue_review_session_question(%L::uuid, %L::uuid)$$,
    current_setting('test.fresh_session_id'),
    current_setting('test.fresh_question_id')
  ),
  'a continued correct question remains in the partial queue'
);
set local role postgres;
delete from public.vocabulary_entries where id = current_setting('test.fresh_entry_id')::uuid;
set local role authenticated;
select set_config(
  'test.fresh_overview',
  public.review_session_overview(current_setting('test.learning_language_id')::uuid)::text,
  true
);
select is((current_setting('test.fresh_overview')::jsonb->>'correct_count')::integer, 0, 'pruning deleted correct questions from the score');
select is((current_setting('test.fresh_overview')::jsonb->>'total_count')::integer, 1, 'pruning keeps correct and total counts consistent');

select throws_ok(
  $$insert into public.review_sessions (learner_id, learning_language_id) values (auth.uid(), current_setting('test.learning_language_id')::uuid)$$,
  '42501',
  'permission denied for table review_sessions',
  'clients cannot create Review Sessions directly'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.review_sessions), 0::bigint, 'another Learner cannot read Review Sessions');
select is((select count(*) from public.review_attempts), 0::bigint, 'another Learner cannot read Attempts');
select throws_ok(
  format(
    $$select public.review_session_overview(%L::uuid)$$,
    current_setting('test.learning_language_id')
  ),
  'P0001',
  'Learning Language is unavailable.',
  'another Learner cannot inspect a private Review Session'
);

select * from finish();
rollback;
