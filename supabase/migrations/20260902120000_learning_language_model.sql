create table public.learning_languages (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  language_tag text not null,
  created_at timestamptz not null default now(),
  unique (learner_id, language_tag),
  unique (id, learner_id)
);

create table public.learner_language_state (
  learner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  active_learning_language_id uuid not null,
  updated_at timestamptz not null default now(),
  foreign key (active_learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade
);

create table public.learning_vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  learning_language_id uuid not null,
  expression text not null,
  expression_identity text collate public.unicode_casefold
    generated always as (public.expression_identity(expression)) stored,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  unique (id, learner_id, learning_language_id),
  foreign key (learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade
);

create unique index learning_vocabulary_entry_expression_identity
on public.learning_vocabulary_entries (learner_id, learning_language_id, expression_identity);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  learning_language_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (id, learner_id, learning_language_id),
  foreign key (learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade
);

create table public.collection_memberships (
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id uuid not null,
  learning_language_id uuid not null,
  learning_vocabulary_entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (collection_id, learning_vocabulary_entry_id),
  foreign key (collection_id, learner_id, learning_language_id)
    references public.collections(id, learner_id, learning_language_id) on delete cascade,
  foreign key (learning_vocabulary_entry_id, learner_id, learning_language_id)
    references public.learning_vocabulary_entries(id, learner_id, learning_language_id) on delete cascade
);

alter table public.study_pairs
add column learning_language_id uuid;

alter table public.vocabulary_entries
add column learning_language_id uuid,
add column learning_vocabulary_entry_id uuid;

alter table public.translations
add column answer_language_tag text,
add column last_used_at timestamptz;

alter table public.cards
add column learning_language_id uuid,
add column answer_language_tag text,
add column direction text not null default 'recognition';

insert into public.learning_languages (learner_id, language_tag, created_at)
select learner_id, target_language_tag, min(created_at)
from public.study_pairs
group by learner_id, target_language_tag;

update public.study_pairs
set learning_language_id = learning_languages.id
from public.learning_languages
where learning_languages.learner_id = study_pairs.learner_id
  and learning_languages.language_tag = study_pairs.target_language_tag;

set constraints public.require_primary_study_pair immediate;

insert into public.learner_language_state (learner_id, active_learning_language_id, updated_at)
select distinct on (learner_id)
  learner_id,
  id,
  created_at
from public.learning_languages
order by learner_id, created_at, id;

update public.vocabulary_entries
set learning_language_id = study_pairs.learning_language_id
from public.study_pairs
where study_pairs.id = vocabulary_entries.study_pair_id
  and study_pairs.learner_id = vocabulary_entries.learner_id;

with ranked_entries as (
  select
    vocabulary_entries.*,
    row_number() over (
      partition by learner_id, learning_language_id, expression_identity
      order by created_at, id
    ) as position
  from public.vocabulary_entries
)
insert into public.learning_vocabulary_entries (
  id,
  learner_id,
  learning_language_id,
  expression,
  suspended,
  created_at
)
select id, learner_id, learning_language_id, expression, suspended, created_at
from ranked_entries
where position = 1;

update public.learning_vocabulary_entries
set suspended = grouped_entries.suspended
from (
  select
    learner_id,
    learning_language_id,
    expression_identity,
    bool_or(suspended) as suspended
  from public.vocabulary_entries
  group by learner_id, learning_language_id, expression_identity
) as grouped_entries
where grouped_entries.learner_id = learning_vocabulary_entries.learner_id
  and grouped_entries.learning_language_id = learning_vocabulary_entries.learning_language_id
  and grouped_entries.expression_identity = learning_vocabulary_entries.expression_identity;

update public.vocabulary_entries
set learning_vocabulary_entry_id = learning_vocabulary_entries.id
from public.learning_vocabulary_entries
where learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
  and learning_vocabulary_entries.learning_language_id = vocabulary_entries.learning_language_id
  and learning_vocabulary_entries.expression_identity = vocabulary_entries.expression_identity;

update public.translations
set answer_language_tag = study_pairs.reference_language_tag,
    last_used_at = translations.created_at
from public.senses
join public.vocabulary_entries
  on vocabulary_entries.id = senses.vocabulary_entry_id
  and vocabulary_entries.learner_id = senses.learner_id
join public.study_pairs
  on study_pairs.id = vocabulary_entries.study_pair_id
  and study_pairs.learner_id = vocabulary_entries.learner_id
where senses.id = translations.sense_id
  and senses.learner_id = translations.learner_id;

update public.cards
set learning_language_id = vocabulary_entries.learning_language_id,
    answer_language_tag = study_pairs.reference_language_tag
from public.senses
join public.vocabulary_entries
  on vocabulary_entries.id = senses.vocabulary_entry_id
  and vocabulary_entries.learner_id = senses.learner_id
join public.study_pairs
  on study_pairs.id = vocabulary_entries.study_pair_id
  and study_pairs.learner_id = vocabulary_entries.learner_id
where senses.id = cards.sense_id
  and senses.learner_id = cards.learner_id;

drop trigger create_recognition_card_after_sense on public.senses;
drop function public.create_recognition_card_for_sense();

alter table public.cards
drop constraint cards_sense_id_key;

alter table public.study_pairs
alter column learning_language_id set not null,
add foreign key (learning_language_id, learner_id)
  references public.learning_languages(id, learner_id) on delete cascade;

alter table public.vocabulary_entries
alter column learning_language_id set not null,
alter column learning_vocabulary_entry_id set not null,
add foreign key (learning_language_id, learner_id)
  references public.learning_languages(id, learner_id) on delete cascade,
add foreign key (learning_vocabulary_entry_id, learner_id)
  references public.learning_vocabulary_entries(id, learner_id) on delete cascade;

alter table public.translations
alter column answer_language_tag set not null,
alter column last_used_at set not null,
alter column last_used_at set default now();

drop index public.translation_identity_per_sense;

create unique index translation_identity_per_sense_and_answer_language
on public.translations (
  learner_id,
  sense_id,
  answer_language_tag,
  translation_identity
);

alter table public.cards
alter column learning_language_id set not null,
alter column answer_language_tag set not null,
add constraint cards_direction_check check (direction in ('recognition', 'recall')),
add foreign key (learning_language_id, learner_id)
  references public.learning_languages(id, learner_id) on delete cascade,
add unique (sense_id, answer_language_tag, direction);

insert into public.cards (
  learner_id,
  sense_id,
  created_at,
  learning_language_id,
  answer_language_tag,
  direction
)
select
  cards.learner_id,
  cards.sense_id,
  cards.created_at,
  cards.learning_language_id,
  cards.answer_language_tag,
  'recall'
from public.cards
where cards.direction = 'recognition'
on conflict (sense_id, answer_language_tag, direction) do nothing;

insert into public.cards (
  learner_id,
  sense_id,
  created_at,
  learning_language_id,
  answer_language_tag,
  direction
)
select distinct
  translations.learner_id,
  translations.sense_id,
  translations.created_at,
  vocabulary_entries.learning_language_id,
  translations.answer_language_tag,
  directions.direction
from public.translations
join public.senses
  on senses.id = translations.sense_id
  and senses.learner_id = translations.learner_id
join public.vocabulary_entries
  on vocabulary_entries.id = senses.vocabulary_entry_id
  and vocabulary_entries.learner_id = senses.learner_id
cross join (values ('recognition'), ('recall')) as directions(direction)
on conflict (sense_id, answer_language_tag, direction) do nothing;

create or replace function public.sync_study_pair_learning_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_learning_language_id uuid;
  canonical_tag text := public.canonical_language_tag(new.target_language_tag);
begin
  insert into public.learning_languages (learner_id, language_tag, created_at)
  values (new.learner_id, canonical_tag, new.created_at)
  on conflict (learner_id, language_tag) do nothing;

  select id into resolved_learning_language_id
  from public.learning_languages
  where learner_id = new.learner_id and language_tag = canonical_tag;

  new.learning_language_id := resolved_learning_language_id;

  insert into public.learner_language_state (learner_id, active_learning_language_id, updated_at)
  values (new.learner_id, resolved_learning_language_id, new.created_at)
  on conflict (learner_id) do nothing;

  return new;
end;
$$;

create trigger sync_study_pair_learning_language
before insert or update of target_language_tag on public.study_pairs
for each row execute function public.sync_study_pair_learning_language();

create or replace function public.sync_legacy_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_pair public.study_pairs%rowtype;
  resolved_entry_id uuid;
  existing_mapping_count bigint;
begin
  select * into selected_pair
  from public.study_pairs
  where id = new.study_pair_id and learner_id = new.learner_id;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  new.learning_language_id := selected_pair.learning_language_id;

  select id into resolved_entry_id
  from public.learning_vocabulary_entries
  where learner_id = new.learner_id
    and learning_language_id = selected_pair.learning_language_id
    and expression_identity = public.expression_identity(new.expression)
  order by created_at, id
  limit 1;

  if resolved_entry_id is null then
    if tg_op = 'UPDATE' and old.learning_language_id = selected_pair.learning_language_id then
      select count(*) into existing_mapping_count
      from public.vocabulary_entries
      where learning_vocabulary_entry_id = old.learning_vocabulary_entry_id;

      if existing_mapping_count = 1 then
        update public.learning_vocabulary_entries
        set expression = new.expression,
            suspended = new.suspended
        where id = old.learning_vocabulary_entry_id
        returning id into resolved_entry_id;
      end if;
    end if;

    if resolved_entry_id is null and tg_op = 'INSERT' then
      insert into public.learning_vocabulary_entries (
        id,
        learner_id,
        learning_language_id,
        expression,
        suspended,
        created_at
      ) values (
        new.id,
        new.learner_id,
        selected_pair.learning_language_id,
        new.expression,
        new.suspended,
        new.created_at
      )
      returning id into resolved_entry_id;
    elsif resolved_entry_id is null then
      insert into public.learning_vocabulary_entries (
        learner_id,
        learning_language_id,
        expression,
        suspended,
        created_at
      ) values (
        new.learner_id,
        selected_pair.learning_language_id,
        new.expression,
        new.suspended,
        new.created_at
      )
      returning id into resolved_entry_id;
    end if;
  end if;

  new.learning_vocabulary_entry_id := resolved_entry_id;
  return new;
end;
$$;

create trigger sync_legacy_vocabulary_entry
before insert or update of study_pair_id, expression on public.vocabulary_entries
for each row execute function public.sync_legacy_vocabulary_entry();

create or replace function public.sync_learning_vocabulary_entry_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.learning_vocabulary_entries
  set suspended = (
    select bool_or(vocabulary_entries.suspended)
    from public.vocabulary_entries
    where vocabulary_entries.learning_vocabulary_entry_id = new.learning_vocabulary_entry_id
  )
  where id = new.learning_vocabulary_entry_id;

  return null;
end;
$$;

create trigger sync_learning_vocabulary_entry_suspension
after update of suspended on public.vocabulary_entries
for each row execute function public.sync_learning_vocabulary_entry_suspension();

create or replace function public.remove_orphaned_learning_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.learning_vocabulary_entries
  set suspended = coalesce((
    select bool_or(vocabulary_entries.suspended)
    from public.vocabulary_entries
    where learning_vocabulary_entry_id = old.learning_vocabulary_entry_id
  ), false)
  where id = old.learning_vocabulary_entry_id;

  delete from public.learning_vocabulary_entries
  where id = old.learning_vocabulary_entry_id
    and not exists (
      select 1
      from public.vocabulary_entries
      where learning_vocabulary_entry_id = old.learning_vocabulary_entry_id
    );

  return null;
end;
$$;

create trigger remove_orphaned_learning_vocabulary_entry
after update of learning_vocabulary_entry_id or delete on public.vocabulary_entries
for each row execute function public.remove_orphaned_learning_vocabulary_entry();

create or replace function public.sync_moved_learning_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_learning_language_id uuid;
begin
  if tg_table_name = 'vocabulary_entries' then
    resolved_learning_language_id := new.learning_language_id;

    update public.cards
    set learning_language_id = resolved_learning_language_id
    where learner_id = new.learner_id
      and sense_id in (
        select id
        from public.senses
        where learner_id = new.learner_id
          and vocabulary_entry_id = new.id
      );
  else
    select learning_language_id into resolved_learning_language_id
    from public.vocabulary_entries
    where id = new.vocabulary_entry_id and learner_id = new.learner_id;

    update public.cards
    set learning_language_id = resolved_learning_language_id
    where learner_id = new.learner_id and sense_id = new.id;
  end if;

  return null;
end;
$$;

create trigger sync_cards_after_vocabulary_entry_move
after update on public.vocabulary_entries
for each row
when (old.learning_language_id is distinct from new.learning_language_id)
execute function public.sync_moved_learning_cards();

create trigger sync_cards_after_sense_move
after update of vocabulary_entry_id on public.senses
for each row
when (old.vocabulary_entry_id is distinct from new.vocabulary_entry_id)
execute function public.sync_moved_learning_cards();

create or replace function public.sync_translation_answer_language()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_answer_language_tag text;
begin
  if new.answer_language_tag is null then
    select study_pairs.reference_language_tag into legacy_answer_language_tag
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.study_pairs
      on study_pairs.id = vocabulary_entries.study_pair_id
      and study_pairs.learner_id = vocabulary_entries.learner_id
    where senses.id = new.sense_id and senses.learner_id = new.learner_id;

    new.answer_language_tag := legacy_answer_language_tag;
  end if;

  new.answer_language_tag := public.canonical_language_tag(new.answer_language_tag);
  new.last_used_at := coalesce(new.last_used_at, new.created_at, now());
  return new;
end;
$$;

create trigger sync_translation_answer_language
before insert or update of answer_language_tag on public.translations
for each row execute function public.sync_translation_answer_language();

create or replace function public.create_learning_cards_for_translation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_learning_language_id uuid;
begin
  select vocabulary_entries.learning_language_id into selected_learning_language_id
  from public.senses
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = senses.learner_id
  where senses.id = new.sense_id and senses.learner_id = new.learner_id;

  insert into public.cards (
    learner_id,
    sense_id,
    created_at,
    learning_language_id,
    answer_language_tag,
    direction
  )
  select
    new.learner_id,
    new.sense_id,
    new.created_at,
    selected_learning_language_id,
    new.answer_language_tag,
    direction
  from (values ('recognition'), ('recall')) as directions(direction)
  on conflict (sense_id, answer_language_tag, direction) do nothing;

  return new;
end;
$$;

create trigger create_learning_cards_after_translation
after insert or update of answer_language_tag on public.translations
for each row execute function public.create_learning_cards_for_translation();

create view public.language_pairs
with (security_invoker = true)
as
select distinct
  learning_languages.learner_id,
  learning_languages.id as learning_language_id,
  learning_languages.language_tag as learning_language_tag,
  translations.answer_language_tag
from public.learning_languages
join public.learning_vocabulary_entries
  on learning_vocabulary_entries.learning_language_id = learning_languages.id
  and learning_vocabulary_entries.learner_id = learning_languages.learner_id
join public.vocabulary_entries
  on vocabulary_entries.learning_vocabulary_entry_id = learning_vocabulary_entries.id
  and vocabulary_entries.learner_id = learning_vocabulary_entries.learner_id
join public.senses
  on senses.vocabulary_entry_id = vocabulary_entries.id
  and senses.learner_id = vocabulary_entries.learner_id
join public.translations
  on translations.sense_id = senses.id
  and translations.learner_id = senses.learner_id;

create view public.preferred_answer_languages
with (security_invoker = true)
as
select learner_id, learning_language_id, learning_language_tag, answer_language_tag
from (
  select
    language_pairs.learner_id,
    language_pairs.learning_language_id,
    language_pairs.learning_language_tag,
    translations.answer_language_tag,
    row_number() over (
      partition by language_pairs.learner_id, language_pairs.learning_language_id
      order by count(distinct translations.sense_id) desc,
        max(translations.last_used_at) desc,
        translations.answer_language_tag
    ) as position
  from public.language_pairs
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.learning_language_id = language_pairs.learning_language_id
    and learning_vocabulary_entries.learner_id = language_pairs.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.learning_vocabulary_entry_id = learning_vocabulary_entries.id
    and vocabulary_entries.learner_id = learning_vocabulary_entries.learner_id
  join public.senses
    on senses.vocabulary_entry_id = vocabulary_entries.id
    and senses.learner_id = vocabulary_entries.learner_id
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = senses.learner_id
    and translations.answer_language_tag = language_pairs.answer_language_tag
  group by
    language_pairs.learner_id,
    language_pairs.learning_language_id,
    language_pairs.learning_language_tag,
    translations.answer_language_tag
) as ranked_languages
where position = 1;

create or replace function public.set_active_learning_language(p_learning_language_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  insert into public.learner_language_state (
    learner_id,
    active_learning_language_id,
    updated_at
  ) values (
    current_learner_id,
    p_learning_language_id,
    now()
  )
  on conflict (learner_id) do update
  set active_learning_language_id = excluded.active_learning_language_id,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.require_single_learning_language(p_card_ids uuid[])
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resolved_learning_language_id uuid;
begin
  if coalesce(cardinality(p_card_ids), 0) = 0 then
    return null;
  end if;

  if (
    select count(*)
    from public.cards
    where learner_id = auth.uid() and id = any(p_card_ids)
  ) <> cardinality(p_card_ids) then
    raise exception 'Card selection is unavailable.';
  end if;

  if (
    select count(distinct learning_language_id)
    from public.cards
    where learner_id = auth.uid() and id = any(p_card_ids)
  ) <> 1 then
    raise exception 'A session cannot mix Learning Languages.';
  end if;

  select min(learning_language_id) into resolved_learning_language_id
  from public.cards
  where learner_id = auth.uid() and id = any(p_card_ids);

  return resolved_learning_language_id;
end;
$$;

create or replace function public.account_learning_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
                'suspended', learning_vocabulary_entries.suspended,
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
                          jsonb_build_object('id', examples.id, 'text', examples.text)
                          order by examples.created_at, examples.id
                        )
                        from public.examples
                        where examples.learner_id = current_learner_id
                          and examples.sense_id = senses.id
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
          'createdAt', cards.created_at,
          'events', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', review_events.id,
                'occurredAt', review_events.occurred_at,
                'rating', review_events.rating
              ) order by review_events.occurred_at, review_events.id
            )
            from public.review_events
            where review_events.learner_id = current_learner_id
              and review_events.card_id = cards.id
          ), '[]'::jsonb)
        ) order by cards.created_at, cards.id
      )
      from public.cards
      where cards.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.account_vocabulary_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
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
                'suspended', vocabulary_entries.suspended,
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
                        from public.examples
                        where examples.learner_id = current_learner_id
                          and examples.sense_id = senses.id
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
$$;

create or replace function public.learning_scheduled_review_overview(p_learning_language_id uuid)
returns table (
  id uuid,
  sense_id uuid,
  learning_language_id uuid,
  expression text,
  suspended boolean,
  learning_language_tag text,
  answer_language_tag text,
  direction text,
  created_at timestamptz,
  translations text[],
  events jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cards.id,
    senses.id,
    learning_languages.id,
    learning_vocabulary_entries.expression,
    learning_vocabulary_entries.suspended,
    learning_languages.language_tag,
    cards.answer_language_tag,
    cards.direction,
    cards.created_at,
    array_agg(translations.text order by translations.created_at, translations.id),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', review_events.id,
          'occurredAt', review_events.occurred_at,
          'rating', review_events.rating
        ) order by review_events.occurred_at, review_events.id
      )
      from public.review_events
      where review_events.learner_id = auth.uid() and review_events.card_id = cards.id
    ), '[]'::jsonb)
  from public.cards
  join public.learning_languages
    on learning_languages.id = cards.learning_language_id
    and learning_languages.learner_id = cards.learner_id
  join public.senses
    on senses.id = cards.sense_id
    and senses.learner_id = cards.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = cards.learner_id
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    and learning_vocabulary_entries.learner_id = cards.learner_id
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = cards.learner_id
    and translations.answer_language_tag = cards.answer_language_tag
  where cards.learner_id = auth.uid()
    and cards.learning_language_id = p_learning_language_id
    and not learning_vocabulary_entries.suspended
  group by cards.id, senses.id, learning_languages.id, learning_vocabulary_entries.id
  order by cards.created_at, cards.id;
$$;

create or replace function public.scheduled_review_overview()
returns table (
  id uuid,
  sense_id uuid,
  study_pair_id uuid,
  expression text,
  suspended boolean,
  target_language_tag text,
  reference_language_tag text,
  created_at timestamptz,
  translations text[],
  events jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    cards.id,
    senses.id,
    study_pairs.id,
    vocabulary_entries.expression,
    vocabulary_entries.suspended,
    study_pairs.target_language_tag,
    study_pairs.reference_language_tag,
    cards.created_at,
    array_agg(translations.text order by translations.created_at, translations.id),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', review_events.id,
          'occurredAt', review_events.occurred_at,
          'rating', review_events.rating
        ) order by review_events.occurred_at, review_events.id
      )
      from public.review_events
      where review_events.learner_id = auth.uid() and review_events.card_id = cards.id
    ), '[]'::jsonb)
  from public.cards
  join public.senses
    on senses.id = cards.sense_id
    and senses.learner_id = cards.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = cards.learner_id
  join public.study_pairs
    on study_pairs.id = vocabulary_entries.study_pair_id
    and study_pairs.learner_id = cards.learner_id
    and study_pairs.reference_language_tag = cards.answer_language_tag
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = cards.learner_id
    and translations.answer_language_tag = cards.answer_language_tag
  where cards.learner_id = auth.uid()
    and cards.direction = 'recognition'
    and not vocabulary_entries.suspended
  group by cards.id, senses.id, study_pairs.id, vocabulary_entries.id
  order by cards.created_at, cards.id;
$$;

alter table public.learning_languages enable row level security;
alter table public.learner_language_state enable row level security;
alter table public.learning_vocabulary_entries enable row level security;
alter table public.collections enable row level security;
alter table public.collection_memberships enable row level security;

create policy learner_reads_learning_languages on public.learning_languages
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_language_state on public.learner_language_state
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_learning_vocabulary_entries on public.learning_vocabulary_entries
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_collections on public.collections
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_collection_memberships on public.collection_memberships
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.learning_languages from anon, authenticated;
revoke all on public.learner_language_state from anon, authenticated;
revoke all on public.learning_vocabulary_entries from anon, authenticated;
revoke all on public.collections from anon, authenticated;
revoke all on public.collection_memberships from anon, authenticated;
grant select on public.learning_languages to authenticated;
grant select on public.learner_language_state to authenticated;
grant select on public.learning_vocabulary_entries to authenticated;
grant select on public.collections to authenticated;
grant select on public.collection_memberships to authenticated;
grant select on public.language_pairs to authenticated;
grant select on public.preferred_answer_languages to authenticated;

revoke all on function public.set_active_learning_language(uuid) from public;
grant execute on function public.set_active_learning_language(uuid) to authenticated;
revoke all on function public.require_single_learning_language(uuid[]) from public;
grant execute on function public.require_single_learning_language(uuid[]) to authenticated;
revoke all on function public.account_learning_snapshot() from public;
grant execute on function public.account_learning_snapshot() to authenticated;
revoke all on function public.learning_scheduled_review_overview(uuid) from public;
grant execute on function public.learning_scheduled_review_overview(uuid) to authenticated;
