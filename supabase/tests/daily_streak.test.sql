begin;

select plan(24);

insert into auth.users (id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');

set local role postgres;

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'es', '2026-09-01T00:00:00Z'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fr', '2026-09-01T00:00:01Z'),
  ('d1000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'es', '2026-09-01T00:00:00Z'),
  ('d1000000-0000-0000-0000-000000000004', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'es', '2026-09-01T00:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select throws_ok(
  $$select public.report_learner_timezone('Mars/Olympus_Mons')$$,
  'Learner Timezone is not a recognised IANA timezone.',
  'an unknown timezone name is rejected'
);

select lives_ok(
  $$select public.report_learner_timezone('America/New_York')$$,
  'a Learner reports an IANA timezone'
);

select is(
  public.learner_timezone(),
  'America/New_York',
  'the Learner reads back the timezone they reported'
);

set local role postgres;

insert into public.lessons (id, learner_id, learning_language_id, source, status, created_at)
values
  ('d2000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001', 'vocabulary', 'active', '2026-11-10T03:00:00Z'),
  ('d2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000002', 'dynamic', 'active', '2026-11-10T03:30:00Z');

select is(
  (select count(*)::integer from public.active_days where learner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'an unfinished Lesson creates no Active Day'
);

update public.lessons
set status = 'completed', completed_at = '2026-11-10T04:30:00Z'
where id = 'd2000000-0000-0000-0000-000000000001';

select results_eq(
  $$select local_date from public.active_days where learner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values ('2026-11-09'::date)$$,
  'a completion at 04:30 UTC is an Active Day on the previous local date in New York'
);

update public.lessons
set status = 'completed', completed_at = '2026-11-10T04:50:00Z'
where id = 'd2000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::integer from public.active_days where learner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'a second completion on the same local date, in another Learning Language and source, adds no Active Day'
);

insert into public.lessons (id, learner_id, learning_language_id, status, created_at)
values ('d2000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd1000000-0000-0000-0000-000000000001', 'active', '2026-11-11T03:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select ok(
  public.discard_lesson('d2000000-0000-0000-0000-000000000003'),
  'the Learner discards an unfinished Lesson'
);

select is(
  (select count(*)::integer from public.active_days),
  1,
  'a discarded Lesson creates no Active Day'
);

select lives_ok(
  $$select public.report_learner_timezone('Asia/Tokyo')$$,
  'the Learner reports a new timezone'
);

select results_eq(
  $$select local_date from public.active_days$$,
  $$values ('2026-11-09'::date)$$,
  'changing the Learner Timezone never moves an existing Active Day'
);

set local role postgres;

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values
  ('d2000000-0000-0000-0000-000000000010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000012', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-03T09:00:00Z', '2026-11-03T10:00:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000013', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000014', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-07T09:00:00Z', '2026-11-07T10:00:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000015', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd1000000-0000-0000-0000-000000000003', 'completed', '2026-11-08T09:00:00Z', '2026-11-08T10:00:00Z', 1, 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

select is(
  public.daily_streak_at('2026-11-08T20:00:00Z'),
  '{"current": 2, "longest": 4, "extended_today": true}'::jsonb,
  'after a gap the Daily Streak resets while the Longest Daily Streak survives'
);

select is(
  public.daily_streak_at('2026-11-09T20:00:00Z'),
  '{"current": 2, "longest": 4, "extended_today": false}'::jsonb,
  'the Daily Streak is kept through today when yesterday was an Active Day'
);

select is(
  public.daily_streak_at('2026-11-10T20:00:00Z'),
  '{"current": 0, "longest": 4, "extended_today": false}'::jsonb,
  'the Daily Streak is 0 once a whole local day passes without an Active Day'
);

select is(
  public.daily_streak(),
  public.daily_streak_at(now()),
  'the Daily Streak read uses the current moment'
);

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);

select is(
  public.daily_streak_at('2026-11-10T12:00:00Z'),
  '{"current": 1, "longest": 1, "extended_today": false}'::jsonb,
  'the Daily Streak counts today in the Learner Timezone, here Tokyo'
);

select is(
  (select count(*)::integer from public.active_days),
  1,
  'a Learner reads only their own Active Days'
);

select is(
  (select count(*)::integer from public.learner_timezones),
  1,
  'a Learner reads only their own Learner Timezone'
);

select throws_ok(
  $$insert into public.active_days (learner_id, local_date, timezone) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-01', 'UTC')$$,
  '42501',
  null,
  'a Learner cannot write Active Days directly'
);

select throws_ok(
  $$update public.learner_timezones set timezone = 'UTC' where learner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  '42501',
  null,
  'a Learner cannot write another Learner Timezone directly'
);

set local role postgres;

insert into public.learner_timezones (learner_id, timezone)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Pacific/Auckland');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values
  ('d2000000-0000-0000-0000-000000000020', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'd1000000-0000-0000-0000-000000000004', 'completed', '2026-11-01T10:00:00Z', '2026-11-01T11:30:00Z', 1, 1),
  ('d2000000-0000-0000-0000-000000000021', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'd1000000-0000-0000-0000-000000000004', 'active', '2026-11-02T10:00:00Z', null, 0, 1);

delete from public.active_days
where learner_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

select is(
  public.backfill_active_days(),
  8,
  'the backfill records one Active Day per Learner and local date of every completed Lesson'
);

select results_eq(
  $$select learner_id, local_date, timezone from public.active_days where learner_id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc') order by learner_id$$,
  $$values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '2026-11-10'::date, 'Asia/Tokyo'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, '2026-11-02'::date, 'Pacific/Auckland')$$,
  'the backfill converts completions with each Learner Timezone'
);

select results_eq(
  $$select local_date, timezone from public.active_days where learner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' order by local_date limit 1$$,
  $$values ('2026-11-01'::date, 'UTC')$$,
  'the backfill uses UTC for a Learner who never reported a timezone'
);

select is(
  public.backfill_active_days(),
  0,
  'running the backfill again records nothing'
);

set local role anon;

select throws_ok(
  $$select public.daily_streak()$$,
  '42501',
  null,
  'anonymous clients cannot read a Daily Streak'
);

select * from finish();
rollback;
