create table public.scheduled_review_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  learning_language_id uuid not null,
  status text not null default 'active' check (status in ('active', 'completed', 'ended')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  ended_at timestamptz,
  unique (id, learner_id),
  foreign key (learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade,
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'ended') = (ended_at is not null)),
  check (status <> 'active' or (completed_at is null and ended_at is null))
);

create unique index scheduled_review_sessions_one_active
on public.scheduled_review_sessions (learner_id, learning_language_id)
where status = 'active';

create table public.scheduled_review_session_items (
  session_id uuid not null,
  learner_id uuid not null default auth.uid(),
  card_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  review_event_id uuid,
  confirmed_at timestamptz,
  primary key (session_id, card_id),
  unique (session_id, ordinal),
  unique (review_event_id, learner_id),
  foreign key (session_id, learner_id)
    references public.scheduled_review_sessions(id, learner_id) on delete cascade,
  foreign key (card_id, learner_id)
    references public.cards(id, learner_id) on delete cascade,
  foreign key (review_event_id, learner_id)
    references public.review_events(id, learner_id) on delete cascade,
  check ((review_event_id is null) = (confirmed_at is null))
);

alter table public.scheduled_review_sessions enable row level security;
alter table public.scheduled_review_session_items enable row level security;

create policy learner_reads_scheduled_review_sessions on public.scheduled_review_sessions
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_scheduled_review_session_items on public.scheduled_review_session_items
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.scheduled_review_sessions from anon, authenticated;
revoke all on public.scheduled_review_session_items from anon, authenticated;
grant select on public.scheduled_review_sessions to authenticated;
grant select on public.scheduled_review_session_items to authenticated;

create or replace function public.start_or_resume_scheduled_review(
  p_learning_language_id uuid,
  p_card_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  current_session public.scheduled_review_sessions%rowtype;
  created_session public.scheduled_review_sessions%rowtype;
  requested_card_count bigint;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_card_ids is null or cardinality(p_card_ids) = 0 then
    raise exception 'Card selection is required.';
  end if;

  if exists (select 1 from unnest(p_card_ids) as requested(card_id) where requested.card_id is null) then
    raise exception 'Card selection is unavailable.';
  end if;

  if exists (
    select requested.card_id
    from unnest(p_card_ids) as requested(card_id)
    group by requested.card_id
    having count(*) > 1
  ) then
    raise exception 'Card selection contains duplicates.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  select count(*) into requested_card_count
  from public.cards
  join public.senses
    on senses.id = cards.sense_id
    and senses.learner_id = cards.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = cards.learner_id
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    and learning_vocabulary_entries.learner_id = cards.learner_id
  where cards.learner_id = current_learner_id
    and cards.learning_language_id = p_learning_language_id
    and cards.id = any(p_card_ids)
    and not learning_vocabulary_entries.suspended;

  if requested_card_count <> cardinality(p_card_ids) then
    raise exception 'Card selection is unavailable.';
  end if;

  select * into current_session
  from public.scheduled_review_sessions
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  for update;

  if found then
    return jsonb_build_object(
      'id', current_session.id,
      'learning_language_id', current_session.learning_language_id,
      'status', current_session.status,
      'created_at', current_session.created_at,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'card_id', session_items.card_id,
            'ordinal', session_items.ordinal,
            'review_event_id', session_items.review_event_id,
            'confirmed_at', session_items.confirmed_at
          ) order by session_items.ordinal
        )
        from public.scheduled_review_session_items as session_items
        where session_items.session_id = current_session.id
          and session_items.learner_id = current_learner_id
      ), '[]'::jsonb)
    );
  end if;

  insert into public.scheduled_review_sessions (learner_id, learning_language_id)
  values (current_learner_id, p_learning_language_id)
  returning * into created_session;

  insert into public.scheduled_review_session_items (session_id, learner_id, card_id, ordinal)
  select created_session.id, current_learner_id, requested.card_id, requested.ordinal::integer
  from unnest(p_card_ids) with ordinality as requested(card_id, ordinal);

  return jsonb_build_object(
    'id', created_session.id,
    'learning_language_id', created_session.learning_language_id,
    'status', created_session.status,
    'created_at', created_session.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'card_id', session_items.card_id,
          'ordinal', session_items.ordinal,
          'review_event_id', session_items.review_event_id,
          'confirmed_at', session_items.confirmed_at
        ) order by session_items.ordinal
      )
      from public.scheduled_review_session_items as session_items
      where session_items.session_id = created_session.id
        and session_items.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
exception
  when unique_violation then
    select * into current_session
    from public.scheduled_review_sessions
    where learner_id = current_learner_id
      and learning_language_id = p_learning_language_id
      and status = 'active'
    for update;

    if found then
      return jsonb_build_object(
        'id', current_session.id,
        'learning_language_id', current_session.learning_language_id,
        'status', current_session.status,
        'created_at', current_session.created_at,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'card_id', session_items.card_id,
              'ordinal', session_items.ordinal,
              'review_event_id', session_items.review_event_id,
              'confirmed_at', session_items.confirmed_at
            ) order by session_items.ordinal
          )
          from public.scheduled_review_session_items as session_items
          where session_items.session_id = current_session.id
            and session_items.learner_id = current_learner_id
        ), '[]'::jsonb)
      );
    end if;

    raise;
end;
$$;

create or replace function public.scheduled_review_session_overview(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  current_session public.scheduled_review_sessions%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  select * into current_session
  from public.scheduled_review_sessions
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active';

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', current_session.id,
    'learning_language_id', current_session.learning_language_id,
    'status', current_session.status,
    'created_at', current_session.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'card_id', session_items.card_id,
          'ordinal', session_items.ordinal,
          'review_event_id', session_items.review_event_id,
          'confirmed_at', session_items.confirmed_at
        ) order by session_items.ordinal
      )
      from public.scheduled_review_session_items as session_items
      where session_items.session_id = current_session.id
        and session_items.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.confirm_scheduled_review_session(
  p_session_id uuid,
  p_card_id uuid,
  p_event_id uuid,
  p_rating public.scheduled_review_rating,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  current_session public.scheduled_review_sessions%rowtype;
  current_item public.scheduled_review_session_items%rowtype;
  existing_event public.review_events%rowtype;
  session_status text;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_event_id is null then
    raise exception 'Review event identity is required.';
  end if;

  if p_rating is null then
    raise exception 'Review rating is required.';
  end if;

  if p_occurred_at is null then
    raise exception 'Review time is required.';
  end if;

  select * into current_session
  from public.scheduled_review_sessions
  where id = p_session_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Scheduled Review Session is unavailable.';
  end if;

  if current_session.status = 'ended' then
    raise exception 'Scheduled Review Session has ended.';
  end if;

  select * into current_item
  from public.scheduled_review_session_items
  where session_id = p_session_id
    and learner_id = current_learner_id
    and card_id = p_card_id
  for update;

  if not found then
    raise exception 'Card is not in Scheduled Review Session.';
  end if;

  if current_item.review_event_id is not null then
    select * into existing_event
    from public.review_events
    where id = current_item.review_event_id
      and learner_id = current_learner_id;

    return jsonb_build_object(
      'event_id', existing_event.id,
      'occurred_at', existing_event.occurred_at,
      'rating', existing_event.rating,
      'already_confirmed', true,
      'session_status', current_session.status
    );
  end if;

  if current_session.status <> 'active' then
    raise exception 'Scheduled Review Session is unavailable.';
  end if;

  perform 1
  from public.cards
  join public.senses
    on senses.id = cards.sense_id
    and senses.learner_id = cards.learner_id
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = cards.learner_id
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    and learning_vocabulary_entries.learner_id = cards.learner_id
  where cards.id = p_card_id
    and cards.learner_id = current_learner_id
    and cards.learning_language_id = current_session.learning_language_id
    and not learning_vocabulary_entries.suspended
  for update of cards;

  if not found then
    raise exception 'Recognition Card is unavailable.';
  end if;

  select * into existing_event
  from public.review_events
  where id = p_event_id;

  if found then
    raise exception 'Review event identity is unavailable.';
  end if;

  insert into public.review_events (id, learner_id, card_id, occurred_at, rating)
  values (p_event_id, current_learner_id, p_card_id, p_occurred_at, p_rating);

  update public.scheduled_review_session_items
  set review_event_id = p_event_id,
      confirmed_at = now()
  where session_id = p_session_id
    and learner_id = current_learner_id
    and card_id = p_card_id;

  if not exists (
    select 1
    from public.scheduled_review_session_items
    where session_id = p_session_id
      and learner_id = current_learner_id
      and review_event_id is null
  ) then
    update public.scheduled_review_sessions
    set status = 'completed',
        completed_at = now()
    where id = p_session_id and learner_id = current_learner_id;
    session_status := 'completed';
  else
    session_status := current_session.status;
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'occurred_at', p_occurred_at,
    'rating', p_rating,
    'already_confirmed', false,
    'session_status', session_status
  );
end;
$$;

create or replace function public.end_scheduled_review_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  current_session public.scheduled_review_sessions%rowtype;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into current_session
  from public.scheduled_review_sessions
  where id = p_session_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Scheduled Review Session is unavailable.';
  end if;

  if current_session.status = 'active' then
    update public.scheduled_review_sessions
    set status = 'ended',
        ended_at = now()
    where id = p_session_id and learner_id = current_learner_id
    returning * into current_session;
  end if;

  return jsonb_build_object('id', current_session.id, 'status', current_session.status);
end;
$$;

revoke all on function public.start_or_resume_scheduled_review(uuid, uuid[]) from public;
grant execute on function public.start_or_resume_scheduled_review(uuid, uuid[]) to authenticated;
revoke all on function public.scheduled_review_session_overview(uuid) from public;
grant execute on function public.scheduled_review_session_overview(uuid) to authenticated;
revoke all on function public.confirm_scheduled_review_session(uuid, uuid, uuid, public.scheduled_review_rating, timestamptz) from public;
grant execute on function public.confirm_scheduled_review_session(uuid, uuid, uuid, public.scheduled_review_rating, timestamptz) to authenticated;
revoke all on function public.end_scheduled_review_session(uuid) from public;
grant execute on function public.end_scheduled_review_session(uuid) to authenticated;
