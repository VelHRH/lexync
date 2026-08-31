begin;

select plan(18);

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

select * from finish();
rollback;
