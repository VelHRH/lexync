create or replace function public.lesson_payload(p_lesson_id uuid, p_learner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', lessons.id,
    'learning_language_id', lessons.learning_language_id,
    'source', lessons.source,
    'collection_id', lessons.collection_id,
    'collection_name', (
      select collections.name
      from public.collections as collections
      where collections.id = lessons.collection_id
        and collections.learner_id = p_learner_id
    ),
    'status', lessons.status,
    'created_at', lessons.created_at,
    'completed_at', lessons.completed_at,
    'correct_count', lessons.correct_count,
    'total_count', lessons.total_count,
    'answered_count', (
      select count(*)
      from public.lesson_attempts as attempts
      where attempts.lesson_id = lessons.id
        and attempts.learner_id = p_learner_id
    ),
    'score', coalesce((
      select count(*) filter (where attempts.is_correct)::numeric / nullif(count(*), 0)
      from public.lesson_attempts as attempts
      where attempts.lesson_id = lessons.id
        and attempts.learner_id = p_learner_id
    ), 0),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', questions.id,
          'ordinal', questions.ordinal,
          'vocabulary_entry_id', questions.vocabulary_entry_id,
          'sense_id', questions.sense_id,
          'prompt', questions.prompt,
          'question_type', questions.question_type,
          'direction', questions.direction,
          'answer_language_tag', questions.answer_language_tag,
          'choices', to_jsonb(questions.choices),
          'selected_answer', questions.selected_answer,
          'continued_at', questions.continued_at,
          'correct_answer', case
            when questions.selected_answer is null then null
            else questions.correct_answer
          end,
          'is_correct', questions.is_correct,
          'answered_at', questions.answered_at
        ) order by questions.ordinal
      )
      from public.lesson_questions as questions
      where questions.lesson_id = lessons.id
        and questions.learner_id = p_learner_id
    ), '[]'::jsonb)
  )
  from public.lessons as lessons
  where lessons.id = p_lesson_id
    and lessons.learner_id = p_learner_id;
$$;

create or replace function public.lesson_history(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
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
    'lessons', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sessions.id,
          'learning_language_id', sessions.learning_language_id,
          'learning_language_tag', languages.language_tag,
          'source', sessions.source,
          'collection_id', sessions.collection_id,
          'collection_name', (
            select collections.name
            from public.collections as collections
            where collections.id = sessions.collection_id
              and collections.learner_id = current_learner_id
          ),
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
            from public.lesson_attempts as attempts
            join public.lesson_questions as questions
              on questions.id = attempts.question_id
              and questions.lesson_id = attempts.lesson_id
              and questions.learner_id = attempts.learner_id
            where attempts.lesson_id = sessions.id
              and attempts.learner_id = current_learner_id
          ), '[]'::jsonb)
        ) order by sessions.completed_at desc, sessions.id desc
      )
      from public.lessons as sessions
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
          select lesson_attempts.answered_at
          from public.lesson_attempts
          where lesson_attempts.sense_id = senses.id
            and lesson_attempts.learner_id = current_learner_id
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

drop function if exists public.vocabulary_lesson_eligible_sense_count(uuid);

create or replace function public.vocabulary_lesson_eligible_sense_count(
  p_learning_language_id uuid,
  p_collection_id uuid default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  eligible_count bigint;
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

  select count(*) into eligible_count
  from (
    select senses.id
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
      and not vocabulary_entries.suspended
      and not learning_vocabulary_entries.suspended
      and exists (
        select 1
        from public.translations
        where translations.sense_id = senses.id
          and translations.learner_id = senses.learner_id
          and length(btrim(translations.text)) > 0
      )
      and exists (
        select 1
        from public.senses as distractor_senses
        join public.vocabulary_entries as distractor_entries
          on distractor_entries.id = distractor_senses.vocabulary_entry_id
          and distractor_entries.learner_id = distractor_senses.learner_id
        join public.learning_vocabulary_entries as distractor_learning_entries
          on distractor_learning_entries.id = distractor_entries.learning_vocabulary_entry_id
          and distractor_learning_entries.learner_id = distractor_entries.learner_id
        join public.translations as distractor_translations
          on distractor_translations.sense_id = distractor_senses.id
          and distractor_translations.learner_id = distractor_senses.learner_id
        where distractor_senses.learner_id = current_learner_id
          and distractor_entries.learning_language_id = p_learning_language_id
          and distractor_learning_entries.learning_language_id = p_learning_language_id
          and public.lesson_collection_includes(p_collection_id, distractor_learning_entries.id)
          and not distractor_entries.suspended
          and not distractor_learning_entries.suspended
          and distractor_entries.id <> vocabulary_entries.id
          and length(btrim(distractor_translations.text)) > 0
          and not exists (
            select 1
            from public.translations as reviewed_translations
            where reviewed_translations.sense_id = senses.id
              and reviewed_translations.learner_id = current_learner_id
              and reviewed_translations.translation_identity = distractor_translations.translation_identity
          )
      )
  ) as eligible_senses;

  return eligible_count;
end;
$$;

revoke all on function public.vocabulary_lesson_eligible_sense_count(uuid, uuid) from public, anon;
grant execute on function public.vocabulary_lesson_eligible_sense_count(uuid, uuid) to authenticated;

create or replace function public.collection_practice_readiness(p_learning_language_id uuid)
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

  return jsonb_build_object(
    'minimum_entries', 8,
    'collections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'collection_id', readiness.collection_id,
          'entry_count', readiness.entry_count,
          'eligible_sense_count', readiness.eligible_sense_count,
          'can_practise', readiness.entry_count >= 8 and readiness.eligible_sense_count >= 2
        ) order by readiness.created_at, readiness.collection_id
      )
      from (
        select
          collections.id as collection_id,
          collections.created_at,
          (
            select count(*)
            from public.collection_memberships
            where collection_memberships.collection_id = collections.id
              and collection_memberships.learner_id = current_learner_id
          ) as entry_count,
          public.vocabulary_lesson_eligible_sense_count(p_learning_language_id, collections.id) as eligible_sense_count
        from public.collections
        where collections.learner_id = current_learner_id
          and collections.learning_language_id = p_learning_language_id
      ) as readiness
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.collection_practice_readiness(uuid) from public, anon;
grant execute on function public.collection_practice_readiness(uuid) to authenticated;
