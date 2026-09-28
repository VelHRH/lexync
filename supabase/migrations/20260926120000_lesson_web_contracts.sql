create or replace function public.vocabulary_lesson_eligible_sense_count(p_learning_language_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select public.review_session_eligible_sense_count(p_learning_language_id);
$$;

create or replace function public.lesson_history(p_learning_language_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lessons', history.payload->'sessions',
    'sense_statistics', history.payload->'sense_statistics'
  )
  from (
    select public.review_history(p_learning_language_id) as payload
  ) as history;
$$;

revoke all on function public.vocabulary_lesson_eligible_sense_count(uuid) from public, anon;
revoke all on function public.lesson_history(uuid) from public, anon;
grant execute on function public.vocabulary_lesson_eligible_sense_count(uuid) to authenticated;
grant execute on function public.lesson_history(uuid) to authenticated;
