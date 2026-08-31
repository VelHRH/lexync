create or replace function public.protect_populated_study_pair_languages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.target_language_tag, old.reference_language_tag) is distinct from (new.target_language_tag, new.reference_language_tag)
    and exists (
      select 1
      from public.vocabulary_entries
      where study_pair_id = old.id and learner_id = old.learner_id
    ) then
    raise exception 'Languages are locked because this Study Pair owns Vocabulary Entries.';
  end if;

  return new;
end;
$$;

create trigger protect_populated_study_pair_languages
before update of target_language_tag, reference_language_tag on public.study_pairs
for each row execute function public.protect_populated_study_pair_languages();

create or replace function public.update_empty_study_pair_languages(
  p_study_pair_id uuid,
  p_target_language_tag text,
  p_reference_language_tag text
)
returns public.study_pairs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_pair public.study_pairs%rowtype;
  updated_pair public.study_pairs%rowtype;
  canonical_target text := public.canonical_language_tag(p_target_language_tag);
  canonical_reference text := public.canonical_language_tag(p_reference_language_tag);
  replacement_id uuid;
  next_primary boolean;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if canonical_target = canonical_reference then
    raise exception 'Target and Reference Languages must be different.';
  end if;

  select * into selected_pair
  from public.study_pairs
  where id = p_study_pair_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  if exists (
    select 1
    from public.vocabulary_entries
    where study_pair_id = selected_pair.id and learner_id = current_learner_id
  ) then
    raise exception 'Languages are locked because this Study Pair owns Vocabulary Entries.';
  end if;

  if selected_pair.is_primary and selected_pair.target_language_tag <> canonical_target then
    select id into replacement_id
    from public.study_pairs
    where learner_id = current_learner_id
      and target_language_tag = selected_pair.target_language_tag
      and id <> selected_pair.id
    order by created_at, id
    limit 1
    for update;

    if replacement_id is not null then
      update public.study_pairs set is_primary = false where id = selected_pair.id;
      update public.study_pairs set is_primary = true where id = replacement_id;
    end if;
  end if;

  next_primary := selected_pair.target_language_tag = canonical_target and selected_pair.is_primary
    or not exists (
      select 1
      from public.study_pairs
      where learner_id = current_learner_id
        and target_language_tag = canonical_target
        and id <> selected_pair.id
    );

  update public.study_pairs
  set target_language_tag = canonical_target,
      reference_language_tag = canonical_reference,
      is_primary = next_primary
  where id = selected_pair.id
  returning * into updated_pair;

  return updated_pair;
end;
$$;

create or replace function public.move_vocabulary_entries(
  p_vocabulary_entry_ids uuid[],
  p_destination_study_pair_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  destination_pair public.study_pairs%rowtype;
  source_pair public.study_pairs%rowtype;
  selected_entry public.vocabulary_entries%rowtype;
  destination_entry public.vocabulary_entries%rowtype;
  source_sense public.senses%rowtype;
  matching_sense_ids uuid[];
  matching_sense_id uuid;
  source_pair_id uuid;
  requested_count integer;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  requested_count := coalesce(cardinality(p_vocabulary_entry_ids), 0);
  if requested_count = 0 then
    raise exception 'Select at least one Vocabulary Entry.';
  end if;

  if (select count(distinct entry_id) from unnest(p_vocabulary_entry_ids) as entry(entry_id)) <> requested_count then
    raise exception 'Vocabulary Entry selection must be distinct.';
  end if;

  select * into destination_pair
  from public.study_pairs
  where id = p_destination_study_pair_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Destination Study Pair is unavailable.';
  end if;

  if (
    select count(*)
    from public.vocabulary_entries
    where learner_id = current_learner_id and id = any(p_vocabulary_entry_ids)
  ) <> requested_count then
    raise exception 'Vocabulary Entry selection is unavailable.';
  end if;

  select (array_agg(distinct study_pair_id))[1], count(distinct study_pair_id)
  into source_pair_id, requested_count
  from public.vocabulary_entries
  where learner_id = current_learner_id and id = any(p_vocabulary_entry_ids);

  if requested_count <> 1 then
    raise exception 'Selected Vocabulary Entries must share one source Study Pair.';
  end if;

  if source_pair_id = destination_pair.id then
    raise exception 'Choose a different destination Study Pair.';
  end if;

  select * into source_pair
  from public.study_pairs
  where id = source_pair_id and learner_id = current_learner_id
  for update;

  if source_pair.reference_language_tag <> destination_pair.reference_language_tag then
    raise exception 'The destination must use the same Reference Language.';
  end if;

  if exists (
    select 1
    from public.senses
    where learner_id = current_learner_id
      and vocabulary_entry_id = any(p_vocabulary_entry_ids)
      and not exists (
        select 1
        from public.translations
        where learner_id = current_learner_id and sense_id = senses.id
      )
  ) then
    raise exception 'Every moved Sense needs at least one translation.';
  end if;

  for selected_entry in
    select *
    from public.vocabulary_entries
    where learner_id = current_learner_id and id = any(p_vocabulary_entry_ids)
    order by id
    for update
  loop
    select * into destination_entry
    from public.vocabulary_entries
    where learner_id = current_learner_id
      and study_pair_id = destination_pair.id
      and expression_identity = selected_entry.expression_identity
    for update;

    if not found then
      update public.vocabulary_entries
      set study_pair_id = destination_pair.id
      where id = selected_entry.id;
      continue;
    end if;

    for source_sense in
      select *
      from public.senses
      where learner_id = current_learner_id
        and vocabulary_entry_id = selected_entry.id
      order by created_at, id
      for update
    loop
      select array_agg(distinct destination_translations.sense_id)
      into matching_sense_ids
      from public.translations as source_translations
      join public.translations as destination_translations
        on destination_translations.learner_id = current_learner_id
        and destination_translations.translation_identity = source_translations.translation_identity
      join public.senses as destination_senses
        on destination_senses.id = destination_translations.sense_id
        and destination_senses.learner_id = current_learner_id
        and destination_senses.vocabulary_entry_id = destination_entry.id
      where source_translations.learner_id = current_learner_id
        and source_translations.sense_id = source_sense.id;

      if coalesce(cardinality(matching_sense_ids), 0) > 1 then
        raise exception 'Moved translations match multiple destination Senses.';
      end if;

      matching_sense_id := matching_sense_ids[1];

      if matching_sense_id is null then
        update public.senses
        set vocabulary_entry_id = destination_entry.id
        where id = source_sense.id;
      else
        insert into public.translations (learner_id, sense_id, text)
        select current_learner_id, matching_sense_id, source_translations.text
        from public.translations as source_translations
        where source_translations.learner_id = current_learner_id
          and source_translations.sense_id = source_sense.id
          and not exists (
            select 1
            from public.translations as existing_translations
            where existing_translations.learner_id = current_learner_id
              and existing_translations.sense_id = matching_sense_id
              and existing_translations.translation_identity = source_translations.translation_identity
          );

        update public.examples
        set sense_id = matching_sense_id
        where learner_id = current_learner_id and sense_id = source_sense.id;

        delete from public.senses where id = source_sense.id;
      end if;
    end loop;

    delete from public.vocabulary_entries where id = selected_entry.id;
  end loop;

  return cardinality(p_vocabulary_entry_ids);
end;
$$;

create or replace function public.delete_study_pair(
  p_study_pair_id uuid,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_pair public.study_pairs%rowtype;
  replacement_id uuid;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_pair
  from public.study_pairs
  where id = p_study_pair_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  if p_confirmation <> selected_pair.target_language_tag || ' → ' || selected_pair.reference_language_tag then
    raise exception 'Type the Study Pair name exactly to confirm deletion.';
  end if;

  if selected_pair.is_primary then
    select id into replacement_id
    from public.study_pairs
    where learner_id = current_learner_id
      and target_language_tag = selected_pair.target_language_tag
      and id <> selected_pair.id
    order by created_at, id
    limit 1
    for update;

    if replacement_id is not null then
      update public.study_pairs set is_primary = false where id = selected_pair.id;
      update public.study_pairs set is_primary = true where id = replacement_id;
    end if;
  end if;

  delete from public.study_pairs where id = selected_pair.id;
end;
$$;

alter function public.set_primary_study_pair(uuid) security definer;

revoke all on function public.update_empty_study_pair_languages(uuid, text, text) from public;
grant execute on function public.update_empty_study_pair_languages(uuid, text, text) to authenticated;
revoke all on function public.move_vocabulary_entries(uuid[], uuid) from public;
grant execute on function public.move_vocabulary_entries(uuid[], uuid) to authenticated;
revoke all on function public.delete_study_pair(uuid, text) from public;
grant execute on function public.delete_study_pair(uuid, text) to authenticated;

revoke update, delete on public.study_pairs from authenticated;
grant update (is_primary) on public.study_pairs to authenticated;
