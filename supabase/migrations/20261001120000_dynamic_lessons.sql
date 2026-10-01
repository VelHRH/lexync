create table public.lesson_question_passages (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null,
  question_id uuid not null,
  learner_id uuid not null default auth.uid(),
  passage_id uuid not null,
  material_id uuid not null,
  passage_ordinal integer not null check (passage_ordinal >= 0),
  similarity real not null check (similarity >= -1 and similarity <= 1),
  passage_text text not null check (length(btrim(passage_text)) > 0),
  created_at timestamptz not null default now(),
  unique (question_id, passage_id),
  foreign key (question_id, lesson_id, learner_id)
    references public.lesson_questions(id, lesson_id, learner_id) on delete cascade
);

alter table public.lesson_question_passages enable row level security;

create policy learner_reads_lesson_question_passages on public.lesson_question_passages
for select to authenticated using ((select auth.uid()) = learner_id);

revoke all on public.lesson_question_passages from public, anon, authenticated;
grant select on public.lesson_question_passages to authenticated;
grant select on public.lesson_question_passages to service_role;

create index learning_material_passages_language_idx on public.learning_material_passages (learner_id, learning_language_id);

create or replace function public.retrieve_dynamic_lesson_context(
  p_learning_language_id uuid,
  p_query_embedding jsonb,
  p_embedding_model text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  resolved_language_tag text;
  setting_value text;
  threshold_value numeric;
  max_passages integer;
  min_passages integer;
  minimum_target integer;
  maximum_target integer;
  accepted_passages jsonb;
  is_sufficient boolean;
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_query_embedding is null
    or jsonb_typeof(p_query_embedding) <> 'array'
    or jsonb_array_length(p_query_embedding) <> 768
    or exists (
      select 1
      from jsonb_array_elements(p_query_embedding) as values(value)
      where jsonb_typeof(values.value) <> 'number'
    ) then
    raise exception 'Practice Request embedding is invalid.';
  end if;

  if p_embedding_model is null or length(btrim(p_embedding_model)) = 0 then
    raise exception 'Embedding model is required.';
  end if;

  select language_tag into resolved_language_tag
  from public.learning_languages
  where id = p_learning_language_id
    and learner_id = current_learner_id;

  if resolved_language_tag is null then
    raise exception 'Learning Language is unavailable.';
  end if;

  setting_value := current_setting('app.dynamic_lesson_relevance_threshold', true);
  begin
    threshold_value := setting_value::numeric;
  exception when others then
    threshold_value := null;
  end;
  if setting_value is null or threshold_value is null then
    threshold_value := 0.65;
  end if;
  if threshold_value < -1 then
    threshold_value := -1;
  end if;

  setting_value := current_setting('app.dynamic_lesson_max_passages', true);
  begin
    max_passages := setting_value::integer;
  exception when others then
    max_passages := null;
  end;
  if setting_value is null or max_passages is null then
    max_passages := 8;
  end if;
  max_passages := greatest(1, least(100, max_passages));

  setting_value := current_setting('app.dynamic_lesson_min_passages', true);
  begin
    min_passages := setting_value::integer;
  exception when others then
    min_passages := null;
  end;
  if setting_value is null or min_passages is null then
    min_passages := 2;
  end if;
  min_passages := greatest(1, least(max_passages, min_passages));

  setting_value := current_setting('app.lesson_min_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_min_size', true);
  end if;
  begin
    minimum_target := setting_value::integer;
  exception when others then
    minimum_target := 8;
  end;
  if setting_value is null or minimum_target is null then
    minimum_target := 8;
  end if;

  setting_value := current_setting('app.lesson_max_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_max_size', true);
  end if;
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

  with candidates as (
    select
      passages.id,
      passages.material_id,
      passages.ordinal,
      passages.passage_text,
      1 - (passages.embedding operator(extensions.<=>) (p_query_embedding::text::extensions.vector(768))) as similarity
    from public.learning_material_passages as passages
    join public.learning_materials as materials
      on materials.id = passages.material_id
     and materials.learner_id = passages.learner_id
     and materials.learning_language_id = passages.learning_language_id
    where passages.learner_id = current_learner_id
      and passages.learning_language_id = p_learning_language_id
      and materials.status = 'ready'
      and passages.embedding_model = p_embedding_model
      and passages.embedding_dimension = 768
    order by passages.embedding operator(extensions.<=>) (p_query_embedding::text::extensions.vector(768)) asc,
             passages.material_id, passages.ordinal
    limit max_passages
  )
  select jsonb_agg(
    jsonb_build_object(
      'id', candidates.id,
      'material_id', candidates.material_id,
      'ordinal', candidates.ordinal,
      'text', candidates.passage_text,
      'similarity', candidates.similarity
    ) order by candidates.similarity desc, candidates.material_id, candidates.ordinal
  )
  into accepted_passages
  from candidates
  where candidates.similarity >= threshold_value;

  accepted_passages := coalesce(accepted_passages, '[]'::jsonb);
  is_sufficient := jsonb_array_length(accepted_passages) >= min_passages;

  if not is_sufficient then
    accepted_passages := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'learning_language_tag', resolved_language_tag,
    'relevance_threshold', threshold_value,
    'min_passages', min_passages,
    'max_passages', max_passages,
    'min_questions', minimum_target,
    'max_questions', maximum_target,
    'sufficient', is_sufficient,
    'passages', accepted_passages
  );
end;
$$;

revoke all on function public.retrieve_dynamic_lesson_context(uuid, jsonb, text) from public, anon;
grant execute on function public.retrieve_dynamic_lesson_context(uuid, jsonb, text) to authenticated;

create or replace function public.create_dynamic_lesson(
  p_learning_language_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
  selected_lesson_id uuid;
  new_lesson_id uuid;
  setting_value text;
  minimum_target integer;
  maximum_target integer;
  question_count integer;
  distinct_prompt_count integer;
  item jsonb;
  position integer;
  question_type_value text;
  prompt_value text;
  direction_value text;
  answer_language_tag_value text;
  choices_value jsonb;
  choices_array text[];
  correct_answer_value text;
  passages_value jsonb;
  passage_item jsonb;
  new_question_id uuid;
  distinct_choice_count integer;
  correct_answer_count integer;
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

  select id into selected_lesson_id
  from public.lessons
  where learner_id = current_learner_id
    and learning_language_id = p_learning_language_id
    and status = 'active'
  order by created_at desc, id desc
  limit 1
  for update;

  if selected_lesson_id is not null then
    return public.lesson_payload(selected_lesson_id, current_learner_id);
  end if;

  setting_value := current_setting('app.lesson_min_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_min_size', true);
  end if;
  begin
    minimum_target := setting_value::integer;
  exception when others then
    minimum_target := 8;
  end;
  if setting_value is null or minimum_target is null then
    minimum_target := 8;
  end if;

  setting_value := current_setting('app.lesson_max_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.lesson_max_size', true);
  end if;
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

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'Lesson questions are invalid.';
  end if;

  question_count := jsonb_array_length(p_questions);
  if question_count < minimum_target or question_count > maximum_target then
    raise exception 'Lesson questions are invalid.';
  end if;

  select count(distinct lower(btrim(value->>'prompt')))
  into distinct_prompt_count
  from jsonb_array_elements(p_questions) as elements(value);

  if distinct_prompt_count <> question_count then
    raise exception 'Lesson questions are invalid.';
  end if;

  for item in (
    select value
    from jsonb_array_elements(p_questions) as entries(value)
  ) loop
    question_type_value := item->>'question_type';
    prompt_value := item->>'prompt';
    direction_value := item->>'direction';
    answer_language_tag_value := item->>'answer_language_tag';
    choices_value := item->'choices';
    correct_answer_value := item->>'correct_answer';
    passages_value := item->'passages';

    if question_type_value is null or question_type_value not in ('translation', 'cloze') then
      raise exception 'Lesson questions are invalid.';
    end if;

    if prompt_value is null or length(btrim(prompt_value)) = 0 then
      raise exception 'Lesson questions are invalid.';
    end if;

    if choices_value is null or jsonb_typeof(choices_value) <> 'array'
      or jsonb_array_length(choices_value) < 2 or jsonb_array_length(choices_value) > 4 then
      raise exception 'Lesson questions are invalid.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(choices_value) as elements(value)
      where jsonb_typeof(elements.value) <> 'string'
    ) then
      raise exception 'Lesson questions are invalid.';
    end if;

    select array_agg(value) into choices_array
    from jsonb_array_elements_text(choices_value) as elements(value);

    if exists (
      select 1
      from unnest(choices_array) as choice(value)
      where value is null or length(btrim(value)) = 0
    ) then
      raise exception 'Lesson questions are invalid.';
    end if;

    select count(distinct value) into distinct_choice_count
    from unnest(choices_array) as choice(value);

    if distinct_choice_count <> cardinality(choices_array) then
      raise exception 'Lesson questions are invalid.';
    end if;

    if correct_answer_value is null or length(btrim(correct_answer_value)) = 0 then
      raise exception 'Lesson questions are invalid.';
    end if;

    select count(*) into correct_answer_count
    from unnest(choices_array) as choice(value)
    where value = correct_answer_value;

    if correct_answer_count <> 1 then
      raise exception 'Lesson questions are invalid.';
    end if;

    if question_type_value = 'translation' then
      if direction_value is null or direction_value not in ('recognition', 'recall') then
        raise exception 'Lesson questions are invalid.';
      end if;
      if answer_language_tag_value is null or length(btrim(answer_language_tag_value)) = 0 then
        raise exception 'Lesson questions are invalid.';
      end if;
    else
      if direction_value is not null or answer_language_tag_value is not null then
        raise exception 'Lesson questions are invalid.';
      end if;
    end if;

    if passages_value is null or jsonb_typeof(passages_value) <> 'array' or jsonb_array_length(passages_value) = 0 then
      raise exception 'Lesson questions are invalid.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(passages_value) as elements(value)
      where elements.value->>'passage_id' is null
        or elements.value->>'material_id' is null
        or elements.value->>'passage_ordinal' is null
        or elements.value->>'similarity' is null
        or elements.value->>'passage_text' is null
        or length(btrim(elements.value->>'passage_text')) = 0
    ) then
      raise exception 'Lesson questions are invalid.';
    end if;
  end loop;

  insert into public.lessons (learner_id, learning_language_id, source, status, total_count, correct_count)
  values (current_learner_id, p_learning_language_id, 'dynamic', 'active', question_count, 0)
  returning id into new_lesson_id;

  position := 0;
  for item in (
    select value
    from jsonb_array_elements(p_questions) with ordinality as entries(value, ordinality)
    order by ordinality
  ) loop
    position := position + 1;

    question_type_value := item->>'question_type';
    prompt_value := item->>'prompt';
    direction_value := item->>'direction';
    answer_language_tag_value := item->>'answer_language_tag';
    choices_value := item->'choices';
    correct_answer_value := item->>'correct_answer';
    passages_value := item->'passages';

    select array_agg(value) into choices_array
    from jsonb_array_elements_text(choices_value) as elements(value);

    insert into public.lesson_questions (
      lesson_id,
      learner_id,
      sense_id,
      vocabulary_entry_id,
      ordinal,
      prompt,
      question_type,
      direction,
      answer_language_tag,
      choices,
      choice_sense_ids,
      choice_vocabulary_entry_ids,
      correct_answer
    ) values (
      new_lesson_id,
      current_learner_id,
      null,
      null,
      position,
      prompt_value,
      question_type_value,
      direction_value,
      answer_language_tag_value,
      choices_array,
      null,
      null,
      correct_answer_value
    )
    returning id into new_question_id;

    for passage_item in (
      select value
      from jsonb_array_elements(passages_value) as entries(value)
    ) loop
      insert into public.lesson_question_passages (
        lesson_id,
        question_id,
        learner_id,
        passage_id,
        material_id,
        passage_ordinal,
        similarity,
        passage_text
      ) values (
        new_lesson_id,
        new_question_id,
        current_learner_id,
        (passage_item->>'passage_id')::uuid,
        (passage_item->>'material_id')::uuid,
        (passage_item->>'passage_ordinal')::integer,
        (passage_item->>'similarity')::real,
        passage_item->>'passage_text'
      );
    end loop;
  end loop;

  return public.lesson_payload(new_lesson_id, current_learner_id);
end;
$$;

revoke all on function public.create_dynamic_lesson(uuid, jsonb) from public, anon;
grant execute on function public.create_dynamic_lesson(uuid, jsonb) to authenticated;

create or replace function public.lesson_history(p_learning_language_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := (select auth.uid());
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.learning_languages
    where id = p_learning_language_id
      and learner_id = current_learner_id
  ) then
    raise exception 'Learning Language is unavailable.';
  end if;

  return jsonb_build_object(
    'lessons', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sessions.id,
          'learning_language_id', sessions.learning_language_id,
          'learning_language_tag', languages.language_tag,
          'source', sessions.source,
          'completed_at', sessions.completed_at,
          'correct_count', sessions.correct_count,
          'total_count', sessions.total_count,
          'questions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', attempts.id,
                'question_id', questions.id,
                'sense_id', questions.sense_id,
                'ordinal', questions.ordinal,
                'prompt', questions.prompt,
                'question_type', questions.question_type,
                'direction', questions.direction,
                'selected_answer', attempts.selected_answer,
                'correct_answer', attempts.correct_answer,
                'is_correct', attempts.is_correct,
                'answered_at', attempts.answered_at
              ) order by questions.ordinal, questions.id
            )
            from public.lesson_attempts as attempts
            join public.lesson_questions as questions
              on questions.id = attempts.question_id
              and questions.lesson_id = attempts.lesson_id
              and questions.learner_id = attempts.learner_id
            where attempts.lesson_id = sessions.id
              and attempts.learner_id = current_learner_id
          ), '[]'::jsonb)
        ) order by sessions.completed_at desc, sessions.id desc
      )
      from public.lessons as sessions
      join public.learning_languages as languages
        on languages.id = sessions.learning_language_id
        and languages.learner_id = sessions.learner_id
      where sessions.learner_id = current_learner_id
        and sessions.status = 'completed'
    ), '[]'::jsonb),
    'sense_statistics', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sense_id', statistics.sense_id,
          'expression', statistics.expression,
          'practice_count', statistics.practice_count,
          'last_practiced_at', statistics.last_practiced_at
        ) order by statistics.created_at, statistics.sense_id
      )
      from (
        select
          senses.id as sense_id,
          vocabulary_entries.expression,
          senses.created_at,
          count(practice.answered_at)::integer as practice_count,
          max(practice.answered_at) as last_practiced_at
        from public.senses
        join public.vocabulary_entries
          on vocabulary_entries.id = senses.vocabulary_entry_id
          and vocabulary_entries.learner_id = senses.learner_id
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        left join lateral (
          select lesson_attempts.answered_at
          from public.lesson_attempts
          where lesson_attempts.sense_id = senses.id
            and lesson_attempts.learner_id = current_learner_id
          union all
          select review_participations.occurred_at
          from public.review_participations
          join public.cards
            on cards.id = review_participations.card_id
            and cards.learner_id = review_participations.learner_id
          where review_participations.learner_id = current_learner_id
            and cards.sense_id = senses.id
            and cards.learning_language_id = p_learning_language_id
        ) as practice on true
        where senses.learner_id = current_learner_id
          and vocabulary_entries.learning_language_id = p_learning_language_id
          and learning_vocabulary_entries.learning_language_id = p_learning_language_id
        group by senses.id, vocabulary_entries.expression, senses.created_at
      ) as statistics
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.lesson_history(uuid) from public, anon;
grant execute on function public.lesson_history(uuid) to authenticated;
