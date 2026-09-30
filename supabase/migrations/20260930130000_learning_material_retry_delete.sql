alter table public.learning_materials
add column processing_version integer not null default 1;

alter table public.learning_materials
add constraint learning_materials_processing_version_check check (processing_version > 0);

revoke update, delete on public.learning_materials from authenticated;

revoke all on function public.complete_learning_material(uuid, text, text, integer, integer, jsonb) from public, anon, authenticated;
drop function public.complete_learning_material(uuid, text, text, integer, integer, jsonb);

create or replace function public.complete_learning_material(
  p_material_id uuid,
  p_normalized_text text,
  p_embedding_model text,
  p_embedding_dimension integer,
  p_passage_schema_version integer,
  p_processing_version integer,
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
  for update;

  if not found or selected_material.status <> 'processing' then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.processing_version is distinct from p_processing_version then
    raise exception 'stale completion is rejected';
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

create or replace function public.fail_learning_material(
  p_material_id uuid,
  p_learning_language_id uuid,
  p_processing_version integer
)
returns public.learning_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_material public.learning_materials%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_material
  from public.learning_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.learner_id is distinct from current_learner_id then
    raise exception 'another Learner cannot fail a private Learning Material';
  end if;

  if selected_material.learning_language_id is distinct from p_learning_language_id then
    raise exception 'failure rejects a wrong Learning Language';
  end if;

  if selected_material.status <> 'processing' then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.processing_version is distinct from p_processing_version then
    raise exception 'stale failure is rejected';
  end if;

  delete from public.learning_material_passages
  where material_id = selected_material.id;

  update public.learning_materials
  set status = 'failed',
      normalized_text = null,
      updated_at = now()
  where id = selected_material.id
  returning * into selected_material;

  return selected_material;
end;
$$;

create or replace function public.claim_learning_material_retry(
  p_material_id uuid,
  p_learning_language_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_material public.learning_materials%rowtype;
  claimed_value boolean := false;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_material
  from public.learning_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.learner_id is distinct from current_learner_id then
    raise exception 'another Learner cannot retry a private Learning Material';
  end if;

  if selected_material.learning_language_id is distinct from p_learning_language_id then
    raise exception 'retry rejects a wrong Learning Language';
  end if;

  if selected_material.status = 'failed' then
    delete from public.learning_material_passages
    where material_id = selected_material.id;

    update public.learning_materials
    set status = 'processing',
        processing_version = processing_version + 1,
        normalized_text = null,
        updated_at = now()
    where id = selected_material.id
    returning * into selected_material;

    claimed_value := true;
  elsif selected_material.status <> 'processing' then
    raise exception 'Learning Material is unavailable.';
  end if;

  return jsonb_build_object(
    'material', jsonb_build_object(
      'id', selected_material.id,
      'fileName', selected_material.file_name,
      'status', selected_material.status,
      'createdAt', selected_material.created_at,
      'storagePath', selected_material.storage_path,
      'processingVersion', selected_material.processing_version,
      'learningLanguageId', selected_material.learning_language_id
    ),
    'claimed', claimed_value
  );
end;
$$;

create or replace function public.delete_learning_material(
  p_material_id uuid,
  p_learning_language_id uuid
)
returns public.learning_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_material public.learning_materials%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_material
  from public.learning_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.learner_id is distinct from current_learner_id then
    raise exception 'another Learner cannot delete a private Learning Material';
  end if;

  if selected_material.learning_language_id is distinct from p_learning_language_id then
    raise exception 'delete rejects a wrong Learning Language';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'learning-materials'
      and name = selected_material.storage_path
  ) then
    raise exception 'Learning Material source must be removed first.';
  end if;

  delete from public.learning_materials
  where id = selected_material.id
  returning * into selected_material;

  return selected_material;
end;
$$;

revoke all on function public.complete_learning_material(uuid, text, text, integer, integer, integer, jsonb) from public, anon;
grant execute on function public.complete_learning_material(uuid, text, text, integer, integer, integer, jsonb) to authenticated;
revoke all on function public.fail_learning_material(uuid, uuid, integer) from public, anon;
grant execute on function public.fail_learning_material(uuid, uuid, integer) to authenticated;
revoke all on function public.claim_learning_material_retry(uuid, uuid) from public, anon;
grant execute on function public.claim_learning_material_retry(uuid, uuid) to authenticated;
revoke all on function public.delete_learning_material(uuid, uuid) from public, anon;
grant execute on function public.delete_learning_material(uuid, uuid) to authenticated;
