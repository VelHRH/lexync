create or replace function public.review_session_questions_recompute_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.review_sessions as sessions
  set correct_count = counts.correct_count,
      total_count = counts.total_count
  from (
    select
      deleted.session_id,
      deleted.learner_id,
      count(attempts.id)::integer as total_count,
      count(*) filter (where attempts.is_correct)::integer as correct_count
    from old_rows as deleted
    left join public.review_attempts as attempts
      on attempts.session_id = deleted.session_id
      and attempts.learner_id = deleted.learner_id
    group by deleted.session_id, deleted.learner_id
  ) as counts
  where sessions.id = counts.session_id
    and sessions.learner_id = counts.learner_id
    and sessions.status = 'completed';

  return null;
end;
$$;

create trigger review_session_questions_recompute_completed
after delete on public.review_session_questions
referencing old table as old_rows
for each statement
execute function public.review_session_questions_recompute_completed();

revoke all on function public.review_session_questions_recompute_completed() from public, anon, authenticated;

create or replace function public.review_history(p_learning_language_id uuid)
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

  if not exists (
    select 1
    from public.learning_languages
    where id = p_learning_language_id
      and learner_id = current_learner_id
  ) then
    raise exception 'Learning Language is unavailable.';
  end if;

  return jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sessions.id,
          'learning_language_id', sessions.learning_language_id,
          'learning_language_tag', languages.language_tag,
          'completed_at', sessions.completed_at,
          'correct_count', sessions.correct_count,
          'total_count', sessions.total_count,
          'questions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', attempts.id,
                'question_id', questions.id,
                'sense_id', questions.sense_id,
                'ordinal', questions.ordinal,
                'prompt', questions.prompt,
                'question_type', questions.question_type,
                'direction', questions.direction,
                'selected_answer', attempts.selected_answer,
                'correct_answer', attempts.correct_answer,
                'is_correct', attempts.is_correct,
                'answered_at', attempts.answered_at
              ) order by questions.ordinal, questions.id
            )
            from public.review_attempts as attempts
            join public.review_session_questions as questions
              on questions.id = attempts.question_id
              and questions.session_id = attempts.session_id
              and questions.learner_id = attempts.learner_id
            where attempts.session_id = sessions.id
              and attempts.learner_id = current_learner_id
          ), '[]'::jsonb)
        ) order by sessions.completed_at desc, sessions.id desc
      )
      from public.review_sessions as sessions
      join public.learning_languages as languages
        on languages.id = sessions.learning_language_id
        and languages.learner_id = sessions.learner_id
      where sessions.learner_id = current_learner_id
        and sessions.status = 'completed'
    ), '[]'::jsonb),
    'sense_statistics', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sense_id', statistics.sense_id,
          'expression', statistics.expression,
          'practice_count', statistics.practice_count,
          'last_practiced_at', statistics.last_practiced_at
        ) order by statistics.created_at, statistics.sense_id
      )
      from (
        select
          senses.id as sense_id,
          vocabulary_entries.expression,
          senses.created_at,
          count(practice.answered_at)::integer as practice_count,
          max(practice.answered_at) as last_practiced_at
        from public.senses
        join public.vocabulary_entries
          on vocabulary_entries.id = senses.vocabulary_entry_id
          and vocabulary_entries.learner_id = senses.learner_id
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        left join lateral (
          select review_attempts.answered_at
          from public.review_attempts
          where review_attempts.sense_id = senses.id
            and review_attempts.learner_id = current_learner_id
          union all
          select review_participations.occurred_at
          from public.review_participations
          join public.cards
            on cards.id = review_participations.card_id
            and cards.learner_id = review_participations.learner_id
          where review_participations.learner_id = current_learner_id
            and cards.sense_id = senses.id
            and cards.learning_language_id = p_learning_language_id
        ) as practice on true
        where senses.learner_id = current_learner_id
          and vocabulary_entries.learning_language_id = p_learning_language_id
          and learning_vocabulary_entries.learning_language_id = p_learning_language_id
        group by senses.id, vocabulary_entries.expression, senses.created_at
      ) as statistics
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.review_history(uuid) from public, anon;
grant execute on function public.review_history(uuid) to authenticated;
