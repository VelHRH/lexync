create or replace function public.translation_identity(value text)
returns text
language sql
immutable
strict
set search_path = ''
return public.expression_identity(value);

alter table public.translations
add column translation_identity text collate public.unicode_casefold
generated always as (public.translation_identity(text)) stored;

alter table public.translations
drop constraint translations_text_check,
add constraint translations_text_check
check (length(public.translation_identity(text)) > 0);

create unique index translation_identity_per_sense
on public.translations (learner_id, sense_id, translation_identity);

create or replace function public.capture_manual_entry(
  p_study_pair_id uuid,
  p_expression text,
  p_translation text,
  p_example text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    insert into public.examples (learner_id, sense_id, text)
    values (current_learner_id, resolved_sense_id, captured_example);
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
$$;

revoke all on function public.translation_identity(text) from public;
grant execute on function public.translation_identity(text) to authenticated;
