create or replace function public.create_collection(
  p_learning_language_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  clean_name text := btrim(p_name);
  created_collection public.collections%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if coalesce(clean_name, '') = '' then
    raise exception 'Collection name is required.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  insert into public.collections (learner_id, learning_language_id, name)
  values (current_learner_id, p_learning_language_id, clean_name)
  returning * into created_collection;

  return jsonb_build_object(
    'id', created_collection.id,
    'learningLanguageId', created_collection.learning_language_id,
    'name', created_collection.name
  );
end;
$$;

create or replace function public.rename_collection(
  p_collection_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  clean_name text := btrim(p_name);
  renamed_collection public.collections%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if coalesce(clean_name, '') = '' then
    raise exception 'Collection name is required.';
  end if;

  update public.collections
  set name = clean_name
  where id = p_collection_id
    and learner_id = current_learner_id
  returning * into renamed_collection;

  if not found then
    raise exception 'Collection is unavailable.';
  end if;

  return jsonb_build_object(
    'id', renamed_collection.id,
    'learningLanguageId', renamed_collection.learning_language_id,
    'name', renamed_collection.name
  );
end;
$$;

create or replace function public.delete_collection(p_collection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  deleted_collection public.collections%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.collections
  where id = p_collection_id
    and learner_id = current_learner_id
  returning * into deleted_collection;

  if not found then
    raise exception 'Collection is unavailable.';
  end if;

  return jsonb_build_object(
    'id', deleted_collection.id,
    'learningLanguageId', deleted_collection.learning_language_id,
    'deleted', true
  );
end;
$$;

create or replace function public.add_collection_membership(
  p_collection_id uuid,
  p_learning_vocabulary_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_collection public.collections%rowtype;
  inserted_membership boolean := false;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_collection
  from public.collections
  where id = p_collection_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Collection is unavailable.';
  end if;

  perform 1
  from public.learning_vocabulary_entries
  where id = p_learning_vocabulary_entry_id
    and learner_id = current_learner_id
    and learning_language_id = selected_collection.learning_language_id;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;

  insert into public.collection_memberships (
    learner_id,
    collection_id,
    learning_language_id,
    learning_vocabulary_entry_id
  ) values (
    current_learner_id,
    selected_collection.id,
    selected_collection.learning_language_id,
    p_learning_vocabulary_entry_id
  )
  on conflict (collection_id, learning_vocabulary_entry_id) do nothing;

  inserted_membership := found;

  return jsonb_build_object(
    'collectionId', selected_collection.id,
    'learningLanguageId', selected_collection.learning_language_id,
    'learningVocabularyEntryId', p_learning_vocabulary_entry_id,
    'created', inserted_membership
  );
end;
$$;

create or replace function public.remove_collection_membership(
  p_collection_id uuid,
  p_learning_vocabulary_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_collection public.collections%rowtype;
  removed_membership boolean := false;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_collection
  from public.collections
  where id = p_collection_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Collection is unavailable.';
  end if;

  perform 1
  from public.learning_vocabulary_entries
  where id = p_learning_vocabulary_entry_id
    and learner_id = current_learner_id
    and learning_language_id = selected_collection.learning_language_id;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;

  delete from public.collection_memberships
  where collection_id = selected_collection.id
    and learning_vocabulary_entry_id = p_learning_vocabulary_entry_id
    and learner_id = current_learner_id;

  removed_membership := found;

  return jsonb_build_object(
    'collectionId', selected_collection.id,
    'learningLanguageId', selected_collection.learning_language_id,
    'learningVocabularyEntryId', p_learning_vocabulary_entry_id,
    'deleted', removed_membership
  );
end;
$$;

revoke all on public.collections from anon, authenticated;
revoke all on public.collection_memberships from anon, authenticated;
grant select on public.collections to authenticated;
grant select on public.collection_memberships to authenticated;

revoke all on function public.create_collection(uuid, text) from public;
grant execute on function public.create_collection(uuid, text) to authenticated;
revoke all on function public.rename_collection(uuid, text) from public;
grant execute on function public.rename_collection(uuid, text) to authenticated;
revoke all on function public.delete_collection(uuid) from public;
grant execute on function public.delete_collection(uuid) to authenticated;
revoke all on function public.add_collection_membership(uuid, uuid) from public;
grant execute on function public.add_collection_membership(uuid, uuid) to authenticated;
revoke all on function public.remove_collection_membership(uuid, uuid) from public;
grant execute on function public.remove_collection_membership(uuid, uuid) to authenticated;
