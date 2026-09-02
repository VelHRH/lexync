create or replace function public.create_learning_language(p_language_tag text)
returns public.learning_languages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  canonical_tag text;
  created_language public.learning_languages%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  canonical_tag := public.canonical_language_tag(p_language_tag);

  perform pg_advisory_xact_lock(hashtextextended(current_learner_id::text || canonical_tag, 0));

  if exists (
    select 1
    from public.learning_languages
    where learner_id = current_learner_id and language_tag = canonical_tag
  ) then
    raise exception 'Learning Language already exists.' using errcode = 'P0001';
  end if;

  insert into public.learning_languages (learner_id, language_tag)
  values (current_learner_id, canonical_tag)
  returning * into created_language;

  insert into public.learner_language_state (learner_id, active_learning_language_id)
  values (current_learner_id, created_language.id)
  on conflict (learner_id) do nothing;

  return created_language;
end;
$$;

create or replace function public.remove_learning_language(p_learning_language_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_language public.learning_languages%rowtype;
  remaining_language_id uuid;
  active_language_id uuid;
  language_count bigint;
  dependent_entry_count bigint;
  dependent_study_pair_count bigint;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_learner_id::text, 0));

  select * into selected_language
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  select count(*) into dependent_entry_count
  from public.learning_vocabulary_entries
  where learner_id = current_learner_id
    and learning_language_id = selected_language.id;

  select dependent_entry_count + count(*) into dependent_entry_count
  from public.vocabulary_entries
  where learner_id = current_learner_id
    and learning_language_id = selected_language.id;

  if dependent_entry_count > 0 then
    raise exception 'Learning Language contains Vocabulary Entries.';
  end if;

  select count(*) into dependent_study_pair_count
  from public.study_pairs
  where learner_id = current_learner_id
    and learning_language_id = selected_language.id;

  if dependent_study_pair_count > 0 then
    raise exception 'Learning Language contains Study Pairs.';
  end if;

  select count(*) into language_count
  from public.learning_languages
  where learner_id = current_learner_id;

  if language_count = 1 then
    raise exception 'The last Learning Language cannot be removed.';
  end if;

  select active_learning_language_id into active_language_id
  from public.learner_language_state
  where learner_id = current_learner_id
  for update;

  if active_language_id = selected_language.id then
    select id into remaining_language_id
    from public.learning_languages
    where learner_id = current_learner_id and id <> selected_language.id
    order by created_at, id
    limit 1;

    update public.learner_language_state
    set active_learning_language_id = remaining_language_id,
        updated_at = now()
    where learner_id = current_learner_id;
  else
    remaining_language_id := active_language_id;
  end if;

  delete from public.learning_languages
  where id = selected_language.id and learner_id = current_learner_id;

  return jsonb_build_object(
    'removed', true,
    'learningLanguageId', selected_language.id,
    'activeLearningLanguageId', remaining_language_id
  );
end;
$$;

create or replace function public.capture_learning_language_entry(
  p_learning_language_id uuid,
  p_answer_language_tag text,
  p_expression text,
  p_translation text,
  p_example text default null,
  p_sense_id uuid default null,
  p_create_new_sense boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    insert into public.examples (learner_id, sense_id, text)
    values (current_learner_id, resolved_sense_id, captured_example);
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
    'answerLanguageTag', canonical_answer_tag
  );
end;
$$;

revoke all on function public.create_learning_language(text) from public;
grant execute on function public.create_learning_language(text) to authenticated;
revoke all on function public.remove_learning_language(uuid) from public;
grant execute on function public.remove_learning_language(uuid) to authenticated;
revoke all on function public.capture_learning_language_entry(uuid, text, text, text, text, uuid, boolean) from public;
grant execute on function public.capture_learning_language_entry(uuid, text, text, text, text, uuid, boolean) to authenticated;
