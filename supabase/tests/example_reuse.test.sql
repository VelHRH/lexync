begin;

select plan(13);

insert into auth.users (id)
values
  ('24424424-4244-2442-4424-424424424424'),
  ('34434434-3443-3443-4434-434434434434');

set local role authenticated;
select set_config('request.jwt.claim.sub', '24424424-4244-2442-4424-424424424424', true);

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
  '  Mokytojas   kuria gerą aplinką. ',
  null,
  false,
  'A teacher builds a nice setting.'
);

select is((select count(*) from public.examples), 1::bigint, 'capturing a saved sentence again reuses the existing Example');
select is(
  (select count(distinct sense_id) from public.sense_examples),
  2::bigint,
  'the reused Example is linked to both Senses'
);
select is(
  (select text from public.example_translations),
  'The teacher creates a good environment.',
  'the existing Example Translation in that Answer Language is kept'
);
select is(
  (select text from public.examples),
  'Mokytojas kuria gerą aplinką.',
  'the existing Example text is kept'
);

select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'kurti',
  'to create',
  'mokytojas kuria gerą aplinką.'
);
select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'es'),
  'en',
  'crear',
  'to create',
  'Mokytojas kuria gerą aplinką.'
);

select is((select count(*) from public.examples), 3::bigint, 'matching is case-sensitive and stays within one Learning Language');

select set_config('request.jwt.claim.sub', '34434434-3443-3443-4434-434434434434', true);
select public.create_learning_language('lt');
select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'aplinka',
  'environment',
  'Mokytojas kuria gerą aplinką.'
);

select is((select count(*) from public.examples), 1::bigint, 'another Learner gets their own Example');
select set_config('request.jwt.claim.sub', '24424424-4244-2442-4424-424424424424', true);
select is((select count(*) from public.examples), 3::bigint, 'another Learner never reuses this Learner''s Example');

select set_config('tests.aplinka_id', (select id::text from public.vocabulary_entries where expression = 'aplinka'), true);
select set_config('tests.aplinka_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.aplinka_id')::uuid), true);
select set_config('tests.kurti_id', (select id::text from public.vocabulary_entries where expression = 'kurti'), true);
select set_config('tests.kurti_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.kurti_id')::uuid), true);
select set_config('tests.shared_example_id', (select id::text from public.examples where text = 'Mokytojas kuria gerą aplinką.' and exists (select 1 from public.sense_examples where sense_examples.example_id = examples.id and sense_examples.sense_id = current_setting('tests.aplinka_sense_id')::uuid)), true);
select set_config('tests.kurti_example_id', (select example_id::text from public.sense_examples where sense_id = current_setting('tests.kurti_sense_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.kurti_id')::uuid,
  'kurti',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.kurti_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.kurti_sense_id')::uuid), 'text', 'to create')),
    'examples', jsonb_build_array(
      jsonb_build_object('id', current_setting('tests.kurti_example_id'), 'text', 'mokytojas kuria gerą aplinką.'),
      jsonb_build_object(
        'text', 'Mokytojas kuria gerą aplinką.',
        'translations', jsonb_build_array(jsonb_build_object('text', 'Ignored translation.', 'answer_language_tag', 'en'))
      )
    )
  ))
);

select is(
  (select array_agg(example_id order by example_id) from public.sense_examples where sense_id = current_setting('tests.kurti_sense_id')::uuid),
  (select array_agg(id order by id) from public.examples where id in (current_setting('tests.shared_example_id')::uuid, current_setting('tests.kurti_example_id')::uuid)),
  'adding an Example in the editor links the existing Example'
);
select is(
  (select array_agg(text order by text) from public.example_translations where example_id = current_setting('tests.shared_example_id')::uuid),
  array['The teacher creates a good environment.'],
  'adding an existing Example in the editor keeps its Example Translation'
);

select public.capture_learning_language_entry(
  (select id from public.learning_languages where language_tag = 'lt'),
  'en',
  'gerai',
  'well',
  'Viskas gerai.',
  null,
  false,
  'Everything is fine.'
);
select set_config('tests.gerai_id', (select id::text from public.vocabulary_entries where expression = 'gerai'), true);
select set_config('tests.gerai_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.gerai_id')::uuid), true);
select set_config('tests.gerai_example_id', (select example_id::text from public.sense_examples where sense_id = current_setting('tests.gerai_sense_id')::uuid), true);
set local role postgres;
update public.examples set created_at = now() - interval '1 day' where id = current_setting('tests.shared_example_id')::uuid;
update public.example_translations set created_at = now() - interval '1 day' where example_id = current_setting('tests.shared_example_id')::uuid;
set local role authenticated;
select public.update_vocabulary_entry(
  current_setting('tests.gerai_id')::uuid,
  'gerai',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.gerai_sense_id'),
    'translations', jsonb_build_array(jsonb_build_object('id', (select id from public.translations where sense_id = current_setting('tests.gerai_sense_id')::uuid), 'text', 'well')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.gerai_example_id'),
      'text', ' Mokytojas kuria  gerą aplinką.',
      'translations', jsonb_build_array(
        jsonb_build_object('id', (select id from public.example_translations where example_id = current_setting('tests.gerai_example_id')::uuid), 'text', 'Everything is fine.'),
        jsonb_build_object('text', 'Todo está bien.', 'answer_language_tag', 'es')
      )
    ))
  ))
);

select is(
  (select count(*) from public.examples where text in ('Mokytojas kuria gerą aplinką.', ' Mokytojas kuria  gerą aplinką.')),
  2::bigint,
  'editing an Example to match another merges them within the Learning Language'
);
select is(
  (select array_agg(sense_id order by sense_id) from public.sense_examples where example_id = current_setting('tests.shared_example_id')::uuid),
  (select array_agg(id order by id) from public.senses where id in (
    current_setting('tests.aplinka_sense_id')::uuid,
    (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'mokyti')),
    current_setting('tests.kurti_sense_id')::uuid,
    current_setting('tests.gerai_sense_id')::uuid
  )),
  'every Sense keeps the merged Example'
);
select is(
  (select jsonb_object_agg(answer_language_tag, text) from public.example_translations where example_id = current_setting('tests.shared_example_id')::uuid),
  '{"en": "Everything is fine.", "es": "Todo está bien."}'::jsonb,
  'the merged Example keeps the latest Example Translation per Answer Language'
);
select is(
  (select count(*) from public.examples where id = current_setting('tests.gerai_example_id')::uuid),
  0::bigint,
  'the merged duplicate Example is removed'
);

select * from finish();
rollback;
