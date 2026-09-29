drop view public.lesson_attempts;
drop view public.lesson_questions;
drop view public.lessons;

alter table public.review_sessions rename to lessons;
alter table public.review_session_questions rename to lesson_questions;
alter table public.review_attempts rename to lesson_attempts;

alter table public.lesson_questions rename column session_id to lesson_id;
alter table public.lesson_questions rename column lesson_vocabulary_entry_id to vocabulary_entry_id;
alter table public.lesson_attempts rename column session_id to lesson_id;
alter table public.lesson_attempts rename column lesson_vocabulary_entry_id to vocabulary_entry_id;

alter index public.review_sessions_one_active rename to lessons_one_active;

do $$
declare
  constraint_row record;
  renamed_constraint text;
begin
  for constraint_row in
    select
      tables.relname as table_name,
      constraints.conname as constraint_name
    from pg_constraint as constraints
    join pg_class as tables on tables.oid = constraints.conrelid
    join pg_namespace as namespaces on namespaces.oid = tables.relnamespace
    where namespaces.nspname = 'public'
      and tables.relname in ('lessons', 'lesson_questions', 'lesson_attempts')
      and constraints.conname like 'review%'
  loop
    renamed_constraint := replace(constraint_row.constraint_name, 'review_session_questions', 'lesson_questions');
    renamed_constraint := replace(renamed_constraint, 'review_sessions', 'lessons');
    renamed_constraint := replace(renamed_constraint, 'review_attempts', 'lesson_attempts');
    renamed_constraint := replace(renamed_constraint, 'session_id', 'lesson_id');
    renamed_constraint := replace(renamed_constraint, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');

    execute format(
      'alter table public.%I rename constraint %I to %I',
      constraint_row.table_name,
      constraint_row.constraint_name,
      renamed_constraint
    );
  end loop;
end;
$$;

alter policy learner_reads_review_sessions on public.lessons rename to learner_reads_lessons;
alter policy learner_reads_review_session_questions on public.lesson_questions rename to learner_reads_lesson_questions;
alter policy learner_reads_review_attempts on public.lesson_attempts rename to learner_reads_lesson_attempts;

alter function public.review_set_vocabulary_entry() rename to lesson_set_vocabulary_entry;
alter function public.review_session_questions_recompute_completed() rename to lesson_questions_recompute_completed;
alter function public.review_cloze_prompt(text, text) rename to lesson_cloze_prompt;
revoke all on function public.lesson_cloze_prompt(text, text) from public, anon, authenticated;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.lesson_set_vocabulary_entry()'::regprocedure;

  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.preserve_dynamic_lesson_on_vocabulary_entry_delete()'::regprocedure;

  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.preserve_dynamic_lesson_on_sense_delete()'::regprocedure;

  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.lesson_questions_recompute_completed()'::regprocedure;

  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

alter trigger review_session_question_set_vocabulary_entry on public.lesson_questions rename to lesson_question_set_vocabulary_entry;
alter trigger review_attempt_set_vocabulary_entry on public.lesson_attempts rename to lesson_attempt_set_vocabulary_entry;
alter trigger review_session_questions_recompute_completed on public.lesson_questions rename to lesson_questions_recompute_completed;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.lesson_payload(uuid, uuid)'::regprocedure;

  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.lesson_overview(uuid)'::regprocedure;

  definition := replace(definition, 'review_session_prune_unavailable', 'lesson_prune_unavailable');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.review_session_prune_unavailable(uuid, uuid)'::regprocedure;

  definition := replace(definition, 'public.review_session_prune_unavailable', 'public.lesson_prune_unavailable');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  definition := replace(definition, 'Review Session', 'Lesson');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.start_or_resume_review_session(uuid)'::regprocedure;

  definition := replace(definition, 'public.start_or_resume_review_session', 'public.start_or_resume_vocabulary_lesson');
  definition := replace(definition, 'public.review_session_prune_unavailable', 'public.lesson_prune_unavailable');
  definition := replace(definition, 'public.review_session_payload', 'public.lesson_payload');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'public.review_cloze_prompt', 'public.lesson_cloze_prompt');
  definition := replace(definition, 'review_selected_senses', 'lesson_selected_senses');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  definition := replace(definition, 'app.review_session_min_questions', 'app.lesson_min_questions');
  definition := replace(definition, 'app.review_session_min_size', 'app.lesson_min_size');
  definition := replace(definition, 'app.review_session_max_questions', 'app.lesson_max_questions');
  definition := replace(definition, 'app.review_session_max_size', 'app.lesson_max_size');
  definition := replace(definition, 'Review Session', 'Lesson');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.review_session_eligible_sense_count(uuid)'::regprocedure;

  definition := replace(definition, 'public.review_session_eligible_sense_count', 'public.vocabulary_lesson_eligible_sense_count');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.submit_review_session_answer(uuid, uuid, text)'::regprocedure;

  definition := replace(definition, 'public.submit_review_session_answer', 'public.submit_lesson_answer');
  definition := replace(definition, 'public.review_session_prune_unavailable', 'public.lesson_prune_unavailable');
  definition := replace(definition, 'public.review_session_payload', 'public.lesson_payload');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  definition := replace(definition, 'Review Session', 'Lesson');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.continue_review_session_question(uuid, uuid)'::regprocedure;

  definition := replace(definition, 'public.continue_review_session_question', 'public.continue_lesson_question');
  definition := replace(definition, 'public.review_session_prune_unavailable', 'public.lesson_prune_unavailable');
  definition := replace(definition, 'public.review_session_payload', 'public.lesson_payload');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  definition := replace(definition, 'Review Session', 'Lesson');
  definition := replace(definition, 'Review Question', 'Lesson Question');
  execute definition;
end;
$$;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(oid)
  into definition
  from pg_proc
  where oid = 'public.review_history(uuid)'::regprocedure;

  definition := replace(definition, 'public.review_history', 'public.lesson_history');
  definition := replace(definition, 'review_sessions', 'lessons');
  definition := replace(definition, 'review_session_questions', 'lesson_questions');
  definition := replace(definition, 'review_attempts', 'lesson_attempts');
  definition := replace(definition, 'lesson_vocabulary_entry_id', 'vocabulary_entry_id');
  definition := replace(definition, 'session_id', 'lesson_id');
  definition := replace(definition, '''sessions''', '''lessons''');
  execute definition;
end;
$$;

drop function public.lesson_insert();
drop function public.lesson_question_insert();
drop function public.lesson_attempt_insert();

drop function public.review_session_overview(uuid);
drop function public.start_or_resume_review_session(uuid);
drop function public.review_session_eligible_sense_count(uuid);
drop function public.submit_review_session_answer(uuid, uuid, text);
drop function public.continue_review_session_question(uuid, uuid);
drop function public.review_history(uuid);
drop function public.review_session_payload(uuid, uuid);
drop function public.review_session_prune_unavailable(uuid, uuid);

revoke all on public.lessons, public.lesson_questions, public.lesson_attempts from anon, authenticated;
grant select on public.lessons, public.lesson_questions, public.lesson_attempts to authenticated;
grant select on public.lessons, public.lesson_questions, public.lesson_attempts to service_role;

revoke all on function public.lesson_set_vocabulary_entry() from public, anon, authenticated;
revoke all on function public.preserve_dynamic_lesson_on_vocabulary_entry_delete() from public, anon, authenticated;
revoke all on function public.preserve_dynamic_lesson_on_sense_delete() from public, anon, authenticated;
revoke all on function public.lesson_questions_recompute_completed() from public, anon, authenticated;
revoke all on function public.lesson_cloze_prompt(text, text) from public, anon, authenticated;
revoke all on function public.lesson_prune_unavailable(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lesson_payload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lesson_overview(uuid) from public, anon, authenticated;
revoke all on function public.start_or_resume_vocabulary_lesson(uuid) from public, anon, authenticated;
revoke all on function public.submit_lesson_answer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.continue_lesson_question(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vocabulary_lesson_eligible_sense_count(uuid) from public, anon;
revoke all on function public.lesson_history(uuid) from public, anon;
grant execute on function public.lesson_overview(uuid) to authenticated;
grant execute on function public.start_or_resume_vocabulary_lesson(uuid) to authenticated;
grant execute on function public.submit_lesson_answer(uuid, uuid, text) to authenticated;
grant execute on function public.continue_lesson_question(uuid, uuid) to authenticated;
grant execute on function public.vocabulary_lesson_eligible_sense_count(uuid) to authenticated;
grant execute on function public.lesson_history(uuid) to authenticated;
