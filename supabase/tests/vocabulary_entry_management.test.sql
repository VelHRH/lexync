begin;

select plan(46);

insert into auth.users (id)
values
  ('10101010-1010-1010-1010-101010101010'),
  ('20202020-2020-2020-2020-202020202020');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10101010-1010-1010-1010-101010101010', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry((select id from public.study_pairs), 'casa', 'house', 'La casa es azul.');
select public.capture_manual_entry((select id from public.study_pairs), 'guardar', 'keep', null);

select throws_ok(
  $$delete from public.translations$$,
  '42501',
  'permission denied for table translations',
  'clients cannot bypass aggregate validation by deleting translations directly'
);
select throws_ok(
  $$insert into public.senses (vocabulary_entry_id) values (gen_random_uuid())$$,
  '42501',
  'permission denied for table senses',
  'clients cannot bypass aggregate validation by inserting Senses directly'
);

select lives_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'casa nueva', %L::jsonb)$$,
    (select id from public.vocabulary_entries where expression = 'casa'),
    jsonb_build_array(
      jsonb_build_object(
        'id', (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'casa')),
        'translations', jsonb_build_array(
          jsonb_build_object('id', (select id from public.translations where text = 'house'), 'text', 'home'),
          jsonb_build_object('id', null, 'text', 'dwelling')
        ),
        'examples', '[]'::jsonb
      ),
      jsonb_build_object(
        'id', null,
        'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'household')),
        'examples', jsonb_build_array(jsonb_build_object('id', (select id from public.examples where text = 'La casa es azul.'), 'text', 'Una casa nueva.'))
      )
    )
  ),
  'an owned Vocabulary Entry aggregate can be updated atomically'
);

select is((select expression from public.vocabulary_entries where expression = 'casa nueva'), 'casa nueva', 'the Expression is updated');
select is((select count(*) from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'casa nueva')), 2::bigint, 'a Sense can be added');
select is((select count(*) from public.translations where text in ('home', 'dwelling', 'household')), 3::bigint, 'translations can be edited and added');
select is((select text from public.examples), 'Una casa nueva.', 'an Example can be edited');
select is((select translations.text from public.translations join public.senses on senses.id = translations.sense_id join public.examples on examples.sense_id = senses.id where examples.text = 'Una casa nueva.'), 'household', 'an Example can move to another Sense');

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'casa nueva', %L::jsonb)$$,
    (select id from public.vocabulary_entries where expression = 'casa nueva'),
    jsonb_build_array(jsonb_build_object('id', null, 'translations', '[]'::jsonb, 'examples', '[]'::jsonb))
  ),
  'P0001',
  'Each Sense needs at least one translation.',
  'a Sense cannot lose its required translations'
);

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'casa nueva', %L::jsonb)$$,
    (select id from public.vocabulary_entries where expression = 'casa nueva'),
    jsonb_build_array(jsonb_build_object(
      'id', null,
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'Home'), jsonb_build_object('id', null, 'text', ' home ')),
      'examples', '[]'::jsonb
    ))
  ),
  'P0001',
  'Translations in a Sense must be present and distinct.',
  'equivalent translations cannot be duplicated in one Sense'
);

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'partial change', %L::jsonb)$$,
    (select id from public.vocabulary_entries where expression = 'casa nueva'),
    jsonb_build_array(jsonb_build_object(
      'id', (select id from public.senses where vocabulary_entry_id = (select id from public.vocabulary_entries where expression = 'casa nueva') order by created_at limit 1),
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'valid first write')),
      'examples', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'text', 'unavailable'))
    ))
  ),
  'P0001',
  'Example is unavailable.',
  'an invalid later aggregate item rejects the complete update'
);
select is((select count(*) from public.vocabulary_entries where expression = 'casa nueva'), 1::bigint, 'a failed aggregate update rolls back the Expression');
select is((select count(*) from public.translations where text = 'valid first write'), 0::bigint, 'a failed aggregate update rolls back earlier child writes');

select set_config('request.jwt.claim.sub', '20202020-2020-2020-2020-202020202020', true);
select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'stolen', '[]'::jsonb)$$,
    (select id from public.vocabulary_entries)
  ),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'another Learner cannot update the aggregate'
);
select throws_ok(
  format($$select public.delete_vocabulary_entry(%L)$$, (select id from public.vocabulary_entries)),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'another Learner cannot delete the aggregate'
);

select set_config('request.jwt.claim.sub', '10101010-1010-1010-1010-101010101010', true);
select lives_ok(
  format($$select public.delete_vocabulary_entry(%L)$$, (select id from public.vocabulary_entries where expression = 'casa nueva')),
  'an owned Vocabulary Entry can be deleted atomically'
);
select is((select count(*) from public.examples), 0::bigint, 'deletion removes owned dependent content');
select is((select count(*) from public.vocabulary_entries where expression = 'guardar'), 1::bigint, 'deletion leaves another Vocabulary Entry unchanged');

select set_config('tests.study_pair_id', (select id::text from public.study_pairs), true);

select public.capture_manual_entry(current_setting('tests.study_pair_id')::uuid, 'playa', 'beach', 'La playa es hermosa.');
select set_config('tests.playa_entry_id', (select id::text from public.vocabulary_entries where expression = 'playa'), true);
select set_config('tests.playa_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.playa_entry_id')::uuid), true);
select set_config('tests.playa_translation_id', (select id::text from public.translations where sense_id = current_setting('tests.playa_sense_id')::uuid), true);
select set_config('tests.playa_example_id', (select id::text from public.examples where sense_id = current_setting('tests.playa_sense_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'The beach is beautiful.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'attaching an Example Translation stores exactly one row');
select is((select answer_language_tag from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 'en', 'the Answer Language is resolved from the Study Pair');
select is((select text from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 'The beach is beautiful.', 'the given text is stored');

select set_config('tests.playa_et_id', (select id::text from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.',
      'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_et_id')::uuid, 'text', 'The beach is lovely.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'editing an Example Translation by id does not create a second row');
select is((select text from public.example_translations where id = current_setting('tests.playa_et_id')::uuid), 'The beach is lovely.', 'editing an Example Translation by id updates its text in place');

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.'
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 0::bigint, 'omitting the field removes the Example Translation');
select is((select count(*) from public.examples where id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'the Example itself survives after its Example Translation is cleared');

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', '   '))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 0::bigint, 'a blank Example Translation is never stored');

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'First version.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'a first Example Translation can be attached after clearing');
select is((select text from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 'First version.', 'the first Example Translation holds its text');

select public.update_vocabulary_entry(
  current_setting('tests.playa_entry_id')::uuid,
  'playa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.playa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_example_id')::uuid,
      'text', 'La playa es hermosa.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'Second version.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'a second Example Translation in the same Answer Language replaces the first rather than duplicating it');
select is((select text from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 'Second version.', 'the replacement holds the newer text');

select set_config('tests.playa_et_id', (select id::text from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), true);

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'playa', %L::jsonb)$$,
    current_setting('tests.playa_entry_id'),
    jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_sense_id')::uuid,
      'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'shore')),
      'examples', jsonb_build_array(jsonb_build_object(
        'id', current_setting('tests.playa_example_id')::uuid,
        'text', 'La playa es hermosa.',
        'translations', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'text', 'unavailable'))
      ))
    ))
  ),
  'P0001',
  'Example Translation is unavailable.',
  'a bogus Example Translation id rejects the update'
);
select is((select text from public.translations where id = current_setting('tests.playa_translation_id')::uuid), 'beach', 'a failed Example Translation write rolls back earlier changes in the same call');
select is((select count(*) from public.example_translations where example_id = current_setting('tests.playa_example_id')::uuid), 1::bigint, 'a failed update does not create a stray Example Translation');

select throws_ok(
  format(
    $$select public.update_vocabulary_entry(%L, 'playa', %L::jsonb)$$,
    current_setting('tests.playa_entry_id'),
    jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.playa_sense_id')::uuid,
      'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.playa_translation_id')::uuid, 'text', 'beach')),
      'examples', jsonb_build_array(jsonb_build_object(
        'id', current_setting('tests.playa_example_id')::uuid,
        'text', 'La playa es hermosa.',
        'translations', jsonb_build_array(
          jsonb_build_object('id', current_setting('tests.playa_et_id')::uuid, 'text', 'Duplicate A'),
          jsonb_build_object('id', current_setting('tests.playa_et_id')::uuid, 'text', 'Duplicate B')
        )
      ))
    ))
  ),
  'P0001',
  'Aggregate items must be distinct.',
  'duplicate Example Translation ids in one call are rejected'
);
select is((select text from public.example_translations where id = current_setting('tests.playa_et_id')::uuid), 'Second version.', 'a failed duplicate-id update rolls back without changing the Example Translation');

select public.capture_manual_entry(current_setting('tests.study_pair_id')::uuid, 'sendero', 'path', 'El sendero es largo.');
select set_config('tests.sendero_example_id', (select id::text from public.examples where text = 'El sendero es largo.'), true);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.sendero_example_id')::uuid), 0::bigint, 'an Example with no Example Translation stores none');
select is((select text from public.examples where id = current_setting('tests.sendero_example_id')::uuid), 'El sendero es largo.', 'the Example loads normally without an Example Translation');

select public.capture_manual_entry(current_setting('tests.study_pair_id')::uuid, 'cometa', 'kite', 'La cometa vuela alto.');
select set_config('tests.cometa_entry_id', (select id::text from public.vocabulary_entries where expression = 'cometa'), true);
select set_config('tests.cometa_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.cometa_entry_id')::uuid), true);
select set_config('tests.cometa_translation_id', (select id::text from public.translations where sense_id = current_setting('tests.cometa_sense_id')::uuid), true);
select set_config('tests.cometa_example_id', (select id::text from public.examples where sense_id = current_setting('tests.cometa_sense_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.cometa_entry_id')::uuid,
  'cometa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.cometa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.cometa_translation_id')::uuid, 'text', 'kite')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.cometa_example_id')::uuid,
      'text', 'La cometa vuela alto.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'The kite flies high.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.cometa_example_id')::uuid), 1::bigint, 'the Example Translation exists before the Example is removed');

select public.update_vocabulary_entry(
  current_setting('tests.cometa_entry_id')::uuid,
  'cometa',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.cometa_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.cometa_translation_id')::uuid, 'text', 'kite')),
    'examples', '[]'::jsonb
  ))
);
select is((select count(*) from public.examples where id = current_setting('tests.cometa_example_id')::uuid), 0::bigint, 'deleting the Example removes it');
select is((select count(*) from public.example_translations where example_id = current_setting('tests.cometa_example_id')::uuid), 0::bigint, 'deleting the Example removes its Example Translations');

select public.capture_manual_entry(current_setting('tests.study_pair_id')::uuid, 'lago', 'lake', 'El lago es profundo.');
select set_config('tests.lago_entry_id', (select id::text from public.vocabulary_entries where expression = 'lago'), true);
select set_config('tests.lago_sense1_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.lago_entry_id')::uuid), true);
select set_config('tests.lago_translation1_id', (select id::text from public.translations where sense_id = current_setting('tests.lago_sense1_id')::uuid), true);
select set_config('tests.lago_example1_id', (select id::text from public.examples where sense_id = current_setting('tests.lago_sense1_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.lago_entry_id')::uuid,
  'lago',
  jsonb_build_array(
    jsonb_build_object(
      'id', current_setting('tests.lago_sense1_id')::uuid,
      'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.lago_translation1_id')::uuid, 'text', 'lake')),
      'examples', jsonb_build_array(jsonb_build_object(
        'id', current_setting('tests.lago_example1_id')::uuid,
        'text', 'El lago es profundo.',
        'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'The lake is deep.'))
      ))
    ),
    jsonb_build_object(
      'id', null,
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'pond')),
      'examples', '[]'::jsonb
    )
  )
);
select set_config(
  'tests.lago_sense2_id',
  (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.lago_entry_id')::uuid and id <> current_setting('tests.lago_sense1_id')::uuid),
  true
);
select set_config('tests.lago_translation2_id', (select id::text from public.translations where sense_id = current_setting('tests.lago_sense2_id')::uuid), true);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.lago_example1_id')::uuid), 1::bigint, 'the Example Translation exists before the Sense is removed');

select public.update_vocabulary_entry(
  current_setting('tests.lago_entry_id')::uuid,
  'lago',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.lago_sense2_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.lago_translation2_id')::uuid, 'text', 'pond')),
    'examples', '[]'::jsonb
  ))
);
select is((select count(*) from public.senses where id = current_setting('tests.lago_sense1_id')::uuid), 0::bigint, 'the omitted Sense is removed');
select is((select count(*) from public.examples where id = current_setting('tests.lago_example1_id')::uuid), 0::bigint, 'deleting the Sense removes its Example');
select is((select count(*) from public.example_translations where example_id = current_setting('tests.lago_example1_id')::uuid), 0::bigint, 'deleting the Sense removes its Example Translations');

select public.capture_manual_entry(current_setting('tests.study_pair_id')::uuid, 'desierto', 'desert', 'El desierto es seco.');
select set_config('tests.desierto_entry_id', (select id::text from public.vocabulary_entries where expression = 'desierto'), true);
select set_config('tests.desierto_sense_id', (select id::text from public.senses where vocabulary_entry_id = current_setting('tests.desierto_entry_id')::uuid), true);
select set_config('tests.desierto_translation_id', (select id::text from public.translations where sense_id = current_setting('tests.desierto_sense_id')::uuid), true);
select set_config('tests.desierto_example_id', (select id::text from public.examples where sense_id = current_setting('tests.desierto_sense_id')::uuid), true);

select public.update_vocabulary_entry(
  current_setting('tests.desierto_entry_id')::uuid,
  'desierto',
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('tests.desierto_sense_id')::uuid,
    'translations', jsonb_build_array(jsonb_build_object('id', current_setting('tests.desierto_translation_id')::uuid, 'text', 'desert')),
    'examples', jsonb_build_array(jsonb_build_object(
      'id', current_setting('tests.desierto_example_id')::uuid,
      'text', 'El desierto es seco.',
      'translations', jsonb_build_array(jsonb_build_object('id', null, 'text', 'The desert is dry.'))
    ))
  ))
);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.desierto_example_id')::uuid), 1::bigint, 'the Example Translation exists before the Vocabulary Entry is deleted');

select public.delete_vocabulary_entry(current_setting('tests.desierto_entry_id')::uuid);
select is((select count(*) from public.example_translations where example_id = current_setting('tests.desierto_example_id')::uuid), 0::bigint, 'deleting the Vocabulary Entry removes its Example Translations');

select * from finish();
rollback;
