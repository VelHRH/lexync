create or replace function public.discard_lesson(p_lesson_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  discarded_count integer;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.lessons
  where id = p_lesson_id
    and learner_id = current_learner_id
    and status = 'active';

  get diagnostics discarded_count = row_count;

  return discarded_count > 0;
end;
$$;

revoke all on function public.discard_lesson(uuid) from public, anon, authenticated;

grant execute on function public.discard_lesson(uuid) to authenticated;
