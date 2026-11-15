create table public.learner_timezones (
  learner_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null,
  reported_at timestamptz not null default now()
);

alter table public.learner_timezones enable row level security;

create policy learner_reads_learner_timezone
on public.learner_timezones
for select
to authenticated
using ((select auth.uid()) = learner_id);

revoke all on table public.learner_timezones from public, anon, authenticated;
grant select on table public.learner_timezones to authenticated;

create table public.active_days (
  learner_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null,
  recorded_at timestamptz not null default now(),
  primary key (learner_id, local_date)
);

alter table public.active_days enable row level security;

create policy learner_reads_active_days
on public.active_days
for select
to authenticated
using ((select auth.uid()) = learner_id);

revoke all on table public.active_days from public, anon, authenticated;
grant select on table public.active_days to authenticated;

create or replace function public.report_learner_timezone(p_timezone text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Learner Timezone is not a recognised IANA timezone.';
  end if;

  insert into public.learner_timezones (learner_id, timezone, reported_at)
  values (current_learner_id, p_timezone, now())
  on conflict (learner_id) do update
  set timezone = excluded.timezone,
      reported_at = excluded.reported_at
  where public.learner_timezones.timezone is distinct from excluded.timezone;

  return p_timezone;
end;
$$;

create or replace function public.learner_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select timezone
  from public.learner_timezones
  where learner_id = (select auth.uid());
$$;

create or replace function public.lesson_record_active_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  learner_timezone text;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status = 'completed') then
    return null;
  end if;

  select coalesce(
    (select timezone from public.learner_timezones where learner_id = new.learner_id),
    'UTC'
  )
  into learner_timezone;

  insert into public.active_days (learner_id, local_date, timezone)
  values (new.learner_id, (new.completed_at at time zone learner_timezone)::date, learner_timezone)
  on conflict (learner_id, local_date) do nothing;

  return null;
end;
$$;

create trigger lesson_record_active_day
after insert or update of status on public.lessons
for each row
execute function public.lesson_record_active_day();

create or replace function public.backfill_active_days()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  recorded_count integer;
begin
  insert into public.active_days (learner_id, local_date, timezone)
  select distinct
    lessons.learner_id,
    (lessons.completed_at at time zone coalesce(learner_timezones.timezone, 'UTC'))::date,
    coalesce(learner_timezones.timezone, 'UTC')
  from public.lessons
  left join public.learner_timezones on learner_timezones.learner_id = lessons.learner_id
  where lessons.status = 'completed'
  on conflict (learner_id, local_date) do nothing;

  get diagnostics recorded_count = row_count;

  return recorded_count;
end;
$$;

create or replace function public.daily_streak_at(p_moment timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  today date;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select (p_moment at time zone coalesce(
    (select timezone from public.learner_timezones where learner_id = current_learner_id),
    'UTC'
  ))::date
  into today;

  return (
    with days as (
      select local_date
      from public.active_days
      where learner_id = current_learner_id
    ), runs as (
      select max(local_date) as last_date, count(*)::integer as length
      from (
        select local_date, local_date - (row_number() over (order by local_date))::integer as run_key
        from days
      ) as numbered
      group by run_key
    ), latest as (
      select last_date, length
      from runs
      order by last_date desc
      limit 1
    )
    select jsonb_build_object(
      'current', coalesce((select length from latest where last_date >= today - 1), 0),
      'longest', coalesce((select max(length) from runs), 0),
      'extended_today', exists (select 1 from days where local_date >= today)
    )
  );
end;
$$;

create or replace function public.daily_streak()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.daily_streak_at(now());
$$;

revoke all on function public.report_learner_timezone(text) from public, anon, authenticated;
revoke all on function public.learner_timezone() from public, anon, authenticated;
revoke all on function public.lesson_record_active_day() from public, anon, authenticated;
revoke all on function public.backfill_active_days() from public, anon, authenticated;
revoke all on function public.daily_streak_at(timestamptz) from public, anon, authenticated;
revoke all on function public.daily_streak() from public, anon, authenticated;

grant execute on function public.report_learner_timezone(text) to authenticated;
grant execute on function public.learner_timezone() to authenticated;
grant execute on function public.daily_streak_at(timestamptz) to authenticated;
grant execute on function public.daily_streak() to authenticated;

select public.backfill_active_days();
