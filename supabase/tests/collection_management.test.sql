begin;

select plan(35);

insert into auth.users (id)
values
  ('12121212-1212-1212-1212-121212121212'),
  ('34343434-3434-3434-3434-343434343434');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-1212-1212-1212-121212121212', true);

select public.create_study_pair('es', 'en');
select public.create_study_pair('fr', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = '12121212-1212-1212-1212-121212121212' and target_language_tag = 'es'),
  'viaje',
  'trip',
  null
);
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = '12121212-1212-1212-1212-121212121212' and target_language_tag = 'fr'),
  'voyage',
  'journey',
  null
);

select throws_ok(
  $$insert into public.collections (learner_id, learning_language_id, name) values (auth.uid(), gen_random_uuid(), 'Direct')$$,
  '42501',
  'permission denied for table collections',
  'clients cannot insert Collections directly'
);
select throws_ok(
  $$insert into public.collection_memberships (learner_id, collection_id, learning_language_id, learning_vocabulary_entry_id) values (auth.uid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  'permission denied for table collection_memberships',
  'clients cannot insert Collection memberships directly'
);

select lives_ok(
  format(
    $$select public.create_collection(%L, '  Travel plans  ')$$,
    (select id from public.learning_languages where learner_id = auth.uid() and language_tag = 'es')
  ),
  'an owned Learning Language can create a Collection'
);
select is(
  (select name from public.collections where learner_id = auth.uid()),
  'Travel plans',
  'Collection names are trimmed'
);
select throws_ok(
  format(
    $$select public.create_collection(%L, '   ')$$,
    (select id from public.learning_languages where learner_id = auth.uid() and language_tag = 'es')
  ),
  'P0001',
  'Collection name is required.',
  'blank Collection names are rejected'
);
select throws_ok(
  $$select public.create_collection(gen_random_uuid(), 'Other account')$$,
  'P0001',
  'Learning Language is unavailable.',
  'an unavailable Learning Language cannot create a Collection'
);

select lives_ok(
  format(
    $$select public.rename_collection(%L, '  Weekend trips  ')$$,
    (select id from public.collections where learner_id = auth.uid())
  ),
  'an owned Collection can be renamed'
);
select is(
  (select name from public.collections where learner_id = auth.uid()),
  'Weekend trips',
  'renaming trims the Collection name'
);
select throws_ok(
  format(
    $$select public.rename_collection(%L, '')$$,
    (select id from public.collections where learner_id = auth.uid())
  ),
  'P0001',
  'Collection name is required.',
  'blank renamed Collection names are rejected'
);

select lives_ok(
  format(
    $$select public.add_collection_membership(%L, %L)$$,
    (select id from public.collections where learner_id = auth.uid()),
    (select learning_vocabulary_entry_id from public.vocabulary_entries where learner_id = auth.uid() and expression = 'viaje')
  ),
  'an owned Vocabulary Entry can be added to a Collection'
);
select is((select count(*) from public.collection_memberships), 1::bigint, 'adding a membership creates one membership');

select lives_ok(
  format(
    $$select public.create_collection(%L, 'Favorites')$$,
    (select id from public.learning_languages where learner_id = auth.uid() and language_tag = 'es')
  ),
  'another Collection can be created in the same Learning Language'
);
select lives_ok(
  format(
    $$select public.add_collection_membership(%L, %L)$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Favorites'),
    (select learning_vocabulary_entry_id from public.vocabulary_entries where learner_id = auth.uid() and expression = 'viaje')
  ),
  'one Vocabulary Entry can belong to multiple Collections'
);
select is((select count(*) from public.collection_memberships), 2::bigint, 'multiple memberships preserve both rows');
select lives_ok(
  format(
    $$select public.rename_collection(%L, 'Favorites renamed')$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Favorites')
  ),
  'a second owned Collection can be renamed'
);
select lives_ok(
  format(
    $$select public.remove_collection_membership(%L, %L)$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Weekend trips'),
    (select learning_vocabulary_entry_id from public.vocabulary_entries where learner_id = auth.uid() and expression = 'viaje')
  ),
  'an owned membership can be removed'
);
select is((select count(*) from public.collection_memberships), 1::bigint, 'removing one membership preserves another');
select is((select count(*) from public.learning_vocabulary_entries where expression = 'viaje'), 1::bigint, 'removing a membership preserves the canonical Vocabulary Entry');

select is(
  (select count(*) from jsonb_path_query(
    public.account_learning_snapshot(),
    '$.learningLanguages[*].collections[*] ? (@.name == "Favorites renamed")'
  )),
  1::bigint,
  'the Learning Language snapshot reflects Collection creation'
);
select is(
  (select count(*) from jsonb_path_query(
    public.account_learning_snapshot(),
    '$.learningLanguages[*].collections[*].vocabularyEntryIds[*] ? (@ == $entry)',
    jsonb_build_object('entry', (select learning_vocabulary_entry_id from public.vocabulary_entries where expression = 'viaje'))
  )),
  1::bigint,
  'the Learning Language snapshot reflects membership removal and remaining membership'
);

select set_config('request.jwt.claim.sub', '34343434-3434-3434-3434-343434343434', true);
select public.create_study_pair('es', 'en');
select public.capture_manual_entry(
  (select id from public.study_pairs where learner_id = auth.uid()),
  'otro',
  'other',
  null
);
select public.create_collection(
  (select id from public.learning_languages where learner_id = auth.uid()),
  'Private shelf'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-1212-1212-1212-121212121212', true);
select throws_ok(
  format(
    $$select public.create_collection(%L, 'Unavailable')$$,
    (select id from public.learning_languages where learner_id = '34343434-3434-3434-3434-343434343434')
  ),
  'P0001',
  'Learning Language is unavailable.',
  'a Learner cannot create a Collection in another account Learning Language'
);
select throws_ok(
  format(
    $$select public.add_collection_membership(%L, %L)$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Favorites renamed'),
    (select learning_vocabulary_entry_id from public.vocabulary_entries where learner_id = auth.uid() and expression = 'voyage')
  ),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'cross-Learning-Language membership is rejected'
);
select is(
  (select count(*) from public.collection_memberships where collection_id = (select id from public.collections where learner_id = auth.uid() and name = 'Favorites renamed')),
  1::bigint,
  'cross-Learning-Language membership rejection is atomic'
);
select throws_ok(
  format(
    $$select public.add_collection_membership(%L, %L)$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Favorites renamed'),
    (select learning_vocabulary_entry_id from public.vocabulary_entries where learner_id = '34343434-3434-3434-3434-343434343434')
  ),
  'P0001',
  'Vocabulary Entry is unavailable.',
  'cross-account membership is rejected'
);
select is((select count(*) from public.collection_memberships where collection_id = (select id from public.collections where learner_id = auth.uid() and name = 'Favorites renamed')), 1::bigint, 'cross-account membership rejection is atomic');
select throws_ok(
  format(
    $$select public.rename_collection(%L, 'Stolen')$$,
    (select id from public.collections where learner_id = '34343434-3434-3434-3434-343434343434')
  ),
  'P0001',
  'Collection is unavailable.',
  'a Learner cannot rename another account Collection'
);
select throws_ok(
  format(
    $$select public.delete_collection(%L)$$,
    (select id from public.collections where learner_id = '34343434-3434-3434-3434-343434343434')
  ),
  'P0001',
  'Collection is unavailable.',
  'a Learner cannot delete another account Collection'
);
set local role postgres;
select is((select count(*) from public.collections where learner_id = '34343434-3434-3434-3434-343434343434' and name = 'Private shelf'), 1::bigint, 'cross-account deletion rejection is atomic');
set local role authenticated;

set local role anon;
select throws_ok(
  $$select public.create_collection(gen_random_uuid(), 'Anonymous')$$,
  '42501',
  'permission denied for function create_collection',
  'anonymous callers cannot create Collections'
);
select throws_ok(
  $$insert into public.collections (name) values ('Anonymous')$$,
  '42501',
  'permission denied for table collections',
  'anonymous callers cannot write Collections directly'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-1212-1212-1212-121212121212', true);
select lives_ok(
  format(
    $$select public.delete_collection(%L)$$,
    (select id from public.collections where learner_id = auth.uid() and name = 'Weekend trips')
  ),
  'an owned Collection can be deleted'
);
select is((select count(*) from public.collections where learner_id = auth.uid() and name = 'Weekend trips'), 0::bigint, 'deleted Collection is absent');
select is((select count(*) from public.collection_memberships where collection_id = (select id from public.collections where learner_id = auth.uid() and name = 'Weekend trips')), 0::bigint, 'deleting a Collection cascades its memberships');
select is((select count(*) from public.learning_vocabulary_entries where expression = 'viaje'), 1::bigint, 'deleting a Collection preserves its canonical Vocabulary Entry');
select is(
  (select count(*) from jsonb_path_query(
    public.account_learning_snapshot(),
    '$.learningLanguages[*].collections[*] ? (@.name == "Private shelf")'
  )),
  0::bigint,
  'the Learning Language snapshot excludes another account Collection'
);

select * from finish();
rollback;
