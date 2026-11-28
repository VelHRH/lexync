begin;

select plan(14);

insert into auth.users (id)
values
  ('24324324-3243-2432-4324-324324324324'),
  ('34334334-3343-3433-4334-334334334334');

set local role authenticated;
select set_config('request.jwt.claim.sub', '24324324-3243-2432-4324-324324324324', true);

select public.create_learning_language('lt');
select public.create_learning_language('es');

select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'aplinka',
  'environment',
  'Mokytojas kuria gerą aplinką.',
  null,
  false,
  'The teacher creates a good environment.'
);
select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'mokyti',
  'to teach',
  null
);
select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'kurti',
  'to create',
  null
);
select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'es'),
  'en',
  'crear',
  'to create',
  null
);

select set_config('tests.aplinka_id', (select id::text from public.vocabulary_entries where expression = 'aplinka'), true);
select set_config('tests.mokyti_id', (select id::text from public.vocabulary_entries where expression = 'mokyti'), true);
select set_config('tests.kurti_id', (select id::text from public.vocabulary_entries where expression = 'kurti'), true);
select set_config('tests.aplinka_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.aplinka_id')::uuid), true);
select set_config('tests.mokyti_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.mokyti_id')::uuid), true);
select set_config('tests.kurti_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.kurti_id')::uuid), true);
select set_config('tests.crear_sense_id', (select senses.id::text from public.senses join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id where vocabulary_entries.expression = 'crear'), true);
select set_config('tests.example_id', (select id::text from public.examples), true);
select set_config('tests.example_translation_id', (select id::text from public.example_translations), true);

set local role postgres;
insert into public.sense_examples (learner_id, sense_id, example_id)
values
  ('24324324-3243-2432-4324-324324324324', current_setting('tests.mokyti_sense_id')::uuid, current_setting('tests.example_id')::uuid),
  ('24324324-3243-2432-4324-324324324324', current_setting('tests.kurti_sense_id')::uuid, current_setting('tests.example_id')::uuid);

select throws_ok(
  $$insert into public.sense_examples (learner_id, sense_id, example_id)
    values ('24324324-3243-2432-4324-324324324324', current_setting('tests.crear_sense_id')::uuid, current_setting('tests.example_id')::uuid)$$,
  'P0001',
  'An Example belongs to one Learning Language.',
  'an Example cannot be linked to a Sense of another Learning Language'
);
set local role authenticated;

select public.update_vocabulary_entry(
  current_setting('tests.mokyti_id')::uuid,
  'mokyti',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.mokyti_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.mokyti_sense_id')::uuid), 'text', 'to teach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.example_id'),
      'text', 'Mokytojas kuria labai gerą aplinką.',
      'translations', jsonb_build_array(jsonb_build_object(
        'id', current_setting('tests.example_translation_id'),
        'text', 'The teacher creates a very good environment.'
      ))
    ))
  ))
);

select is(
  (
    select jsonb_agg(sense->'examples'->0->>'text' order by entry->>'expression')
    from jsonb_array_elements(public.account_learning_snapshot()->'learningLanguages') as language
    cross join lateral jsonb_array_elements(language->'vocabularyEntries') as entry
    cross join lateral jsonb_array_elements(entry->'senses') as sense
    where language->>'languageTag' = 'lt'
  ),
  '["Mokytojas kuria labai gerą aplinką.", "Mokytojas kuria labai gerą aplinką.", "Mokytojas kuria labai gerą aplinką."]'::jsonb,
  'editing a shared Example from one Vocabulary Entry shows the new text in every linked Sense'
);
select is(
  (select text from public.example_translations where example_id = current_setting('tests.example_id')::uuid),
  'The teacher creates a very good environment.',
  'editing a shared Example Translation from one Vocabulary Entry updates it for every linked Sense'
);
select is((select count(*) from public.examples), 1::bigint, 'a shared Example is stored once');

select public.update_vocabulary_entry(
  current_setting('tests.mokyti_id')::uuid,
  'mokyti',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.mokyti_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.mokyti_sense_id')::uuid), 'text', 'to teach')),
    'examples', '[]'::jsonb
  ))
);

select is(
  (select array_agg(sense_id order by sense_id) from public.sense_examples where example_id = current_setting('tests.example_id')::uuid),
  (select array_agg(id order by id) from public.senses where id in (current_setting('tests.aplinka_sense_id')::uuid, current_setting('tests.kurti_sense_id')::uuid)),
  'removing a shared Example from one Vocabulary Entry only unlinks it from that Sense'
);
select is(
  (select text from public.examples where id = current_setting('tests.example_id')::uuid),
  'Mokytojas kuria labai gerą aplinką.',
  'the unlinked Example stays in the other Vocabulary Entries'
);

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L::uuid, 'mokyti', jsonb_build_array(jsonb_build_object(
      'id', %L,
      'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = %L::uuid), 'text', 'to teach')),
      'examples', jsonb_build_array(jsonb_build_object('id', %L, 'text', 'Pavogtas sakinys.'))
    )))$$,
    current_setting('tests.mokyti_id'),
    current_setting('tests.mokyti_sense_id'),
    current_setting('tests.mokyti_sense_id'),
    current_setting('tests.example_id')
  ),
  'P0001',
  'Example is unavailable.',
  'a Vocabulary Entry cannot claim an Example it is not linked to'
);

select public.delete_vocabulary_entry(current_setting('tests.kurti_id')::uuid);

select is(
  (select array_agg(sense_id) from public.sense_examples where example_id = current_setting('tests.example_id')::uuid),
  array[current_setting('tests.aplinka_sense_id')::uuid],
  'deleting a Vocabulary Entry only unlinks its shared Example'
);

select public.update_vocabulary_entry(
  current_setting('tests.aplinka_id')::uuid,
  'aplinka',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.aplinka_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.aplinka_sense_id')::uuid), 'text', 'environment')),
    'examples', '[]'::jsonb
  ))
);

select is((select count(*) from public.examples), 0::bigint, 'removing an Example from its last Sense deletes it');
select is((select count(*) from public.example_translations), 0::bigint, 'deleting the Example removes its Example Translations');

select public.update_vocabulary_entry(
  current_setting('tests.aplinka_id')::uuid,
  'aplinka',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.aplinka_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.aplinka_sense_id')::uuid), 'text', 'environment')),
    'examples', jsonb_build_array(jsonb_build_object('text', 'Švari aplinka.'))
  ))
);
select set_config('tests.example_id', (select id::text from public.examples), true);
select public.delete_vocabulary_entry(current_setting('tests.aplinka_id')::uuid);

select is((select count(*) from public.examples), 0::bigint, 'deleting the last Vocabulary Entry of an Example deletes the Example');

select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'aplinka',
  'environment',
  'Privati aplinka.'
);

select set_config('request.jwt.claim.sub', '34334334-3343-3433-4334-334334334334', true);

select is((select count(*) from public.sense_examples), 0::bigint, 'another Learner cannot read Example links');
select throws_ok(
  $$insert into public.sense_examples (sense_id, example_id) values (gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  'permission denied for table sense_examples',
  'another Learner cannot link an Example directly'
);
select throws_ok(
  $$delete from public.sense_examples$$,
  '42501',
  'permission denied for table sense_examples',
  'another Learner cannot unlink an Example directly'
);

select * from finish();
rollback;
