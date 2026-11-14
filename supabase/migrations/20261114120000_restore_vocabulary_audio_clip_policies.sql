insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vocabulary-audio-clips', 'vocabulary-audio-clips', false, 2097152, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists learner_reads_vocabulary_audio_clip_objects on storage.objects;
drop policy if exists learner_inserts_vocabulary_audio_clip_objects on storage.objects;
drop policy if exists learner_updates_vocabulary_audio_clip_objects on storage.objects;
drop policy if exists learner_deletes_vocabulary_audio_clip_objects on storage.objects;

create policy learner_reads_vocabulary_audio_clip_objects on storage.objects
for select to authenticated
using (
  bucket_id = 'vocabulary-audio-clips'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_vocabulary_entries
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_inserts_vocabulary_audio_clip_objects on storage.objects
for insert to authenticated
with check (
  bucket_id = 'vocabulary-audio-clips'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_vocabulary_entries
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_updates_vocabulary_audio_clip_objects on storage.objects
for update to authenticated
using (
  bucket_id = 'vocabulary-audio-clips'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_vocabulary_entries
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
)
with check (
  bucket_id = 'vocabulary-audio-clips'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_vocabulary_entries
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_deletes_vocabulary_audio_clip_objects on storage.objects
for delete to authenticated
using (
  bucket_id = 'vocabulary-audio-clips'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_vocabulary_entries
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);
