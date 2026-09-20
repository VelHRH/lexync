alter table public.review_sessions
drop constraint if exists review_sessions_total_count_check;

alter table public.review_sessions
add constraint review_sessions_total_count_nonnegative_check check (total_count >= 0);

alter table public.review_session_questions
drop constraint if exists review_session_questions_direction_check,
drop constraint if exists review_session_questions_choices_check;

alter table public.review_session_questions
add constraint review_session_questions_direction_check check (direction in ('recognition', 'recall')),
add constraint review_session_questions_choices_check check (cardinality(choices) >= 2);

alter table public.review_attempts
drop constraint if exists review_attempts_direction_check;

alter table public.review_attempts
add constraint review_attempts_direction_check check (direction in ('recognition', 'recall'));

alter table public.review_session_questions
add column if not exists continued_at timestamptz,
add constraint review_session_questions_continued_after_answer_check
  check (continued_at is null or selected_answer is not null);

alter table public.review_session_questions
add column if not exists choice_sense_ids uuid[],
add constraint review_session_questions_choice_provenance_check
  check (choice_sense_ids is null or cardinality(choice_sense_ids) = cardinality(choices));

with question_choices as (
  select
    questions.id,
    questions.learner_id,
    choice.position,
    questions.choices[choice.position] as text
  from public.review_session_questions as questions
  cross join lateral generate_subscripts(questions.choices, 1) as choice(position)
  where questions.choice_sense_ids is null
    and questions.direction = 'recognition'
), unique_matches as (
  select
    question_choices.id,
    question_choices.position,
    (array_agg(senses.id order by senses.id))[1] as sense_id
  from question_choices
  join public.translations
    on translations.learner_id = question_choices.learner_id
    and translations.translation_identity = public.translation_identity(question_choices.text)
  join public.senses
    on senses.id = translations.sense_id
    and senses.learner_id = translations.learner_id
  group by question_choices.id, question_choices.position
  having count(distinct senses.id) = 1
), complete_matches as (
  select
    unique_matches.id,
    array_agg(unique_matches.sense_id order by unique_matches.position) as choice_sense_ids,
    count(*) as matched_count
  from unique_matches
  group by unique_matches.id
)
update public.review_session_questions as questions
set choice_sense_ids = complete_matches.choice_sense_ids
from complete_matches
where questions.id = complete_matches.id
  and complete_matches.matched_count = cardinality(questions.choices);

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

  update public.review_sessions
  set total_count = (
    select count(*)
    from public.review_session_questions
    where session_id = p_session_id
      and learner_id = p_learner_id
  )
  where id = p_session_id
    and learner_id = p_learner_id
    and status = 'active';
end;
$$;

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
    'answered_count', (
      select count(*)
      from public.review_attempts
      where review_attempts.session_id = review_sessions.id
        and review_attempts.learner_id = p_learner_id
    ),
    'score', coalesce((
      select count(*) filter (where review_attempts.is_correct)::numeric / nullif(count(*), 0)
      from public.review_attempts
      where review_attempts.session_id = review_sessions.id
        and review_attempts.learner_id = p_learner_id
    ), 0),
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
          'continued_at', review_session_questions.continued_at,
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
volatile
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
  else
    perform public.review_session_prune_unavailable(selected_session_id, current_learner_id);
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
  selected_prompt text;
  selected_answer_language_tag text;
  selected_correct_answer text;
  selected_choices text[];
  selected_choice_sense_ids uuid[];
  selected_direction text;
  first_direction text := case when random() < 0.5 then 'recognition' else 'recall' end;
  minimum_target integer := 8;
  maximum_target integer := 12;
  target_count integer;
  active_sense_count bigint;
  ordinal integer := 0;
  setting_value text;
  selected_sense record;
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
  limit 1
  for update;

  if selected_session_id is not null then
    perform public.review_session_prune_unavailable(selected_session_id, current_learner_id);
    return public.review_session_payload(selected_session_id, current_learner_id);
  end if;

  setting_value := current_setting('app.review_session_min_size', true);
  begin
    minimum_target := setting_value::integer;
  exception when others then
    minimum_target := 8;
  end;
  if setting_value is null or minimum_target is null then
    minimum_target := 8;
  end if;

  setting_value := current_setting('app.review_session_max_size', true);
  begin
    maximum_target := setting_value::integer;
  exception when others then
    maximum_target := 12;
  end;
  if setting_value is null or maximum_target is null then
    maximum_target := 12;
  end if;

  if minimum_target < 2 or maximum_target < minimum_target or minimum_target > 1000 or maximum_target > 1000 then
    minimum_target := 8;
    maximum_target := 12;
  end if;

  select count(*) into active_sense_count
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

  if active_sense_count < 2 then
    raise exception 'At least two eligible Senses are required to start a Review Session.';
  end if;

  target_count := least(
    active_sense_count::integer,
    minimum_target + floor(random() * (maximum_target - minimum_target + 1))::integer
  );

  insert into public.review_sessions (
    learner_id,
    learning_language_id,
    status,
    total_count
  ) values (
    current_learner_id,
    p_learning_language_id,
    'active',
    target_count
  ) returning id into selected_session_id;

  for selected_sense in
    select
      senses.id as sense_id,
      senses.vocabulary_entry_id,
      vocabulary_entries.expression,
      count(review_attempts.id) as practice_count
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    left join public.review_attempts
      on review_attempts.sense_id = senses.id
      and review_attempts.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
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
    group by senses.id, senses.vocabulary_entry_id, vocabulary_entries.expression
    order by count(review_attempts.id), random()
    limit target_count
  loop
    ordinal := ordinal + 1;

    select translations.text, translations.answer_language_tag
    into selected_correct_answer, selected_answer_language_tag
    from public.translations
    where translations.sense_id = selected_sense.sense_id
      and translations.learner_id = current_learner_id
      and length(btrim(translations.text)) > 0
    order by random()
    limit 1;

    selected_direction := case
      when ordinal = 1 then first_direction
      when first_direction = 'recognition' and ordinal % 2 = 0 then 'recall'
      when first_direction = 'recall' and ordinal % 2 = 0 then 'recognition'
      else first_direction
    end;

    if selected_direction = 'recognition' then
      selected_prompt := selected_sense.expression;

      with distractor_candidates as (
        select distinct on (identity) text, identity, sense_id
        from (
          select distinct on (senses.id)
            translations.text,
            translations.translation_identity collate public.unicode_casefold as identity,
            senses.id as sense_id
          from public.translations
          join public.senses
            on senses.id = translations.sense_id
            and senses.learner_id = translations.learner_id
          join public.vocabulary_entries
            on vocabulary_entries.id = senses.vocabulary_entry_id
            and vocabulary_entries.learner_id = senses.learner_id
          join public.learning_vocabulary_entries
            on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
            and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
          where translations.learner_id = current_learner_id
            and senses.id <> selected_sense.sense_id
            and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
            and vocabulary_entries.learning_language_id = p_learning_language_id
            and learning_vocabulary_entries.learning_language_id = p_learning_language_id
            and not vocabulary_entries.suspended
            and not learning_vocabulary_entries.suspended
            and length(btrim(translations.text)) > 0
            and not exists (
              select 1
              from public.translations as reviewed_translations
              where reviewed_translations.sense_id = selected_sense.sense_id
                and reviewed_translations.learner_id = current_learner_id
                and reviewed_translations.translation_identity = translations.translation_identity
            )
          order by senses.id, random()
        ) as distractors
        order by identity, text
      ), limited_distractors as (
        select text, sense_id
        from distractor_candidates
        where identity <> (public.translation_identity(selected_correct_answer) collate public.unicode_casefold)
        order by random()
        limit 3
      ), all_choices as (
        select selected_correct_answer as text, selected_sense.sense_id as sense_id, random() as shuffle
        union all
        select text, sense_id, random() as shuffle from limited_distractors
      )
      select array_agg(text order by shuffle, sense_id), array_agg(sense_id order by shuffle, sense_id)
      into selected_choices, selected_choice_sense_ids
      from all_choices;
    else
      selected_prompt := selected_correct_answer;
      selected_correct_answer := selected_sense.expression;

      with distractor_candidates as (
        select distinct on (identity) text, identity, sense_id
        from (
          select distinct on (senses.id)
            vocabulary_entries.expression as text,
            public.expression_identity(vocabulary_entries.expression) collate public.unicode_casefold as identity,
            senses.id as sense_id
          from public.senses
          join public.vocabulary_entries
            on vocabulary_entries.id = senses.vocabulary_entry_id
            and vocabulary_entries.learner_id = senses.learner_id
          join public.learning_vocabulary_entries
            on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
            and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
          where senses.learner_id = current_learner_id
            and senses.id <> selected_sense.sense_id
            and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
            and vocabulary_entries.learning_language_id = p_learning_language_id
            and learning_vocabulary_entries.learning_language_id = p_learning_language_id
            and not vocabulary_entries.suspended
            and not learning_vocabulary_entries.suspended
            and length(btrim(vocabulary_entries.expression)) > 0
          order by senses.id, random()
        ) as distractors
        order by identity, text
      ), limited_distractors as (
        select text, sense_id
        from distractor_candidates
        where identity <> (public.expression_identity(selected_correct_answer) collate public.unicode_casefold)
        order by random()
        limit 3
      ), all_choices as (
        select selected_correct_answer as text, selected_sense.sense_id as sense_id, random() as shuffle
        union all
        select text, sense_id, random() as shuffle from limited_distractors
      )
      select array_agg(text order by shuffle, sense_id), array_agg(sense_id order by shuffle, sense_id)
      into selected_choices, selected_choice_sense_ids
      from all_choices;
    end if;

    if cardinality(selected_choices) < 2 then
      continue;
    end if;

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
      choice_sense_ids,
      correct_answer
    ) values (
      selected_session_id,
      current_learner_id,
      selected_sense.sense_id,
      ordinal,
      selected_prompt,
      'translation',
      selected_direction,
      selected_answer_language_tag,
      selected_choices,
      selected_choice_sense_ids,
      selected_correct_answer
    );
  end loop;

  update public.review_sessions
  set total_count = (
    select count(*)
    from public.review_session_questions
    where session_id = selected_session_id
      and learner_id = current_learner_id
  )
  where id = selected_session_id
    and learner_id = current_learner_id;

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
  answered_count integer;
  correct_answer_count integer;
  question_count integer;
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

  select count(*) filter (where selected_answer is not null),
         count(*) filter (where is_correct),
         count(*)
  into answered_count, correct_answer_count, question_count
  from public.review_session_questions
  where session_id = p_session_id
    and learner_id = current_learner_id;

  update public.review_sessions
  set status = 'active',
      completed_at = null,
      correct_count = correct_answer_count,
      total_count = question_count
  where id = p_session_id
    and learner_id = current_learner_id;

  return public.review_session_payload(p_session_id, current_learner_id);
end;
$$;

create or replace function public.continue_review_session_question(
  p_session_id uuid,
  p_question_id uuid
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
  continued_timestamp timestamptz;
  unanswered_count integer;
  correct_answer_count integer;
  question_count integer;
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

  if selected_session.status = 'completed' or selected_question.continued_at is not null then
    return public.review_session_payload(p_session_id, current_learner_id);
  end if;

  if selected_question.selected_answer is null then
    raise exception 'Review Question must be answered before continuing.';
  end if;

  continued_timestamp := now();

  update public.review_session_questions
  set continued_at = continued_timestamp
  where id = p_question_id
    and session_id = p_session_id
    and learner_id = current_learner_id
    and continued_at is null;

  select count(*) filter (where selected_answer is null),
         count(*) filter (where is_correct),
         count(*)
  into unanswered_count, correct_answer_count, question_count
  from public.review_session_questions
  where session_id = p_session_id
    and learner_id = current_learner_id;

  if unanswered_count = 0 then
    update public.review_sessions
    set status = 'completed',
        completed_at = continued_timestamp,
        correct_count = correct_answer_count,
        total_count = question_count
    where id = p_session_id
      and learner_id = current_learner_id
      and status = 'active';
  else
    update public.review_sessions
    set status = 'active',
        completed_at = null,
        correct_count = correct_answer_count,
        total_count = question_count
    where id = p_session_id
      and learner_id = current_learner_id;
  end if;

  return public.review_session_payload(p_session_id, current_learner_id);
end;
$$;

revoke all on function public.review_session_prune_unavailable(uuid, uuid) from public;
revoke all on function public.review_session_overview(uuid) from public;
revoke all on function public.start_or_resume_review_session(uuid) from public;
revoke all on function public.submit_review_session_answer(uuid, uuid, text) from public;
revoke all on function public.continue_review_session_question(uuid, uuid) from public;
grant execute on function public.review_session_overview(uuid) to authenticated;
grant execute on function public.start_or_resume_review_session(uuid) to authenticated;
grant execute on function public.submit_review_session_answer(uuid, uuid, text) to authenticated;
grant execute on function public.continue_review_session_question(uuid, uuid) to authenticated;
