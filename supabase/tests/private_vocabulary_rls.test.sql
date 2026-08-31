begin;

select plan(8);

insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.study_pairs (id, target_language_tag, reference_language_tag)
values ('33333333-3333-3333-3333-333333333333', 'it', 'en');

select public.capture_manual_entry(
  '33333333-3333-3333-3333-333333333333',
  'incontro',
  'meeting',
  'La città gli veniva incontro.'
);

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is((select count(*) from public.study_pairs), 0::bigint, 'another Learner cannot read Study Pairs');
select is((select count(*) from public.vocabulary_entries), 0::bigint, 'another Learner cannot read Vocabulary Entries');
select is((select count(*) from public.senses), 0::bigint, 'another Learner cannot read Senses');
select is((select count(*) from public.translations), 0::bigint, 'another Learner cannot read translations');
select is((select count(*) from public.examples), 0::bigint, 'another Learner cannot read Examples');
select throws_ok(
  $$update public.vocabulary_entries set expression = 'changed'$$,
  '42501',
  'permission denied for table vocabulary_entries',
  'direct aggregate updates are unavailable to clients'
);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select is((select expression from public.vocabulary_entries), 'incontro', 'a rejected direct update leaves the Vocabulary Entry unchanged');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$select public.capture_manual_entry('33333333-3333-3333-3333-333333333333', 'intruso', 'intruder', null)$$,
  'P0001',
  'Study Pair is unavailable.',
  'another Learner cannot capture into a private Study Pair'
);

select * from finish();
rollback;
