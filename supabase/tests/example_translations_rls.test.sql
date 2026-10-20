begin;

select plan(8);

insert into auth.users (id)
values
  ('71717171-7171-7171-7171-717171717171'),
  ('81818181-8181-8181-8181-818181818181');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71717171-7171-7171-7171-717171717171', true);

select public.create_study_pair('it', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs),
  'incontro',
  'meeting',
  'La città gli veniva incontro.'
);

select public.update_vocabulary_entry(
  (select id from public.vocabulary_entries),
  'incontro',
  jsonb_build_array(jsonb_build_object(
    'id', (select id from public.senses),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations), 'text', 'meeting')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', (select id from public.examples),
      'text', 'La città gli veniva incontro.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'The city was coming towards him.'))
    ))
  ))
);

select set_config('tests.vocabulary_entry_id', (select id::text from public.vocabulary_entries), true);

select set_config('request.jwt.claim.sub', '81818181-8181-8181-8181-818181818181', true);

select is((select count(*) from public.example_translations), 0::bigint, 'another Learner cannot read Example Translations');

select throws_ok(
  $$insert into public.example_translations (example_id, text) values (gen_random_uuid(), 'intruder')$$,
  '42501',
  'permission denied for table example_translations',
  'another Learner cannot insert an Example Translation directly'
);
select throws_ok(
  $$update public.example_translations set text = 'changed'$$,
  '42501',
  'permission denied for table example_translations',
  'another Learner cannot update an Example Translation directly'
);
select throws_ok(
  $$delete from public.example_translations$$,
  '42501',
  'permission denied for table example_translations',
  'another Learner cannot delete an Example Translation directly'
);

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L::uuid, 'stolen', '[]'::jsonb)$$,
    current_setting('tests.vocabulary_entry_id')
  ),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'another Learner cannot reach a private Example through the aggregate'
);

select set_config('request.jwt.claim.sub', '71717171-7171-7171-7171-717171717171', true);

select is((select count(*) from public.example_translations), 1::bigint, 'the Learner can read their own Example Translation');
select is(
  (select text from public.example_translations),
  'The city was coming towards him.',
  'a rejected direct write leaves the Example Translation unchanged'
);

set local role anon;
select throws_ok(
  $$select * from public.example_translations$$,
  '42501',
  'permission denied for table example_translations',
  'anonymous callers cannot read Example Translations'
);

select * from finish();
rollback;
