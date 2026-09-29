begin;

select plan(36);

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
  $$select public.complete_learning_material('77777777-7777-7777-7777-777777777777', 'Alpha', 'ci-deterministic', 767, 1, '[]'::jsonb)$$,
  'P0001',
  'Embedding dimension is invalid.',
  'completion enforces the fixed embedding dimension'
);

select public.complete_learning_material(
  '66666666-6666-6666-6666-666666666666',
  'Alpha beta',
  'ci-deterministic',
  768,
  1,
  jsonb_build_array(jsonb_build_object(
    'ordinal', 0,
    'start_offset', 0,
    'end_offset', 10,
    'text', 'Alpha beta',
    'embedding_model', 'ci-deterministic',
    'schema_version', 1,
    'embedding', ('[' || repeat('0,', 767) || '0]')::jsonb
  ))
);
set local role postgres;
select is((select status from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'ready', 'completion transitions the material to ready');
select is((select normalized_text from public.learning_materials where id = '66666666-6666-6666-6666-666666666666'), 'Alpha beta', 'completion stores normalized text');
select is((select count(*) from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 1::bigint, 'completion inserts passages atomically');
select is((select ordinal from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0, 'passages retain source order');
select is((select source_start from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 0, 'passages retain normalized-text start offsets');
select is((select source_end from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 10, 'passages retain normalized-text end offsets');
select is((select embedding_dimension from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 768, 'passages retain embedding dimension metadata');
select is((select passage_schema_version from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 1, 'passages retain schema version metadata');
select is((select embedding_model from public.learning_material_passages where material_id = '66666666-6666-6666-6666-666666666666'), 'ci-deterministic', 'passages retain embedding model identity');
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
  $$select public.complete_learning_material('66666666-6666-6666-6666-666666666666', 'Alpha beta', 'ci-deterministic', 768, 1, '[]'::jsonb)$$,
  'P0001',
  'Learning Material is unavailable.',
  'another Learner cannot complete a private material'
);
select is((select count(*) from public.learning_materials), 0::bigint, 'another Learner cannot see completed materials');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$select public.complete_learning_material('66666666-6666-6666-6666-666666666666', 'Alpha beta', 'ci-deterministic', 768, 1, '[]'::jsonb)$$,
  'P0001',
  'Learning Material is unavailable.',
  'completed materials cannot be completed a second time'
);
select throws_ok(
  $$select public.complete_learning_material('77777777-7777-7777-7777-777777777777', 'Alpha', 'ci-deterministic', 768, 1, '[]'::jsonb)$$,
  'P0001',
  'At least one passage is required.',
  'processing materials require passages before completion'
);

select * from finish();
rollback;
