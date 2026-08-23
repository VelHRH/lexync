create table public.study_pairs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_language_tag text not null check (target_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  reference_language_tag text not null check (reference_language_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (learner_id, target_language_tag, reference_language_tag),
  unique (id, learner_id)
);

create unique index one_primary_study_pair_per_target
on public.study_pairs (learner_id, target_language_tag)
where is_primary;

create table public.vocabulary_entries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  study_pair_id uuid not null,
  expression text not null check (length(btrim(expression)) > 0),
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (study_pair_id, learner_id) references public.study_pairs(id, learner_id) on delete cascade
);

create table public.senses (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vocabulary_entry_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (vocabulary_entry_id, learner_id) references public.vocabulary_entries(id, learner_id) on delete cascade
);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sense_id uuid not null,
  text text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (sense_id, learner_id) references public.senses(id, learner_id) on delete cascade
);

create table public.examples (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sense_id uuid not null,
  text text not null check (length(btrim(text)) > 0),
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (sense_id, learner_id) references public.senses(id, learner_id) on delete cascade
);

alter table public.study_pairs enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.senses enable row level security;
alter table public.translations enable row level security;
alter table public.examples enable row level security;

create policy learner_owns_study_pairs on public.study_pairs
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

create policy learner_owns_vocabulary_entries on public.vocabulary_entries
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

create policy learner_owns_senses on public.senses
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

create policy learner_owns_translations on public.translations
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

create policy learner_owns_examples on public.examples
for all to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

revoke all on public.study_pairs from anon;
revoke all on public.vocabulary_entries from anon;
revoke all on public.senses from anon;
revoke all on public.translations from anon;
revoke all on public.examples from anon;

grant select, insert, update, delete on public.study_pairs to authenticated;
grant select, insert, update, delete on public.vocabulary_entries to authenticated;
grant select, insert, update, delete on public.senses to authenticated;
grant select, insert, update, delete on public.translations to authenticated;
grant select, insert, update, delete on public.examples to authenticated;

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
  sense_id uuid;
  clean_expression text := btrim(p_expression);
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
  returning id into vocabulary_entry_id;

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
    'expression', clean_expression,
    'translation', clean_translation,
    'example', clean_example,
    'targetLanguageTag', selected_pair.target_language_tag,
    'referenceLanguageTag', selected_pair.reference_language_tag
  );
end;
$$;

revoke all on function public.capture_manual_entry(uuid, text, text, text) from public;
grant execute on function public.capture_manual_entry(uuid, text, text, text) to authenticated;
