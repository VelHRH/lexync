create table public.cards (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sense_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  unique (sense_id),
  foreign key (sense_id, learner_id) references public.senses(id, learner_id) on delete cascade
);

create type public.scheduled_review_rating as enum ('again', 'hard', 'good', 'easy');

create table public.review_events (
  id uuid primary key,
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null,
  occurred_at timestamptz not null,
  rating public.scheduled_review_rating not null,
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (card_id, learner_id) references public.cards(id, learner_id) on delete cascade
);

create index review_events_chronological on public.review_events (card_id, occurred_at, id);

alter table public.cards enable row level security;
alter table public.review_events enable row level security;

create policy learner_reads_cards on public.cards
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_review_events on public.review_events
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.cards from anon, authenticated;
revoke all on public.review_events from anon, authenticated;
grant select on public.cards to authenticated;
grant select on public.review_events to authenticated;

create or replace function public.create_recognition_card_for_sense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cards (learner_id, sense_id, created_at)
  values (new.learner_id, new.id, new.created_at)
  on conflict (sense_id) do nothing;

  return new;
end;
$$;

create trigger create_recognition_card_after_sense
after insert on public.senses
for each row execute function public.create_recognition_card_for_sense();

insert into public.cards (learner_id, sense_id, created_at)
select learner_id, id, created_at
from public.senses
on conflict (sense_id) do nothing;

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
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = cards.learner_id
  where cards.learner_id = auth.uid()
    and not vocabulary_entries.suspended
  group by cards.id, senses.id, study_pairs.id, vocabulary_entries.id
  order by cards.created_at, cards.id;
$$;

create or replace function public.confirm_scheduled_review(
  p_card_id uuid,
  p_event_id uuid,
  p_rating public.scheduled_review_rating,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  existing_event public.review_events%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_occurred_at is null then
    raise exception 'Review time is required.';
  end if;

  perform 1
  from public.cards
  join public.senses
    on senses.id = cards.sense_id
    and senses.learner_id = cards.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = cards.learner_id
  where cards.id = p_card_id
    and cards.learner_id = current_learner_id
    and not vocabulary_entries.suspended
  for update of cards;

  if not found then
    raise exception 'Recognition Card is unavailable.';
  end if;

  select * into existing_event
  from public.review_events
  where id = p_event_id;

  if found then
    if existing_event.learner_id = current_learner_id
      and existing_event.card_id = p_card_id
      and existing_event.rating = p_rating
      and existing_event.occurred_at = p_occurred_at then
      return;
    end if;

    raise exception 'Review event identity is unavailable.';
  end if;

  insert into public.review_events (id, learner_id, card_id, occurred_at, rating)
  values (p_event_id, current_learner_id, p_card_id, p_occurred_at, p_rating);
end;
$$;

revoke all on function public.scheduled_review_overview() from public;
grant execute on function public.scheduled_review_overview() to authenticated;
revoke all on function public.confirm_scheduled_review(uuid, uuid, public.scheduled_review_rating, timestamptz) from public;
grant execute on function public.confirm_scheduled_review(uuid, uuid, public.scheduled_review_rating, timestamptz) to authenticated;
