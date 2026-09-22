begin;

select plan(17);

select ok(to_regclass('public.cards') is not null, 'Cards remain the durable Sense ownership records');
select ok(
  not exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.cards')
      and not attisdropped
      and attname in ('due_at', 'due', 'stability', 'difficulty', 'reps', 'lapses', 'last_review', 'scheduled_at')
  ),
  'Cards do not carry schedule state'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.cards')
      and not attisdropped
      and attname = 'sense_id'
  ),
  'Cards retain Sense identity'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.cards')
      and not attisdropped
      and attname = 'answer_language_tag'
  ),
  'Cards retain Answer Language identity'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.cards')
      and not attisdropped
      and attname = 'direction'
  ),
  'Cards retain direction identity'
);

select ok(to_regclass('public.review_participations') is not null, 'rating-free historical participation records remain available');
select ok(
  not exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.review_participations')
      and not attisdropped
      and attname in ('rating', 'is_correct', 'correct', 'correctness', 'due_at', 'due', 'stability', 'difficulty', 'reps', 'lapses', 'last_review')
  ),
  'historical participation records have no rating, correctness, or schedule payload'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.review_participations')
      and not attisdropped
      and attname = 'card_id'
  ),
  'historical participation records retain Card ownership'
);
select ok(
  exists (
    select 1
    from pg_attribute
    where attrelid = to_regclass('public.review_participations')
      and not attisdropped
      and attname in ('occurred_at', 'participated_at', 'created_at')
  ),
  'historical participation records retain a timestamp'
);
select ok(
  not exists (
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('review_events', 'scheduled_review_sessions', 'scheduled_review_session_items')
  ),
  'obsolete scheduling relations are retired'
);
select ok(
  not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'scheduled_review_rating'
  ),
  'obsolete rating type is retired'
);
select ok(
  not exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'scheduled_review_overview',
        'learning_scheduled_review_overview',
        'confirm_scheduled_review',
        'start_or_resume_scheduled_review',
        'scheduled_review_session_overview',
        'confirm_scheduled_review_session',
        'end_scheduled_review_session'
      )
  ),
  'obsolete scheduling APIs are retired'
);

insert into auth.users (id)
values ('59595959-5959-5959-5959-595959595959');

set local role authenticated;
select set_config('request.jwt.claim.sub', '59595959-5959-5959-5959-595959595959', true);
select public.create_learning_language('es');
select public.capture_learning_language_entry(
  (select id from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'),
  'en',
  'casa',
  'house',
  null,
  null,
  true
);
select public.capture_learning_language_entry(
  (select id from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'),
  'uk',
  'casa',
  'дім',
  null,
  (select sense_id from public.translations where learner_id = auth.uid() and text = 'house'),
  false
);

select set_config(
  'test.card_id',
  (select id::text from public.cards where learner_id = auth.uid() order by created_at, id limit 1),
  true
);
select set_config(
  'test.vocabulary_entry_id',
  (select vocabulary_entry_id::text from public.senses where id = (select sense_id from public.cards where id = current_setting('test.card_id')::uuid)),
  true
);
set local role postgres;
insert into public.review_participations (id, learner_id, card_id, occurred_at)
values (
  '59590000-0000-0000-0000-000000000001',
  '59595959-5959-5959-5959-595959595959',
  current_setting('test.card_id')::uuid,
  '2026-09-19T10:00:00Z'::timestamptz
);
set local role authenticated;

select is(
  (select count(distinct (sense_id, answer_language_tag, direction)) from public.cards where learner_id = auth.uid()),
  4::bigint,
  'Card identity is Sense plus Answer Language plus direction'
);
select is(
  (select count(*) from public.cards where learner_id = auth.uid()),
  4::bigint,
  'one Sense has independent Cards for each Answer Language and direction'
);
select is(
  (select count(*) from public.review_participations where learner_id = auth.uid()),
  1::bigint,
  'a Learner can query rating-free historical participation records'
);
select public.set_vocabulary_entry_suspended(current_setting('test.vocabulary_entry_id')::uuid, true);
select is(
  (select count(*) from public.review_participations where learner_id = auth.uid()),
  1::bigint,
  'suspension excludes future Review without deleting retained participation history'
);
select ok(
  not jsonb_path_exists(public.account_learning_snapshot(), '$.cards[*].events')
    and not jsonb_path_exists(public.account_learning_snapshot(), '$.cards[*].rating')
    and not jsonb_path_exists(public.account_learning_snapshot(), '$.cards[*].due')
    and not jsonb_path_exists(public.account_learning_snapshot(), '$.cards[*].dueAt'),
  'the account snapshot exposes no event, rating, or schedule payload'
);

select * from finish();
rollback;
