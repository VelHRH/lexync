begin;

select plan(15);

insert into auth.users (id)
values ('55555555-5555-5555-5555-555555555555');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

select public.create_study_pair('fr', 'en');
select public.create_study_pair('fr', 'uk');

select public.capture_manual_entry(
  (select id from public.study_pairs where reference_language_tag = 'en'),
  'CAFÉ AU LAIT',
  U&'MORNING DR\00CDNK',
  'Le café au lait est déjà prêt.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where reference_language_tag = 'en'),
  U&'cafe\0301   au lait',
  U&' morning   dri\0301nk ',
  E'  Elle commande un CAFÉ  au lait.\t'
);

select is((select count(*) from public.vocabulary_entries), 1::bigint, 'an equivalent Expression reuses its Vocabulary Entry');
select is((select count(*) from public.senses), 1::bigint, 'an equivalent translation reuses its Sense');
select is((select count(*) from public.translations), 1::bigint, 'an equivalent translation is not duplicated');
select is((select count(*) from public.examples), 2::bigint, 'a matching Sense receives another Example');
select is(
  (select count(distinct sense_id) from public.examples),
  1::bigint,
  'matching Examples belong to the reused Sense'
);
select is(
  (select text from public.examples where text like '%Elle%'),
  E'  Elle commande un CAFÉ  au lait.\t',
  'the complete captured Example spelling is preserved'
);

select public.capture_manual_entry(
  (select id from public.study_pairs where reference_language_tag = 'en'),
  'café au lait',
  'coffee with milk',
  'Ce café au lait accompagne le déjeuner.'
);

select is((select count(*) from public.vocabulary_entries), 1::bigint, 'a new translation still reuses the Vocabulary Entry');
select is((select count(*) from public.senses), 2::bigint, 'a new translation creates a personal Sense');
select is((select count(*) from public.translations), 2::bigint, 'the new Sense owns its translation');
select is(
  (
    select examples.text
    from public.examples as examples
    join public.translations as translations on translations.sense_id = examples.sense_id
    where translations.text = 'coffee with milk'
  ),
  'Ce café au lait accompagne le déjeuner.',
  'the new Example is assigned to the new Sense'
);
select is(
  (select count(*) from public.examples where sense_id is null),
  0::bigint,
  'every Example belongs to exactly one Sense'
);

select public.capture_manual_entry(
  (select id from public.study_pairs where reference_language_tag = 'uk'),
  'café au lait',
  'кава з молоком',
  null
);

select is((select count(*) from public.vocabulary_entries), 2::bigint, 'the same Expression remains independent across Study Pairs');
select is((select count(*) from public.senses), 3::bigint, 'the other Study Pair owns an independent Sense');
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('vocabulary_entries', 'senses', 'translations', 'examples')
      and column_name in ('source_url', 'page_title', 'source_application', 'capture_provenance', 'provenance')
  ),
  0::bigint,
  'first-release records contain no capture provenance fields'
);

select is(
  (public.capture_manual_entry(
    (select id from public.study_pairs where reference_language_tag = 'en'),
    'CAFÉ AU LAIT',
    U&'morning dri\0301nk',
    null
  )->>'senseCreated')::boolean,
  false,
  'capture reports when an existing Sense is enriched'
);

select * from finish();
rollback;
