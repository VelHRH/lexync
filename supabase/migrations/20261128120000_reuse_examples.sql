create index examples_learner_identity_idx on public.examples (learner_id, public.example_identity(text));

create function public.resolve_example(
  p_learner_id uuid,
  p_learning_language_id uuid,
  p_text text,
  out resolved_example_id uuid,
  out example_reused boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'example:' || p_learner_id::text || p_learning_language_id::text || public.example_identity(p_text),
    0
  ));

  select examples.id into resolved_example_id
  from public.examples
  where examples.learner_id = p_learner_id
    and public.example_identity(examples.text) = public.example_identity(p_text)
    and exists (
      select 1
      from public.sense_examples
      join public.senses
        on senses.id = sense_examples.sense_id
        and senses.learner_id = sense_examples.learner_id
      join public.vocabulary_entries
        on vocabulary_entries.id = senses.vocabulary_entry_id
        and vocabulary_entries.learner_id = senses.learner_id
      where sense_examples.example_id = examples.id
        and sense_examples.learner_id = p_learner_id
        and vocabulary_entries.learning_language_id = p_learning_language_id
    )
  order by examples.created_at, examples.id
  limit 1;

  example_reused := resolved_example_id is not null;

  if not example_reused then
    insert into public.examples (learner_id, text)
    values (p_learner_id, p_text)
    returning id into resolved_example_id;
  end if;
end;
$$;

create function public.merge_duplicate_examples(p_learner_id uuid, p_example_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  duplicate record;
begin
  for duplicate in
    with linked as (
      select distinct
        examples.id as example_id,
        examples.created_at,
        vocabulary_entries.learning_language_id,
        public.example_identity(examples.text) as identity
      from public.examples
      join public.sense_examples
        on sense_examples.example_id = examples.id
        and sense_examples.learner_id = examples.learner_id
      join public.senses
        on senses.id = sense_examples.sense_id
        and senses.learner_id = sense_examples.learner_id
      join public.vocabulary_entries
        on vocabulary_entries.id = senses.vocabulary_entry_id
        and vocabulary_entries.learner_id = senses.learner_id
      where examples.learner_id = p_learner_id
    ),
    targets as (
      select distinct learning_language_id, identity
      from linked
      where example_id = any(p_example_ids)
    ),
    ranked as (
      select
        linked.example_id,
        first_value(linked.example_id) over (
          partition by linked.learning_language_id, linked.identity
          order by linked.created_at, linked.example_id
        ) as survivor_id
      from linked
      join targets
        on targets.learning_language_id = linked.learning_language_id
        and targets.identity = linked.identity
    )
    select distinct ranked.example_id, ranked.survivor_id
    from ranked
    where ranked.example_id <> ranked.survivor_id
  loop
    delete from public.example_translations as kept
    using public.example_translations as incoming
    where kept.learner_id = p_learner_id
      and kept.example_id = duplicate.survivor_id
      and incoming.learner_id = p_learner_id
      and incoming.example_id = duplicate.example_id
      and incoming.answer_language_tag = kept.answer_language_tag
      and (incoming.created_at, incoming.id) > (kept.created_at, kept.id);

    update public.example_translations as incoming
    set example_id = duplicate.survivor_id
    where incoming.learner_id = p_learner_id
      and incoming.example_id = duplicate.example_id
      and not exists (
        select 1
        from public.example_translations as kept
        where kept.learner_id = p_learner_id
          and kept.example_id = duplicate.survivor_id
          and kept.answer_language_tag = incoming.answer_language_tag
      );

    insert into public.sense_examples (learner_id, sense_id, example_id, created_at)
    select p_learner_id, sense_examples.sense_id, duplicate.survivor_id, sense_examples.created_at
    from public.sense_examples
    where sense_examples.learner_id = p_learner_id
      and sense_examples.example_id = duplicate.example_id
    on conflict do nothing;

    delete from public.examples
    where examples.learner_id = p_learner_id
      and examples.id = duplicate.example_id;
  end loop;
end;
$$;

revoke all on function public.resolve_example(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.merge_duplicate_examples(uuid, uuid[]) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_manual_entry(p_study_pair_id uuid, p_expression text, p_translation text, p_example text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_learner_id uuid := auth.uid();
  selected_pair public.study_pairs%rowtype;
  resolved_vocabulary_entry_id uuid;
  vocabulary_entry_created boolean := false;
  resolved_sense_id uuid;
  sense_created boolean := false;
  stored_translation text;
  clean_expression text := regexp_replace(
    normalize(p_expression, NFC),
    '(^[[:space:]]+|[[:space:]]+$)',
    '',
    'g'
  );
  clean_translation text := btrim(p_translation);
  captured_example text := case
    when nullif(btrim(p_example), '') is null then null
    else p_example
  end;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if clean_expression = '' then
    raise exception 'Expression is required.';
  end if;

  if clean_translation = '' then
    raise exception 'Translation is required.';
  end if;

  select * into selected_pair
  from public.study_pairs
  where id = p_study_pair_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  insert into public.vocabulary_entries (learner_id, study_pair_id, expression)
  values (current_learner_id, selected_pair.id, clean_expression)
  on conflict (learner_id, study_pair_id, expression_identity) do nothing
  returning id into resolved_vocabulary_entry_id;

  if resolved_vocabulary_entry_id is null then
    select id into resolved_vocabulary_entry_id
    from public.vocabulary_entries
    where learner_id = current_learner_id
      and study_pair_id = selected_pair.id
      and expression_identity = public.expression_identity(clean_expression);
  else
    vocabulary_entry_created := true;
  end if;

  perform 1
  from public.vocabulary_entries
  where id = resolved_vocabulary_entry_id
  for update;

  select translations.sense_id, translations.text
  into resolved_sense_id, stored_translation
  from public.translations as translations
  join public.senses as senses on senses.id = translations.sense_id
  where senses.learner_id = current_learner_id
    and senses.vocabulary_entry_id = resolved_vocabulary_entry_id
    and translations.translation_identity = public.translation_identity(clean_translation)
  order by translations.created_at, translations.id
  limit 1;

  if resolved_sense_id is null then
    insert into public.senses (learner_id, vocabulary_entry_id)
    values (current_learner_id, resolved_vocabulary_entry_id)
    returning id into resolved_sense_id;

    insert into public.translations (learner_id, sense_id, text)
    values (current_learner_id, resolved_sense_id, clean_translation);

    stored_translation := clean_translation;
    sense_created := true;
  end if;

  if captured_example is not null then
    insert into public.sense_examples (learner_id, sense_id, example_id)
    select current_learner_id, resolved_sense_id, resolved.resolved_example_id
    from public.resolve_example(
      current_learner_id,
      (select learning_language_id from public.vocabulary_entries where id = resolved_vocabulary_entry_id),
      captured_example
    ) as resolved
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'vocabularyEntryId', resolved_vocabulary_entry_id,
    'vocabularyEntryCreated', vocabulary_entry_created,
    'senseCreated', sense_created,
    'expression', clean_expression,
    'translation', stored_translation,
    'example', captured_example,
    'targetLanguageTag', selected_pair.target_language_tag,
    'referenceLanguageTag', selected_pair.reference_language_tag
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.capture_learning_language_entry(p_learning_language_id uuid, p_answer_language_tag text, p_expression text, p_translation text, p_example text DEFAULT NULL::text, p_sense_id uuid DEFAULT NULL::uuid, p_create_new_sense boolean DEFAULT false, p_example_translation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_learner_id uuid := auth.uid();
  selected_language public.learning_languages%rowtype;
  canonical_answer_tag text;
  clean_expression text := regexp_replace(
    normalize(p_expression, NFC),
    '(^[[:space:]]+|[[:space:]]+$)',
    '',
    'g'
  );
  clean_translation text := btrim(p_translation);
  captured_example text := case
    when nullif(btrim(p_example), '') is null then null
    else p_example
  end;
  captured_example_translation text := nullif(btrim(p_example_translation), '');
  captured_example_id uuid;
  resolved_entry_id uuid;
  bridge_entry_id uuid;
  resolved_sense_id uuid;
  resolved_translation_id uuid;
  stored_translation text;
  existing_sense_count bigint;
  entry_created boolean := false;
  sense_created boolean := false;
  translation_created boolean := false;
  pair_id uuid;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if clean_expression = '' then
    raise exception 'Expression is required.';
  end if;

  if clean_translation = '' then
    raise exception 'Translation is required.';
  end if;

  canonical_answer_tag := public.canonical_language_tag(p_answer_language_tag);

  select * into selected_language
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_learner_id::text || p_learning_language_id::text || public.expression_identity(clean_expression),
    0
  ));

  select id into resolved_entry_id
  from public.learning_vocabulary_entries
  where learner_id = current_learner_id
    and learning_language_id = selected_language.id
    and expression_identity = public.expression_identity(clean_expression)
  for update;

  if resolved_entry_id is null then
    insert into public.learning_vocabulary_entries (learner_id, learning_language_id, expression)
    values (current_learner_id, selected_language.id, clean_expression)
    returning id into resolved_entry_id;
    entry_created := true;
  end if;

  select count(distinct senses.id) into existing_sense_count
  from public.senses
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = senses.learner_id
  where senses.learner_id = current_learner_id
    and vocabulary_entries.learning_vocabulary_entry_id = resolved_entry_id;

  if existing_sense_count > 1 and p_sense_id is null and not p_create_new_sense then
    return jsonb_build_object(
      'kind', 'needs_sense',
      'learningLanguageId', selected_language.id,
      'vocabularyEntryId', resolved_entry_id,
      'expression', clean_expression,
      'senses', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', senses.id,
            'translations', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', translations.id,
                  'text', translations.text,
                  'answerLanguageTag', translations.answer_language_tag
                ) order by translations.created_at, translations.id
              )
              from public.translations
              where translations.learner_id = current_learner_id
                and translations.sense_id = senses.id
            ), '[]'::jsonb)
          ) order by senses.created_at, senses.id
        )
        from public.senses
        join public.vocabulary_entries
          on vocabulary_entries.id = senses.vocabulary_entry_id
          and vocabulary_entries.learner_id = senses.learner_id
        where senses.learner_id = current_learner_id
          and vocabulary_entries.learning_vocabulary_entry_id = resolved_entry_id
      ), '[]'::jsonb)
    );
  end if;

  if p_sense_id is not null and p_create_new_sense then
    raise exception 'Choose an existing Sense or create a new Sense.';
  end if;

  if p_sense_id is not null then
    perform 1
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    where senses.id = p_sense_id
      and senses.learner_id = current_learner_id
      and vocabulary_entries.learning_vocabulary_entry_id = resolved_entry_id;

    if not found then
      raise exception 'Sense is unavailable.';
    end if;

    resolved_sense_id := p_sense_id;
  elsif existing_sense_count = 1 and not p_create_new_sense then
    select senses.id into resolved_sense_id
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_vocabulary_entry_id = resolved_entry_id
    order by senses.created_at, senses.id
    limit 1;
  end if;

  insert into public.study_pairs (
    learner_id,
    target_language_tag,
    reference_language_tag,
    is_primary
  ) values (
    current_learner_id,
    selected_language.language_tag,
    canonical_answer_tag,
    not exists (
      select 1
      from public.study_pairs
      where learner_id = current_learner_id
        and target_language_tag = selected_language.language_tag
    )
  )
  on conflict (learner_id, target_language_tag, reference_language_tag) do nothing
  returning id into pair_id;

  if pair_id is null then
    select id into pair_id
    from public.study_pairs
    where learner_id = current_learner_id
      and target_language_tag = selected_language.language_tag
      and reference_language_tag = canonical_answer_tag;
  end if;

  insert into public.vocabulary_entries (learner_id, study_pair_id, expression)
  values (current_learner_id, pair_id, clean_expression)
  on conflict (learner_id, study_pair_id, expression_identity) do nothing;

  select id into bridge_entry_id
  from public.vocabulary_entries
  where learner_id = current_learner_id
    and study_pair_id = pair_id
    and expression_identity = public.expression_identity(clean_expression);

  if resolved_sense_id is null then
    insert into public.senses (learner_id, vocabulary_entry_id)
    values (current_learner_id, bridge_entry_id)
    returning id into resolved_sense_id;
    sense_created := true;
  end if;

  insert into public.translations (learner_id, sense_id, text, answer_language_tag)
  values (current_learner_id, resolved_sense_id, clean_translation, canonical_answer_tag)
  on conflict (learner_id, sense_id, answer_language_tag, translation_identity) do nothing
  returning id, text into resolved_translation_id, stored_translation;

  if resolved_translation_id is null then
    select id, text into resolved_translation_id, stored_translation
    from public.translations
    where learner_id = current_learner_id
      and sense_id = resolved_sense_id
      and answer_language_tag = canonical_answer_tag
      and translation_identity = public.translation_identity(clean_translation)
    order by created_at, id
    limit 1;
  else
    translation_created := true;
  end if;

  if captured_example is not null then
    select resolved.resolved_example_id into captured_example_id
    from public.resolve_example(current_learner_id, selected_language.id, captured_example) as resolved;

    insert into public.sense_examples (learner_id, sense_id, example_id)
    values (current_learner_id, resolved_sense_id, captured_example_id)
    on conflict do nothing;

    if captured_example_translation is not null then
      insert into public.example_translations (learner_id, example_id, text, answer_language_tag)
      values (current_learner_id, captured_example_id, captured_example_translation, canonical_answer_tag)
      on conflict (learner_id, example_id, answer_language_tag) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'kind', 'saved',
    'learningLanguageId', selected_language.id,
    'vocabularyEntryId', resolved_entry_id,
    'vocabularyEntryCreated', entry_created,
    'senseId', resolved_sense_id,
    'senseCreated', sense_created,
    'translationId', resolved_translation_id,
    'translationCreated', translation_created,
    'expression', clean_expression,
    'translation', stored_translation,
    'example', captured_example,
    'exampleTranslation', case when captured_example is null then null else captured_example_translation end,
    'answerLanguageTag', canonical_answer_tag
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_vocabulary_entry(p_vocabulary_entry_id uuid, p_expression text, p_senses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  example_translation_item jsonb;
  resolved_sense_id uuid;
  requested_sense_id uuid;
  requested_translation_id uuid;
  requested_example_id uuid;
  requested_example_translation_id uuid;
  desired_sense_ids uuid[] := array[]::uuid[];
  desired_translation_ids uuid[];
  desired_example_ids uuid[] := array[]::uuid[];
  desired_example_sense_ids uuid[] := array[]::uuid[];
  desired_example_translation_ids uuid[];
  clean_translation text;
  example_text text;
  clean_example_translation text;
  example_translation_tag text;
  example_reused boolean;
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
  ) or exists (
    select 1
    from jsonb_array_elements(p_senses) as sense(value)
    cross join lateral jsonb_array_elements(coalesce(sense.value->'examples', '[]'::jsonb)) as example(value)
    cross join lateral jsonb_array_elements(coalesce(example.value->'translations', '[]'::jsonb)) as example_translation(value)
    where nullif(example_translation.value->>'id', '') is not null
    group by example_translation.value->>'id'
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

      example_reused := false;

      if requested_example_id is null then
        select resolved.resolved_example_id, resolved.example_reused
        into requested_example_id, example_reused
        from public.resolve_example(current_learner_id, selected_entry.learning_language_id, example_text) as resolved;
      else
        update public.examples as examples
        set text = example_text
        where examples.id = requested_example_id
          and examples.learner_id = current_learner_id
          and exists (
            select 1
            from public.sense_examples
            join public.senses
              on senses.id = sense_examples.sense_id
              and senses.learner_id = sense_examples.learner_id
            where sense_examples.example_id = examples.id
              and sense_examples.learner_id = current_learner_id
              and senses.vocabulary_entry_id = selected_entry.id
          );

        if not found then
          raise exception 'Example is unavailable.';
        end if;
      end if;

      insert into public.sense_examples (learner_id, sense_id, example_id)
      values (current_learner_id, resolved_sense_id, requested_example_id)
      on conflict do nothing;

      desired_example_ids := array_append(desired_example_ids, requested_example_id);
      desired_example_sense_ids := array_append(desired_example_sense_ids, resolved_sense_id);
      desired_example_translation_ids := array[]::uuid[];

      for example_translation_item in select value from jsonb_array_elements(coalesce(example_item->'translations', '[]'::jsonb)) loop
        if nullif(btrim(example_translation_item->>'text'), '') is null then
          continue;
        end if;

        requested_example_translation_id := nullif(example_translation_item->>'id', '')::uuid;
        clean_example_translation := btrim(example_translation_item->>'text');
        example_translation_tag := nullif(btrim(example_translation_item->>'answer_language_tag'), '');

        if requested_example_translation_id is not null then
          perform 1
          from public.example_translations
          where id = requested_example_translation_id
            and learner_id = current_learner_id
            and example_id = requested_example_id;

          if not found then
            raise exception 'Example Translation is unavailable.';
          end if;

          if example_translation_tag is not null then
            update public.example_translations
            set text = clean_example_translation,
                answer_language_tag = example_translation_tag
            where id = requested_example_translation_id;
          else
            update public.example_translations
            set text = clean_example_translation
            where id = requested_example_translation_id;
          end if;

          desired_example_translation_ids := array_append(desired_example_translation_ids, requested_example_translation_id);
        elsif example_reused then
          insert into public.example_translations (learner_id, example_id, text, answer_language_tag)
          values (current_learner_id, requested_example_id, clean_example_translation, example_translation_tag)
          on conflict (learner_id, example_id, answer_language_tag) do nothing;
        else
          insert into public.example_translations (learner_id, example_id, text, answer_language_tag)
          values (current_learner_id, requested_example_id, clean_example_translation, example_translation_tag)
          on conflict (learner_id, example_id, answer_language_tag) do update set text = excluded.text
          returning id into requested_example_translation_id;

          desired_example_translation_ids := array_append(desired_example_translation_ids, requested_example_translation_id);
        end if;
      end loop;

      if not example_reused then
        delete from public.example_translations
        where learner_id = current_learner_id
          and example_id = requested_example_id
          and not (id = any(desired_example_translation_ids));
      end if;
    end loop;
  end loop;

  delete from public.sense_examples
  using public.senses
  where sense_examples.sense_id = senses.id
    and sense_examples.learner_id = current_learner_id
    and senses.learner_id = current_learner_id
    and senses.vocabulary_entry_id = selected_entry.id
    and not exists (
      select 1
      from unnest(desired_example_sense_ids, desired_example_ids) as desired(sense_id, example_id)
      where desired.sense_id = sense_examples.sense_id
        and desired.example_id = sense_examples.example_id
    );

  delete from public.senses
  where learner_id = current_learner_id
    and vocabulary_entry_id = selected_entry.id
    and not (id = any(desired_sense_ids));

  perform public.merge_duplicate_examples(current_learner_id, desired_example_ids);

  return jsonb_build_object(
    'vocabularyEntryId', selected_entry.id,
    'expression', clean_expression
  );
end;
$function$;
