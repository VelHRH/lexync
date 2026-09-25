alter table public.review_sessions
add column source text not null default 'vocabulary',
add constraint review_sessions_source_check check (source in ('vocabulary', 'dynamic'));

alter table public.review_session_questions
add column lesson_vocabulary_entry_id uuid,
alter column sense_id drop not null;

alter table public.review_session_questions
drop constraint if exists review_session_questions_sense_id_learner_id_fkey;

alter table public.review_session_questions
add constraint review_session_questions_sense_id_learner_id_fkey
  foreign key (sense_id, learner_id)
  references public.senses(id, learner_id) on delete cascade,
add constraint review_session_questions_lesson_vocabulary_entry_id_learner_id_fkey
  foreign key (lesson_vocabulary_entry_id, learner_id)
  references public.vocabulary_entries(id, learner_id) on delete cascade;

alter table public.review_attempts
add column lesson_vocabulary_entry_id uuid,
alter column sense_id drop not null;

alter table public.review_attempts
drop constraint if exists review_attempts_sense_id_learner_id_fkey;

alter table public.review_attempts
add constraint review_attempts_sense_id_learner_id_fkey
  foreign key (sense_id, learner_id)
  references public.senses(id, learner_id) on delete cascade,
add constraint review_attempts_lesson_vocabulary_entry_id_learner_id_fkey
  foreign key (lesson_vocabulary_entry_id, learner_id)
  references public.vocabulary_entries(id, learner_id) on delete cascade;

update public.review_session_questions as questions
set lesson_vocabulary_entry_id = senses.vocabulary_entry_id
from public.senses
where questions.lesson_vocabulary_entry_id is null
  and questions.sense_id = senses.id
  and questions.learner_id = senses.learner_id;

update public.review_attempts as attempts
set lesson_vocabulary_entry_id = senses.vocabulary_entry_id
from public.senses
where attempts.lesson_vocabulary_entry_id is null
  and attempts.sense_id = senses.id
  and attempts.learner_id = senses.learner_id;

create or replace function public.review_session_question_set_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_vocabulary_entry_id is null and new.sense_id is not null and exists (
    select 1
    from public.review_sessions
    where id = new.session_id
      and learner_id = new.learner_id
      and source = 'vocabulary'
  ) then
    select senses.vocabulary_entry_id
    into new.lesson_vocabulary_entry_id
    from public.senses
    where senses.id = new.sense_id
      and senses.learner_id = new.learner_id;
  end if;

  return new;
end;
$$;

create trigger review_session_question_set_vocabulary_entry
before insert or update of sense_id, lesson_vocabulary_entry_id on public.review_session_questions
for each row
execute function public.review_session_question_set_vocabulary_entry();

create or replace function public.review_attempt_set_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_vocabulary_entry_id is null and new.sense_id is not null and exists (
    select 1
    from public.review_sessions
    where id = new.session_id
      and learner_id = new.learner_id
      and source = 'vocabulary'
  ) then
    select senses.vocabulary_entry_id
    into new.lesson_vocabulary_entry_id
    from public.senses
    where senses.id = new.sense_id
      and senses.learner_id = new.learner_id;
  end if;

  return new;
end;
$$;

create trigger review_attempt_set_vocabulary_entry
before insert or update of sense_id, lesson_vocabulary_entry_id on public.review_attempts
for each row
execute function public.review_attempt_set_vocabulary_entry();

create or replace function public.review_session_prune_unavailable(
  p_session_id uuid,
  p_learner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.review_sessions
  where id = p_session_id
    and learner_id = p_learner_id
  for update;

  if exists (
    select 1
    from public.review_sessions
    where id = p_session_id
      and learner_id = p_learner_id
      and source = 'dynamic'
  ) then
    return;
  end if;

  delete from public.review_session_questions as questions
  where questions.session_id = p_session_id
    and questions.learner_id = p_learner_id
    and questions.selected_answer is null
    and not exists (
      select 1
      from public.senses
      join public.vocabulary_entries
        on vocabulary_entries.id = senses.vocabulary_entry_id
        and vocabulary_entries.learner_id = senses.learner_id
      join public.learning_vocabulary_entries
        on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
        and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
      where senses.id = questions.sense_id
        and senses.learner_id = questions.learner_id
        and not vocabulary_entries.suspended
        and not learning_vocabulary_entries.suspended
    );

  delete from public.review_session_questions as questions
  where questions.session_id = p_session_id
    and questions.learner_id = p_learner_id
    and questions.selected_answer is null
    and questions.question_type = 'translation'
    and questions.choice_sense_ids is not null
    and (
      select count(*)
      from generate_subscripts(questions.choices, 1) as choice(position)
      where exists (
        select 1
        from public.senses
        join public.vocabulary_entries
          on vocabulary_entries.id = senses.vocabulary_entry_id
          and vocabulary_entries.learner_id = senses.learner_id
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        where senses.id = questions.choice_sense_ids[choice.position]
          and senses.learner_id = questions.learner_id
          and not vocabulary_entries.suspended
          and not learning_vocabulary_entries.suspended
      )
    ) < 2;

  delete from public.review_session_questions as questions
  where questions.session_id = p_session_id
    and questions.learner_id = p_learner_id
    and questions.selected_answer is null
    and questions.question_type = 'cloze'
    and questions.choice_vocabulary_entry_ids is not null
    and (
      select count(*)
      from generate_subscripts(questions.choices, 1) as choice(position)
      where exists (
        select 1
        from public.vocabulary_entries
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        where vocabulary_entries.id = questions.choice_vocabulary_entry_ids[choice.position]
          and vocabulary_entries.learner_id = questions.learner_id
          and not vocabulary_entries.suspended
          and not learning_vocabulary_entries.suspended
      )
    ) < 2;

  with surviving as (
    select
      questions.id,
      array_agg(questions.choices[choice.position] order by choice.position) as choices,
      array_agg(questions.choice_sense_ids[choice.position] order by choice.position) as choice_sense_ids
    from public.review_session_questions as questions
    cross join lateral generate_subscripts(questions.choices, 1) as choice(position)
    where questions.session_id = p_session_id
      and questions.learner_id = p_learner_id
      and questions.selected_answer is null
      and questions.question_type = 'translation'
      and questions.choice_sense_ids is not null
      and exists (
        select 1
        from public.senses
        join public.vocabulary_entries
          on vocabulary_entries.id = senses.vocabulary_entry_id
          and vocabulary_entries.learner_id = senses.learner_id
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = senses.learner_id
        where senses.id = questions.choice_sense_ids[choice.position]
          and senses.learner_id = questions.learner_id
          and not vocabulary_entries.suspended
          and not learning_vocabulary_entries.suspended
      )
    group by questions.id
    having count(*) >= 2
  )
  update public.review_session_questions as questions
  set choices = surviving.choices,
      choice_sense_ids = surviving.choice_sense_ids
  from surviving
  where questions.id = surviving.id;

  with surviving as (
    select
      questions.id,
      array_agg(questions.choices[choice.position] order by choice.position) as choices,
      array_agg(questions.choice_vocabulary_entry_ids[choice.position] order by choice.position) as choice_vocabulary_entry_ids
    from public.review_session_questions as questions
    cross join lateral generate_subscripts(questions.choices, 1) as choice(position)
    where questions.session_id = p_session_id
      and questions.learner_id = p_learner_id
      and questions.selected_answer is null
      and questions.question_type = 'cloze'
      and questions.choice_vocabulary_entry_ids is not null
      and exists (
        select 1
        from public.vocabulary_entries
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        where vocabulary_entries.id = questions.choice_vocabulary_entry_ids[choice.position]
          and vocabulary_entries.learner_id = questions.learner_id
          and not vocabulary_entries.suspended
          and not learning_vocabulary_entries.suspended
      )
    group by questions.id
    having count(*) >= 2
  )
  update public.review_session_questions as questions
  set choices = surviving.choices,
      choice_vocabulary_entry_ids = surviving.choice_vocabulary_entry_ids
  from surviving
  where questions.id = surviving.id;

  delete from public.review_sessions as sessions
  where sessions.id = p_session_id
    and sessions.learner_id = p_learner_id
    and sessions.status = 'active'
    and not exists (
      select 1
      from public.review_session_questions
      where session_id = p_session_id
        and learner_id = p_learner_id
    );

  with question_counts as (
    select
      count(*)::integer as total_count,
      count(*) filter (where is_correct)::integer as correct_count
    from public.review_session_questions
    where session_id = p_session_id
      and learner_id = p_learner_id
  )
  update public.review_sessions as sessions
  set total_count = question_counts.total_count,
      correct_count = least(question_counts.correct_count, question_counts.total_count)
  from question_counts
  where sessions.id = p_session_id
    and sessions.learner_id = p_learner_id;
end;
$$;

revoke all on function public.review_session_prune_unavailable(uuid, uuid) from public, anon, authenticated;

create view public.lessons
with (security_invoker = true)
as
select
  id,
  learner_id,
  learning_language_id,
  source,
  status,
  created_at,
  completed_at,
  correct_count,
  total_count
from public.review_sessions;

create view public.lesson_questions
with (security_invoker = true)
as
select
  id,
  session_id as lesson_id,
  learner_id,
  lesson_vocabulary_entry_id as vocabulary_entry_id,
  sense_id,
  ordinal,
  prompt,
  question_type,
  direction,
  answer_language_tag,
  choices,
  choice_sense_ids,
  choice_vocabulary_entry_ids,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at,
  continued_at
from public.review_session_questions;

create view public.lesson_attempts
with (security_invoker = true)
as
select
  id,
  session_id as lesson_id,
  question_id,
  learner_id,
  lesson_vocabulary_entry_id as vocabulary_entry_id,
  sense_id,
  question_type,
  direction,
  selected_answer,
  correct_answer,
  is_correct,
  answered_at
from public.review_attempts;

revoke all on public.lessons, public.lesson_questions, public.lesson_attempts from anon, authenticated;
grant select, insert on public.lessons, public.lesson_questions, public.lesson_attempts to authenticated;
grant select, insert on public.lessons, public.lesson_questions, public.lesson_attempts to service_role;

create or replace function public.lesson_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'permission denied for table lessons' using errcode = '42501';
  end if;

  insert into public.review_sessions (
    id,
    learner_id,
    learning_language_id,
    source,
    status,
    created_at,
    completed_at,
    correct_count,
    total_count
  ) values (
    coalesce(new.id, gen_random_uuid()),
    coalesce(new.learner_id, auth.uid()),
    new.learning_language_id,
    coalesce(new.source, 'vocabulary'),
    coalesce(new.status, 'active'),
    coalesce(new.created_at, now()),
    new.completed_at,
    coalesce(new.correct_count, 0),
    coalesce(new.total_count, 1)
  );

  return new;
end;
$$;

create trigger lessons_insert
instead of insert on public.lessons
for each row
execute function public.lesson_insert();

create or replace function public.lesson_question_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'permission denied for table lesson_questions' using errcode = '42501';
  end if;

  insert into public.review_session_questions (
    id,
    session_id,
    learner_id,
    lesson_vocabulary_entry_id,
    sense_id,
    ordinal,
    prompt,
    question_type,
    direction,
    answer_language_tag,
    choices,
    choice_sense_ids,
    choice_vocabulary_entry_ids,
    selected_answer,
    correct_answer,
    is_correct,
    answered_at,
    continued_at
  ) values (
    coalesce(new.id, gen_random_uuid()),
    new.lesson_id,
    coalesce(new.learner_id, auth.uid()),
    new.vocabulary_entry_id,
    new.sense_id,
    new.ordinal,
    new.prompt,
    new.question_type,
    new.direction,
    new.answer_language_tag,
    new.choices,
    new.choice_sense_ids,
    new.choice_vocabulary_entry_ids,
    new.selected_answer,
    new.correct_answer,
    new.is_correct,
    new.answered_at,
    new.continued_at
  );

  return new;
end;
$$;

create trigger lesson_questions_insert
instead of insert on public.lesson_questions
for each row
execute function public.lesson_question_insert();

create or replace function public.lesson_attempt_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'permission denied for table lesson_attempts' using errcode = '42501';
  end if;

  insert into public.review_attempts (
    id,
    session_id,
    question_id,
    learner_id,
    lesson_vocabulary_entry_id,
    sense_id,
    question_type,
    direction,
    selected_answer,
    correct_answer,
    is_correct,
    answered_at
  ) values (
    coalesce(new.id, gen_random_uuid()),
    new.lesson_id,
    new.question_id,
    coalesce(new.learner_id, auth.uid()),
    new.vocabulary_entry_id,
    new.sense_id,
    new.question_type,
    new.direction,
    new.selected_answer,
    new.correct_answer,
    new.is_correct,
    coalesce(new.answered_at, now())
  );

  return new;
end;
$$;

create trigger lesson_attempts_insert
instead of insert on public.lesson_attempts
for each row
execute function public.lesson_attempt_insert();

revoke all on function public.lesson_insert() from public, anon, authenticated;
revoke all on function public.lesson_question_insert() from public, anon, authenticated;
revoke all on function public.lesson_attempt_insert() from public, anon, authenticated;

create or replace function public.lesson_payload(
  p_lesson_id uuid,
  p_learner_id uuid
)
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
    'status', lessons.status,
    'created_at', lessons.created_at,
    'completed_at', lessons.completed_at,
    'correct_count', lessons.correct_count,
    'total_count', lessons.total_count,
    'answered_count', (
      select count(*)
      from public.review_attempts as attempts
      where attempts.session_id = lessons.id
        and attempts.learner_id = p_learner_id
    ),
    'score', coalesce((
      select count(*) filter (where attempts.is_correct)::numeric / nullif(count(*), 0)
      from public.review_attempts as attempts
      where attempts.session_id = lessons.id
        and attempts.learner_id = p_learner_id
    ), 0),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', questions.id,
          'ordinal', questions.ordinal,
          'vocabulary_entry_id', questions.lesson_vocabulary_entry_id,
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
      from public.review_session_questions as questions
      where questions.session_id = lessons.id
        and questions.learner_id = p_learner_id
    ), '[]'::jsonb)
  )
  from public.review_sessions as lessons
  where lessons.id = p_lesson_id
    and lessons.learner_id = p_learner_id;
$$;

create or replace function public.lesson_overview(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_lesson_id uuid;
  selected_source text;
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

  select id, source
  into selected_lesson_id, selected_source
  from public.review_sessions
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  order by created_at desc, id desc
  limit 1;

  if selected_lesson_id is not null and selected_source = 'vocabulary' then
    perform public.review_session_prune_unavailable(selected_lesson_id, current_learner_id);
    if not exists (
      select 1
      from public.review_sessions
      where id = selected_lesson_id
        and learner_id = current_learner_id
        and status = 'active'
    ) then
      selected_lesson_id := null;
    end if;
  end if;

  if selected_lesson_id is null then
    select id
    into selected_lesson_id
    from public.review_sessions
    where learner_id = current_learner_id
      and learning_language_id = p_learning_language_id
      and status = 'completed'
    order by completed_at desc, id desc
    limit 1;
  end if;

  if selected_lesson_id is null then
    return null;
  end if;

  return public.lesson_payload(selected_lesson_id, current_learner_id);
end;
$$;

create or replace function public.start_or_resume_vocabulary_lesson(p_learning_language_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  result jsonb;
begin
  result := public.start_or_resume_review_session(p_learning_language_id);
  if result is null then
    return null;
  end if;

  return public.lesson_payload((result->>'id')::uuid, current_learner_id);
end;
$$;

create or replace function public.submit_lesson_answer(
  p_lesson_id uuid,
  p_question_id uuid,
  p_selected_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  result jsonb;
begin
  result := public.submit_review_session_answer(p_lesson_id, p_question_id, p_selected_choice);
  if result is null then
    return null;
  end if;

  return public.lesson_payload(p_lesson_id, current_learner_id);
end;
$$;

create or replace function public.continue_lesson_question(
  p_lesson_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  result jsonb;
begin
  result := public.continue_review_session_question(p_lesson_id, p_question_id);
  if result is null then
    return null;
  end if;

  return public.lesson_payload(p_lesson_id, current_learner_id);
end;
$$;

revoke all on function public.lesson_payload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lesson_overview(uuid) from public, anon, authenticated;
revoke all on function public.start_or_resume_vocabulary_lesson(uuid) from public, anon, authenticated;
revoke all on function public.submit_lesson_answer(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.continue_lesson_question(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lesson_overview(uuid) to authenticated;
grant execute on function public.start_or_resume_vocabulary_lesson(uuid) to authenticated;
grant execute on function public.submit_lesson_answer(uuid, uuid, text) to authenticated;
grant execute on function public.continue_lesson_question(uuid, uuid) to authenticated;
