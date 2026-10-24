alter table public.lesson_questions
add column revealed_meaning text,
add column revealed_meaning_answer_language_tag text,
add constraint lesson_questions_revealed_meaning_check
  check (
    (revealed_meaning is null and revealed_meaning_answer_language_tag is null)
    or
    (
      revealed_meaning is not null
      and revealed_meaning_answer_language_tag is not null
      and length(btrim(revealed_meaning)) > 0
      and length(btrim(revealed_meaning_answer_language_tag)) > 0
    )
  );

create or replace function public.preferred_answer_language(p_learning_language_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select preferred.answer_language_tag
  from public.preferred_answer_languages as preferred
  where preferred.learner_id = (select auth.uid())
    and preferred.learning_language_id = p_learning_language_id;
$$;

revoke all on function public.preferred_answer_language(uuid) from public, anon;
grant execute on function public.preferred_answer_language(uuid) to authenticated;

create or replace function public.start_or_resume_vocabulary_lesson(
  p_learning_language_id uuid,
  p_collection_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  selected_lesson_id uuid;
  selected_prompt text;
  selected_answer_language_tag text;
  selected_correct_answer text;
  selected_choices text[];
  selected_choice_sense_ids uuid[];
  selected_choice_vocabulary_entry_ids uuid[];
  selected_direction text;
  first_direction text := case when random() < 0.5 then 'recognition' else 'recall' end;
  minimum_target integer := 8;
  maximum_target integer := 12;
  target_count integer;
  active_sense_count bigint;
  collection_entry_count bigint;
  ordinal integer := 0;
  translation_ordinal integer := 0;
  cloze_target_count integer := 0;
  final_is_cloze boolean;
  setting_value text;
  selected_sense record;
  preferred_answer_language_tag text;
  selected_revealed_meaning text;
  selected_revealed_meaning_tag text;
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

  preferred_answer_language_tag := public.preferred_answer_language(p_learning_language_id);

  if p_collection_id is not null then
    perform 1
    from public.collections
    where id = p_collection_id
      and learner_id = current_learner_id
      and learning_language_id = p_learning_language_id;

    if not found then
      raise exception 'Collection is unavailable.';
    end if;
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
    perform public.lesson_prune_unavailable(selected_lesson_id, current_learner_id);
    perform 1
    from public.lessons
    where id = selected_lesson_id
      and learner_id = current_learner_id
      and status = 'active';

    if found then
      return public.lesson_payload(selected_lesson_id, current_learner_id);
    end if;

    selected_lesson_id := null;
  end if;

  if p_collection_id is not null then
    select count(*) into collection_entry_count
    from public.collection_memberships
    where collection_id = p_collection_id
      and learner_id = current_learner_id;

    if collection_entry_count < 8 then
      raise exception 'A Collection needs at least eight Vocabulary Entries to practise. Add % more.', 8 - collection_entry_count;
    end if;
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
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
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
          and public.lesson_collection_includes(p_collection_id, distractor_learning_entries.id)
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
    raise exception 'At least two eligible Senses are required to start a Lesson.';
  end if;

  target_count := least(
    active_sense_count::integer,
    minimum_target + floor(random() * (maximum_target - minimum_target + 1))::integer
  );

  insert into public.lessons (learner_id, learning_language_id, status, total_count, collection_id)
  values (current_learner_id, p_learning_language_id, 'active', target_count, p_collection_id)
  returning id into selected_lesson_id;

  drop table if exists pg_temp.lesson_selected_senses;
  create temporary table lesson_selected_senses (
    ordinal integer not null,
    sense_id uuid not null,
    vocabulary_entry_id uuid not null,
    expression text not null,
    translation text not null,
    answer_language_tag text not null,
    cloze_prompt text,
    is_cloze boolean not null default false
  ) on commit drop;

  insert into pg_temp.lesson_selected_senses (
    ordinal,
    sense_id,
    vocabulary_entry_id,
    expression,
    translation,
    answer_language_tag,
    cloze_prompt
  )
  select
    row_number() over (order by selected.practice_count, selected.random_order),
    selected.sense_id,
    selected.vocabulary_entry_id,
    selected.expression,
    selected.translation,
    selected.answer_language_tag,
    cloze.prompt
  from (
    select
      senses.id as sense_id,
      senses.vocabulary_entry_id,
      vocabulary_entries.expression,
      translation.text as translation,
      translation.answer_language_tag,
      count(lesson_attempts.id) as practice_count,
      random() as random_order,
      examples.text as example_text
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    join lateral (
      select translations.text, translations.answer_language_tag
      from public.translations
      where translations.sense_id = senses.id
        and translations.learner_id = current_learner_id
        and length(btrim(translations.text)) > 0
      order by random()
      limit 1
    ) as translation on true
    left join lateral (
      select examples.text
      from public.examples
      where examples.sense_id = senses.id
        and examples.learner_id = current_learner_id
        and public.lesson_cloze_prompt(examples.text, vocabulary_entries.expression) is not null
      order by random()
      limit 1
    ) as examples on true
    left join public.lesson_attempts
      on lesson_attempts.sense_id = senses.id
      and lesson_attempts.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
      and not vocabulary_entries.suspended
      and not learning_vocabulary_entries.suspended
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
          and public.lesson_collection_includes(p_collection_id, distractor_learning_entries.id)
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
    group by senses.id, senses.vocabulary_entry_id, vocabulary_entries.expression,
      translation.text, translation.answer_language_tag, examples.text
    order by count(lesson_attempts.id), random_order
    limit target_count
  ) as selected
  cross join lateral (
    select public.lesson_cloze_prompt(selected.example_text, selected.expression) as prompt
  ) as cloze;

  select least(
    floor(target_count / 2.0)::integer,
    count(*) filter (where cloze_prompt is not null)::integer
  ) into cloze_target_count
  from pg_temp.lesson_selected_senses;

  update pg_temp.lesson_selected_senses
  set is_cloze = true
  where sense_id in (
    select sense_id
    from pg_temp.lesson_selected_senses
    where cloze_prompt is not null
    order by random()
    limit cloze_target_count
  );

  for selected_sense in
    select * from pg_temp.lesson_selected_senses order by ordinal
  loop
    ordinal := ordinal + 1;
    selected_choice_sense_ids := null;
    selected_choice_vocabulary_entry_ids := null;
    selected_answer_language_tag := selected_sense.answer_language_tag;
    selected_correct_answer := selected_sense.translation;
    final_is_cloze := selected_sense.is_cloze;

    if final_is_cloze then
      selected_prompt := selected_sense.cloze_prompt;
      selected_correct_answer := selected_sense.expression;
      selected_answer_language_tag := null;

      with distractor_candidates as (
        select distinct on (identity)
          vocabulary_entries.expression as text,
          vocabulary_entries.id as vocabulary_entry_id,
          public.expression_identity(vocabulary_entries.expression) collate public.unicode_casefold as identity
        from public.vocabulary_entries
        join public.learning_vocabulary_entries
          on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
          and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
        where vocabulary_entries.learner_id = current_learner_id
          and vocabulary_entries.learning_language_id = p_learning_language_id
          and learning_vocabulary_entries.learning_language_id = p_learning_language_id
          and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
          and not vocabulary_entries.suspended
          and not learning_vocabulary_entries.suspended
          and vocabulary_entries.id <> selected_sense.vocabulary_entry_id
          and length(btrim(vocabulary_entries.expression)) > 0
        order by identity, vocabulary_entries.id
      ), limited_distractors as (
        select text, vocabulary_entry_id
        from distractor_candidates
        where identity <> (public.expression_identity(selected_correct_answer) collate public.unicode_casefold)
        order by random()
        limit 3
      ), all_choices as (
        select selected_correct_answer as text, selected_sense.vocabulary_entry_id as vocabulary_entry_id, random() as shuffle
        union all
        select text, vocabulary_entry_id, random() as shuffle from limited_distractors
      )
      select array_agg(text order by shuffle, vocabulary_entry_id), array_agg(vocabulary_entry_id order by shuffle, vocabulary_entry_id)
      into selected_choices, selected_choice_vocabulary_entry_ids
      from all_choices;
      selected_direction := null;
    end if;

    if not final_is_cloze or cardinality(coalesce(selected_choices, array[]::text[])) < 2 then
      final_is_cloze := false;
      selected_choice_vocabulary_entry_ids := null;
      selected_answer_language_tag := selected_sense.answer_language_tag;
      selected_correct_answer := selected_sense.translation;
      translation_ordinal := translation_ordinal + 1;
      selected_direction := case
        when translation_ordinal = 1 then first_direction
        when translation_ordinal % 2 = 0 then case when first_direction = 'recognition' then 'recall' else 'recognition' end
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
              and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
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
        selected_prompt := selected_sense.translation;
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
              and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
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
    end if;

    if cardinality(coalesce(selected_choices, array[]::text[])) < 2 then
      continue;
    end if;

    if final_is_cloze and preferred_answer_language_tag is not null then
      select string_agg(translations.text, ', ' order by translations.created_at, translations.id)
      into selected_revealed_meaning
      from public.translations
      where translations.sense_id = selected_sense.sense_id
        and translations.learner_id = current_learner_id
        and translations.answer_language_tag = preferred_answer_language_tag
        and length(btrim(translations.text)) > 0;
    else
      selected_revealed_meaning := null;
    end if;

    selected_revealed_meaning_tag := case when selected_revealed_meaning is null then null else preferred_answer_language_tag end;

    insert into public.lesson_questions (
      lesson_id,
      learner_id,
      sense_id,
      ordinal,
      prompt,
      question_type,
      direction,
      answer_language_tag,
      choices,
      choice_sense_ids,
      choice_vocabulary_entry_ids,
      correct_answer,
      revealed_meaning,
      revealed_meaning_answer_language_tag
    ) values (
      selected_lesson_id,
      current_learner_id,
      selected_sense.sense_id,
      ordinal,
      selected_prompt,
      case when final_is_cloze then 'cloze' else 'translation' end,
      case when final_is_cloze then null else selected_direction end,
      case when final_is_cloze then null else selected_answer_language_tag end,
      selected_choices,
      case when final_is_cloze then null else selected_choice_sense_ids end,
      case when final_is_cloze then selected_choice_vocabulary_entry_ids else null end,
      selected_correct_answer,
      selected_revealed_meaning,
      selected_revealed_meaning_tag
    );
  end loop;

  update public.lessons
  set total_count = (
    select count(*)
    from public.lesson_questions
    where lesson_id = selected_lesson_id
      and learner_id = current_learner_id
  )
  where id = selected_lesson_id
    and learner_id = current_learner_id;

  return public.lesson_payload(selected_lesson_id, current_learner_id);
end;
$$;

revoke all on function public.start_or_resume_vocabulary_lesson(uuid, uuid) from public, anon;
grant execute on function public.start_or_resume_vocabulary_lesson(uuid, uuid) to authenticated;

create or replace function public.lesson_payload(p_lesson_id uuid, p_learner_id uuid)
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
    'collection_id', lessons.collection_id,
    'collection_name', (
      select collections.name
      from public.collections as collections
      where collections.id = lessons.collection_id
        and collections.learner_id = p_learner_id
    ),
    'status', lessons.status,
    'created_at', lessons.created_at,
    'completed_at', lessons.completed_at,
    'correct_count', lessons.correct_count,
    'total_count', lessons.total_count,
    'answered_count', (
      select count(*)
      from public.lesson_attempts as attempts
      where attempts.lesson_id = lessons.id
        and attempts.learner_id = p_learner_id
    ),
    'score', coalesce((
      select count(*) filter (where attempts.is_correct)::numeric / nullif(count(*), 0)
      from public.lesson_attempts as attempts
      where attempts.lesson_id = lessons.id
        and attempts.learner_id = p_learner_id
    ), 0),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', questions.id,
          'ordinal', questions.ordinal,
          'vocabulary_entry_id', questions.vocabulary_entry_id,
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
          'revealed_meaning', case
            when questions.selected_answer is null then null
            else questions.revealed_meaning
          end,
          'revealed_meaning_answer_language_tag', case
            when questions.selected_answer is null then null
            else questions.revealed_meaning_answer_language_tag
          end,
          'is_correct', questions.is_correct,
          'answered_at', questions.answered_at
        ) order by questions.ordinal
      )
      from public.lesson_questions as questions
      where questions.lesson_id = lessons.id
        and questions.learner_id = p_learner_id
    ), '[]'::jsonb)
  )
  from public.lessons as lessons
  where lessons.id = p_lesson_id
    and lessons.learner_id = p_learner_id;
$$;
