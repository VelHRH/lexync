create or replace function public.lesson_by_id(p_lesson_id uuid)
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
  from public.lessons
  where id = p_lesson_id
    and learner_id = current_learner_id;

  if not found then
    return null;
  end if;

  return public.lesson_payload(p_lesson_id, current_learner_id);
end;
$$;

revoke all on function public.lesson_by_id(uuid) from public, anon, authenticated;
grant execute on function public.lesson_by_id(uuid) to authenticated;
