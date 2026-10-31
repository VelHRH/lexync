begin;

select plan(12);

insert into auth.users (id)
values ('71717171-7171-7171-7171-717171717171');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71717171-7171-7171-7171-717171717171', true);

select public.create_learning_language('es');

select lives_ok(
  $$select public.capture_learning_language_entry(
      (select id from public.learning_languages where learner_id = '71717171-7171-7171-7171-717171717171' and language_tag = 'es'),
      'en-US',
      'descubrir',
      'to discover',
      'Quiero descubrir la ciudad.',
      null,
      false,
      'I want to discover the city.'
    )$$,
  'a capture carries an Example Translation alongside the Example'
);

select is(
  (select count(*) from public.example_translations where learner_id = '71717171-7171-7171-7171-717171717171'),
  1::bigint,
  'the Example Translation is stored'
);
select is(
  (select text from public.example_translations where learner_id = '71717171-7171-7171-7171-717171717171'),
  'I want to discover the city.',
  'the Example Translation keeps the text written at capture'
);
select is(
  (select answer_language_tag from public.example_translations where learner_id = '71717171-7171-7171-7171-717171717171'),
  'en-US',
  'the Example Translation is stored in the Answer Language selected at capture'
);
select is(
  (select examples.text
   from public.example_translations
   join public.examples on examples.id = example_translations.example_id
   where example_translations.learner_id = '71717171-7171-7171-7171-717171717171'),
  'Quiero descubrir la ciudad.',
  'the Example Translation hangs off the Example captured with it'
);

select lives_ok(
  $$select public.capture_learning_language_entry(
      (select id from public.learning_languages where learner_id = '71717171-7171-7171-7171-717171717171' and language_tag = 'es'),
      'en-US',
      'guardar',
      'to keep',
      'Voy a guardar esto.',
      null,
      false,
      null
    )$$,
  'a capture with an Example and no Example Translation is accepted'
);
select is(
  (select count(*)
   from public.example_translations
   join public.examples on examples.id = example_translations.example_id
   where example_translations.learner_id = '71717171-7171-7171-7171-717171717171'
     and examples.text = 'Voy a guardar esto.'),
  0::bigint,
  'an absent Example Translation stores no row'
);

select lives_ok(
  $$select public.capture_learning_language_entry(
      (select id from public.learning_languages where learner_id = '71717171-7171-7171-7171-717171717171' and language_tag = 'es'),
      'en-US',
      'blanco',
      'white',
      'Un muro blanco.',
      null,
      false,
      '   '
    )$$,
  'a blank Example Translation is accepted'
);
select is(
  (select count(*)
   from public.example_translations
   join public.examples on examples.id = example_translations.example_id
   where example_translations.learner_id = '71717171-7171-7171-7171-717171717171'
     and examples.text = 'Un muro blanco.'),
  0::bigint,
  'a blank Example Translation stores no row'
);

select lives_ok(
  $$select public.capture_learning_language_entry(
      (select id from public.learning_languages where learner_id = '71717171-7171-7171-7171-717171717171' and language_tag = 'es'),
      'en-US',
      'silla',
      'chair',
      null,
      null,
      false,
      'An orphaned sentence.'
    )$$,
  'an Example Translation without an Example is accepted'
);
select is(
  (select count(*) from public.example_translations where learner_id = '71717171-7171-7171-7171-717171717171' and text = 'An orphaned sentence.'),
  0::bigint,
  'an Example Translation without an Example stores no row'
);

select public.capture_learning_language_entry(
  (select id from public.learning_languages where learner_id = '71717171-7171-7171-7171-717171717171' and language_tag = 'es'),
  'en-US',
  'descubrir',
  'to uncover',
  null,
  (select senses.id
   from public.senses
   join public.vocabulary_entries on vocabulary_entries.id = senses.vocabulary_entry_id
   where senses.learner_id = '71717171-7171-7171-7171-717171717171'
     and vocabulary_entries.expression = 'descubrir'
   limit 1),
  false,
  null
);

select is(
  (select text from public.example_translations where learner_id = '71717171-7171-7171-7171-717171717171' and text = 'I want to discover the city.'),
  'I want to discover the city.',
  'capturing the same Expression again keeps an Example Translation already stored'
);

select * from finish();
rollback;
