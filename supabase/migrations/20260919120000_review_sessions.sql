create table public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  learning_language_id uuid not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  correct_count integer not null default 0 check (correct_count >= 0 and correct_count <= total_count),
  total_count integer not null default 1 check (total_count = 1),
  unique (id, learner_id),
  foreign key (learning_language_id, learner_id)
    references public.learning_languages(id, learner_id) on delete cascade,
  check ((status = 'completed') = (completed_at is not null)),
  check (status = 'active' or correct_count is not null),
  check (status = 'active' or correct_count <= total_count),
  check (status = 'active' or completed_at is not null)
);

create unique index review_sessions_one_active
on public.review_sessions (learner_id, learning_language_id)
where status = 'active';

create table public.review_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  learner_id uuid not null default auth.uid(),
  sense_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  prompt text not null check (length(btrim(prompt)) > 0),
  question_type text not null check (question_type = 'translation'),
  direction text not null check (direction = 'recognition'),
  answer_language_tag text not null check (length(btrim(answer_language_tag)) > 0),
  choices text[] not null check (cardinality(choices) >= 2),
  selected_answer text,
  correct_answer text not null check (length(btrim(correct_answer)) > 0),
  is_correct boolean,
  answered_at timestamptz,
  unique (id, session_id, learner_id),
  unique (session_id, ordinal, learner_id),
  foreign key (session_id, learner_id)
    references public.review_sessions(id, learner_id) on delete cascade,
  foreign key (sense_id, learner_id)
    references public.senses(id, learner_id) on delete cascade,
  check ((selected_answer is null) = (answered_at is null)),
  check ((selected_answer is null) = (is_correct is null))
);

create table public.review_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  question_id uuid not null,
  learner_id uuid not null default auth.uid(),
  sense_id uuid not null,
  question_type text not null check (question_type = 'translation'),
  direction text not null check (direction = 'recognition'),
  selected_answer text not null,
  correct_answer text not null,
  is_correct boolean not null,
  answered_at timestamptz not null,
  unique (id, learner_id),
  unique (session_id, question_id, learner_id),
  foreign key (session_id, learner_id)
    references public.review_sessions(id, learner_id) on delete cascade,
  foreign key (question_id, session_id, learner_id)
    references public.review_session_questions(id, session_id, learner_id) on delete cascade,
  foreign key (sense_id, learner_id)
    references public.senses(id, learner_id) on delete cascade
);

alter table public.review_sessions enable row level security;
alter table public.review_session_questions enable row level security;
alter table public.review_attempts enable row level security;

create policy learner_reads_review_sessions on public.review_sessions
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_review_session_questions on public.review_session_questions
for select to authenticated
using ((select auth.uid()) = learner_id);

create policy learner_reads_review_attempts on public.review_attempts
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.review_sessions from anon, authenticated;
revoke all on public.review_session_questions from anon, authenticated;
revoke all on public.review_attempts from anon, authenticated;
grant select on public.review_sessions to authenticated;
grant select on public.review_session_questions to authenticated;
grant select on public.review_attempts to authenticated;

create or replace function public.review_session_payload(
  p_session_id uuid,
  p_learner_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', review_sessions.id,
    'learning_language_id', review_sessions.learning_language_id,
    'status', review_sessions.status,
    'created_at', review_sessions.created_at,
    'completed_at', review_sessions.completed_at,
    'correct_count', review_sessions.correct_count,
    'total_count', review_sessions.total_count,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', review_session_questions.id,
          'ordinal', review_session_questions.ordinal,
          'sense_id', review_session_questions.sense_id,
          'prompt', review_session_questions.prompt,
          'question_type', review_session_questions.question_type,
          'direction', review_session_questions.direction,
          'answer_language_tag', review_session_questions.answer_language_tag,
          'choices', to_jsonb(review_session_questions.choices),
          'selected_answer', review_session_questions.selected_answer,
          'correct_answer', case
            when review_session_questions.selected_answer is null then null
            else review_session_questions.correct_answer
          end,
          'is_correct', review_session_questions.is_correct,
          'answered_at', review_session_questions.answered_at
        ) order by review_session_questions.ordinal
      )
      from public.review_session_questions
      where review_session_questions.session_id = review_sessions.id
        and review_session_questions.learner_id = p_learner_id
    ), '[]'::jsonb)
  )
  from public.review_sessions
  where review_sessions.id = p_session_id
    and review_sessions.learner_id = p_learner_id;
$$;

create or replace function public.review_session_overview(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_session_id uuid;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  select id into selected_session_id
  from public.review_sessions
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  order by created_at desc, id desc
  limit 1;

  if selected_session_id is null then
    select id into selected_session_id
    from public.review_sessions
    where learner_id = current_learner_id
      and learning_language_id = p_learning_language_id
      and status = 'completed'
    order by completed_at desc, id desc
    limit 1;
  end if;

  if selected_session_id is null then
    return null;
  end if;

  return public.review_session_payload(selected_session_id, current_learner_id);
end;
$$;

create or replace function public.start_or_resume_review_session(p_learning_language_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_session_id uuid;
  selected_sense_id uuid;
  selected_prompt text;
  selected_answer_language_tag text;
  selected_correct_answer text;
  selected_choices text[];
  distinct_sense_count bigint;
  distinct_choice_count bigint;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    current_learner_id::text || p_learning_language_id::text,
    0
  ));

  perform 1
  from public.learning_languages
  where id = p_learning_language_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Learning Language is unavailable.';
  end if;

  select id into selected_session_id
  from public.review_sessions
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  order by created_at desc, id desc
  limit 1;

  if selected_session_id is not null then
    return public.review_session_payload(selected_session_id, current_learner_id);
  end if;

  select
    count(distinct senses.id),
    count(distinct translations.text)
  into distinct_sense_count, distinct_choice_count
  from public.senses
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = senses.learner_id
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = senses.learner_id
  where senses.learner_id = current_learner_id
    and vocabulary_entries.learning_language_id = p_learning_language_id
    and learning_vocabulary_entries.learning_language_id = p_learning_language_id
    and not learning_vocabulary_entries.suspended
    and length(btrim(translations.text)) > 0;

  if distinct_sense_count < 2 or distinct_choice_count < 2 then
    raise exception 'At least two eligible Senses are required to start a Review Session.';
  end if;

  select
    senses.id,
    vocabulary_entries.expression,
    translations.answer_language_tag,
    translations.text
  into
    selected_sense_id,
    selected_prompt,
    selected_answer_language_tag,
    selected_correct_answer
  from public.senses
  join public.vocabulary_entries
    on vocabulary_entries.id = senses.vocabulary_entry_id
    and vocabulary_entries.learner_id = senses.learner_id
  join public.learning_vocabulary_entries
    on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
    and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
  join public.translations
    on translations.sense_id = senses.id
    and translations.learner_id = senses.learner_id
  where senses.learner_id = current_learner_id
    and vocabulary_entries.learning_language_id = p_learning_language_id
    and learning_vocabulary_entries.learning_language_id = p_learning_language_id
    and not learning_vocabulary_entries.suspended
    and length(btrim(translations.text)) > 0
  order by senses.created_at, senses.id, translations.created_at, translations.id
  limit 1;

  select array_agg(choice.text order by choice.text)
  into selected_choices
  from (
    select distinct translations.text as text
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    join public.translations
      on translations.sense_id = senses.id
      and translations.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and not learning_vocabulary_entries.suspended
      and length(btrim(translations.text)) > 0
  ) as choice;

  insert into public.review_sessions (
    learner_id,
    learning_language_id,
    status,
    total_count
  ) values (
    current_learner_id,
    p_learning_language_id,
    'active',
    1
  ) returning id into selected_session_id;

  insert into public.review_session_questions (
    session_id,
    learner_id,
    sense_id,
    ordinal,
    prompt,
    question_type,
    direction,
    answer_language_tag,
    choices,
    correct_answer
  ) values (
    selected_session_id,
    current_learner_id,
    selected_sense_id,
    1,
    selected_prompt,
    'translation',
    'recognition',
    selected_answer_language_tag,
    selected_choices,
    selected_correct_answer
  );

  return public.review_session_payload(selected_session_id, current_learner_id);
end;
$$;

create or replace function public.submit_review_session_answer(
  p_session_id uuid,
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
  selected_session public.review_sessions%rowtype;
  selected_question public.review_session_questions%rowtype;
  answer_timestamp timestamptz;
  answer_correct boolean;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into selected_session
  from public.review_sessions
  where id = p_session_id and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Review Session is unavailable.';
  end if;

  select * into selected_question
  from public.review_session_questions
  where id = p_question_id
    and session_id = p_session_id
    and learner_id = current_learner_id
  for update;

  if not found then
    raise exception 'Review Question is unavailable.';
  end if;

  if selected_question.selected_answer is not null then
    return public.review_session_payload(p_session_id, current_learner_id);
  end if;

  if selected_session.status <> 'active' then
    return public.review_session_payload(p_session_id, current_learner_id);
  end if;

  if p_selected_choice is null or not (p_selected_choice = any(selected_question.choices)) then
    raise exception 'Selected choice is unavailable.';
  end if;

  answer_timestamp := now();
  answer_correct := p_selected_choice = selected_question.correct_answer;

  insert into public.review_attempts (
    session_id,
    question_id,
    learner_id,
    sense_id,
    question_type,
    direction,
    selected_answer,
    correct_answer,
    is_correct,
    answered_at
  ) values (
    p_session_id,
    p_question_id,
    current_learner_id,
    selected_question.sense_id,
    selected_question.question_type,
    selected_question.direction,
    p_selected_choice,
    selected_question.correct_answer,
    answer_correct,
    answer_timestamp
  );

  update public.review_session_questions
  set selected_answer = p_selected_choice,
      is_correct = answer_correct,
      answered_at = answer_timestamp
  where id = p_question_id
    and learner_id = current_learner_id;

  update public.review_sessions
  set status = 'completed',
      completed_at = answer_timestamp,
      correct_count = case when answer_correct then 1 else 0 end
  where id = p_session_id
    and learner_id = current_learner_id;

  return public.review_session_payload(p_session_id, current_learner_id);
end;
$$;

revoke all on function public.review_session_payload(uuid, uuid) from public;
revoke all on function public.review_session_overview(uuid) from public;
revoke all on function public.start_or_resume_review_session(uuid) from public;
revoke all on function public.submit_review_session_answer(uuid, uuid, text) from public;
grant execute on function public.review_session_overview(uuid) to authenticated;
grant execute on function public.start_or_resume_review_session(uuid) to authenticated;
grant execute on function public.submit_review_session_answer(uuid, uuid, text) to authenticated;
