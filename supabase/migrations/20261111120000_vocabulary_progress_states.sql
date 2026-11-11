create or replace function public.vocabulary_entry_progress_states(
  p_learner_id uuid,
  p_learning_language_id uuid
)
returns table (learning_vocabulary_entry_id uuid, state text)
language sql
stable
security definer
set search_path = ''
as $$
  with entry_scope as (
    select learning_vocabulary_entries.id
    from public.learning_vocabulary_entries
    where learning_vocabulary_entries.learner_id = p_learner_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and not learning_vocabulary_entries.suspended
  ), sense_streaks as (
    select
      vocabulary_entries.learning_vocabulary_entry_id,
      count(attempts.id) as attempt_count,
      count(attempts.id) filter (
        where attempts.is_correct
          and (last_incorrect.answered_at is null or attempts.answered_at > last_incorrect.answered_at)
      ) as practice_streak
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join entry_scope on entry_scope.id = vocabulary_entries.learning_vocabulary_entry_id
    left join lateral (
      select max(incorrect.answered_at) as answered_at
      from public.lesson_attempts as incorrect
      where incorrect.sense_id = senses.id
        and incorrect.learner_id = p_learner_id
        and not incorrect.is_correct
    ) as last_incorrect on true
    left join public.lesson_attempts as attempts
      on attempts.sense_id = senses.id
      and attempts.learner_id = p_learner_id
    where senses.learner_id = p_learner_id
    group by senses.id, vocabulary_entries.learning_vocabulary_entry_id, last_incorrect.answered_at
  )
  select
    entry_scope.id,
    case
      when count(sense_streaks.learning_vocabulary_entry_id) > 0
        and count(sense_streaks.learning_vocabulary_entry_id) filter (where sense_streaks.practice_streak < 2) = 0 then 'learned'
      when coalesce(sum(sense_streaks.attempt_count), 0) > 0 then 'in_practice'
      else 'new'
    end
  from entry_scope
  left join sense_streaks on sense_streaks.learning_vocabulary_entry_id = entry_scope.id
  group by entry_scope.id;
$$;

revoke all on function public.vocabulary_entry_progress_states(uuid, uuid) from public, anon, authenticated;

create or replace function public.vocabulary_progress(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  return (
    with entry_states as (
      select states.learning_vocabulary_entry_id, states.state
      from public.vocabulary_entry_progress_states(current_learner_id, p_learning_language_id) as states
    ), collection_states as (
      select
        collections.created_at,
        collections.id,
        jsonb_build_object(
          'id', collections.id,
          'name', collections.name,
          'new_count', count(entry_states.learning_vocabulary_entry_id) filter (where entry_states.state = 'new'),
          'in_practice_count', count(entry_states.learning_vocabulary_entry_id) filter (where entry_states.state = 'in_practice'),
          'learned_count', count(entry_states.learning_vocabulary_entry_id) filter (where entry_states.state = 'learned'),
          'total_count', count(entry_states.learning_vocabulary_entry_id)
        ) as progress
      from public.collections
      left join public.collection_memberships
        on collection_memberships.collection_id = collections.id
        and collection_memberships.learner_id = current_learner_id
      left join entry_states on entry_states.learning_vocabulary_entry_id = collection_memberships.learning_vocabulary_entry_id
      where collections.learner_id = current_learner_id
        and collections.learning_language_id = p_learning_language_id
      group by collections.id, collections.name, collections.created_at
    )
    select jsonb_build_object(
      'new_count', count(*) filter (where entry_states.state = 'new'),
      'in_practice_count', count(*) filter (where entry_states.state = 'in_practice'),
      'learned_count', count(*) filter (where entry_states.state = 'learned'),
      'total_count', count(*),
      'collections', (
        select coalesce(jsonb_agg(collection_states.progress order by collection_states.created_at, collection_states.id), '[]'::jsonb)
        from collection_states
      )
    )
    from entry_states
  );
end;
$$;

revoke all on function public.vocabulary_progress(uuid) from public, anon;
grant execute on function public.vocabulary_progress(uuid) to authenticated;

create or replace function public.vocabulary_progress_states(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id
    and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  return (
    select jsonb_build_object('entries', coalesce(jsonb_agg(
      jsonb_build_object(
        'learning_vocabulary_entry_id', states.learning_vocabulary_entry_id,
        'state', states.state
      )
      order by entries.created_at, states.learning_vocabulary_entry_id
    ), '[]'::jsonb))
    from public.vocabulary_entry_progress_states(current_learner_id, p_learning_language_id) as states
    join public.learning_vocabulary_entries as entries
      on entries.id = states.learning_vocabulary_entry_id
  );
end;
$$;

revoke all on function public.vocabulary_progress_states(uuid) from public, anon;
grant execute on function public.vocabulary_progress_states(uuid) to authenticated;
