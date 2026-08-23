begin;

select plan(13);

insert into auth.users (id)
values ('44444444-4444-4444-4444-444444444444');

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select public.create_study_pair('pt-br', 'en');
select public.create_study_pair('pt-BR', 'uk');
select public.create_study_pair('pt-PT', 'en');
select public.create_study_pair('zh-Hans', 'en');
select public.create_study_pair('zh-Hant', 'en');

select is(
  (select count(*) from public.study_pairs where target_language_tag = 'pt-BR'),
  2::bigint,
  'canonical BCP 47 tags share a Target Language'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag in ('pt-BR', 'pt-PT')),
  3::bigint,
  'regional BCP 47 variants remain distinct'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag in ('zh-Hans', 'zh-Hant')),
  2::bigint,
  'script BCP 47 variants remain distinct'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag = 'pt-BR' and is_primary),
  1::bigint,
  'the first Study Pair is primary for its Target Language'
);
select throws_ok(
  $$select public.create_study_pair('pt-BR', 'en')$$,
  '23505',
  null,
  'a canonical duplicate Study Pair is rejected'
);

select public.set_primary_study_pair(
  (select id from public.study_pairs where target_language_tag = 'pt-BR' and reference_language_tag = 'uk')
);
select is(
  (select reference_language_tag from public.study_pairs where target_language_tag = 'pt-BR' and is_primary),
  'uk',
  'the primary Study Pair can be changed atomically'
);
select throws_ok(
  $$update public.study_pairs set is_primary = false where target_language_tag = 'pt-BR' and is_primary; set constraints require_primary_study_pair immediate$$,
  '23514',
  null,
  'a Target Language cannot be left without a primary Study Pair'
);

select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'pt-BR' and reference_language_tag = 'en'),
  E'  CAFÉ\t AU   LAIT  ',
  'coffee with milk',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'pt-BR' and reference_language_tag = 'en'),
  E'\tcafé au lait\n',
  'coffee with milk',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'pt-BR' and reference_language_tag = 'en'),
  'cafés au lait',
  'coffees with milk',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'pt-PT' and reference_language_tag = 'en'),
  U&'cafe\0301 au lait',
  'coffee with milk',
  null
);

select is((select count(*) from public.vocabulary_entries), 3::bigint, 'equivalent Expressions reuse one Vocabulary Entry within a Study Pair');
select is(
  (
    select expression
    from public.vocabulary_entries
    where study_pair_id = (
      select id from public.study_pairs where target_language_tag = 'pt-BR' and reference_language_tag = 'en'
    ) and expression_identity = public.expression_identity(E'  CAFÉ\t AU   LAIT  ')
  ),
  E'CAFÉ\t AU   LAIT',
  'the first captured Expression spelling is preserved'
);
select is((select count(*) from public.senses), 4::bigint, 'repeated capture still records its Sense before enrichment rules exist');
select is((select count(*) from public.translations), 4::bigint, 'repeated capture still records its translation');
select is((select count(*) from public.examples), 0::bigint, 'no Example is invented');
select is(
  (select count(*) from public.vocabulary_entries where expression_identity = public.expression_identity(U&'cafe\0301 au lait')),
  2::bigint,
  'the same Expression remains independent across Study Pairs'
);

select * from finish();
rollback;
