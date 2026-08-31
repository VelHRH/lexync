create or replace function public.update_vocabulary_entry(
  p_vocabulary_entry_id uuid,
  p_expression text,
  p_senses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_entry public.vocabulary_entries%rowtype;
  clean_expression text := regexp_replace(
    normalize(p_expression, NFC),
    '(^[[:space:]]+|[[:space:]]+$)',
    '',
    'g'
  );
  sense_item jsonb;
  translation_item jsonb;
  example_item jsonb;
  resolved_sense_id uuid;
  requested_sense_id uuid;
  requested_translation_id uuid;
  requested_example_id uuid;
  desired_sense_ids uuid[] := array[]::uuid[];
  desired_translation_ids uuid[];
  desired_example_ids uuid[] := array[]::uuid[];
  clean_translation text;
  example_text text;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_entry
  from public.vocabulary_entries
  where id = p_vocabulary_entry_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;

  if clean_expression = '' then
    raise exception 'Expression is required.';
  end if;

  if jsonb_typeof(p_senses) is distinct from 'array' or jsonb_array_length(p_senses) = 0 then
    raise exception 'A Vocabulary Entry needs at least one Sense.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_senses) as sense(value)
    where jsonb_typeof(sense.value->'translations') is distinct from 'array'
      or jsonb_array_length(sense.value->'translations') = 0
  ) then
    raise exception 'Each Sense needs at least one translation.';
  end if;

  if exists (
    select 1
    from (
      select normalized.position, normalized.identity, count(*) as occurrences
      from (
        select
          sense.position,
          public.translation_identity(translation.value->>'text') collate public.unicode_casefold as identity
        from jsonb_array_elements(p_senses) with ordinality as sense(value, position)
        cross join lateral jsonb_array_elements(sense.value->'translations') as translation(value)
      ) as normalized
      group by normalized.position, normalized.identity
    ) as grouped
    where length(grouped.identity) = 0 or grouped.occurrences > 1
  ) then
    raise exception 'Translations in a Sense must be present and distinct.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_senses) as sense(value)
    where nullif(sense.value->>'id', '') is not null
    group by sense.value->>'id'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_senses) as sense(value)
    cross join lateral jsonb_array_elements(coalesce(sense.value->'examples', '[]'::jsonb)) as example(value)
    where nullif(example.value->>'id', '') is not null
    group by example.value->>'id'
    having count(*) > 1
  ) then
    raise exception 'Aggregate items must be distinct.';
  end if;

  update public.vocabulary_entries
  set expression = clean_expression
  where id = selected_entry.id;

  for sense_item in select value from jsonb_array_elements(p_senses) loop
    requested_sense_id := nullif(sense_item->>'id', '')::uuid;

    if requested_sense_id is null then
      insert into public.senses (learner_id, vocabulary_entry_id)
      values (current_learner_id, selected_entry.id)
      returning id into resolved_sense_id;
    else
      select id into resolved_sense_id
      from public.senses
      where id = requested_sense_id
        and learner_id = current_learner_id
        and vocabulary_entry_id = selected_entry.id;

      if not found then
        raise exception 'Sense is unavailable.';
      end if;
    end if;

    desired_sense_ids := array_append(desired_sense_ids, resolved_sense_id);
    desired_translation_ids := array[]::uuid[];

    for translation_item in select value from jsonb_array_elements(sense_item->'translations') loop
      requested_translation_id := nullif(translation_item->>'id', '')::uuid;
      clean_translation := btrim(translation_item->>'text');

      if requested_translation_id is not null then
        perform 1
        from public.translations
        where id = requested_translation_id
          and learner_id = current_learner_id
          and sense_id = resolved_sense_id;

        if not found then
          raise exception 'Translation is unavailable.';
        end if;

        desired_translation_ids := array_append(desired_translation_ids, requested_translation_id);
      end if;
    end loop;

    delete from public.translations
    where learner_id = current_learner_id
      and sense_id = resolved_sense_id
      and not (id = any(desired_translation_ids));

    update public.translations
    set text = id::text
    where learner_id = current_learner_id
      and sense_id = resolved_sense_id
      and id = any(desired_translation_ids);

    for translation_item in select value from jsonb_array_elements(sense_item->'translations') loop
      requested_translation_id := nullif(translation_item->>'id', '')::uuid;
      clean_translation := btrim(translation_item->>'text');

      if requested_translation_id is null then
        insert into public.translations (learner_id, sense_id, text)
        values (current_learner_id, resolved_sense_id, clean_translation);
      else
        update public.translations
        set text = clean_translation
        where id = requested_translation_id;
      end if;
    end loop;

    for example_item in select value from jsonb_array_elements(coalesce(sense_item->'examples', '[]'::jsonb)) loop
      requested_example_id := nullif(example_item->>'id', '')::uuid;
      example_text := example_item->>'text';

      if nullif(btrim(example_text), '') is null then
        raise exception 'Example text is required.';
      end if;

      if requested_example_id is null then
        insert into public.examples (learner_id, sense_id, text)
        values (current_learner_id, resolved_sense_id, example_text)
        returning id into requested_example_id;
      else
        update public.examples as examples
        set sense_id = resolved_sense_id,
            text = example_text
        from public.senses
        where examples.id = requested_example_id
          and examples.learner_id = current_learner_id
          and senses.id = examples.sense_id
          and senses.learner_id = current_learner_id
          and senses.vocabulary_entry_id = selected_entry.id;

        if not found then
          raise exception 'Example is unavailable.';
        end if;
      end if;

      desired_example_ids := array_append(desired_example_ids, requested_example_id);
    end loop;
  end loop;

  delete from public.examples as examples
  using public.senses
  where examples.sense_id = senses.id
    and examples.learner_id = current_learner_id
    and senses.learner_id = current_learner_id
    and senses.vocabulary_entry_id = selected_entry.id
    and not (examples.id = any(desired_example_ids));

  delete from public.senses
  where learner_id = current_learner_id
    and vocabulary_entry_id = selected_entry.id
    and not (id = any(desired_sense_ids));

  return jsonb_build_object(
    'vocabularyEntryId', selected_entry.id,
    'expression', clean_expression
  );
end;
$$;

create or replace function public.delete_vocabulary_entry(p_vocabulary_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.vocabulary_entries
  where id = p_vocabulary_entry_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;
end;
$$;

revoke all on function public.update_vocabulary_entry(uuid, text, jsonb) from public;
grant execute on function public.update_vocabulary_entry(uuid, text, jsonb) to authenticated;
revoke all on function public.delete_vocabulary_entry(uuid) from public;
grant execute on function public.delete_vocabulary_entry(uuid) to authenticated;

alter function public.capture_manual_entry(uuid, text, text, text) security definer;

revoke insert, update, delete on public.vocabulary_entries from authenticated;
revoke insert, update, delete on public.senses from authenticated;
revoke insert, update, delete on public.translations from authenticated;
revoke insert, update, delete on public.examples from authenticated;
grant update (suspended) on public.vocabulary_entries to authenticated;
