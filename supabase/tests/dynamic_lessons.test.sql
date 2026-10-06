begin;

select plan(59);

select ok(
  to_regprocedure('public.retrieve_dynamic_lesson_context(uuid, jsonb, text)') is not null,
  'retrieval RPC exists with the contracted signature'
);
select ok(
  pg_get_function_arguments('public.retrieve_dynamic_lesson_context(uuid, jsonb, text)'::regprocedure) !~* 'learner',
  'retrieval accepts no caller-supplied Learner identity'
);
select throws_ok(
  $$select public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')$$,
  'P0001',
  'Authentication is required.',
  'retrieval requires authentication'
);

insert into auth.users (id)
values
  ('12200000-0000-0000-0000-000000000001'),
  ('12200000-0000-0000-0000-000000000002');

insert into public.learning_languages (id, learner_id, language_tag)
values
  ('12200000-0000-0000-0000-000000000011', '12200000-0000-0000-0000-000000000001', 'it'),
  ('12200000-0000-0000-0000-000000000012', '12200000-0000-0000-0000-000000000001', 'fr'),
  ('12200000-0000-0000-0000-000000000013', '12200000-0000-0000-0000-000000000001', 'de'),
  ('12200000-0000-0000-0000-000000000014', '12200000-0000-0000-0000-000000000001', 'pt'),
  ('12200000-0000-0000-0000-000000000015', '12200000-0000-0000-0000-000000000001', 'nl'),
  ('12200000-0000-0000-0000-000000000016', '12200000-0000-0000-0000-000000000002', 'it');

set local role postgres;

insert into public.learning_materials (id, learner_id, learning_language_id, file_name, storage_path, byte_size, status, normalized_text)
values
  ('12200000-0000-0000-0000-000000000021', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 'ready-it.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000011/12200000-0000-0000-0000-000000000021/ready-it.txt', 10, 'ready', 'Alpha'),
  ('12200000-0000-0000-0000-000000000022', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000012', 'ready-fr.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000012/12200000-0000-0000-0000-000000000022/ready-fr.txt', 10, 'ready', 'Alpha'),
  ('12200000-0000-0000-0000-000000000023', '12200000-0000-0000-0000-000000000002', '12200000-0000-0000-0000-000000000016', 'ready-other.txt', '12200000-0000-0000-0000-000000000002/12200000-0000-0000-0000-000000000016/12200000-0000-0000-0000-000000000023/ready-other.txt', 10, 'ready', 'Alpha'),
  ('12200000-0000-0000-0000-000000000024', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 'processing-it.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000011/12200000-0000-0000-0000-000000000024/processing-it.txt', 10, 'processing', null),
  ('12200000-0000-0000-0000-000000000025', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 'failed-it.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000011/12200000-0000-0000-0000-000000000025/failed-it.txt', 10, 'failed', null);

insert into public.learning_material_passages (id, material_id, learner_id, learning_language_id, ordinal, source_start, source_end, passage_text, embedding_model, embedding_dimension, passage_schema_version, embedding)
values
  ('12200000-0000-0000-0000-000000000031', '12200000-0000-0000-0000-000000000021', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 0, 0, 10, 'Learner one passage zero for language it.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000032', '12200000-0000-0000-0000-000000000021', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 1, 10, 20, 'Learner one passage one for language it.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000033', '12200000-0000-0000-0000-000000000022', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000012', 0, 0, 10, 'Learner one passage for language fr.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000034', '12200000-0000-0000-0000-000000000023', '12200000-0000-0000-0000-000000000002', '12200000-0000-0000-0000-000000000016', 0, 0, 10, 'Learner two passage for language it.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000035', '12200000-0000-0000-0000-000000000024', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 0, 0, 10, 'Processing passage should be excluded.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000036', '12200000-0000-0000-0000-000000000025', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 0, 0, 10, 'Failed passage should be excluded.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768));

set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);

select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'learning_language_tag'),
  'it',
  'retrieval resolves the Learning Language tag for the caller'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  2,
  'retrieval returns only the ready passages owned by the caller in the requested Learning Language'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages') as elements(value)
    where elements.value->>'material_id' in ('12200000-0000-0000-0000-000000000022', '12200000-0000-0000-0000-000000000023')
  ),
  0::bigint,
  'retrieval excludes another Learning Language and another Learner entirely'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages') as elements(value)
    where elements.value->>'text' in ('Processing passage should be excluded.', 'Failed passage should be excluded.')
  ),
  0::bigint,
  'retrieval excludes passages belonging to processing or failed Learning Materials'
);

select set_config('app.dynamic_lesson_relevance_threshold', '1.5', true);
select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  false,
  'a threshold raised above every row makes retrieval insufficient'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  0,
  'an insufficient retrieval never leaks sub-threshold passage text'
);
select set_config('app.dynamic_lesson_relevance_threshold', '-1', true);
select set_config('app.dynamic_lesson_max_passages', '1', true);
select ok(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000011'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages') <= 1,
  'a max-passage policy of one caps the accepted passages at one row'
);
select set_config('app.dynamic_lesson_max_passages', '8', true);
select set_config('app.dynamic_lesson_relevance_threshold', '0.65', true);

set local role postgres;
insert into public.learning_languages (id, learner_id, language_tag)
values
  ('12200000-0000-0000-0000-000000000051', '12200000-0000-0000-0000-000000000001', 'sv'),
  ('12200000-0000-0000-0000-000000000052', '12200000-0000-0000-0000-000000000001', 'da'),
  ('12200000-0000-0000-0000-000000000053', '12200000-0000-0000-0000-000000000001', 'no');
insert into public.learning_materials (id, learner_id, learning_language_id, file_name, storage_path, byte_size, status, normalized_text)
values
  ('12200000-0000-0000-0000-000000000061', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000051', 'boundary-below.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000051/12200000-0000-0000-0000-000000000061/boundary-below.txt', 10, 'ready', 'Alpha'),
  ('12200000-0000-0000-0000-000000000062', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000052', 'boundary-above.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000052/12200000-0000-0000-0000-000000000062/boundary-above.txt', 10, 'ready', 'Alpha'),
  ('12200000-0000-0000-0000-000000000063', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000053', 'boundary-mixed.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000053/12200000-0000-0000-0000-000000000063/boundary-mixed.txt', 10, 'ready', 'Alpha');
insert into public.learning_material_passages (id, material_id, learner_id, learning_language_id, ordinal, source_start, source_end, passage_text, embedding_model, embedding_dimension, passage_schema_version, embedding)
values
  ('12200000-0000-0000-0000-000000000071', '12200000-0000-0000-0000-000000000061', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000051', 0, 0, 10, 'Below threshold passage zero.', 'ci-deterministic', 768, 1, ('[' || 0.64::text || ',' || sqrt(1 - 0.64 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000072', '12200000-0000-0000-0000-000000000061', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000051', 1, 10, 20, 'Below threshold passage one.', 'ci-deterministic', 768, 1, ('[' || 0.64::text || ',' || sqrt(1 - 0.64 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000073', '12200000-0000-0000-0000-000000000062', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000052', 0, 0, 10, 'Above threshold passage zero.', 'ci-deterministic', 768, 1, ('[' || 0.66::text || ',' || sqrt(1 - 0.66 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000074', '12200000-0000-0000-0000-000000000062', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000052', 1, 10, 20, 'Above threshold passage one.', 'ci-deterministic', 768, 1, ('[' || 0.66::text || ',' || sqrt(1 - 0.66 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000075', '12200000-0000-0000-0000-000000000063', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000053', 0, 0, 10, 'Mixed passage above zero.', 'ci-deterministic', 768, 1, ('[' || 0.66::text || ',' || sqrt(1 - 0.66 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000076', '12200000-0000-0000-0000-000000000063', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000053', 1, 10, 20, 'Mixed passage above one.', 'ci-deterministic', 768, 1, ('[' || 0.66::text || ',' || sqrt(1 - 0.66 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000077', '12200000-0000-0000-0000-000000000063', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000053', 2, 20, 30, 'Mixed passage below two.', 'ci-deterministic', 768, 1, ('[' || 0.64::text || ',' || sqrt(1 - 0.64 ^ 2)::text || ',' || repeat('0,', 765) || '0]')::extensions.vector(768));
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);
reset app.dynamic_lesson_relevance_threshold;

select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000051'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  false,
  'the default 0.65 relevance threshold excludes passages scoring just below it'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000051'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  0,
  'passages scoring just below the default 0.65 threshold are never returned'
);
select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000052'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  true,
  'the default 0.65 relevance threshold accepts passages scoring just above it'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000052'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  2,
  'retrieval returns exactly the two passages scoring just above the default threshold'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000052'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages') as elements(value)
    where (elements.value->>'id')::uuid in ('12200000-0000-0000-0000-000000000073', '12200000-0000-0000-0000-000000000074')
  ),
  2::bigint,
  'retrieval returns precisely the above-threshold passage ids and nothing else'
);
select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000053'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  true,
  'retrieval stays sufficient when a sub-threshold passage is mixed in with above-threshold passages'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000053'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  2,
  'a sub-threshold passage mixed in with above-threshold passages does not inflate the returned set'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000053'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages') as elements(value)
    where (elements.value->>'id')::uuid = '12200000-0000-0000-0000-000000000077'
  ),
  0::bigint,
  'the sub-threshold passage mixed in with above-threshold passages is excluded from the returned set'
);

set local role postgres;
insert into public.lessons (id, learner_id, learning_language_id, source, status, total_count)
values ('12200000-0000-0000-0000-000000000041', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000011', 'vocabulary', 'active', 1);
insert into public.lesson_questions (id, lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer)
values ('12200000-0000-0000-0000-000000000042', '12200000-0000-0000-0000-000000000041', '12200000-0000-0000-0000-000000000001', 1, 'vocabulary active prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a');
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);
select set_config('app.lesson_min_questions', '2', true);
select set_config('app.lesson_max_questions', '2', true);

select is(
  (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000011'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'dynamic translation prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('casa', 'house'),
      'correct_answer', 'house',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.91, 'passage_text', 'Sample retrieved passage text one.'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'dynamic cloze prompt ____',
      'choices', jsonb_build_array('casa', 'perro'),
      'correct_answer', 'casa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Sample retrieved passage text two.'))
    )
  ))->>'id'),
  '12200000-0000-0000-0000-000000000041',
  'an active Vocabulary Lesson is resumed instead of creating a Dynamic Lesson'
);
select is(
  (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000011'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'dynamic translation prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('casa', 'house'),
      'correct_answer', 'house',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.91, 'passage_text', 'Sample retrieved passage text one.'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'dynamic cloze prompt ____',
      'choices', jsonb_build_array('casa', 'perro'),
      'correct_answer', 'casa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Sample retrieved passage text two.'))
    )
  ))->>'source'),
  'vocabulary',
  'the resumed Lesson keeps its original vocabulary source'
);
select is(
  (select count(*) from public.lessons where learner_id = '12200000-0000-0000-0000-000000000001' and learning_language_id = '12200000-0000-0000-0000-000000000011'),
  1::bigint,
  'resuming an active Vocabulary Lesson creates no new Lesson row'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = '12200000-0000-0000-0000-000000000041'),
  1::bigint,
  'resuming an active Vocabulary Lesson leaves its Lesson Questions untouched'
);

select set_config('test.dynamic_first_id', (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000012'::uuid, jsonb_build_array(
  jsonb_build_object(
    'question_type', 'translation',
    'prompt', 'first dynamic translation prompt',
    'direction', 'recognition',
    'answer_language_tag', 'en',
    'choices', jsonb_build_array('casa', 'house'),
    'correct_answer', 'house',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.91, 'passage_text', 'Sample retrieved passage text three.'))
  ),
  jsonb_build_object(
    'question_type', 'cloze',
    'prompt', 'first dynamic cloze prompt ____',
    'choices', jsonb_build_array('casa', 'perro'),
    'correct_answer', 'casa',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Sample retrieved passage text four.'))
  )
))->>'id'), true);
select set_config('test.dynamic_first_question_ids', (select string_agg(id::text, ',' order by ordinal) from public.lesson_questions where lesson_id = current_setting('test.dynamic_first_id')::uuid), true);

select is(
  (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000012'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'second dynamic translation prompt',
      'direction', 'recall',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('libro', 'book'),
      'correct_answer', 'book',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.93, 'passage_text', 'Sample retrieved passage text five.'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'second dynamic cloze prompt ____',
      'choices', jsonb_build_array('libro', 'mesa'),
      'correct_answer', 'mesa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.87, 'passage_text', 'Sample retrieved passage text six.'))
    )
  ))->>'id'),
  current_setting('test.dynamic_first_id'),
  'an active Dynamic Lesson is resumed with the same Lesson id'
);
select is(
  (select string_agg(id::text, ',' order by ordinal) from public.lesson_questions where lesson_id = current_setting('test.dynamic_first_id')::uuid),
  current_setting('test.dynamic_first_question_ids'),
  'resuming an active Dynamic Lesson leaves the same Lesson Questions in place'
);
select is(
  (select count(*) from public.lessons where learner_id = '12200000-0000-0000-0000-000000000001' and learning_language_id = '12200000-0000-0000-0000-000000000012'),
  1::bigint,
  'resuming an active Dynamic Lesson creates no second Lesson row'
);

select is(
  (public.start_or_resume_vocabulary_lesson('12200000-0000-0000-0000-000000000012'::uuid)->>'id'),
  current_setting('test.dynamic_first_id'),
  'the ordinary Vocabulary Lesson entry point resumes the active Dynamic Lesson instead of creating one'
);
select is(
  (select count(*) from public.lessons where learner_id = '12200000-0000-0000-0000-000000000001' and learning_language_id = '12200000-0000-0000-0000-000000000012'),
  1::bigint,
  'the ordinary Vocabulary Lesson entry point creates no additional Lesson row for the Dynamic Lesson Learning Language'
);
select is(
  (select string_agg(id::text, ',' order by ordinal) from public.lesson_questions where lesson_id = current_setting('test.dynamic_first_id')::uuid),
  current_setting('test.dynamic_first_question_ids'),
  'the ordinary Vocabulary Lesson entry point leaves the Dynamic Lesson Questions untouched'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.dynamic_first_id')::uuid),
  2::bigint,
  'the ordinary Vocabulary Lesson entry point does not prune the Dynamic Lesson Questions'
);

select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'only one question',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'a',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Lesson questions are invalid.',
  'too few Questions are rejected'
);
select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'duplicate prompt text',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'a',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'duplicate prompt text',
      'choices', jsonb_build_array('c', 'd'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Lesson questions are invalid.',
  'duplicate prompts are rejected'
);
select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'wrong correct answer prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'valid companion cloze prompt',
      'choices', jsonb_build_array('c', 'd'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Lesson questions are invalid.',
  'a correct answer absent from its own choices is rejected'
);
select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'cloze prompt with a direction ____',
      'direction', 'recognition',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'a',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    ),
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'valid companion translation prompt',
      'direction', 'recall',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('c', 'd'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Lesson questions are invalid.',
  'a Cloze Question carrying a direction is rejected'
);
select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'translation prompt without an answer language',
      'direction', 'recognition',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'a',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    ),
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'second valid companion cloze prompt',
      'choices', jsonb_build_array('c', 'd'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Lesson questions are invalid.',
  'a translation Question missing an Answer Language is rejected'
);
select is(
  (select count(*) from public.lessons where learner_id = '12200000-0000-0000-0000-000000000001' and learning_language_id = '12200000-0000-0000-0000-000000000013'),
  0::bigint,
  'no Lesson row persists after rejecting invalid Dynamic Lesson payloads'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id in (select id from public.lessons where learning_language_id = '12200000-0000-0000-0000-000000000013')),
  0::bigint,
  'no Lesson Question row persists after rejecting invalid Dynamic Lesson payloads'
);
select is(
  (select count(*) from public.lesson_question_passages where lesson_id in (select id from public.lessons where learning_language_id = '12200000-0000-0000-0000-000000000013')),
  0::bigint,
  'no Lesson Question Passage row persists after rejecting invalid Dynamic Lesson payloads'
);

set local role postgres;
create or replace function public.dynamic_lesson_rollback_sentinel()
returns trigger
language plpgsql
as $fn$
begin
  if new.prompt = 'rollback sentinel prompt' then
    raise exception 'Simulated Lesson Question insert failure.';
  end if;
  return new;
end;
$fn$;
create trigger dynamic_lesson_rollback_sentinel
before insert on public.lesson_questions
for each row execute function public.dynamic_lesson_rollback_sentinel();
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'rollback companion cloze prompt ____',
      'choices', jsonb_build_array('a', 'b'),
      'correct_answer', 'a',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
    ),
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'rollback sentinel prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('c', 'd'),
      'correct_answer', 'c',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
    )
  ))$$,
  'P0001',
  'Simulated Lesson Question insert failure.',
  'a failure injected mid-insert raises instead of partially persisting'
);

set local role postgres;
drop trigger dynamic_lesson_rollback_sentinel on public.lesson_questions;
drop function public.dynamic_lesson_rollback_sentinel();
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);

select is(
  (select count(*) from public.lessons where learner_id = '12200000-0000-0000-0000-000000000001' and learning_language_id = '12200000-0000-0000-0000-000000000013'),
  0::bigint,
  'a mid-insert failure leaves no Lesson row behind'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id in (select id from public.lessons where learning_language_id = '12200000-0000-0000-0000-000000000013')),
  0::bigint,
  'a mid-insert failure leaves no Lesson Question row behind'
);
select is(
  (select count(*) from public.lesson_question_passages where lesson_id in (select id from public.lessons where learning_language_id = '12200000-0000-0000-0000-000000000013')),
  0::bigint,
  'a mid-insert failure leaves no Lesson Question Passage row behind'
);

select set_config('test.dynamic_retry_id', (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000013'::uuid, jsonb_build_array(
  jsonb_build_object(
    'question_type', 'cloze',
    'prompt', 'retry companion cloze prompt ____',
    'choices', jsonb_build_array('a', 'b'),
    'correct_answer', 'a',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'text'))
  ),
  jsonb_build_object(
    'question_type', 'translation',
    'prompt', 'retry translation prompt',
    'direction', 'recognition',
    'answer_language_tag', 'en',
    'choices', jsonb_build_array('c', 'd'),
    'correct_answer', 'c',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.9, 'passage_text', 'text'))
  )
))->>'id'), true);
select is(
  (select source from public.lessons where id = current_setting('test.dynamic_retry_id')::uuid),
  'dynamic',
  'a retry after the trigger is removed succeeds with no poisoned state left behind'
);

select set_config('test.dynamic_valid_id', (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000014'::uuid, jsonb_build_array(
  jsonb_build_object(
    'question_type', 'translation',
    'prompt', 'valid dynamic translation prompt',
    'direction', 'recognition',
    'answer_language_tag', 'en',
    'choices', jsonb_build_array('casa', 'house'),
    'correct_answer', 'house',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.91, 'passage_text', 'Sample retrieved passage text seven.'))
  ),
  jsonb_build_object(
    'question_type', 'cloze',
    'prompt', 'valid dynamic cloze prompt ____',
    'choices', jsonb_build_array('casa', 'perro'),
    'correct_answer', 'casa',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Sample retrieved passage text eight.'))
  )
))->>'id'), true);

select is(
  (select source from public.lessons where id = current_setting('test.dynamic_valid_id')::uuid),
  'dynamic',
  'a valid Dynamic Lesson payload creates a Lesson with the dynamic source'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.dynamic_valid_id')::uuid),
  2::bigint,
  'a valid Dynamic Lesson payload creates one Lesson Question per supplied Question'
);
select is(
  (select array_agg(ordinal order by ordinal) from public.lesson_questions where lesson_id = current_setting('test.dynamic_valid_id')::uuid),
  array[1, 2],
  'Dynamic Lesson Questions receive sequential ordinals starting at one'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.dynamic_valid_id')::uuid and sense_id is null and vocabulary_entry_id is null),
  2::bigint,
  'Dynamic Lesson Questions omit Vocabulary Entry and Sense links'
);
select is(
  (select count(*) from public.lesson_question_passages where lesson_id = current_setting('test.dynamic_valid_id')::uuid),
  2::bigint,
  'a valid Dynamic Lesson payload persists one Lesson Question Passage row per supplied passage'
);
set local role postgres;
select throws_ok(
  $$insert into public.lessons (learner_id, learning_language_id, source, status, total_count) values ('12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000014', 'dynamic', 'active', 1)$$,
  '23505',
  null,
  'a second active Lesson for the same Learning Language is rejected'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);

select is(
  (select relrowsecurity from pg_class where oid = 'public.lesson_question_passages'::regclass),
  true,
  'Lesson Question Passage provenance uses row-level security'
);
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.lesson_question_passages),
  0::bigint,
  'another Learner cannot read Lesson Question Passage provenance'
);
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);
select is(
  has_table_privilege('authenticated', 'public.learning_material_passages', 'select'),
  false,
  'passages still receive no broad authenticated table grants'
);

set local role postgres;
insert into public.learning_materials (id, learner_id, learning_language_id, file_name, storage_path, byte_size, status, normalized_text)
values ('12200000-0000-0000-0000-000000000026', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000015', 'delete-proof.txt', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000015/12200000-0000-0000-0000-000000000026/delete-proof.txt', 10, 'ready', 'Alpha');
insert into public.learning_material_passages (id, material_id, learner_id, learning_language_id, ordinal, source_start, source_end, passage_text, embedding_model, embedding_dimension, passage_schema_version, embedding)
values
  ('12200000-0000-0000-0000-000000000081', '12200000-0000-0000-0000-000000000026', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000015', 0, 0, 10, 'Deletion proof retrieval passage zero.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768)),
  ('12200000-0000-0000-0000-000000000082', '12200000-0000-0000-0000-000000000026', '12200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000015', 1, 10, 20, 'Deletion proof retrieval passage one.', 'ci-deterministic', 768, 1, ('[' || '1,' || repeat('0,', 766) || '0]')::extensions.vector(768));
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('learning-materials', '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000015/12200000-0000-0000-0000-000000000026/delete-proof.txt', '12200000-0000-0000-0000-000000000001', '{"mimetype":"text/plain","size":10}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '12200000-0000-0000-0000-000000000001', true);

select set_config('test.deletion_proof_id', (public.create_dynamic_lesson('12200000-0000-0000-0000-000000000015'::uuid, jsonb_build_array(
  jsonb_build_object(
    'question_type', 'translation',
    'prompt', 'deletion proof translation prompt',
    'direction', 'recognition',
    'answer_language_tag', 'en',
    'choices', jsonb_build_array('casa', 'house'),
    'correct_answer', 'house',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', '12200000-0000-0000-0000-000000000026', 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'Provenance snapshot text for deletion proof.'))
  ),
  jsonb_build_object(
    'question_type', 'cloze',
    'prompt', 'deletion proof cloze prompt ____',
    'choices', jsonb_build_array('casa', 'perro'),
    'correct_answer', 'casa',
    'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', '12200000-0000-0000-0000-000000000026', 'passage_ordinal', 1, 'similarity', 0.85, 'passage_text', 'Another provenance snapshot text for deletion proof.'))
  )
))->>'id'), true);

select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000015'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  true,
  'retrieval finds the Learning Material passages before the Learning Material is deleted'
);

set local role postgres;
set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'learning-materials'
  and name = '12200000-0000-0000-0000-000000000001/12200000-0000-0000-0000-000000000015/12200000-0000-0000-0000-000000000026/delete-proof.txt';
set local session_replication_role = origin;
set local role authenticated;
select public.delete_learning_material('12200000-0000-0000-0000-000000000026', '12200000-0000-0000-0000-000000000015');

select is(
  (select count(*) from public.learning_materials where id = '12200000-0000-0000-0000-000000000026'),
  0::bigint,
  'deleting the source Learning Material removes its own row'
);
select is(
  (select count(*) from public.lessons where id = current_setting('test.deletion_proof_id')::uuid),
  1::bigint,
  'deleting the source Learning Material leaves the Dynamic Lesson intact'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.deletion_proof_id')::uuid),
  2::bigint,
  'deleting the source Learning Material leaves the Dynamic Lesson Questions intact'
);
select is(
  (select count(*) from public.lesson_question_passages where lesson_id = current_setting('test.deletion_proof_id')::uuid),
  2::bigint,
  'deleting the source Learning Material leaves the Lesson Question Passage provenance rows intact'
);
select is(
  (select passage_text from public.lesson_question_passages where lesson_id = current_setting('test.deletion_proof_id')::uuid and passage_ordinal = 0),
  'Provenance snapshot text for deletion proof.',
  'deleting the source Learning Material leaves the snapshotted passage text intact'
);
select is(
  (public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000015'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->>'sufficient')::boolean,
  false,
  'deleting the source Learning Material makes its passages unavailable to a later retrieval call'
);
select is(
  jsonb_array_length(public.retrieve_dynamic_lesson_context('12200000-0000-0000-0000-000000000015'::uuid, ('[' || '1,' || repeat('0,', 766) || '0]')::jsonb, 'ci-deterministic')->'passages'),
  0,
  'deleting the source Learning Material leaves no passages for a later retrieval call'
);

select * from finish();
rollback;
