begin;

select plan(44);

insert into auth.users (id)
values
  ('59595959-5959-5959-5959-595959595959'),
  ('69696969-6969-6969-6969-696969696969');

set local role authenticated;
select set_config('request.jwt.claim.sub', '59595959-5959-5959-5959-595959595959', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry((select id from public.study_pairs), 'casa', 'house', null);
select public.capture_manual_entry((select id from public.study_pairs), 'casa', 'home', null);
select public.capture_manual_entry((select id from public.study_pairs), 'nube', 'cloud', null);

select is((select count(*) from public.cards), 6::bigint, 'each Sense has recognition and recall Cards');
select is((select count(distinct sense_id) from public.cards), 3::bigint, 'recognition Cards are independent by Sense');
select is((select count(*) from public.scheduled_review_overview()), 3::bigint, 'all active owned Cards are due initially');

select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where expression = 'nube' order by created_at limit 1), true);
select is((select count(*) from public.scheduled_review_overview()), 2::bigint, 'suspended material is excluded from due review data');
select is((select count(*) from public.cards), 6::bigint, 'suspension retains Card progress');
select set_config(
  'test.owner_card_id',
  (select cards.id::text from public.cards join public.senses on senses.id = cards.sense_id join public.translations on translations.sense_id = senses.id where translations.text = 'house' and cards.direction = 'recognition'),
  true
);

select lives_ok(
  format(
    $$select public.confirm_scheduled_review(%L::uuid, '59590000-0000-0000-0000-000000000001'::uuid, 'good'::public.scheduled_review_rating, '2026-09-01T09:00:00Z'::timestamptz)$$,
    current_setting('test.owner_card_id')
  ),
  'the owner can confirm one Scheduled Review'
);
select is((select count(*) from public.review_events), 1::bigint, 'confirmation appends one durable event');
select is((select rating from public.review_events), 'good'::public.scheduled_review_rating, 'the chosen rating is durable');
select is((select occurred_at from public.review_events), '2026-09-01T09:00:00Z'::timestamptz, 'the chronological review time is durable');

select lives_ok(
  format(
    $$select public.confirm_scheduled_review(%L::uuid, '59590000-0000-0000-0000-000000000001'::uuid, 'good'::public.scheduled_review_rating, '2026-09-01T09:00:00Z'::timestamptz)$$,
    (select card_id from public.review_events)
  ),
  'retrying the same event identity is idempotent'
);
select is((select count(*) from public.review_events), 1::bigint, 'idempotent retry does not duplicate the event');
select is((select count(distinct card_id) from public.review_events), 1::bigint, 'only the reviewed Card has an event');

select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where expression = 'nube' order by created_at limit 1), false);
select public.capture_learning_language_entry(
  (select learning_language_id from public.cards where id = current_setting('test.owner_card_id')::uuid),
  'uk',
  'nube',
  'хмара',
  null,
  null,
  true
);
select set_config(
  'test.learning_language_id',
  (select learning_language_id::text from public.cards where id = current_setting('test.owner_card_id')::uuid),
  true
);
select set_config(
  'test.recall_card_id',
  (select cards.id::text from public.cards where cards.sense_id = (select sense_id from public.cards where id = current_setting('test.owner_card_id')::uuid) and cards.answer_language_tag = 'en' and cards.direction = 'recall'),
  true
);
select set_config(
  'test.mixed_card_id',
  (select cards.id::text from public.cards join public.translations on translations.sense_id = cards.sense_id and translations.learner_id = cards.learner_id where cards.learning_language_id = current_setting('test.learning_language_id')::uuid and cards.answer_language_tag = 'uk' and cards.direction = 'recognition' and translations.text = 'хмара' limit 1),
  true
);
select is((select count(*) from public.cards where learning_language_id = current_setting('test.learning_language_id')::uuid and direction in ('recognition', 'recall')), 8::bigint, 'recognition and recall Cards share one Learning Language across Answer Languages');
select throws_ok(
  format(
    $$select public.start_or_resume_scheduled_review(%L::uuid, '{}'::uuid[])$$,
    current_setting('test.learning_language_id')
  ),
  'P0001',
  'Card selection is required.',
  'an empty scheduled review selection is rejected'
);
select throws_ok(
  format(
    $$select public.start_or_resume_scheduled_review(%L::uuid, array[%L::uuid, %L::uuid])$$,
    current_setting('test.learning_language_id'),
    current_setting('test.owner_card_id'),
    current_setting('test.owner_card_id')
  ),
  'P0001',
  'Card selection contains duplicates.',
  'duplicate Cards are rejected'
);
select throws_ok(
  format(
    $$select public.start_or_resume_scheduled_review(%L::uuid, array['69690000-0000-0000-0000-000000000001'::uuid])$$,
    current_setting('test.learning_language_id')
  ),
  'P0001',
  'Card selection is unavailable.',
  'unowned Cards are rejected'
);
select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where expression = 'nube' order by created_at limit 1), true);
select throws_ok(
  format(
    $$select public.start_or_resume_scheduled_review(%L::uuid, array[%L::uuid])$$,
    current_setting('test.learning_language_id'),
    current_setting('test.mixed_card_id')
  ),
  'P0001',
  'Card selection is unavailable.',
  'suspended Cards are rejected'
);
select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where expression = 'nube' order by created_at limit 1), false);
select public.create_learning_language('fr');
select public.capture_learning_language_entry(
  (select id from public.learning_languages where learner_id = '59595959-5959-5959-5959-595959595959' and language_tag = 'fr'),
  'en',
  'bonjour',
  'hello',
  null,
  null,
  false
);
select set_config(
  'test.other_language_card_id',
  (select cards.id::text from public.cards where learning_language_id = (select id from public.learning_languages where learner_id = '59595959-5959-5959-5959-595959595959' and language_tag = 'fr') and direction = 'recognition' limit 1),
  true
);
select throws_ok(
  format(
    $$select public.start_or_resume_scheduled_review(%L::uuid, array[%L::uuid, %L::uuid])$$,
    current_setting('test.learning_language_id'),
    current_setting('test.owner_card_id'),
    current_setting('test.other_language_card_id')
  ),
  'P0001',
  'Card selection is unavailable.',
  'Cards from another Learning Language are rejected'
);

select set_config(
  'test.session',
  public.start_or_resume_scheduled_review(
    current_setting('test.learning_language_id')::uuid,
    array[
      current_setting('test.owner_card_id')::uuid,
      current_setting('test.recall_card_id')::uuid,
      current_setting('test.mixed_card_id')::uuid
    ]
  )->>'id',
  true
);
select is((public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->>'status'), 'active', 'a scheduled review session starts active');
select is(jsonb_array_length(public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->'items'), 3, 'the session snapshots its queue membership');
select is((public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->'items'->0->>'ordinal'), '1', 'the first Card has stable ordinal one');
select is((public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->'items'->1->>'ordinal'), '2', 'the second Card has stable ordinal two');
select is((public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->'items'->2->>'ordinal'), '3', 'the third Card has stable ordinal three');
select is((public.start_or_resume_scheduled_review(
  current_setting('test.learning_language_id')::uuid,
  array[current_setting('test.mixed_card_id')::uuid, current_setting('test.owner_card_id')::uuid]
)->>'id'), current_setting('test.session'), 'resuming ignores later queue changes and keeps the original session');
select is(jsonb_array_length(public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid)->'items'), 3, 'resuming does not add later Cards to the snapshot');

select is((public.confirm_scheduled_review_session(
  current_setting('test.session')::uuid,
  current_setting('test.owner_card_id')::uuid,
  '59590000-0000-0000-0000-000000000002'::uuid,
  'good'::public.scheduled_review_rating,
  '2026-09-01T09:30:00Z'::timestamptz
)->>'already_confirmed'), 'false', 'the first session confirmation inserts one event');
select is((public.confirm_scheduled_review_session(
  current_setting('test.session')::uuid,
  current_setting('test.owner_card_id')::uuid,
  '59590000-0000-0000-0000-000000000003'::uuid,
  'easy'::public.scheduled_review_rating,
  '2026-09-01T09:31:00Z'::timestamptz
)->>'already_confirmed'), 'true', 'confirming one session item twice is idempotent');
select is((public.confirm_scheduled_review_session(
  current_setting('test.session')::uuid,
  current_setting('test.recall_card_id')::uuid,
  '59590000-0000-0000-0000-000000000004'::uuid,
  'hard'::public.scheduled_review_rating,
  '2026-09-01T09:32:00Z'::timestamptz
)->>'session_status'), 'active', 'a partially confirmed session remains active');
select is((public.confirm_scheduled_review_session(
  current_setting('test.session')::uuid,
  current_setting('test.mixed_card_id')::uuid,
  '59590000-0000-0000-0000-000000000005'::uuid,
  'again'::public.scheduled_review_rating,
  '2026-09-01T09:33:00Z'::timestamptz
)->>'session_status'), 'completed', 'the last confirmation completes the session');
select is((select count(*) from public.review_events), 4::bigint, 'session confirmations append only the unconfirmed items');
select is((select count(distinct id) from public.review_events), 4::bigint, 'each confirmed Card has a distinct event UUID');
select is((select status from public.scheduled_review_sessions where id = current_setting('test.session')::uuid), 'completed', 'the completed session outcome is durable');
select is((public.end_scheduled_review_session(current_setting('test.session')::uuid)->>'status'), 'completed', 'ending a completed session preserves its outcome');
select is(public.scheduled_review_session_overview(current_setting('test.learning_language_id')::uuid), null, 'completed sessions are absent from the active overview');

select public.capture_learning_language_entry(
  current_setting('test.learning_language_id')::uuid,
  'de',
  'sol',
  'Sonne',
  null,
  null,
  true
);
select set_config(
  'test.early_end_card_id',
  (select cards.id::text from public.cards where learning_language_id = current_setting('test.learning_language_id')::uuid and answer_language_tag = 'de' and direction = 'recognition' limit 1),
  true
);
select set_config(
  'test.early_end_session',
  public.start_or_resume_scheduled_review(current_setting('test.learning_language_id')::uuid, array[current_setting('test.early_end_card_id')::uuid])->>'id',
  true
);
select is((public.end_scheduled_review_session(current_setting('test.early_end_session')::uuid)->>'status'), 'ended', 'an active session can end early');
select is((select count(*) from public.review_events where card_id = current_setting('test.early_end_card_id')::uuid), 0::bigint, 'ending early does not invent events');
select throws_ok(
  format(
    $$select public.confirm_scheduled_review_session(%L::uuid, %L::uuid, '59590000-0000-0000-0000-000000000006'::uuid, 'good'::public.scheduled_review_rating, '2026-09-01T09:34:00Z'::timestamptz)$$,
    current_setting('test.early_end_session'),
    current_setting('test.early_end_card_id')
  ),
  'P0001',
  'Scheduled Review Session has ended.',
  'ended sessions cannot receive new confirmations'
);

select set_config('request.jwt.claim.sub', '69696969-6969-6969-6969-696969696969', true);
select is((select count(*) from public.cards), 0::bigint, 'another Learner cannot read Cards');
select is((select count(*) from public.review_events), 0::bigint, 'another Learner cannot read review events');
select is((select count(*) from public.scheduled_review_sessions), 0::bigint, 'another Learner cannot read scheduled review sessions');
select is((select count(*) from public.scheduled_review_session_items), 0::bigint, 'another Learner cannot read scheduled review items');
select throws_ok(
  format(
    $$select public.confirm_scheduled_review(%L::uuid, '69690000-0000-0000-0000-000000000001'::uuid, 'good'::public.scheduled_review_rating, '2026-09-01T10:00:00Z'::timestamptz)$$,
    current_setting('test.owner_card_id')
  ),
  'P0001',
  'Recognition Card is unavailable.',
  'another Learner cannot confirm a private Card'
);
select throws_ok(
  $$insert into public.review_events (card_id, occurred_at, rating) values ('59590000-0000-0000-0000-000000000001', now(), 'good')$$,
  '42501',
  'permission denied for table review_events',
  'clients cannot append review evidence outside the confirmation function'
);
select throws_ok(
  format(
    $$insert into public.scheduled_review_sessions (learner_id, learning_language_id) values ('69696969-6969-6969-6969-696969696969', %L::uuid)$$,
    current_setting('test.learning_language_id')
  ),
  '42501',
  'permission denied for table scheduled_review_sessions',
  'clients cannot create sessions directly'
);

select * from finish();
rollback;
