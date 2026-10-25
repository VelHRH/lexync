begin;

select plan(21);

select ok(
  (select id from storage.buckets where id = 'vocabulary-audio-clips') is not null,
  'Audio Clips are kept in their own storage bucket'
);

select is(
  (select public from storage.buckets where id = 'vocabulary-audio-clips'),
  false,
  'the Audio Clip bucket is private'
);

select ok(
  (select file_size_limit from storage.buckets where id = 'vocabulary-audio-clips') > 0,
  'the Audio Clip bucket limits how large one recording may be'
);

select ok(
  (select allowed_mime_types from storage.buckets where id = 'vocabulary-audio-clips') is not null,
  'the Audio Clip bucket accepts only an allowlist of audio media types'
);

select ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'learning_vocabulary_entries'
     and column_name in ('audio_clip_path', 'audio_clip_duration_ms')) = 2,
  'a Vocabulary Entry carries an Audio Clip path and the clip duration'
);

insert into auth.users (id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

set local role postgres;

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', '2026-09-01T00:00:00Z'),
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'es', '2026-09-01T00:00:00Z');

insert into public.learning_vocabulary_entries (id, learner_id, learning_language_id, expression, suspended, created_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001', 'casa', false, '2026-09-01T01:00:00Z'),
  ('b3000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'casa', false, '2026-09-01T01:00:00Z');

select lives_ok(
  $$update public.learning_vocabulary_entries
    set audio_clip_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm',
        audio_clip_duration_ms = 1200
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  'a Vocabulary Entry accepts an Audio Clip stored under its own Learner, Learning Language and Entry'
);

select throws_ok(
  $$update public.learning_vocabulary_entries
    set audio_clip_path = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm',
        audio_clip_duration_ms = null
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'an Audio Clip without a duration is rejected'
);

select throws_ok(
  $$update public.learning_vocabulary_entries
    set audio_clip_path = null, audio_clip_duration_ms = 1200
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'a duration without an Audio Clip is rejected'
);

select throws_ok(
  $$update public.learning_vocabulary_entries
    set audio_clip_path = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm',
        audio_clip_duration_ms = 1200
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'an Audio Clip stored under another Learner is rejected'
);

select lives_ok(
  $$update public.learning_vocabulary_entries
    set audio_clip_path = null, audio_clip_duration_ms = null
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  'a Vocabulary Entry may carry no Audio Clip at all'
);

select ok(
  to_regprocedure('public.set_vocabulary_entry_audio_clip(uuid, text, integer)') is not null,
  'a Learner records an Audio Clip through its own write contract'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select lives_ok(
  $$select public.set_vocabulary_entry_audio_clip(
      'a3000000-0000-0000-0000-000000000001',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm',
      1200)$$,
  'a Learner keeps an Audio Clip against their own Vocabulary Entry'
);

select is(
  (select audio_clip_duration_ms from public.learning_vocabulary_entries where id = 'a3000000-0000-0000-0000-000000000001'),
  1200,
  'the kept Audio Clip carries the duration the Learner recorded'
);

select is(
  (select audio_clip_path from public.learning_vocabulary_entries
   where id = 'a3000000-0000-0000-0000-000000000001'
     and public.set_vocabulary_entry_audio_clip('a3000000-0000-0000-0000-000000000001', null, null) is null),
  null,
  'removing an Audio Clip returns the Vocabulary Entry to having none'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
select throws_ok(
  $$select public.set_vocabulary_entry_audio_clip(
      'a3000000-0000-0000-0000-000000000001',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001/clip.webm',
      1200)$$,
  'P0001',
  'Vocabulary Entry is unavailable.',
  'a second Learner cannot record an Audio Clip against another Learner''s Vocabulary Entry'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('vocabulary-audio-clips', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm')$$,
  'a Learner stores an Audio Clip under their own Learner, Learning Language and Vocabulary Entry'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'vocabulary-audio-clips' and name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm'),
  1,
  'a Learner can reach the Audio Clip they recorded'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('vocabulary-audio-clips', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b1000000-0000-0000-0000-000000000001/b3000000-0000-0000-0000-000000000001/intruder.webm')$$,
  '42501',
  null,
  'a Learner cannot store an Audio Clip under another Learner'
);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'vocabulary-audio-clips' and name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm'),
  0,
  'a second Learner cannot read another Learner''s Audio Clip'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'learner_deletes_vocabulary_audio_clip_objects'
      and cmd = 'DELETE'
      and qual like '%vocabulary-audio-clips%'
      and qual like '%auth.uid()%'
  ),
  'removing an Audio Clip object is permitted only to the Learner whose prefix holds it'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'vocabulary-audio-clips' and name = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a1000000-0000-0000-0000-000000000001/a3000000-0000-0000-0000-000000000001/clip.webm'),
  1,
  'the Audio Clip stays reachable to the Learner who recorded it'
);

select * from finish();
rollback;
