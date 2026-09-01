create or replace function public.set_vocabulary_entry_suspended(
  p_vocabulary_entry_id uuid,
  p_suspended boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  update public.vocabulary_entries
  set suspended = p_suspended
  where id = p_vocabulary_entry_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Vocabulary Entry is unavailable.';
  end if;
end;
$$;

revoke all on function public.set_vocabulary_entry_suspended(uuid, boolean) from public;
grant execute on function public.set_vocabulary_entry_suspended(uuid, boolean) to authenticated;
