create extension if not exists dblink;

begin;

select plan(77);

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

select is((select count(*) from public.cards where learner_id = auth.uid()), 6::bigint, 'legacy Cards exist before unscheduled Review');
select is((select count(*) from public.review_events where learner_id = auth.uid()), 0::bigint, 'legacy review events start empty');

select set_config(
  'test.learning_language_id',
  (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'),
  true
);
select set_config(
  'test.legacy_card_id',
  (select id::text from public.cards where learner_id = auth.uid() and direction = 'recognition' order by created_at, id limit 1),
  true
);

select public.confirm_scheduled_review(
  current_setting('test.legacy_card_id')::uuid,
  '11110000-0000-0000-0000-000000000001'::uuid,
  'good'::public.scheduled_review_rating,
  '2026-09-19T10:00:00Z'::timestamptz
);
select public.start_or_resume_scheduled_review(
  current_setting('test.learning_language_id')::uuid,
  array[current_setting('test.legacy_card_id')::uuid]
);
select set_config('test.legacy_events', (select count(*)::text from public.review_events where learner_id = auth.uid()), true);
select set_config('test.legacy_cards', (select count(*)::text from public.cards where learner_id = auth.uid()), true);
select set_config('test.legacy_scheduled', (select count(*)::text from public.scheduled_review_sessions where learner_id = auth.uid()), true);
select set_config('app.review_session_min_size', '2', true);
select set_config('app.review_session_max_size', '2', true);

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
select is((select count(*) from public.review_events where learner_id = auth.uid()), current_setting('test.legacy_events')::bigint, 'Review Session submission does not append legacy events');
select is((select count(*) from public.cards where learner_id = auth.uid()), current_setting('test.legacy_cards')::bigint, 'Review Session submission does not change Cards');
select is((select count(*) from public.scheduled_review_sessions where learner_id = auth.uid()), current_setting('test.legacy_scheduled')::bigint, 'Review Session submission does not change scheduled sessions');
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
  (select total_count >= 1 from public.review_sessions where id = current_setting('test.repeat_session_id')::uuid),
  'pruning retains at least one unanswered question when enough choices remain'
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
select set_config(
  'test.remaining_distractor_sense_id',
  (
    select choice.sense_id::text
    from public.review_session_questions as questions
    cross join lateral unnest(questions.choices, questions.choice_sense_ids) as choice(text, sense_id)
    where questions.session_id = current_setting('test.repeat_session_id')::uuid
      and questions.sense_id <> (select sense_id from public.review_session_questions where id = current_setting('test.question_id')::uuid)
      and choice.sense_id <> questions.sense_id
    limit 1
  ),
  true
);
select set_config(
  'test.remaining_distractor_entry_id',
  (
    select vocabulary_entry_id::text
    from public.senses
    where id = current_setting('test.remaining_distractor_sense_id')::uuid
  ),
  true
);
set local role postgres;
delete from public.vocabulary_entries
where id = current_setting('test.remaining_distractor_entry_id')::uuid
  and learner_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select is(jsonb_array_length(public.review_session_overview(current_setting('test.learning_language_id')::uuid)->'questions'), 0, 'an unanswered question below two choices is pruned');
select is((select total_count from public.review_sessions where id = current_setting('test.repeat_session_id')::uuid), 0, 'pruning removes the unavailable queue total');
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
