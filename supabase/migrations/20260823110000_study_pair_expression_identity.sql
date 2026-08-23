create collation if not exists public.unicode_casefold (
  provider = icu,
  locale = 'und-u-ks-level2',
  deterministic = false
);

create or replace function public.canonical_language_tag(value text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  parts text[] := string_to_array(btrim(value), '-');
  part text;
  canonical_parts text[] := array[]::text[];
  position integer := 0;
begin
  if value ~ '_' or btrim(value) !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
    raise exception 'Enter a valid BCP 47 language tag.' using errcode = '22023';
  end if;

  foreach part in array parts loop
    position := position + 1;

    if position = 1 then
      canonical_parts := array_append(canonical_parts, lower(part));
    elsif length(part) = 4 and part ~ '^[A-Za-z]+$' then
      canonical_parts := array_append(canonical_parts, upper(left(part, 1)) || lower(substring(part from 2)));
    elsif length(part) = 2 and part ~ '^[A-Za-z]+$' then
      canonical_parts := array_append(canonical_parts, upper(part));
    else
      canonical_parts := array_append(canonical_parts, lower(part));
    end if;
  end loop;

  return array_to_string(canonical_parts, '-');
end;
$$;

create or replace function public.expression_identity(value text)
returns text
language sql
immutable
strict
set search_path = ''
return btrim(regexp_replace(normalize(value, NFC), '[[:space:]]+', ' ', 'g'));

create or replace function public.canonicalize_study_pair_languages()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.target_language_tag := public.canonical_language_tag(new.target_language_tag);
  new.reference_language_tag := public.canonical_language_tag(new.reference_language_tag);
  return new;
end;
$$;

create trigger canonicalize_study_pair_languages
before insert or update of target_language_tag, reference_language_tag on public.study_pairs
for each row execute function public.canonicalize_study_pair_languages();

update public.study_pairs
set target_language_tag = public.canonical_language_tag(target_language_tag),
    reference_language_tag = public.canonical_language_tag(reference_language_tag);

with ranked_pairs as (
  select id,
         row_number() over (
           partition by learner_id, target_language_tag
           order by is_primary desc, created_at, id
         ) = 1 as should_be_primary
  from public.study_pairs
)
update public.study_pairs
set is_primary = ranked_pairs.should_be_primary
from ranked_pairs
where study_pairs.id = ranked_pairs.id;

create or replace function public.require_primary_study_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_learner_id uuid := coalesce(new.learner_id, old.learner_id);
  affected_target_language_tag text := coalesce(new.target_language_tag, old.target_language_tag);
begin
  if exists (
    select 1 from public.study_pairs
    where learner_id = affected_learner_id
      and target_language_tag = affected_target_language_tag
  ) and not exists (
    select 1 from public.study_pairs
    where learner_id = affected_learner_id
      and target_language_tag = affected_target_language_tag
      and is_primary
  ) then
    raise check_violation using message = 'A Target Language must have one primary Study Pair.';
  end if;

  if tg_op = 'UPDATE'
    and (old.learner_id, old.target_language_tag) is distinct from (new.learner_id, new.target_language_tag)
    and exists (
      select 1 from public.study_pairs
      where learner_id = old.learner_id
        and target_language_tag = old.target_language_tag
    ) and not exists (
      select 1 from public.study_pairs
      where learner_id = old.learner_id
        and target_language_tag = old.target_language_tag
        and is_primary
    ) then
    raise check_violation using message = 'A Target Language must have one primary Study Pair.';
  end if;

  return null;
end;
$$;

create constraint trigger require_primary_study_pair
after insert or update or delete on public.study_pairs
deferrable initially deferred
for each row execute function public.require_primary_study_pair();

create or replace function public.create_study_pair(
  p_target_language_tag text,
  p_reference_language_tag text
)
returns public.study_pairs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  canonical_target text := public.canonical_language_tag(p_target_language_tag);
  canonical_reference text := public.canonical_language_tag(p_reference_language_tag);
  created_pair public.study_pairs%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_learner_id::text || canonical_target, 0));

  insert into public.study_pairs (
    learner_id,
    target_language_tag,
    reference_language_tag,
    is_primary
  ) values (
    current_learner_id,
    canonical_target,
    canonical_reference,
    not exists (
      select 1 from public.study_pairs
      where learner_id = current_learner_id
        and target_language_tag = canonical_target
    )
  )
  returning * into created_pair;

  return created_pair;
end;
$$;

create or replace function public.set_primary_study_pair(p_study_pair_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_pair public.study_pairs%rowtype;
begin
  select * into selected_pair
  from public.study_pairs
  where id = p_study_pair_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  update public.study_pairs
  set is_primary = false
  where learner_id = current_learner_id
    and target_language_tag = selected_pair.target_language_tag
    and is_primary;

  update public.study_pairs
  set is_primary = true
  where id = selected_pair.id;
end;
$$;

alter table public.vocabulary_entries
add column expression_identity text collate public.unicode_casefold
generated always as (public.expression_identity(expression)) stored;

alter table public.vocabulary_entries
drop constraint vocabulary_entries_expression_check,
add constraint vocabulary_entries_expression_check
check (length(public.expression_identity(expression)) > 0);

create unique index vocabulary_entry_expression_identity
on public.vocabulary_entries (learner_id, study_pair_id, expression_identity);

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
  vocabulary_entry_id uuid;
  vocabulary_entry_created boolean := false;
  sense_id uuid;
  clean_expression text := regexp_replace(
    normalize(p_expression, NFC),
    '(^[[:space:]]+|[[:space:]]+$)',
    '',
    'g'
  );
  clean_translation text := btrim(p_translation);
  clean_example text := nullif(btrim(p_example), '');
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
  returning id into vocabulary_entry_id;

  if vocabulary_entry_id is null then
    select id into vocabulary_entry_id
    from public.vocabulary_entries
    where learner_id = current_learner_id
      and study_pair_id = selected_pair.id
      and expression_identity = public.expression_identity(clean_expression);
  else
    vocabulary_entry_created := true;
  end if;

  insert into public.senses (learner_id, vocabulary_entry_id)
  values (current_learner_id, vocabulary_entry_id)
  returning id into sense_id;

  insert into public.translations (learner_id, sense_id, text)
  values (current_learner_id, sense_id, clean_translation);

  if clean_example is not null then
    insert into public.examples (learner_id, sense_id, text)
    values (current_learner_id, sense_id, clean_example);
  end if;

  return jsonb_build_object(
    'vocabularyEntryId', vocabulary_entry_id,
    'vocabularyEntryCreated', vocabulary_entry_created,
    'expression', clean_expression,
    'translation', clean_translation,
    'example', clean_example,
    'targetLanguageTag', selected_pair.target_language_tag,
    'referenceLanguageTag', selected_pair.reference_language_tag
  );
end;
$$;

revoke all on function public.canonical_language_tag(text) from public;
revoke all on function public.expression_identity(text) from public;
revoke all on function public.create_study_pair(text, text) from public;
revoke all on function public.set_primary_study_pair(uuid) from public;
grant execute on function public.create_study_pair(text, text) to authenticated;
grant execute on function public.set_primary_study_pair(uuid) to authenticated;
grant execute on function public.canonical_language_tag(text) to authenticated;
grant execute on function public.expression_identity(text) to authenticated;
