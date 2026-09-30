begin;

select plan(69);

select ok(
  exists (
    select 1
    from pg_extension
    where extname = 'vector'
  ),
  'pgvector is enabled'
);
select is((select public from storage.buckets where id = 'learning-materials'), false, 'Learning Materials storage is private');
select is((select file_size_limit from storage.buckets where id = 'learning-materials'), 1048576::bigint, 'Learning Materials storage has a one MiB limit');
select is((select allowed_mime_types from storage.buckets where id = 'learning-materials'), array['text/plain']::text[], 'Learning Materials storage accepts plain text');
select is((select relrowsecurity from pg_class where oid = 'public.learning_materials'::regclass), true, 'Learning Materials use row-level security');
select is((select relrowsecurity from pg_class where oid = 'public.learning_material_passages'::regclass), true, 'Learning Material Passages use row-level security');
select col_type_is(
  'public',
  'learning_materials',
  'processing_version',
  'integer',
  'processing version is an integer column'
);
select is(
  has_table_privilege('authenticated', 'public.learning_materials', 'insert'),
  true,
  'authenticated Learners can create Learning Material fixtures'
);
select is(
  has_table_privilege('authenticated', 'public.learning_materials', 'update'),
  false,
  'authenticated Learners cannot directly update Learning Materials'
);
select is(
  has_table_privilege('authenticated', 'public.learning_materials', 'delete'),
  false,
  'authenticated Learners cannot directly delete Learning Materials'
);
select is(
  (
    select format_type(a.atttypid, a.atttypmod)
    from pg_attribute as a
    where a.attrelid = 'public.learning_material_passages'::regclass
      and a.attname = 'embedding'
  ),
  'vector(768)',
  'Passage embeddings have fixed dimension 768'
);
select is(
  has_table_privilege('authenticated', 'public.learning_material_passages', 'select'),
  false,
  'passages do not receive broad authenticated table grants'
);

insert into auth.users (id)
values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.learning_languages (id, learner_id, language_tag)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'it'),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fr'),
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'it');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into public.learning_materials (
  id,
  learning_language_id,
  file_name,
  storage_path,
  byte_size
)
values (
  '66666666-6666-6666-6666-666666666666',
  '33333333-3333-3333-3333-333333333333',
  'notes.txt',
  '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666/notes.txt',
  10
);

select is((select count(*) from public.learning_materials), 1::bigint, 'a Learner can see their own Learning Material');
select is(
  (select count(*) from public.learning_materials where learning_language_id = '44444444-4444-4444-4444-444444444444'),
  0::bigint,
  'Learning Materials remain scoped to their Learning Language'
);
select throws_ok(
  $$insert into public.learning_materials (id, learning_language_id, file_name, storage_path, byte_size)
    values ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'other.txt',
      '11111111-1111-1111-1111-111111111111/55555555-5555-5555-5555-555555555555/77777777-7777-7777-7777-777777777777/other.txt', 4)$$,
  '23503',
  'insert or update on table "learning_materials" violates foreign key constraint "learning_materials_learning_language_id_learner_id_fkey"',
  'a Learner cannot attach a Learning Material to another Learner'
);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from public.learning_materials), 0::bigint, 'another Learner cannot see Learning Materials');
select is((select count(*) from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 0::bigint, 'another Learner cannot address a private Learning Material');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$insert into public.learning_materials (id, learning_language_id, file_name, storage_path, byte_size)
    values ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'other.txt',
      '11111111-1111-1111-1111-111111111111/55555555-5555-5555-5555-555555555555/77777777-7777-7777-7777-777777777777/other.txt', 4)$$,
  '23503',
  'insert or update on table "learning_materials" violates foreign key constraint "learning_materials_learning_language_id_learner_id_fkey"',
  'RLS blocks cross-Learner Learning Language linkage'
);
select throws_ok(
  $$insert into public.learning_materials (id, learning_language_id, file_name, storage_path, byte_size, status)
    values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'other.txt',
      '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/77777777-7777-7777-7777-777777777777/other.txt', 4, 'unknown')$$,
  '23514',
  'new row for relation "learning_materials" violates check constraint "learning_materials_status_check"',
  'Learning Material status is constrained'
);
select throws_ok(
  $$insert into public.learning_materials (id, learning_language_id, file_name, storage_path, byte_size)
    values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'other.pdf',
      '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/77777777-7777-7777-7777-777777777777/other.pdf', 4)$$,
  '23514',
  'new row for relation "learning_materials" violates check constraint "learning_materials_file_name_check"',
  'only TXT file names are persisted'
);
select throws_ok(
  $$insert into public.learning_materials (id, learning_language_id, file_name, storage_path, byte_size)
    values ('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 'large.txt',
      '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/77777777-7777-7777-7777-777777777777/large.txt', 1048577)$$,
  '23514',
  'new row for relation "learning_materials" violates check constraint "learning_materials_byte_size_check"',
  'stored bytes are bounded to one MiB'
);

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'learning-materials',
  '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666/notes.txt',
  '11111111-1111-1111-1111-111111111111',
  '{"mimetype":"text/plain","size":10}'::jsonb
);
select is((select count(*) from storage.objects where bucket_id = 'learning-materials'), 1::bigint, 'a Learner can store their own material object');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is((select count(*) from storage.objects where bucket_id = 'learning-materials'), 0::bigint, 'another Learner cannot read a private material object');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('learning-materials', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666/other.txt',
      '22222222-2222-2222-2222-222222222222', '{"mimetype":"text/plain","size":5}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'storage objects are limited to the first Learner folder'
);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('learning-materials', '11111111-1111-1111-1111-111111111111/44444444-4444-4444-4444-444444444444/66666666-6666-6666-6666-666666666666/wrong.txt',
      '11111111-1111-1111-1111-111111111111', '{"mimetype":"text/plain","size":5}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'storage objects require the owned Learning Language folder'
);

select is((select processing_version from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 1, 'new Learning Materials start at processing version one');
select public.fail_learning_material('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 1);
select is((select status from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'failed', 'a current processing failure is visible as failed');
set local role postgres;
select is((select count(*) from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0::bigint, 'failed processing has no passages');
set local role authenticated;
select public.claim_learning_material_retry('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333');
select is((select status from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'processing', 'retry claims a failed material');
select is((select processing_version from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 2, 'retry increments the processing version once');
select public.claim_learning_material_retry('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333');
select is((select processing_version from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 2, 'repeated retry keeps the active processing version');
select throws_ok(
  $$select public.fail_learning_material('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', 1)$$,
  'P0001',
  'stale failure is rejected'
);
select is((select status from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'processing', 'stale failure cannot change the active attempt');

insert into public.learning_materials (
  id,
  learning_language_id,
  file_name,
  storage_path,
  byte_size
)
values (
  '77777777-7777-7777-7777-777777777777',
  '33333333-3333-3333-3333-333333333333',
  'second.txt',
  '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/77777777-7777-7777-7777-777777777777/second.txt',
  4
);
select throws_ok(
  $$select public.complete_learning_material(
    p_material_id => '77777777-7777-7777-7777-777777777777',
    p_normalized_text => 'Alpha',
    p_embedding_model => 'ci-deterministic',
    p_embedding_dimension => 767,
    p_passage_schema_version => 1,
    p_processing_version => 1,
    p_passages => '[]'::jsonb
  )$$,
  'P0001',
  'Embedding dimension is invalid.',
  'completion enforces the fixed embedding dimension'
);

select public.complete_learning_material(
  p_material_id => '66666666-6666-6666-6666-666666666666',
  p_normalized_text => '😀Alpha',
  p_embedding_model => 'ci-deterministic',
  p_embedding_dimension => 768,
  p_passage_schema_version => 1,
  p_processing_version => 2,
  p_passages => jsonb_build_array(jsonb_build_object(
    'ordinal', 0,
    'start_offset', 0,
    'end_offset', 6,
    'text', '😀Alpha',
    'embedding_model', 'ci-deterministic',
    'schema_version', 1,
    'embedding', ('[' || repeat('0,', 767) || '0]')::jsonb
  ))
);
set local role postgres;
select is((select status from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'ready', 'completion transitions the material to ready');
select is((select normalized_text from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), '😀Alpha', 'completion stores normalized text');
select is((select count(*) from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 1::bigint, 'completion inserts passages atomically');
select is((select ordinal from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0, 'passages retain source order');
select is((select source_start from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0, 'passages retain normalized-text start offsets');
select is((select source_end from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 6, 'passages retain Unicode code-point end offsets');
select is((select embedding_dimension from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 768, 'passages retain embedding dimension metadata');
select is((select passage_schema_version from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 1, 'passages retain schema version metadata');
select is((select embedding_model from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 'ci-deterministic', 'passages retain embedding model identity');
select public.fail_learning_material('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333', 1);
select public.claim_learning_material_retry('77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333');
select is((select status from public.learning_materials where id = '77777777-7777-7777-7777-777777777777'), 'processing', 'a retried material accepts a new processing attempt');
select is((select processing_version from public.learning_materials where id = '77777777-7777-7777-7777-777777777777'), 2, 'the retried material has exactly one new processing version');
select throws_ok(
  $$select public.complete_learning_material(
    p_material_id => '77777777-7777-7777-7777-777777777777',
    p_normalized_text => 'Alpha',
    p_embedding_model => 'ci-deterministic',
    p_embedding_dimension => 768,
    p_passage_schema_version => 1,
    p_processing_version => 1,
    p_passages => jsonb_build_array(jsonb_build_object(
      'ordinal', 0,
      'start_offset', 0,
      'end_offset', 5,
      'text', 'Alpha',
      'embedding_model', 'ci-deterministic',
      'schema_version', 1,
      'embedding', ('[' || repeat('0,', 767) || '0]')::jsonb
    ))
  )$$,
  'P0001',
  'stale completion is rejected'
);
select is((select status from public.learning_materials where id = '77777777-7777-7777-7777-777777777777'), 'processing', 'stale completion leaves the material processing');
set local role postgres;
select throws_ok(
  $$insert into public.learning_material_passages (material_id, learner_id, learning_language_id, ordinal, source_start, source_end, passage_text, embedding_model, embedding_dimension, passage_schema_version, embedding)
    values ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 1, 0, 10, 'Alpha beta', 'ci-deterministic', 768, 1, ('[' || repeat('0,', 767) || '0]')::extensions.vector(768))$$,
  '23503',
  'insert or update on table "learning_material_passages" violates foreign key constraint "learning_material_passages_material_id_learner_id_learning_fkey"',
  'passages cannot cross Learning Language ownership boundaries'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok(
  $$select public.complete_learning_material(
    p_material_id => '66666666-6666-6666-6666-666666666666',
    p_normalized_text => 'Alpha beta',
    p_embedding_model => 'ci-deterministic',
    p_embedding_dimension => 768,
    p_passage_schema_version => 1,
    p_processing_version => 1,
    p_passages => '[]'::jsonb
  )$$,
  'P0001',
  'Learning Material is unavailable.',
  'another Learner cannot complete a private material'
);
select is((select count(*) from public.learning_materials), 0::bigint, 'another Learner cannot see completed materials');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$select public.complete_learning_material(
    p_material_id => '66666666-6666-6666-6666-666666666666',
    p_normalized_text => 'Alpha beta',
    p_embedding_model => 'ci-deterministic',
    p_embedding_dimension => 768,
    p_passage_schema_version => 1,
    p_processing_version => 2,
    p_passages => '[]'::jsonb
  )$$,
  'P0001',
  'Learning Material is unavailable.',
  'completed materials cannot be completed a second time'
);
select public.complete_learning_material(
  p_material_id => '77777777-7777-7777-7777-777777777777',
  p_normalized_text => 'Alpha',
  p_embedding_model => 'ci-deterministic',
  p_embedding_dimension => 768,
  p_passage_schema_version => 1,
  p_processing_version => 2,
  p_passages => jsonb_build_array(jsonb_build_object(
    'ordinal', 0,
    'start_offset', 0,
    'end_offset', 5,
    'text', 'Alpha',
    'embedding_model', 'ci-deterministic',
    'schema_version', 1,
    'embedding', ('[' || repeat('0,', 767) || '0]')::jsonb
  ))
);
select is((select status from public.learning_materials where id = '77777777-7777-7777-7777-777777777777'), 'ready', 'the current processing version can complete exactly once');

set local role postgres;
insert into public.learning_materials (
  id,
  learner_id,
  learning_language_id,
  file_name,
  storage_path,
  byte_size,
  status
)
values (
  '88888888-8888-8888-8888-888888888888',
  '22222222-2222-2222-2222-222222222222',
  '55555555-5555-5555-5555-555555555555',
  'private-owner.txt',
  '22222222-2222-2222-2222-222222222222/55555555-5555-5555-5555-555555555555/88888888-8888-8888-8888-888888888888/private-owner.txt',
  5,
  'failed'
);
set local role authenticated;
select throws_ok(
  $$select public.claim_learning_material_retry('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555')$$,
  'P0001',
  'another Learner cannot retry a private Learning Material'
);
select throws_ok(
  $$select public.delete_learning_material('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555')$$,
  'P0001',
  'another Learner cannot delete a private Learning Material'
);

select throws_ok(
  $$select public.claim_learning_material_retry('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444')$$,
  'P0001',
  'retry rejects a wrong Learning Language'
);
select throws_ok(
  $$select public.delete_learning_material('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444')$$,
  'P0001',
  'delete rejects a wrong Learning Language'
);
select is((select count(*) from public.learning_materials where status = 'ready' and id = '88888888-8888-8888-8888-888888888888'), 0::bigint, 'failed or inaccessible materials are excluded from ready selection');

savepoint ready_delete_guard;
select throws_ok(
  $$select public.delete_learning_material('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333')$$,
  'P0001',
  'Learning Material source must be removed first.',
  'ready deletion requires the source object to be removed first'
);
rollback to savepoint ready_delete_guard;
set local role postgres;
set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'learning-materials'
  and name = '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/66666666-6666-6666-6666-666666666666/notes.txt';
set local session_replication_role = origin;
set local role authenticated;
select public.delete_learning_material('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333');
set local role postgres;
select is((select count(*) from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 0::bigint, 'deleting a ready material removes its row');
select is((select count(*) from public.learning_materials where normalized_text = '😀Alpha'), 0::bigint, 'deleting a ready material removes its normalized text with the row');
select is((select count(*) from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0::bigint, 'deleting a ready material cascades passages and embeddings');
set local role authenticated;

insert into public.learning_materials (
  id,
  learning_language_id,
  file_name,
  storage_path,
  byte_size,
  status,
  normalized_text
)
values
  ('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', 'failed-delete.txt', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/99999999-9999-9999-9999-999999999999/failed-delete.txt', 5, 'failed', null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'processing-delete.txt', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/processing-delete.txt', 5, 'processing', null),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'same-name.txt', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/same-name.txt', 5, 'ready', 'Alpha'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', 'same-name.txt', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/cccccccc-cccc-cccc-cccc-cccccccccccc/same-name.txt', 5, 'ready', 'Alpha');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('learning-materials', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/99999999-9999-9999-9999-999999999999/failed-delete.txt', '11111111-1111-1111-1111-111111111111', '{"mimetype":"text/plain","size":5}'::jsonb),
  ('learning-materials', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/processing-delete.txt', '11111111-1111-1111-1111-111111111111', '{"mimetype":"text/plain","size":5}'::jsonb),
  ('learning-materials', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/same-name.txt', '11111111-1111-1111-1111-111111111111', '{"mimetype":"text/plain","size":5}'::jsonb),
  ('learning-materials', '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/cccccccc-cccc-cccc-cccc-cccccccccccc/same-name.txt', '11111111-1111-1111-1111-111111111111', '{"mimetype":"text/plain","size":5}'::jsonb);
savepoint failed_delete_guard;
select throws_ok(
  $$select public.delete_learning_material('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333')$$,
  'P0001',
  'Learning Material source must be removed first.',
  'failed deletion requires the source object to be removed first'
);
rollback to savepoint failed_delete_guard;
set local role postgres;
set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'learning-materials'
  and name = '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/99999999-9999-9999-9999-999999999999/failed-delete.txt';
set local session_replication_role = origin;
set local role authenticated;
select public.delete_learning_material('99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333');
set local role postgres;
select is((select count(*) from public.learning_materials where id = '99999999-9999-9999-9999-999999999999'), 0::bigint, 'deleting a failed material removes its row');
set local role authenticated;
savepoint processing_delete_guard;
select throws_ok(
  $$select public.delete_learning_material('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333')$$,
  'P0001',
  'Learning Material source must be removed first.',
  'processing deletion requires the source object to be removed first'
);
rollback to savepoint processing_delete_guard;
set local role postgres;
set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'learning-materials'
  and name = '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/processing-delete.txt';
set local session_replication_role = origin;
set local role authenticated;
select public.delete_learning_material('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333');
set local role postgres;
select is((select count(*) from public.learning_materials where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0::bigint, 'deleting a processing material removes its row');
select is((select count(*) from public.learning_materials where id in ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc')), 2::bigint, 'same-name materials remain independent before one is deleted');
set local role authenticated;
savepoint same_name_delete_guard;
select throws_ok(
  $$select public.delete_learning_material('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333')$$,
  'P0001',
  'Learning Material source must be removed first.',
  'same-name deletion requires the source object to be removed first'
);
rollback to savepoint same_name_delete_guard;
set local role postgres;
set local session_replication_role = replica;
delete from storage.objects
where bucket_id = 'learning-materials'
  and name = '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/same-name.txt';
set local session_replication_role = origin;
set local role authenticated;
select public.delete_learning_material('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333');
set local role postgres;
select is((select count(*) from public.learning_materials where id in ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc')), 1::bigint, 'deleting one same-name material preserves the other row');
select is((select count(*) from storage.objects where bucket_id = 'learning-materials' and name like '%/cccccccc-cccc-cccc-cccc-cccccccccccc/%'), 1::bigint, 'deleting one same-name material preserves the other private object');

select * from finish();
rollback;
