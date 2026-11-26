create table public.sense_examples (
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sense_id uuid not null,
  example_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (learner_id, sense_id, example_id),
  foreign key (sense_id, learner_id) references public.senses(id, learner_id) on delete cascade,
  foreign key (example_id, learner_id) references public.examples(id, learner_id) on delete cascade
);

create index sense_examples_example_id_idx on public.sense_examples (example_id);
create index sense_examples_sense_id_idx on public.sense_examples (sense_id);

alter table public.sense_examples enable row level security;

create policy learner_owns_sense_examples on public.sense_examples
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

revoke all on public.sense_examples from anon;

grant select on public.sense_examples to authenticated;

create function public.example_identity(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(p_text, '(^[[:space:]]+|[[:space:]]+$)', '', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  );
$$;

insert into public.sense_examples (learner_id, sense_id, example_id, created_at)
select examples.learner_id, examples.sense_id, examples.id, examples.created_at
from public.examples;

create temporary table example_merge as
select
  examples.id as example_id,
  first_value(examples.id) over (
    partition by examples.learner_id, vocabulary_entries.learning_language_id, public.example_identity(examples.text)
    order by examples.created_at, examples.id
  ) as survivor_id
from public.examples
join public.senses
  on senses.id = examples.sense_id
  and senses.learner_id = examples.learner_id
join public.vocabulary_entries
  on vocabulary_entries.id = senses.vocabulary_entry_id
  and vocabulary_entries.learner_id = senses.learner_id;

create temporary table example_translation_keep as
select distinct on (example_merge.survivor_id, example_translations.answer_language_tag)
  example_translations.id,
  example_merge.survivor_id
from public.example_translations
join example_merge on example_merge.example_id = example_translations.example_id
order by
  example_merge.survivor_id,
  example_translations.answer_language_tag,
  example_translations.created_at desc,
  example_translations.id desc;

delete from public.example_translations
where not exists (
  select 1 from example_translation_keep where example_translation_keep.id = example_translations.id
);

update public.example_translations
set example_id = example_translation_keep.survivor_id
from example_translation_keep
where example_translation_keep.id = example_translations.id
  and example_translations.example_id <> example_translation_keep.survivor_id;

insert into public.sense_examples (learner_id, sense_id, example_id, created_at)
select sense_examples.learner_id, sense_examples.sense_id, example_merge.survivor_id, sense_examples.created_at
from public.sense_examples
join example_merge on example_merge.example_id = sense_examples.example_id
where example_merge.survivor_id <> example_merge.example_id
on conflict do nothing;

delete from public.examples
using example_merge
where example_merge.example_id = examples.id
  and example_merge.survivor_id <> example_merge.example_id;

drop table example_translation_keep;
drop table example_merge;

alter table public.examples drop column sense_id;

create function public.remove_unlinked_example()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.examples
  where examples.id = old.example_id
    and examples.learner_id = old.learner_id
    and not exists (
      select 1
      from public.sense_examples
      where sense_examples.example_id = old.example_id
        and sense_examples.learner_id = old.learner_id
    );

  return old;
end;
$$;

create trigger remove_unlinked_example
after delete on public.sense_examples
for each row execute function public.remove_unlinked_example();

create function public.guard_sense_example_learning_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.sense_examples as other_links
    join public.senses as other_senses
      on other_senses.id = other_links.sense_id
      and other_senses.learner_id = other_links.learner_id
    join public.vocabulary_entries as other_entries
      on other_entries.id = other_senses.vocabulary_entry_id
      and other_entries.learner_id = other_senses.learner_id
    join public.senses as linked_sense
      on linked_sense.id = new.sense_id
      and linked_sense.learner_id = new.learner_id
    join public.vocabulary_entries as linked_entry
      on linked_entry.id = linked_sense.vocabulary_entry_id
      and linked_entry.learner_id = linked_sense.learner_id
    where other_links.example_id = new.example_id
      and other_links.learner_id = new.learner_id
      and other_links.sense_id <> new.sense_id
      and other_entries.learning_language_id <> linked_entry.learning_language_id
  ) then
    raise exception 'An Example belongs to one Learning Language.';
  end if;

  return new;
end;
$$;

create trigger guard_sense_example_learning_language
before insert on public.sense_examples
for each row execute function public.guard_sense_example_learning_language();

revoke all on function public.example_identity(text) from public, anon;
revoke all on function public.remove_unlinked_example() from public, anon, authenticated;
revoke all on function public.guard_sense_example_learning_language() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_example_translation_answer_language()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  legacy_answer_language_tag text;
begin
  if new.answer_language_tag is null then
    select study_pairs.reference_language_tag into legacy_answer_language_tag
    from public.sense_examples
    join public.senses
      on senses.id = sense_examples.sense_id
      and senses.learner_id = sense_examples.learner_id
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.study_pairs
      on study_pairs.id = vocabulary_entries.study_pair_id
      and study_pairs.learner_id = vocabulary_entries.learner_id
    where sense_examples.example_id = new.example_id and sense_examples.learner_id = new.learner_id
    order by sense_examples.created_at, sense_examples.sense_id
    limit 1;

    new.answer_language_tag := legacy_answer_language_tag;
  end if;

  new.answer_language_tag := public.canonical_language_tag(new.answer_language_tag);
  return new;
end;
$function$;

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
    with created_example as (
      insert into public.examples (learner_id, text)
      values (current_learner_id, captured_example)
      returning id
    )
    insert into public.sense_examples (learner_id, sense_id, example_id)
    select current_learner_id, resolved_sense_id, created_example.id
    from created_example;
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
    insert into public.examples (learner_id, text)
    values (current_learner_id, captured_example)
    returning id into captured_example_id;

    insert into public.sense_examples (learner_id, sense_id, example_id)
    values (current_learner_id, resolved_sense_id, captured_example_id);

    if captured_example_translation is not null then
      insert into public.example_translations (learner_id, example_id, text, answer_language_tag)
      values (current_learner_id, captured_example_id, captured_example_translation, canonical_answer_tag)
      on conflict (learner_id, example_id, answer_language_tag) do update set text = excluded.text;
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

      if requested_example_id is null then
        insert into public.examples (learner_id, text)
        values (current_learner_id, example_text)
        returning id into requested_example_id;
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
        else
          insert into public.example_translations (learner_id, example_id, text, answer_language_tag)
          values (current_learner_id, requested_example_id, clean_example_translation, example_translation_tag)
          on conflict (learner_id, example_id, answer_language_tag) do update set text = excluded.text
          returning id into requested_example_translation_id;

          desired_example_translation_ids := array_append(desired_example_translation_ids, requested_example_translation_id);
        end if;
      end loop;

      delete from public.example_translations
      where learner_id = current_learner_id
        and example_id = requested_example_id
        and not (id = any(desired_example_translation_ids));
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

  return jsonb_build_object(
    'vocabularyEntryId', selected_entry.id,
    'expression', clean_expression
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_vocabulary_entries(p_vocabulary_entry_ids uuid[], p_destination_study_pair_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

        insert into public.sense_examples (learner_id, sense_id, example_id)
        select current_learner_id, matching_sense_id, source_links.example_id
        from public.sense_examples as source_links
        where source_links.learner_id = current_learner_id
          and source_links.sense_id = source_sense.id
        on conflict do nothing;

        delete from public.senses where id = source_sense.id;
      end if;
    end loop;

    delete from public.vocabulary_entries where id = selected_entry.id;
  end loop;

  return cardinality(p_vocabulary_entry_ids);
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_vocabulary_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'learnerId', current_learner_id,
    'studyPairs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', study_pairs.id,
          'targetLanguageTag', study_pairs.target_language_tag,
          'referenceLanguageTag', study_pairs.reference_language_tag,
          'isPrimary', study_pairs.is_primary,
          'vocabularyEntries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', vocabulary_entries.id,
                'expression', vocabulary_entries.expression,
                'suspended', false,
                'senses', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', senses.id,
                      'translations', coalesce((
                        select jsonb_agg(
                          jsonb_build_object('id', translations.id, 'text', translations.text)
                          order by translations.created_at, translations.id
                        )
                        from public.translations
                        where translations.learner_id = current_learner_id
                          and translations.sense_id = senses.id
                          and translations.answer_language_tag = study_pairs.reference_language_tag
                      ), '[]'::jsonb),
                      'examples', coalesce((
                        select jsonb_agg(
                          jsonb_build_object('id', examples.id, 'text', examples.text)
                          order by examples.created_at, examples.id
                        )
                        from public.sense_examples
                        join public.examples
                          on examples.id = sense_examples.example_id
                          and examples.learner_id = sense_examples.learner_id
                        where sense_examples.learner_id = current_learner_id
                          and sense_examples.sense_id = senses.id
                      ), '[]'::jsonb)
                    ) order by senses.created_at, senses.id
                  )
                  from public.senses
                  where senses.learner_id = current_learner_id
                    and senses.vocabulary_entry_id = vocabulary_entries.id
                    and exists (
                      select 1
                      from public.translations
                      where translations.learner_id = current_learner_id
                        and translations.sense_id = senses.id
                        and translations.answer_language_tag = study_pairs.reference_language_tag
                    )
                ), '[]'::jsonb)
              ) order by vocabulary_entries.created_at, vocabulary_entries.id
            )
            from public.vocabulary_entries
            where vocabulary_entries.learner_id = current_learner_id
              and vocabulary_entries.study_pair_id = study_pairs.id
          ), '[]'::jsonb)
        ) order by study_pairs.created_at, study_pairs.id
      )
      from public.study_pairs
      where study_pairs.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.account_learning_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 2,
    'learnerId', current_learner_id,
    'activeLearningLanguageId', (
      select active_learning_language_id
      from public.learner_language_state
      where learner_id = current_learner_id
    ),
    'learningLanguages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', learning_languages.id,
          'languageTag', learning_languages.language_tag,
          'preferredAnswerLanguageTag', preferred_answer_languages.answer_language_tag,
          'vocabularyEntries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', learning_vocabulary_entries.id,
                'expression', learning_vocabulary_entries.expression,
                'suspended', false,
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
                      ), '[]'::jsonb),
                      'examples', coalesce((
                        select jsonb_agg(
                          jsonb_build_object(
                            'id', examples.id,
                            'text', examples.text
                          ) order by examples.created_at, examples.id
                        )
                        from public.sense_examples
                        join public.examples
                          on examples.id = sense_examples.example_id
                          and examples.learner_id = sense_examples.learner_id
                        where sense_examples.learner_id = current_learner_id
                          and sense_examples.sense_id = senses.id
                      ), '[]'::jsonb)
                    ) order by senses.created_at, senses.id
                  )
                  from public.senses
                  join public.vocabulary_entries
                    on vocabulary_entries.id = senses.vocabulary_entry_id
                    and vocabulary_entries.learner_id = senses.learner_id
                  where senses.learner_id = current_learner_id
                    and vocabulary_entries.learning_vocabulary_entry_id = learning_vocabulary_entries.id
                ), '[]'::jsonb)
              ) order by learning_vocabulary_entries.created_at, learning_vocabulary_entries.id
            )
            from public.learning_vocabulary_entries
            where learning_vocabulary_entries.learner_id = current_learner_id
              and learning_vocabulary_entries.learning_language_id = learning_languages.id
          ), '[]'::jsonb),
          'collections', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', collections.id,
                'name', collections.name,
                'vocabularyEntryIds', coalesce((
                  select jsonb_agg(
                    collection_memberships.learning_vocabulary_entry_id
                    order by collection_memberships.created_at,
                      collection_memberships.learning_vocabulary_entry_id
                  )
                  from public.collection_memberships
                  where collection_memberships.learner_id = current_learner_id
                    and collection_memberships.collection_id = collections.id
                ), '[]'::jsonb)
              ) order by collections.created_at, collections.id
            )
            from public.collections
            where collections.learner_id = current_learner_id
              and collections.learning_language_id = learning_languages.id
          ), '[]'::jsonb)
        ) order by learning_languages.created_at, learning_languages.id
      )
      from public.learning_languages
      left join public.preferred_answer_languages
        on preferred_answer_languages.learning_language_id = learning_languages.id
        and preferred_answer_languages.learner_id = learning_languages.learner_id
      where learning_languages.learner_id = current_learner_id
    ), '[]'::jsonb),
    'languagePairs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'learningLanguageId', language_pairs.learning_language_id,
          'learningLanguageTag', language_pairs.learning_language_tag,
          'answerLanguageTag', language_pairs.answer_language_tag
        ) order by language_pairs.learning_language_tag, language_pairs.answer_language_tag
      )
      from public.language_pairs
      where language_pairs.learner_id = current_learner_id
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cards.id,
          'senseId', cards.sense_id,
          'learningLanguageId', cards.learning_language_id,
          'answerLanguageTag', cards.answer_language_tag,
          'direction', cards.direction,
          'createdAt', cards.created_at
        ) order by cards.created_at, cards.id
      )
      from public.cards
      where cards.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_or_resume_vocabulary_lesson(p_learning_language_id uuid, p_collection_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_learner_id uuid := auth.uid();
  selected_lesson_id uuid;
  selected_prompt text;
  selected_answer_language_tag text;
  selected_correct_answer text;
  selected_choices text[];
  selected_choice_sense_ids uuid[];
  selected_choice_vocabulary_entry_ids uuid[];
  selected_direction text;
  first_direction text := case when random() < 0.5 then 'recognition' else 'recall' end;
  minimum_target integer := 8;
  maximum_target integer := 12;
  target_count integer;
  active_sense_count bigint;
  collection_entry_count bigint;
  ordinal integer := 0;
  translation_ordinal integer := 0;
  cloze_target_count integer := 0;
  final_is_cloze boolean;
  setting_value text;
  selected_sense record;
  preferred_answer_language_tag text;
  selected_revealed_meaning text;
  selected_revealed_meaning_tag text;
  selected_revealed_example text;
  selected_revealed_example_translation text;
  selected_revealed_example_translation_tag text;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_learner_id::text || p_learning_language_id::text,
    0
  ));

  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  preferred_answer_language_tag := public.preferred_answer_language(p_learning_language_id);

  if p_collection_id is not null then
    perform 1
    from public.collections
    where id = p_collection_id
      and learner_id = current_learner_id
      and learning_language_id = p_learning_language_id;

    if not found then
      raise exception 'Collection is unavailable.';
    end if;
  end if;

  select id into selected_lesson_id
  from public.lessons
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  order by created_at desc, id desc
  limit 1
  for update;

  if selected_lesson_id is not null then
    perform public.lesson_prune_unavailable(selected_lesson_id, current_learner_id);
    perform 1
    from public.lessons
    where id = selected_lesson_id
      and learner_id = current_learner_id
      and status = 'active';

    if found then
      return public.lesson_payload(selected_lesson_id, current_learner_id);
    end if;

    selected_lesson_id := null;
  end if;

  if p_collection_id is not null then
    select count(*) into collection_entry_count
    from public.collection_memberships
    where collection_id = p_collection_id
      and learner_id = current_learner_id;

    if collection_entry_count < 8 then
      raise exception 'A Collection needs at least eight Vocabulary Entries to practise. Add % more.', 8 - collection_entry_count;
    end if;
  end if;

  setting_value := current_setting('app.lesson_min_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_min_size', true);
  end if;
  begin
    minimum_target := setting_value::integer;
  exception when others then
    minimum_target := 8;
  end;
  if setting_value is null or minimum_target is null then
    minimum_target := 8;
  end if;

  setting_value := current_setting('app.lesson_max_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_max_size', true);
  end if;
  begin
    maximum_target := setting_value::integer;
  exception when others then
    maximum_target := 12;
  end;
  if setting_value is null or maximum_target is null then
    maximum_target := 12;
  end if;

  if minimum_target < 2 or maximum_target < minimum_target or minimum_target > 1000 or maximum_target > 1000 then
    minimum_target := 8;
    maximum_target := 12;
  end if;

  select count(*) into active_sense_count
  from (
    select senses.id
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
      and exists (
        select 1
        from public.translations
        where translations.sense_id = senses.id
          and translations.learner_id = senses.learner_id
          and length(btrim(translations.text)) > 0
      )
      and exists (
        select 1
        from public.senses as distractor_senses
        join public.vocabulary_entries as distractor_entries
          on distractor_entries.id = distractor_senses.vocabulary_entry_id
          and distractor_entries.learner_id = distractor_senses.learner_id
        join public.learning_vocabulary_entries as distractor_learning_entries
          on distractor_learning_entries.id = distractor_entries.learning_vocabulary_entry_id
          and distractor_learning_entries.learner_id = distractor_entries.learner_id
        join public.translations as distractor_translations
          on distractor_translations.sense_id = distractor_senses.id
          and distractor_translations.learner_id = distractor_senses.learner_id
        where distractor_senses.learner_id = current_learner_id
          and distractor_entries.learning_language_id = p_learning_language_id
          and distractor_learning_entries.learning_language_id = p_learning_language_id
          and public.lesson_collection_includes(p_collection_id, distractor_learning_entries.id)
          and distractor_entries.id <> vocabulary_entries.id
          and length(btrim(distractor_translations.text)) > 0
          and not exists (
            select 1
            from public.translations as reviewed_translations
            where reviewed_translations.sense_id = senses.id
              and reviewed_translations.learner_id = current_learner_id
              and reviewed_translations.translation_identity = distractor_translations.translation_identity
          )
      )
  ) as eligible_senses;

  if active_sense_count < 2 then
    raise exception 'At least two eligible Senses are required to start a Lesson.';
  end if;

  target_count := least(
    active_sense_count::integer,
    minimum_target + floor(random() * (maximum_target - minimum_target + 1))::integer
  );

  insert into public.lessons (learner_id, learning_language_id, status, total_count, collection_id)
  values (current_learner_id, p_learning_language_id, 'active', target_count, p_collection_id)
  returning id into selected_lesson_id;

  drop table if exists pg_temp.lesson_selected_senses;
  create temporary table lesson_selected_senses (
    ordinal integer not null,
    sense_id uuid not null,
    vocabulary_entry_id uuid not null,
    expression text not null,
    translation text not null,
    answer_language_tag text not null,
    cloze_prompt text,
    example_text text,
    example_translation text,
    example_translation_tag text,
    cloze_example_text text,
    cloze_example_translation text,
    cloze_example_translation_tag text,
    is_cloze boolean not null default false
  ) on commit drop;

  insert into pg_temp.lesson_selected_senses (
    ordinal,
    sense_id,
    vocabulary_entry_id,
    expression,
    translation,
    answer_language_tag,
    cloze_prompt,
    example_text,
    example_translation,
    example_translation_tag,
    cloze_example_text,
    cloze_example_translation,
    cloze_example_translation_tag
  )
  select
    row_number() over (order by selected.practice_count, selected.random_order),
    selected.sense_id,
    selected.vocabulary_entry_id,
    selected.expression,
    selected.translation,
    selected.answer_language_tag,
    selected.cloze_prompt,
    selected.example_text,
    selected.example_translation,
    selected.example_translation_tag,
    selected.cloze_example_text,
    selected.cloze_example_translation,
    selected.cloze_example_translation_tag
  from (
    select
      senses.id as sense_id,
      senses.vocabulary_entry_id,
      vocabulary_entries.expression,
      translation.text as translation,
      translation.answer_language_tag,
      count(lesson_attempts.id) as practice_count,
      random() as random_order,
      sense_example.example_text,
      sense_example.example_translation,
      sense_example.example_translation_tag,
      sense_example.cloze_example_text,
      sense_example.cloze_example_translation,
      sense_example.cloze_example_translation_tag,
      sense_example.cloze_prompt
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    join lateral (
      select translations.text, translations.answer_language_tag
      from public.translations
      where translations.sense_id = senses.id
        and translations.learner_id = current_learner_id
        and length(btrim(translations.text)) > 0
      order by random()
      limit 1
    ) as translation on true
    left join lateral (
      select
        (array_agg(candidate.text order by candidate.untranslated, candidate.shuffle))[1] as example_text,
        (array_agg(candidate.translation_text order by candidate.untranslated, candidate.shuffle))[1] as example_translation,
        (array_agg(candidate.translation_tag order by candidate.untranslated, candidate.shuffle))[1] as example_translation_tag,
        (array_agg(candidate.text order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_text,
        (array_agg(candidate.translation_text order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_translation,
        (array_agg(candidate.translation_tag order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_translation_tag,
        (array_agg(candidate.cloze_prompt order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_prompt
      from (
        select
          examples.text,
          example_translation.text as translation_text,
          example_translation.answer_language_tag as translation_tag,
          example_translation.text is null as untranslated,
          random() as shuffle,
          public.lesson_cloze_prompt(examples.text, vocabulary_entries.expression) as cloze_prompt
        from public.sense_examples
        join public.examples
          on examples.id = sense_examples.example_id
          and examples.learner_id = sense_examples.learner_id
        left join lateral (
          select example_translations.text, example_translations.answer_language_tag
          from public.example_translations
          where example_translations.example_id = examples.id
            and example_translations.learner_id = current_learner_id
            and example_translations.answer_language_tag = preferred_answer_language_tag
            and length(btrim(example_translations.text)) > 0
          limit 1
        ) as example_translation on true
        where sense_examples.sense_id = senses.id
          and sense_examples.learner_id = current_learner_id
      ) as candidate
    ) as sense_example on true
    left join public.lesson_attempts
      on lesson_attempts.sense_id = senses.id
      and lesson_attempts.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
      and exists (
        select 1
        from public.senses as distractor_senses
        join public.vocabulary_entries as distractor_entries
          on distractor_entries.id = distractor_senses.vocabulary_entry_id
          and distractor_entries.learner_id = distractor_senses.learner_id
        join public.learning_vocabulary_entries as distractor_learning_entries
          on distractor_learning_entries.id = distractor_entries.learning_vocabulary_entry_id
          and distractor_learning_entries.learner_id = distractor_entries.learner_id
        join public.translations as distractor_translations
          on distractor_translations.sense_id = distractor_senses.id
          and distractor_translations.learner_id = distractor_senses.learner_id
        where distractor_senses.learner_id = current_learner_id
          and distractor_entries.learning_language_id = p_learning_language_id
          and distractor_learning_entries.learning_language_id = p_learning_language_id
          and public.lesson_collection_includes(p_collection_id, distractor_learning_entries.id)
          and distractor_entries.id <> vocabulary_entries.id
          and length(btrim(distractor_translations.text)) > 0
          and not exists (
            select 1
            from public.translations as reviewed_translations
            where reviewed_translations.sense_id = senses.id
              and reviewed_translations.learner_id = current_learner_id
              and reviewed_translations.translation_identity = distractor_translations.translation_identity
          )
      )
    group by senses.id, senses.vocabulary_entry_id, vocabulary_entries.expression,
      translation.text, translation.answer_language_tag,
      sense_example.example_text, sense_example.example_translation, sense_example.example_translation_tag,
      sense_example.cloze_example_text, sense_example.cloze_example_translation,
      sense_example.cloze_example_translation_tag, sense_example.cloze_prompt
    order by count(lesson_attempts.id), random_order
    limit target_count
  ) as selected;

  select least(
    floor(target_count / 2.0)::integer,
    count(*) filter (where cloze_prompt is not null)::integer
  ) into cloze_target_count
  from pg_temp.lesson_selected_senses;

  update pg_temp.lesson_selected_senses
  set is_cloze = true
  where sense_id in (
    select sense_id
    from pg_temp.lesson_selected_senses
    where cloze_prompt is not null
    order by random()
    limit cloze_target_count
  );

  for selected_sense in
    select * from pg_temp.lesson_selected_senses order by ordinal
  loop
    ordinal := ordinal + 1;
    selected_choice_sense_ids := null;
    selected_choice_vocabulary_entry_ids := null;
    selected_answer_language_tag := selected_sense.answer_language_tag;
    selected_correct_answer := selected_sense.translation;
    final_is_cloze := selected_sense.is_cloze;

    if final_is_cloze then
      selected_prompt := selected_sense.cloze_prompt;
      selected_correct_answer := selected_sense.expression;
      selected_answer_language_tag := null;

      with distractor_candidates as (
        select distinct on (identity)
          vocabulary_entries.expression as text,
          vocabulary_entries.id as vocabulary_entry_id,
          public.expression_identity(vocabulary_entries.expression) collate public.unicode_casefold as identity
        from public.vocabulary_entries
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        where vocabulary_entries.learner_id = current_learner_id
          and vocabulary_entries.learning_language_id = p_learning_language_id
          and learning_vocabulary_entries.learning_language_id = p_learning_language_id
          and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
          and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
          and length(btrim(vocabulary_entries.expression)) > 0
        order by identity, vocabulary_entries.id
      ), limited_distractors as (
        select text, vocabulary_entry_id
        from distractor_candidates
        where identity <> (public.expression_identity(selected_correct_answer) collate public.unicode_casefold)
        order by random()
        limit 3
      ), all_choices as (
        select selected_correct_answer as text, selected_sense.vocabulary_entry_id as vocabulary_entry_id, random() as shuffle
        union all
        select text, vocabulary_entry_id, random() as shuffle from limited_distractors
      )
      select array_agg(text order by shuffle, vocabulary_entry_id), array_agg(vocabulary_entry_id order by shuffle, vocabulary_entry_id)
      into selected_choices, selected_choice_vocabulary_entry_ids
      from all_choices;
      selected_direction := null;
    end if;

    if not final_is_cloze or cardinality(coalesce(selected_choices, array[]::text[])) < 2 then
      final_is_cloze := false;
      selected_choice_vocabulary_entry_ids := null;
      selected_answer_language_tag := selected_sense.answer_language_tag;
      selected_correct_answer := selected_sense.translation;
      translation_ordinal := translation_ordinal + 1;
      selected_direction := case
        when translation_ordinal = 1 then first_direction
        when translation_ordinal % 2 = 0 then case when first_direction = 'recognition' then 'recall' else 'recognition' end
        else first_direction
      end;

      if selected_direction = 'recognition' then
        selected_prompt := selected_sense.expression;

        with distractor_candidates as (
          select distinct on (identity) text, identity, sense_id
          from (
            select distinct on (senses.id)
              translations.text,
              translations.translation_identity collate public.unicode_casefold as identity,
              senses.id as sense_id
            from public.translations
            join public.senses
              on senses.id = translations.sense_id
              and senses.learner_id = translations.learner_id
            join public.vocabulary_entries
              on vocabulary_entries.id = senses.vocabulary_entry_id
              and vocabulary_entries.learner_id = senses.learner_id
            join public.learning_vocabulary_entries
              on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
              and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
            where translations.learner_id = current_learner_id
              and senses.id <> selected_sense.sense_id
              and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
              and vocabulary_entries.learning_language_id = p_learning_language_id
              and learning_vocabulary_entries.learning_language_id = p_learning_language_id
              and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
              and length(btrim(translations.text)) > 0
              and not exists (
                select 1
                from public.translations as reviewed_translations
                where reviewed_translations.sense_id = selected_sense.sense_id
                  and reviewed_translations.learner_id = current_learner_id
                  and reviewed_translations.translation_identity = translations.translation_identity
              )
            order by senses.id, random()
          ) as distractors
          order by identity, text
        ), limited_distractors as (
          select text, sense_id
          from distractor_candidates
          where identity <> (public.translation_identity(selected_correct_answer) collate public.unicode_casefold)
          order by random()
          limit 3
        ), all_choices as (
          select selected_correct_answer as text, selected_sense.sense_id as sense_id, random() as shuffle
          union all
          select text, sense_id, random() as shuffle from limited_distractors
        )
        select array_agg(text order by shuffle, sense_id), array_agg(sense_id order by shuffle, sense_id)
        into selected_choices, selected_choice_sense_ids
        from all_choices;
      else
        selected_prompt := selected_sense.translation;
        selected_correct_answer := selected_sense.expression;

        with distractor_candidates as (
          select distinct on (identity) text, identity, sense_id
          from (
            select distinct on (senses.id)
              vocabulary_entries.expression as text,
              public.expression_identity(vocabulary_entries.expression) collate public.unicode_casefold as identity,
              senses.id as sense_id
            from public.senses
            join public.vocabulary_entries
              on vocabulary_entries.id = senses.vocabulary_entry_id
              and vocabulary_entries.learner_id = senses.learner_id
            join public.learning_vocabulary_entries
              on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
              and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
            where senses.learner_id = current_learner_id
              and senses.id <> selected_sense.sense_id
              and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
              and vocabulary_entries.learning_language_id = p_learning_language_id
              and learning_vocabulary_entries.learning_language_id = p_learning_language_id
              and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
              and length(btrim(vocabulary_entries.expression)) > 0
            order by senses.id, random()
          ) as distractors
          order by identity, text
        ), limited_distractors as (
          select text, sense_id
          from distractor_candidates
          where identity <> (public.expression_identity(selected_correct_answer) collate public.unicode_casefold)
          order by random()
          limit 3
        ), all_choices as (
          select selected_correct_answer as text, selected_sense.sense_id as sense_id, random() as shuffle
          union all
          select text, sense_id, random() as shuffle from limited_distractors
        )
        select array_agg(text order by shuffle, sense_id), array_agg(sense_id order by shuffle, sense_id)
        into selected_choices, selected_choice_sense_ids
        from all_choices;
      end if;
    end if;

    if cardinality(coalesce(selected_choices, array[]::text[])) < 2 then
      continue;
    end if;

    if final_is_cloze and preferred_answer_language_tag is not null then
      select string_agg(translations.text, ', ' order by translations.created_at, translations.id)
      into selected_revealed_meaning
      from public.translations
      where translations.sense_id = selected_sense.sense_id
        and translations.learner_id = current_learner_id
        and translations.answer_language_tag = preferred_answer_language_tag
        and length(btrim(translations.text)) > 0;
    else
      selected_revealed_meaning := null;
    end if;

    selected_revealed_meaning_tag := case when selected_revealed_meaning is null then null else preferred_answer_language_tag end;

    if final_is_cloze then
      selected_revealed_example := selected_sense.cloze_example_text;
      selected_revealed_example_translation := selected_sense.cloze_example_translation;
      selected_revealed_example_translation_tag := selected_sense.cloze_example_translation_tag;
    else
      selected_revealed_example := selected_sense.example_text;
      selected_revealed_example_translation := selected_sense.example_translation;
      selected_revealed_example_translation_tag := selected_sense.example_translation_tag;
    end if;

    insert into public.lesson_questions (
      lesson_id,
      learner_id,
      sense_id,
      ordinal,
      prompt,
      question_type,
      direction,
      answer_language_tag,
      choices,
      choice_sense_ids,
      choice_vocabulary_entry_ids,
      correct_answer,
      revealed_meaning,
      revealed_meaning_answer_language_tag,
      revealed_example,
      revealed_example_translation,
      revealed_example_translation_answer_language_tag
    ) values (
      selected_lesson_id,
      current_learner_id,
      selected_sense.sense_id,
      ordinal,
      selected_prompt,
      case when final_is_cloze then 'cloze' else 'translation' end,
      case when final_is_cloze then null else selected_direction end,
      case when final_is_cloze then null else selected_answer_language_tag end,
      selected_choices,
      case when final_is_cloze then null else selected_choice_sense_ids end,
      case when final_is_cloze then selected_choice_vocabulary_entry_ids else null end,
      selected_correct_answer,
      selected_revealed_meaning,
      selected_revealed_meaning_tag,
      selected_revealed_example,
      selected_revealed_example_translation,
      selected_revealed_example_translation_tag
    );
  end loop;

  update public.lessons
  set total_count = (
    select count(*)
    from public.lesson_questions
    where lesson_id = selected_lesson_id
      and learner_id = current_learner_id
  )
  where id = selected_lesson_id
    and learner_id = current_learner_id;

  return public.lesson_payload(selected_lesson_id, current_learner_id);
end;
$function$;

