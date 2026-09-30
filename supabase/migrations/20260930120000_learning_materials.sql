create extension if not exists vector with schema extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-materials', 'learning-materials', false, 1048576, array['text/plain']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  learning_language_id uuid not null,
  file_name text not null check (length(btrim(file_name)) > 0 and file_name !~ '[\\/]' and file_name ~* '\.txt$'),
  storage_path text not null unique,
  byte_size integer not null check (byte_size > 0 and byte_size <= 1048576),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  normalized_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, learner_id, learning_language_id),
  foreign key (learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade,
  check (
    storage_path = learner_id::text || '/' || learning_language_id::text || '/' || id::text || '/' || file_name
  ),
  check (status <> 'ready' or length(btrim(normalized_text)) > 0)
);

create table public.learning_material_passages (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null,
  learner_id uuid not null,
  learning_language_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  source_start integer not null check (source_start >= 0),
  source_end integer not null check (source_end > source_start),
  passage_text text not null check (length(btrim(passage_text)) > 0),
  embedding_model text not null check (length(btrim(embedding_model)) > 0),
  embedding_dimension integer not null check (embedding_dimension = 768),
  passage_schema_version integer not null check (passage_schema_version = 1),
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  unique (material_id, ordinal),
  unique (id, learner_id, learning_language_id),
  foreign key (material_id, learner_id, learning_language_id)
    references public.learning_materials(id, learner_id, learning_language_id) on delete cascade
);

alter table public.learning_materials enable row level security;
alter table public.learning_material_passages enable row level security;

create policy learner_owns_learning_materials on public.learning_materials
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

create policy learner_reads_learning_material_passages on public.learning_material_passages
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.learning_materials from anon;
revoke all on public.learning_material_passages from public, anon, authenticated;

grant select, insert, update, delete on public.learning_materials to authenticated;

create policy learner_reads_learning_material_objects on storage.objects
for select to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_materials
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_inserts_learning_material_objects on storage.objects
for insert to authenticated
with check (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_materials
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_updates_learning_material_objects on storage.objects
for update to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_materials
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
)
with check (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_materials
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create policy learner_deletes_learning_material_objects on storage.objects
for delete to authenticated
using (
  bucket_id = 'learning-materials'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.learning_materials
    where id::text = (storage.foldername(name))[3]
      and learner_id = (select auth.uid())
      and learning_language_id::text = (storage.foldername(name))[2]
  )
);

create or replace function public.complete_learning_material(
  p_material_id uuid,
  p_normalized_text text,
  p_embedding_model text,
  p_embedding_dimension integer,
  p_passage_schema_version integer,
  p_passages jsonb
)
returns public.learning_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_material public.learning_materials%rowtype;
  item jsonb;
  passage_count integer;
  position integer := 0;
  ordinal_value integer;
  source_start_value integer;
  source_end_value integer;
  passage_text_value text;
  embedding_model_value text;
  embedding_value jsonb;
  item_schema_version integer;
  previous_start integer := -1;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_material
  from public.learning_materials
  where id = p_material_id
    and learner_id = current_learner_id
    and status = 'processing'
  for update;

  if not found then
    raise exception 'Learning Material is unavailable.';
  end if;

  if p_embedding_dimension <> 768 then
    raise exception 'Embedding dimension is invalid.';
  end if;

  if p_passage_schema_version <> 1 then
    raise exception 'Passage schema version is invalid.';
  end if;

  if p_normalized_text is null or length(btrim(p_normalized_text)) = 0 then
    raise exception 'Normalized text is required.';
  end if;

  if p_embedding_model is null or length(btrim(p_embedding_model)) = 0 then
    raise exception 'Embedding model is required.';
  end if;

  if p_passages is null or jsonb_typeof(p_passages) <> 'array' then
    raise exception 'Passages must be an array.';
  end if;

  passage_count := jsonb_array_length(p_passages);
  if passage_count = 0 then
    raise exception 'At least one passage is required.';
  end if;

  for item in (
    select value
    from jsonb_array_elements(p_passages) with ordinality as entries(value, ordinality)
    order by ordinality
  ) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Passage is invalid.';
    end if;

    ordinal_value := nullif(coalesce(item->>'ordinal', item->>'sourceOrdinal'), '')::integer;
    source_start_value := nullif(coalesce(item->>'source_start', item->>'sourceStart', item->>'start_offset', item->>'startOffset'), '')::integer;
    source_end_value := nullif(coalesce(item->>'source_end', item->>'sourceEnd', item->>'end_offset', item->>'endOffset'), '')::integer;
    passage_text_value := coalesce(item->>'passage_text', item->>'passageText', item->>'text');
    embedding_model_value := coalesce(item->>'embedding_model', item->>'embeddingModel', p_embedding_model);
    embedding_value := coalesce(item->'embedding', item->'vector');
    item_schema_version := nullif(coalesce(item->>'passage_schema_version', item->>'passageSchemaVersion', item->>'schema_version', item->>'schemaVersion'), '')::integer;

    if ordinal_value is null or ordinal_value <> position then
      raise exception 'Passage ordinals are invalid.';
    end if;

    if source_start_value is null or source_end_value is null
      or source_start_value < 0
      or source_end_value <= source_start_value
      or source_end_value > length(p_normalized_text)
      or source_start_value < previous_start then
      raise exception 'Passage offsets are invalid.';
    end if;

    if passage_text_value is null or length(btrim(passage_text_value)) = 0
      or substring(p_normalized_text from source_start_value + 1 for source_end_value - source_start_value) <> passage_text_value then
      raise exception 'Passage text does not match its offsets.';
    end if;

    if embedding_model_value <> p_embedding_model
      or item_schema_version is not null and item_schema_version <> 1
      or embedding_value is null
      or jsonb_typeof(embedding_value) <> 'array'
      or jsonb_array_length(embedding_value) <> 768
      or exists (
        select 1
        from jsonb_array_elements(embedding_value) as values(value)
        where jsonb_typeof(values.value) <> 'number'
      ) then
      raise exception 'Passage embedding metadata is invalid.';
    end if;

    insert into public.learning_material_passages (
      material_id,
      learner_id,
      learning_language_id,
      ordinal,
      source_start,
      source_end,
      passage_text,
      embedding_model,
      embedding_dimension,
      passage_schema_version,
      embedding
    ) values (
      selected_material.id,
      selected_material.learner_id,
      selected_material.learning_language_id,
      ordinal_value,
      source_start_value,
      source_end_value,
      passage_text_value,
      embedding_model_value,
      p_embedding_dimension,
      coalesce(item_schema_version, p_passage_schema_version),
      embedding_value::text::extensions.vector(768)
    );

    previous_start := source_start_value;
    position := position + 1;
  end loop;

  update public.learning_materials
  set normalized_text = p_normalized_text,
      status = 'ready',
      updated_at = now()
  where id = selected_material.id
  returning * into selected_material;

  return selected_material;
end;
$$;

revoke all on function public.complete_learning_material(uuid, text, text, integer, integer, jsonb) from public, anon;
grant execute on function public.complete_learning_material(uuid, text, text, integer, integer, jsonb) to authenticated;
