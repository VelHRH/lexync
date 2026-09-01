begin;

select plan(9);

insert into auth.users (id)
values
  ('51515151-5151-5151-5151-515151515151'),
  ('52525252-5252-5252-5252-525252525252');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51515151-5151-5151-5151-515151515151', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry((select id from public.study_pairs), 'descubrir', 'to discover', 'Quiero descubrir la ciudad.');

select lives_ok(
  format($$select public.set_vocabulary_entry_suspended(%L, true)$$, (select id from public.vocabulary_entries)),
  'a Learner can suspend an owned Vocabulary Entry'
);
select ok((select suspended from public.vocabulary_entries), 'suspension state is durable');
select is((select count(*) from public.senses), 1::bigint, 'suspension retains Senses');
select is((select text from public.translations), 'to discover', 'suspension retains translations');
select is((select text from public.examples), 'Quiero descubrir la ciudad.', 'suspension retains Examples');

select set_config('request.jwt.claim.sub', '52525252-5252-5252-5252-525252525252', true);
select throws_ok(
  format($$select public.set_vocabulary_entry_suspended(%L, false)$$, (select id from public.vocabulary_entries)),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'another Learner cannot resume the Vocabulary Entry'
);

select set_config('request.jwt.claim.sub', '51515151-5151-5151-5151-515151515151', true);
select ok((select suspended from public.vocabulary_entries), 'a rejected cross-account mutation leaves suspension unchanged');
select lives_ok(
  format($$select public.set_vocabulary_entry_suspended(%L, false)$$, (select id from public.vocabulary_entries)),
  'the owner can resume the Vocabulary Entry'
);
select isnt((select suspended from public.vocabulary_entries), true, 'resumption restores active state without recreating the Entry');

select * from finish();
rollback;
