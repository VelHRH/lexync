insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vocabulary-audio-clips', 'vocabulary-audio-clips', false, 2097152, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.learning_vocabulary_entries
add column audio_clip_path text,
add column audio_clip_duration_ms integer,
add constraint learning_vocabulary_entries_audio_clip_check
  check (
    (audio_clip_path is null and audio_clip_duration_ms is null)
    or (
      audio_clip_path is not null
      and audio_clip_duration_ms is not null
      and audio_clip_duration_ms > 0
      and audio_clip_path like learner_id::text || '/' || learning_language_id::text || '/' || id::text || '/%'
    )
  ),
add constraint learning_vocabulary_entries_audio_clip_path_key unique (audio_clip_path);

create or replace function public.set_vocabulary_entry_audio_clip(
  p_learning_vocabulary_entry_id uuid,
  p_audio_clip_path text,
  p_audio_clip_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.learning_vocabulary_entries
  set audio_clip_path = nullif(btrim(coalesce(p_audio_clip_path, '')), ''),
      audio_clip_duration_ms = case when nullif(btrim(coalesce(p_audio_clip_path, '')), '') is null then null else p_audio_clip_duration_ms end
  where id = p_learning_vocabulary_entry_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;
end;
$$;

revoke all on function public.set_vocabulary_entry_audio_clip(uuid, text, integer) from public, anon;
grant execute on function public.set_vocabulary_entry_audio_clip(uuid, text, integer) to authenticated;

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
