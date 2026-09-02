begin;

select plan(16);

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

select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where expression = 'nube'), true);
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

select set_config('request.jwt.claim.sub', '69696969-6969-6969-6969-696969696969', true);
select is((select count(*) from public.cards), 0::bigint, 'another Learner cannot read Cards');
select is((select count(*) from public.review_events), 0::bigint, 'another Learner cannot read review events');
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

select * from finish();
rollback;
