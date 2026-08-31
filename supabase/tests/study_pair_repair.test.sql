begin;

select plan(29);

insert into auth.users (id)
values
  ('77777777-7777-7777-7777-777777777777'),
  ('88888888-8888-8888-8888-888888888888');

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

select public.create_study_pair('es', 'en');
select public.create_study_pair('fr', 'en');
select public.create_study_pair('es', 'uk');
select public.create_study_pair('de', 'uk');

select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  'Casa',
  'home',
  'Mi casa es pequeña.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  'libro',
  'book',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en'),
  ' casa ',
  'house',
  null
);

select is(
  (select count(*) from public.study_pair_overview()),
  4::bigint,
  'Study Pair overview returns only the Learner owned pairs'
);
select is(
  (select entry_count from public.study_pair_overview() where target_language_tag = 'es' and reference_language_tag = 'en'),
  2::bigint,
  'Study Pair overview returns an exact populated source count'
);
select is(
  (select entry_count from public.study_pair_overview() where target_language_tag = 'fr' and reference_language_tag = 'en'),
  1::bigint,
  'Study Pair overview returns an exact destination count'
);

select throws_ok(
  $$select public.update_empty_study_pair_languages(
    (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
    'pt',
    'en'
  )$$,
  'P0001',
  'Languages are locked because this Study Pair owns Vocabulary Entries.',
  'populated Study Pair languages cannot be reinterpreted'
);
select lives_ok(
  $$select public.update_empty_study_pair_languages(
    (select id from public.study_pairs where target_language_tag = 'de' and reference_language_tag = 'uk'),
    'it-it',
    'en-us'
  )$$,
  'an empty Study Pair can correct its languages'
);
select is(
  (select target_language_tag || '|' || reference_language_tag from public.study_pairs where target_language_tag = 'it-IT'),
  'it-IT|en-US',
  'empty-pair correction canonicalizes both language tags'
);
select throws_ok(
  $$update public.study_pairs set target_language_tag = 'pt' where target_language_tag = 'es' and reference_language_tag = 'en'$$,
  '42501',
  null,
  'direct client updates cannot bypass language repair functions'
);
select throws_ok(
  $$select public.move_vocabulary_entries(
    array[(select id from public.vocabulary_entries where expression = 'libro')],
    (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'uk')
  )$$,
  'P0001',
  'The destination must use the same Reference Language.',
  'a different Reference Language rejects the complete move'
);
select is(
  public.move_vocabulary_entries(
    array[(select id from public.vocabulary_entries where expression = 'Casa')],
    (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  1,
  'an equivalent destination Expression is enriched atomically'
);
select is(
  (select count(*) from public.vocabulary_entries where expression = 'Casa'),
  0::bigint,
  'the enriched source aggregate is removed'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
      and expression_identity = public.expression_identity('casa')
  ),
  1::bigint,
  'destination Expression identity remains unique'
);
select is(
  (
    select count(*)
    from public.translations
    join public.senses on senses.id = translations.sense_id
    join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
    where vocabulary_entries.study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
      and vocabulary_entries.expression_identity = public.expression_identity('casa')
  ),
  2::bigint,
  'distinct translations enrich the equivalent destination aggregate'
);
select is(
  (
    select count(*)
    from public.examples
    join public.senses on senses.id = examples.sense_id
    join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
    where vocabulary_entries.study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
      and vocabulary_entries.expression_identity = public.expression_identity('casa')
  ),
  1::bigint,
  'private Examples move to the enriched destination Sense'
);
select is(
  public.move_vocabulary_entries(
    array[(select id from public.vocabulary_entries where expression = 'libro')],
    (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  1,
  'a unique Expression moves as one complete aggregate'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where expression = 'libro'
      and study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  1::bigint,
  'the unique aggregate belongs to the destination'
);

select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  'uno',
  'one',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  'dos',
  'two',
  null
);

reset role;
delete from public.translations
where sense_id = (
  select senses.id
  from public.senses
  join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
  where vocabulary_entries.expression = 'dos'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

select throws_ok(
  $$select public.move_vocabulary_entries(
    array[
      (select id from public.vocabulary_entries where expression = 'uno'),
      (select id from public.vocabulary_entries where expression = 'dos')
    ],
    (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  )$$,
  'P0001',
  'Every moved Sense needs at least one translation.',
  'an incomplete aggregate rejects the complete batch'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where expression = 'uno'
      and study_pair_id = (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en')
  ),
  1::bigint,
  'a rejected batch preserves an earlier valid source aggregate'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where expression in ('uno', 'dos')
      and study_pair_id = (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en')
  ),
  2::bigint,
  'a rejected batch preserves every selected source aggregate'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  2::bigint,
  'a rejected batch leaves the destination unchanged'
);

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
select public.create_study_pair('pl', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where target_language_tag = 'pl' and reference_language_tag = 'en'),
  'obcy',
  'foreign',
  null
);
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

select throws_ok(
  $$select public.move_vocabulary_entries(
    array['00000000-0000-0000-0000-000000000000'::uuid],
    (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  )$$,
  'P0001',
  'Vocabulary Entry selection is unavailable.',
  'foreign Vocabulary Entries are unavailable to movement'
);
select throws_ok(
  $$delete from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'$$,
  '42501',
  null,
  'direct client deletion cannot bypass strong confirmation'
);
select throws_ok(
  $$select public.delete_study_pair(
    (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
    'Spanish to English'
  )$$,
  'P0001',
  'Type the Study Pair name exactly to confirm deletion.',
  'incorrect confirmation preserves the populated Study Pair'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  1::bigint,
  'failed deletion leaves the Study Pair intact'
);
select lives_ok(
  $$select public.delete_study_pair(
    (select id from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
    'es → en'
  )$$,
  'exact confirmation deletes the complete populated Study Pair'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'en'),
  0::bigint,
  'confirmed deletion removes the selected pair'
);
select is(
  (
    select count(*)
    from public.vocabulary_entries
    where study_pair_id = (select id from public.study_pairs where target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  2::bigint,
  'confirmed deletion leaves destination aggregates unchanged'
);
select is(
  (select count(*) from public.study_pairs where target_language_tag = 'es' and reference_language_tag = 'uk' and is_primary),
  1::bigint,
  'deleting a primary pair promotes the remaining pair for that Target Language'
);
select throws_ok(
  $$select public.delete_study_pair(
    '00000000-0000-0000-0000-000000000000',
    'pl → en'
  )$$,
  'P0001',
  'Study Pair is unavailable.',
  'foreign Study Pairs are unavailable to deletion'
);
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
select is(
  (select count(*) from public.study_pairs where target_language_tag = 'pl' and reference_language_tag = 'en'),
  1::bigint,
  'ownership rejection leaves the foreign Study Pair intact'
);

select * from finish();
rollback;
