begin;

select plan(34);

insert into auth.users (id)
values
  ('79797979-7979-7979-7979-797979797979'),
  ('89898989-8989-8989-8989-898989898989');

set local role authenticated;
select set_config('request.jwt.claim.sub', '79797979-7979-7979-7979-797979797979', true);

select public.create_study_pair('es', 'en');
select public.create_study_pair('es', 'uk');
select public.create_study_pair('fr', 'en');

select is((select count(*) from public.learning_languages), 2::bigint, 'Study Pairs expand into Learning Languages');
select is((select count(*) from public.learner_language_state), 1::bigint, 'a Learner has one synchronized language state');
select is((select count(*) from public.learner_language_state where active_learning_language_id is not null), 1::bigint, 'a Learner with languages has one active Learning Language');
select is((select count(distinct learning_language_id) from public.study_pairs where target_language_tag = 'es'), 1::bigint, 'Study Pairs for one target share a Learning Language');

select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = '79797979-7979-7979-7979-797979797979' and target_language_tag = 'es' and reference_language_tag = 'en'),
  'casa',
  'house',
  'La casa es azul.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = '79797979-7979-7979-7979-797979797979' and target_language_tag = 'es' and reference_language_tag = 'uk'),
  'casa',
  'дім',
  null
);

set local role postgres;
insert into public.translations (learner_id, sense_id, text, answer_language_tag)
values (
  '79797979-7979-7979-7979-797979797979',
  (select sense_id from public.translations where learner_id = '79797979-7979-7979-7979-797979797979' and text = 'house'),
  'будинок',
  'uk'
);
insert into public.translations (learner_id, sense_id, text, answer_language_tag)
values (
  '79797979-7979-7979-7979-797979797979',
  (select sense_id from public.translations where learner_id = '79797979-7979-7979-7979-797979797979' and text = 'дім'),
  'home',
  'en'
);
insert into public.collections (learner_id, learning_language_id, name)
values (
  '79797979-7979-7979-7979-797979797979',
  (select id from public.learning_languages where learner_id = '79797979-7979-7979-7979-797979797979' and language_tag = 'es'),
  'Homes'
);
insert into public.collection_memberships (
  learner_id,
  collection_id,
  learning_language_id,
  learning_vocabulary_entry_id
)
select
  '79797979-7979-7979-7979-797979797979',
  collections.id,
  collections.learning_language_id,
  learning_vocabulary_entries.id
from public.collections
join public.learning_vocabulary_entries
  on learning_vocabulary_entries.learning_language_id = collections.learning_language_id;
set local role authenticated;

select is((select count(*) from public.learning_vocabulary_entries where expression_identity = 'casa'), 1::bigint, 'duplicate Expressions consolidate within a Learning Language');
select is((select count(*) from public.senses), 2::bigint, 'consolidation preserves distinct Senses');
select is((select count(distinct answer_language_tag) from public.translations), 2::bigint, 'Translations declare their Answer Languages');
select is((select max(answer_count) from (select count(distinct answer_language_tag) as answer_count from public.translations group by sense_id) as sense_answers), 2::bigint, 'one Sense can contain multiple Answer Languages');
select is((select count(*) from public.language_pairs), 2::bigint, 'Language Pairs derive from Translations');
select is((select answer_language_tag from public.preferred_answer_languages where learner_id = '79797979-7979-7979-7979-797979797979'), 'en', 'a deterministic recent-use tie selects the Preferred Answer Language');
select is((select count(*) from public.cards), 8::bigint, 'each Sense and Answer Language has recognition and recall Cards');
select is((select count(distinct (sense_id, answer_language_tag, direction)) from public.cards), 8::bigint, 'Card identity includes Sense, Answer Language, and direction');
select is((select count(*) from public.review_events), 0::bigint, 'expansion does not invent review events');

select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where learner_id = '79797979-7979-7979-7979-797979797979' limit 1), true);
select is((select suspended from public.learning_vocabulary_entries where learner_id = '79797979-7979-7979-7979-797979797979'), true, 'canonical suspension follows compatibility writes');

select is(public.account_learning_snapshot()->>'schemaVersion', '2', 'the Learning Language snapshot identifies its schema version');
select is(jsonb_array_length(public.account_learning_snapshot()->'learningLanguages'), 2, 'the new snapshot exposes Learning Languages');
select is(jsonb_array_length(public.account_learning_snapshot()->'languagePairs'), 2, 'the new snapshot exposes derived Language Pairs');
select ok(jsonb_path_exists(public.account_learning_snapshot(), '$.learningLanguages[*].vocabularyEntries[*].senses[*].translations[*].answerLanguageTag'), 'the new snapshot exposes multilingual Translations');
select ok(jsonb_path_exists(public.account_learning_snapshot(), '$.learningLanguages[*].collections[*].vocabularyEntryIds[*]'), 'Collections remain scoped to a Learning Language in the snapshot');
select ok(jsonb_path_exists(public.account_learning_snapshot(), '$.cards[*].direction'), 'the new snapshot exposes Card directions');
select is(public.account_vocabulary_snapshot()->>'schemaVersion', '1', 'the compatibility snapshot remains schema version 1');
select is(jsonb_array_length(public.account_vocabulary_snapshot()->'studyPairs'), 3, 'legacy clients can still read Study Pairs');
select ok(
  not jsonb_path_exists(
    public.account_vocabulary_snapshot(),
    '$.studyPairs[*] ? (@.referenceLanguageTag == "en").vocabularyEntries[*].senses[*].translations[*] ? (@.text == "будинок")'
  ),
  'legacy Study Pair snapshots hide other Answer Languages'
);

select public.set_vocabulary_entry_suspended((select id from public.vocabulary_entries where learner_id = '79797979-7979-7979-7979-797979797979' and suspended limit 1), false);

select is(
  (select count(distinct learning_language_id) from public.learning_scheduled_review_overview(
    (select id from public.learning_languages where learner_id = '79797979-7979-7979-7979-797979797979' and language_tag = 'es')
  )),
  1::bigint,
  'the review contract returns one requested Learning Language'
);
select is(
  (select count(*) from public.learning_scheduled_review_overview(
    (select id from public.learning_languages where learner_id = '79797979-7979-7979-7979-797979797979' and language_tag = 'fr')
  )),
  0::bigint,
  'the review contract does not mix another Learning Language'
);

select set_config(
  'test.moved_card_id',
  (select cards.id::text
   from public.cards
   join public.senses on senses.id = cards.sense_id
   join public.translations on translations.sense_id = senses.id
   where translations.learner_id = '79797979-7979-7979-7979-797979797979'
     and senses.learner_id = '79797979-7979-7979-7979-797979797979'
     and cards.learner_id = '79797979-7979-7979-7979-797979797979'
     and translations.text = 'house'
     and cards.answer_language_tag = 'en'
     and cards.direction = 'recognition'),
  true
);
select lives_ok(
  format(
    $$select public.move_vocabulary_entries(array[%L::uuid], %L::uuid)$$,
    (select vocabulary_entries.id from public.vocabulary_entries join public.study_pairs on study_pairs.id = vocabulary_entries.study_pair_id where vocabulary_entries.learner_id = '79797979-7979-7979-7979-797979797979' and study_pairs.learner_id = '79797979-7979-7979-7979-797979797979' and study_pairs.target_language_tag = 'es' and study_pairs.reference_language_tag = 'en'),
    (select id from public.study_pairs where learner_id = '79797979-7979-7979-7979-797979797979' and target_language_tag = 'fr' and reference_language_tag = 'en')
  ),
  'a legacy Vocabulary Entry can move between Learning Languages'
);
select is(
  (select learning_languages.language_tag
   from public.cards
   join public.learning_languages on learning_languages.id = cards.learning_language_id
   where cards.learner_id = '79797979-7979-7979-7979-797979797979'
     and learning_languages.learner_id = '79797979-7979-7979-7979-797979797979'
     and cards.id = current_setting('test.moved_card_id')::uuid),
  'fr',
  'moved Cards follow the new Learning Language without changing identity'
);

select lives_ok(
  $$select public.set_active_learning_language((select id from public.learning_languages where learner_id = '79797979-7979-7979-7979-797979797979' and language_tag = 'fr'))$$,
  'the Learner can synchronize another Active Learning Language'
);
select is(
  (select language_tag from public.learning_languages join public.learner_language_state on active_learning_language_id = learning_languages.id where learning_languages.learner_id = '79797979-7979-7979-7979-797979797979' and learner_language_state.learner_id = '79797979-7979-7979-7979-797979797979'),
  'fr',
  'the synchronized Active Learning Language changes'
);

select set_config('request.jwt.claim.sub', '89898989-8989-8989-8989-898989898989', true);
select is((select count(*) from public.learning_languages), 0::bigint, 'Learning Languages are isolated by Learner');
select is((select count(*) from public.cards), 0::bigint, 'Cards are isolated by Learner');
select is(jsonb_array_length(public.account_learning_snapshot()->'learningLanguages'), 0, 'the snapshot excludes another Learner data');
select throws_ok(
  $$select public.set_active_learning_language((select id from public.learning_languages where learner_id = '89898989-8989-8989-8989-898989898989' limit 1))$$,
  'P0001',
  'Learning Language is unavailable.',
  'a Learner cannot select another account Learning Language'
);

set local role anon;
select throws_ok(
  $$select public.account_learning_snapshot()$$,
  '42501',
  'permission denied for function account_learning_snapshot',
  'anonymous callers cannot request a Learning Language snapshot'
);

select * from finish();
rollback;
