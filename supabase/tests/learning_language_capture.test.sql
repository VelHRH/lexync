begin;

select plan(24);

insert into auth.users (id)
values ('80808080-8080-8080-8080-808080808080');

set local role authenticated;
select set_config('request.jwt.claim.sub', '80808080-8080-8080-8080-808080808080', true);

select is(
  (select language_tag from public.create_learning_language('pt-BR')),
  'pt-BR',
  'create_learning_language canonicalizes a Learning Language tag'
);
select is(
  (select language_tag from public.create_learning_language('fr-CA')),
  'fr-CA',
  'create_learning_language adds a subsequent Learning Language'
);
select is(
  (select language_tag from public.learning_languages join public.learner_language_state on learner_language_state.active_learning_language_id = learning_languages.id),
  'pt-BR',
  'the first Learning Language is active'
);
select throws_ok(
  $$select public.create_learning_language('pt-br')$$,
  'P0001',
  'Learning Language already exists.',
  'duplicate Learning Languages are explicit errors'
);

select lives_ok(
  $$select public.capture_learning_language_entry(
    (select id from public.learning_languages where language_tag = 'pt-BR'),
    'en-US', 'casa', 'house', 'A casa.'
  )$$,
  'a canonical Learning Language capture succeeds'
);
select is((select count(*) from public.learning_vocabulary_entries), 1::bigint, 'the capture creates one canonical Expression');
select is((select count(*) from public.vocabulary_entries), 1::bigint, 'the capture creates a legacy bridge entry');
select is((select answer_language_tag from public.translations), 'en-US', 'the capture preserves an Answer Language variant');
select is((select target_language_tag from public.study_pairs), 'pt-BR', 'the bridge Study Pair uses the Learning Language');
select is((select reference_language_tag from public.study_pairs), 'en-US', 'the bridge Study Pair uses the Answer Language');

select lives_ok(
  $$select public.capture_learning_language_entry(
    (select id from public.learning_languages where language_tag = 'pt-BR'),
    'en-GB', ' casa ', 'home', null
  )$$,
  'a new Answer Language enriches the sole Sense'
);
select is((select count(*) from public.learning_vocabulary_entries), 1::bigint, 'Answer Language capture reuses the canonical Expression');
select is((select count(*) from public.senses), 1::bigint, 'Answer Language capture reuses the sole Sense');
select is((select count(*) from public.translations), 2::bigint, 'Answer Language capture adds one Translation');
select is((select count(*) from public.study_pairs), 2::bigint, 'each Answer Language keeps a legacy bridge');

set local role postgres;
insert into public.vocabulary_entries (learner_id, study_pair_id, expression)
values (
  '80808080-8080-8080-8080-808080808080',
  (select id from public.study_pairs where reference_language_tag = 'en-US'),
  'banco'
);
insert into public.senses (learner_id, vocabulary_entry_id)
values ('80808080-8080-8080-8080-808080808080', (select id from public.vocabulary_entries where expression = 'banco'));
insert into public.translations (learner_id, sense_id, text, answer_language_tag)
values ('80808080-8080-8080-8080-808080808080', (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'banco')), 'bank', 'en-US');
insert into public.senses (learner_id, vocabulary_entry_id)
values ('80808080-8080-8080-8080-808080808080', (select id from public.vocabulary_entries where expression = 'banco'));
insert into public.translations (learner_id, sense_id, text, answer_language_tag)
values ('80808080-8080-8080-8080-808080808080', (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'banco') order by created_at desc limit 1), 'bench', 'en-US');
set local role authenticated;

select is(
  public.capture_learning_language_entry(
    (select id from public.learning_languages where language_tag = 'pt-BR'),
    'uk', 'banco', 'банк', null
  )->>'kind',
  'needs_sense',
  'a multi-Sense capture returns a structured choice'
);
select is((select count(*) from public.translations where text = 'банк'), 0::bigint, 'an ambiguous capture performs no writes');

select is(
  public.capture_learning_language_entry(
    (select id from public.learning_languages where language_tag = 'pt-BR'),
    'uk', 'banco', 'банк', null,
    (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'banco') order by created_at limit 1),
    false
  )->>'kind',
  'saved',
  'an explicit Sense selection saves the capture'
);
select is((select count(*) from public.translations where text = 'банк'), 1::bigint, 'an explicit Sense selection adds its Translation');

select is(
  public.capture_learning_language_entry(
    (select id from public.learning_languages where language_tag = 'pt-BR'),
    'uk', 'banco', 'лавка', null, null, true
  )->>'kind',
  'saved',
  'create-new Sense saves the capture'
);
select is((select count(*) from public.senses join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id where vocabulary_entries.learning_vocabulary_entry_id = (select id from public.learning_vocabulary_entries where expression = 'banco')), 3::bigint, 'create-new Sense adds a Sense');

select lives_ok(
  $$select public.remove_learning_language((select id from public.learning_languages where language_tag = 'fr-CA'))$$,
  'an empty non-active Learning Language can be removed'
);
select is((select count(*) from public.learning_languages), 1::bigint, 'the empty Learning Language is removed');
select throws_ok(
  $$select public.remove_learning_language((select id from public.learning_languages where language_tag = 'pt-BR'))$$,
  'P0001',
  'Learning Language contains Vocabulary Entries.',
  'a Learning Language with material cannot be removed'
);

select * from finish();
rollback;
