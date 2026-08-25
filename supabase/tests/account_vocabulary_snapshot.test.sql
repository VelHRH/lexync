begin;

select plan(10);

insert into auth.users (id)
values
  ('88888888-8888-8888-8888-888888888888'),
  ('99999999-9999-9999-9999-999999999999');

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs),
  'caminar',
  'to walk',
  'Camino al trabajo cada mañana.'
);
select public.capture_manual_entry(
  (select id from public.study_pairs),
  'caminar',
  'to travel on foot',
  'Prefiero caminar cuando hace sol.'
);

select is(public.account_vocabulary_snapshot()->>'schemaVersion', '1', 'the snapshot identifies its schema version');
select is(
  public.account_vocabulary_snapshot()->>'learnerId',
  '88888888-8888-8888-8888-888888888888',
  'the snapshot identifies the authenticated Learner'
);
select is(jsonb_array_length(public.account_vocabulary_snapshot()->'studyPairs'), 1, 'the snapshot contains Study Pairs');
select is(
  jsonb_array_length(public.account_vocabulary_snapshot()->'studyPairs'->0->'vocabularyEntries'),
  1,
  'the snapshot contains Vocabulary Entries without duplicates'
);
select is(
  jsonb_array_length(public.account_vocabulary_snapshot()->'studyPairs'->0->'vocabularyEntries'->0->'senses'),
  2,
  'the snapshot contains each Sense'
);
select ok(
  jsonb_path_exists(
    public.account_vocabulary_snapshot(),
    '$.studyPairs[*].vocabularyEntries[*].senses[*].translations[*] ? (@.text == "to walk")'
  ),
  'the snapshot contains translations'
);
select ok(
  jsonb_path_exists(
    public.account_vocabulary_snapshot(),
    '$.studyPairs[*].vocabularyEntries[*].senses[*].examples[*] ? (@.text == "Camino al trabajo cada mañana.")'
  ),
  'the snapshot contains private Examples'
);

update public.vocabulary_entries set suspended = true;

select is(
  (public.account_vocabulary_snapshot()->'studyPairs'->0->'vocabularyEntries'->0->>'suspended')::boolean,
  true,
  'the snapshot contains suspension state'
);

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

select is(jsonb_array_length(public.account_vocabulary_snapshot()->'studyPairs'), 0, 'the snapshot excludes another Learner data');

set local role anon;

select throws_ok(
  $$select public.account_vocabulary_snapshot()$$,
  '42501',
  'permission denied for function account_vocabulary_snapshot',
  'anonymous callers cannot request a snapshot'
);

select * from finish();
rollback;
