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
    with entry_scope as (
      select learning_vocabulary_entries.id
      from public.learning_vocabulary_entries
      where learning_vocabulary_entries.learner_id = current_learner_id
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
          and incorrect.learner_id = current_learner_id
          and not incorrect.is_correct
      ) as last_incorrect on true
      left join public.lesson_attempts as attempts
        on attempts.sense_id = senses.id
        and attempts.learner_id = current_learner_id
      where senses.learner_id = current_learner_id
      group by senses.id, vocabulary_entries.learning_vocabulary_entry_id, last_incorrect.answered_at
    ), entry_states as (
      select
        entry_scope.id,
        coalesce(sum(sense_streaks.attempt_count), 0) > 0 as practised,
        count(sense_streaks.learning_vocabulary_entry_id) > 0
          and count(sense_streaks.learning_vocabulary_entry_id) filter (where sense_streaks.practice_streak < 2) = 0 as learned
      from entry_scope
      left join sense_streaks on sense_streaks.learning_vocabulary_entry_id = entry_scope.id
      group by entry_scope.id
    )
    select jsonb_build_object(
      'new_count', count(*) filter (where not practised),
      'in_practice_count', count(*) filter (where practised and not learned),
      'learned_count', count(*) filter (where learned),
      'total_count', count(*)
    )
    from entry_states
  );
end;
$$;

revoke all on function public.vocabulary_progress(uuid) from public, anon;
grant execute on function public.vocabulary_progress(uuid) to authenticated;
