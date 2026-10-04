alter table public.learning_materials
add column if not exists failure_reason text,
add constraint learning_materials_failure_reason_status_check
  check (failure_reason is null or status = 'failed');

create or replace function public.learning_material_clear_failure_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from 'failed' then
    new.failure_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists learning_materials_clear_failure_reason on public.learning_materials;

create trigger learning_materials_clear_failure_reason
before insert or update on public.learning_materials
for each row execute function public.learning_material_clear_failure_reason();

drop function if exists public.fail_learning_material(uuid, uuid, integer);

create or replace function public.fail_learning_material(
  p_material_id uuid,
  p_learning_language_id uuid,
  p_processing_version integer,
  p_failure_reason text default null
)
returns public.learning_materials
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_material public.learning_materials%rowtype;
  trimmed_failure_reason text := nullif(btrim(coalesce(p_failure_reason, '')), '');
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_material
  from public.learning_materials
  where id = p_material_id
  for update;

  if not found then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.learner_id is distinct from current_learner_id then
    raise exception 'another Learner cannot fail a private Learning Material';
  end if;

  if selected_material.learning_language_id is distinct from p_learning_language_id then
    raise exception 'failure rejects a wrong Learning Language';
  end if;

  if selected_material.status <> 'processing' then
    raise exception 'Learning Material is unavailable.';
  end if;

  if selected_material.processing_version is distinct from p_processing_version then
    raise exception 'stale failure is rejected';
  end if;

  delete from public.learning_material_passages
  where material_id = selected_material.id;

  update public.learning_materials
  set status = 'failed',
      normalized_text = null,
      failure_reason = left(trimmed_failure_reason, 500),
      updated_at = now()
  where id = selected_material.id
  returning * into selected_material;

  return selected_material;
end;
$$;

revoke all on function public.fail_learning_material(uuid, uuid, integer, text) from public, anon, authenticated;

grant execute on function public.fail_learning_material(uuid, uuid, integer, text) to authenticated;
