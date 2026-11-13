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
        and count(sense_streaks.learning_vocabulary_entry_id) filter (where sense_streaks.practice_streak < 5) = 0 then 'learned'
      when coalesce(sum(sense_streaks.attempt_count), 0) > 0 then 'in_practice'
      else 'new'
    end
  from entry_scope
  left join sense_streaks on sense_streaks.learning_vocabulary_entry_id = entry_scope.id
  group by entry_scope.id;
$$;

revoke all on function public.vocabulary_entry_progress_states(uuid, uuid) from public, anon, authenticated;
