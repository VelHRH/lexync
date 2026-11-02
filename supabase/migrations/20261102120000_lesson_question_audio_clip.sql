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
          'revealed_meaning', case
            when questions.selected_answer is null then null
            else questions.revealed_meaning
          end,
          'revealed_meaning_answer_language_tag', case
            when questions.selected_answer is null then null
            else questions.revealed_meaning_answer_language_tag
          end,
          'revealed_example', case
            when questions.selected_answer is null then null
            else questions.revealed_example
          end,
          'revealed_example_translation', case
            when questions.selected_answer is null then null
            else questions.revealed_example_translation
          end,
          'revealed_example_translation_answer_language_tag', case
            when questions.selected_answer is null then null
            else questions.revealed_example_translation_answer_language_tag
          end,
          'audio_clip_path', case
            when questions.selected_answer is null then null
            else recording.audio_clip_path
          end,
          'audio_clip_duration_ms', case
            when questions.selected_answer is null then null
            else recording.audio_clip_duration_ms
          end,
          'audio_clip_expression', case
            when questions.selected_answer is null then null
            else recording.expression
          end,
          'is_correct', questions.is_correct,
          'answered_at', questions.answered_at
        ) order by questions.ordinal
      )
      from public.lesson_questions as questions
      left join lateral (
        select
          entries.audio_clip_path,
          entries.audio_clip_duration_ms,
          entries.expression
        from public.vocabulary_entries as bridge
        join public.learning_vocabulary_entries as entries
          on entries.id = bridge.learning_vocabulary_entry_id
          and entries.learner_id = bridge.learner_id
        where bridge.id = questions.vocabulary_entry_id
          and bridge.learner_id = questions.learner_id
          and entries.audio_clip_path is not null
      ) as recording on true
      where questions.lesson_id = lessons.id
        and questions.learner_id = p_learner_id
    ), '[]'::jsonb)
  )
  from public.lessons as lessons
  where lessons.id = p_lesson_id
    and lessons.learner_id = p_learner_id;
$$;
