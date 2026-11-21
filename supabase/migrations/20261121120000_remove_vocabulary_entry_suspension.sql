update public.vocabulary_entries
set suspended = false
where suspended;

update public.learning_vocabulary_entries
set suspended = false
where suspended;

drop trigger sync_learning_vocabulary_entry_suspension on public.vocabulary_entries;
drop function public.sync_learning_vocabulary_entry_suspension();
drop function public.set_vocabulary_entry_suspended(uuid, boolean);

create or replace function public.account_vocabulary_snapshot()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'learnerId', current_learner_id,
    'studyPairs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', study_pairs.id,
          'targetLanguageTag', study_pairs.target_language_tag,
          'referenceLanguageTag', study_pairs.reference_language_tag,
          'isPrimary', study_pairs.is_primary,
          'vocabularyEntries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', vocabulary_entries.id,
                'expression', vocabulary_entries.expression,
                'suspended', false,
                'senses', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', senses.id,
                      'translations', coalesce((
                        select jsonb_agg(
                          jsonb_build_object('id', translations.id, 'text', translations.text)
                          order by translations.created_at, translations.id
                        )
                        from public.translations
                        where translations.learner_id = current_learner_id
                          and translations.sense_id = senses.id
                          and translations.answer_language_tag = study_pairs.reference_language_tag
                      ), '[]'::jsonb),
                      'examples', coalesce((
                        select jsonb_agg(
                          jsonb_build_object('id', examples.id, 'text', examples.text)
                          order by examples.created_at, examples.id
                        )
                        from public.examples
                        where examples.learner_id = current_learner_id
                          and examples.sense_id = senses.id
                      ), '[]'::jsonb)
                    ) order by senses.created_at, senses.id
                  )
                  from public.senses
                  where senses.learner_id = current_learner_id
                    and senses.vocabulary_entry_id = vocabulary_entries.id
                    and exists (
                      select 1
                      from public.translations
                      where translations.learner_id = current_learner_id
                        and translations.sense_id = senses.id
                        and translations.answer_language_tag = study_pairs.reference_language_tag
                    )
                ), '[]'::jsonb)
              ) order by vocabulary_entries.created_at, vocabulary_entries.id
            )
            from public.vocabulary_entries
            where vocabulary_entries.learner_id = current_learner_id
              and vocabulary_entries.study_pair_id = study_pairs.id
          ), '[]'::jsonb)
        ) order by study_pairs.created_at, study_pairs.id
      )
      from public.study_pairs
      where study_pairs.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.account_learning_snapshot()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
begin
  if current_learner_id is null then
    raise exception 'Authentication is required.';
  end if;

  return jsonb_build_object(
    'schemaVersion', 2,
    'learnerId', current_learner_id,
    'activeLearningLanguageId', (
      select active_learning_language_id
      from public.learner_language_state
      where learner_id = current_learner_id
    ),
    'learningLanguages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', learning_languages.id,
          'languageTag', learning_languages.language_tag,
          'preferredAnswerLanguageTag', preferred_answer_languages.answer_language_tag,
          'vocabularyEntries', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', learning_vocabulary_entries.id,
                'expression', learning_vocabulary_entries.expression,
                'suspended', false,
                'senses', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', senses.id,
                      'translations', coalesce((
                        select jsonb_agg(
                          jsonb_build_object(
                            'id', translations.id,
                            'text', translations.text,
                            'answerLanguageTag', translations.answer_language_tag
                          ) order by translations.created_at, translations.id
                        )
                        from public.translations
                        where translations.learner_id = current_learner_id
                          and translations.sense_id = senses.id
                      ), '[]'::jsonb),
                      'examples', coalesce((
                        select jsonb_agg(
                          jsonb_build_object(
                            'id', examples.id,
                            'text', examples.text
                          ) order by examples.created_at, examples.id
                        )
                        from public.examples
                        where examples.learner_id = current_learner_id
                          and examples.sense_id = senses.id
                      ), '[]'::jsonb)
                    ) order by senses.created_at, senses.id
                  )
                  from public.senses
                  join public.vocabulary_entries
                    on vocabulary_entries.id = senses.vocabulary_entry_id
                    and vocabulary_entries.learner_id = senses.learner_id
                  where senses.learner_id = current_learner_id
                    and vocabulary_entries.learning_vocabulary_entry_id = learning_vocabulary_entries.id
                ), '[]'::jsonb)
              ) order by learning_vocabulary_entries.created_at, learning_vocabulary_entries.id
            )
            from public.learning_vocabulary_entries
            where learning_vocabulary_entries.learner_id = current_learner_id
              and learning_vocabulary_entries.learning_language_id = learning_languages.id
          ), '[]'::jsonb),
          'collections', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', collections.id,
                'name', collections.name,
                'vocabularyEntryIds', coalesce((
                  select jsonb_agg(
                    collection_memberships.learning_vocabulary_entry_id
                    order by collection_memberships.created_at,
                      collection_memberships.learning_vocabulary_entry_id
                  )
                  from public.collection_memberships
                  where collection_memberships.learner_id = current_learner_id
                    and collection_memberships.collection_id = collections.id
                ), '[]'::jsonb)
              ) order by collections.created_at, collections.id
            )
            from public.collections
            where collections.learner_id = current_learner_id
              and collections.learning_language_id = learning_languages.id
          ), '[]'::jsonb)
        ) order by learning_languages.created_at, learning_languages.id
      )
      from public.learning_languages
      left join public.preferred_answer_languages
        on preferred_answer_languages.learning_language_id = learning_languages.id
        and preferred_answer_languages.learner_id = learning_languages.learner_id
      where learning_languages.learner_id = current_learner_id
    ), '[]'::jsonb),
    'languagePairs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'learningLanguageId', language_pairs.learning_language_id,
          'learningLanguageTag', language_pairs.learning_language_tag,
          'answerLanguageTag', language_pairs.answer_language_tag
        ) order by language_pairs.learning_language_tag, language_pairs.answer_language_tag
      )
      from public.language_pairs
      where language_pairs.learner_id = current_learner_id
    ), '[]'::jsonb),
    'cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cards.id,
          'senseId', cards.sense_id,
          'learningLanguageId', cards.learning_language_id,
          'answerLanguageTag', cards.answer_language_tag,
          'direction', cards.direction,
          'createdAt', cards.created_at
        ) order by cards.created_at, cards.id
      )
      from public.cards
      where cards.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sync_legacy_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_pair public.study_pairs%rowtype;
  resolved_entry_id uuid;
  existing_mapping_count bigint;
begin
  select * into selected_pair
  from public.study_pairs
  where id = new.study_pair_id and learner_id = new.learner_id;

  if not found then
    raise exception 'Study Pair is unavailable.';
  end if;

  new.learning_language_id := selected_pair.learning_language_id;

  select id into resolved_entry_id
  from public.learning_vocabulary_entries
  where learner_id = new.learner_id
    and learning_language_id = selected_pair.learning_language_id
    and expression_identity = public.expression_identity(new.expression)
  order by created_at, id
  limit 1;

  if resolved_entry_id is null then
    if tg_op = 'UPDATE' and old.learning_language_id = selected_pair.learning_language_id then
      select count(*) into existing_mapping_count
      from public.vocabulary_entries
      where learning_vocabulary_entry_id = old.learning_vocabulary_entry_id;

      if existing_mapping_count = 1 then
        update public.learning_vocabulary_entries
        set expression = new.expression
        where id = old.learning_vocabulary_entry_id
        returning id into resolved_entry_id;
      end if;
    end if;

    if resolved_entry_id is null and tg_op = 'INSERT' then
      insert into public.learning_vocabulary_entries (
        id,
        learner_id,
        learning_language_id,
        expression,
        created_at
      ) values (
        new.id,
        new.learner_id,
        selected_pair.learning_language_id,
        new.expression,
        new.created_at
      )
      returning id into resolved_entry_id;
    elsif resolved_entry_id is null then
      insert into public.learning_vocabulary_entries (
        learner_id,
        learning_language_id,
        expression,
        created_at
      ) values (
        new.learner_id,
        selected_pair.learning_language_id,
        new.expression,
        new.created_at
      )
      returning id into resolved_entry_id;
    end if;
  end if;

  new.learning_vocabulary_entry_id := resolved_entry_id;
  return new;
end;
$$;

create or replace function public.remove_orphaned_learning_vocabulary_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.learning_vocabulary_entries
  where id = old.learning_vocabulary_entry_id
    and not exists (
      select 1
      from public.vocabulary_entries
      where learning_vocabulary_entry_id = old.learning_vocabulary_entry_id
    );

  return null;
end;
$$;

create or replace function public.vocabulary_entry_progress_states(p_learner_id uuid, p_learning_language_id uuid)
returns table (learning_vocabulary_entry_id uuid, state text)
language sql
stable security definer
set search_path = ''
as $$
  with entry_scope as (
    select learning_vocabulary_entries.id
    from public.learning_vocabulary_entries
    where learning_vocabulary_entries.learner_id = p_learner_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
  ), sense_streaks as (
    select
      vocabulary_entries.learning_vocabulary_entry_id,
      count(attempts.id) as attempt_count,
      count(attempts.id) filter (
        where attempts.is_correct
          and (last_incorrect.answered_at is null or attempts.answered_at > last_incorrect.answered_at)
      ) as practice_streak
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join entry_scope on entry_scope.id = vocabulary_entries.learning_vocabulary_entry_id
    left join lateral (
      select max(incorrect.answered_at) as answered_at
      from public.lesson_attempts as incorrect
      where incorrect.sense_id = senses.id
        and incorrect.learner_id = p_learner_id
        and not incorrect.is_correct
    ) as last_incorrect on true
    left join public.lesson_attempts as attempts
      on attempts.sense_id = senses.id
      and attempts.learner_id = p_learner_id
    where senses.learner_id = p_learner_id
    group by senses.id, vocabulary_entries.learning_vocabulary_entry_id, last_incorrect.answered_at
  )
  select
    entry_scope.id,
    case
      when count(sense_streaks.learning_vocabulary_entry_id) > 0
        and count(sense_streaks.learning_vocabulary_entry_id) filter (where sense_streaks.practice_streak < 5) = 0 then 'learned'
      when coalesce(sum(sense_streaks.attempt_count), 0) > 0 then 'in_practice'
      else 'new'
    end
  from entry_scope
  left join sense_streaks on sense_streaks.learning_vocabulary_entry_id = entry_scope.id
  group by entry_scope.id;
$$;

create or replace function public.lesson_prune_unavailable(p_lesson_id uuid, p_learner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.lessons
  where id = p_lesson_id
    and learner_id = p_learner_id
  for update;

  if exists (
    select 1
    from public.lessons
    where id = p_lesson_id
      and learner_id = p_learner_id
      and source = 'dynamic'
  ) then
    return;
  end if;

  delete from public.lesson_questions as questions
  where questions.lesson_id = p_lesson_id
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
    );

  delete from public.lesson_questions as questions
  where questions.lesson_id = p_lesson_id
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
      )
    ) < 2;

  delete from public.lesson_questions as questions
  where questions.lesson_id = p_lesson_id
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
      )
    ) < 2;

  with surviving as (
    select
      questions.id,
      array_agg(questions.choices[choice.position] order by choice.position) as choices,
      array_agg(questions.choice_sense_ids[choice.position] order by choice.position) as choice_sense_ids
    from public.lesson_questions as questions
    cross join lateral generate_subscripts(questions.choices, 1) as choice(position)
    where questions.lesson_id = p_lesson_id
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
      )
    group by questions.id
    having count(*) >= 2
  )
  update public.lesson_questions as questions
  set choices = surviving.choices,
      choice_sense_ids = surviving.choice_sense_ids
  from surviving
  where questions.id = surviving.id;

  with surviving as (
    select
      questions.id,
      array_agg(questions.choices[choice.position] order by choice.position) as choices,
      array_agg(questions.choice_vocabulary_entry_ids[choice.position] order by choice.position) as choice_vocabulary_entry_ids
    from public.lesson_questions as questions
    cross join lateral generate_subscripts(questions.choices, 1) as choice(position)
    where questions.lesson_id = p_lesson_id
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
      )
    group by questions.id
    having count(*) >= 2
  )
  update public.lesson_questions as questions
  set choices = surviving.choices,
      choice_vocabulary_entry_ids = surviving.choice_vocabulary_entry_ids
  from surviving
  where questions.id = surviving.id;

  delete from public.lessons as sessions
  where sessions.id = p_lesson_id
    and sessions.learner_id = p_learner_id
    and sessions.status = 'active'
    and not exists (
      select 1
      from public.lesson_questions
      where lesson_id = p_lesson_id
        and learner_id = p_learner_id
    );

  with question_counts as (
    select
      count(*)::integer as total_count,
      count(*) filter (where is_correct)::integer as correct_count
    from public.lesson_questions
    where lesson_id = p_lesson_id
      and learner_id = p_learner_id
  )
  update public.lessons as sessions
  set total_count = question_counts.total_count,
      correct_count = least(question_counts.correct_count, question_counts.total_count)
  from question_counts
  where sessions.id = p_lesson_id
    and sessions.learner_id = p_learner_id;
end;
$$;

create or replace function public.vocabulary_lesson_eligible_sense_count(p_learning_language_id uuid, p_collection_id uuid default null)
returns bigint
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  current_learner_id uuid := auth.uid();
  eligible_count bigint;
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

  select count(*) into eligible_count
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

  return eligible_count;
end;
$$;

create or replace function public.start_or_resume_vocabulary_lesson(p_learning_language_id uuid, p_collection_id uuid default null)
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
  selected_revealed_example text;
  selected_revealed_example_translation text;
  selected_revealed_example_translation_tag text;
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
    example_text text,
    example_translation text,
    example_translation_tag text,
    cloze_example_text text,
    cloze_example_translation text,
    cloze_example_translation_tag text,
    is_cloze boolean not null default false
  ) on commit drop;

  insert into pg_temp.lesson_selected_senses (
    ordinal,
    sense_id,
    vocabulary_entry_id,
    expression,
    translation,
    answer_language_tag,
    cloze_prompt,
    example_text,
    example_translation,
    example_translation_tag,
    cloze_example_text,
    cloze_example_translation,
    cloze_example_translation_tag
  )
  select
    row_number() over (order by selected.practice_count, selected.random_order),
    selected.sense_id,
    selected.vocabulary_entry_id,
    selected.expression,
    selected.translation,
    selected.answer_language_tag,
    selected.cloze_prompt,
    selected.example_text,
    selected.example_translation,
    selected.example_translation_tag,
    selected.cloze_example_text,
    selected.cloze_example_translation,
    selected.cloze_example_translation_tag
  from (
    select
      senses.id as sense_id,
      senses.vocabulary_entry_id,
      vocabulary_entries.expression,
      translation.text as translation,
      translation.answer_language_tag,
      count(lesson_attempts.id) as practice_count,
      random() as random_order,
      sense_example.example_text,
      sense_example.example_translation,
      sense_example.example_translation_tag,
      sense_example.cloze_example_text,
      sense_example.cloze_example_translation,
      sense_example.cloze_example_translation_tag,
      sense_example.cloze_prompt
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
      select
        (array_agg(candidate.text order by candidate.untranslated, candidate.shuffle))[1] as example_text,
        (array_agg(candidate.translation_text order by candidate.untranslated, candidate.shuffle))[1] as example_translation,
        (array_agg(candidate.translation_tag order by candidate.untranslated, candidate.shuffle))[1] as example_translation_tag,
        (array_agg(candidate.text order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_text,
        (array_agg(candidate.translation_text order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_translation,
        (array_agg(candidate.translation_tag order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_example_translation_tag,
        (array_agg(candidate.cloze_prompt order by candidate.untranslated, candidate.shuffle) filter (where candidate.cloze_prompt is not null))[1] as cloze_prompt
      from (
        select
          examples.text,
          example_translation.text as translation_text,
          example_translation.answer_language_tag as translation_tag,
          example_translation.text is null as untranslated,
          random() as shuffle,
          public.lesson_cloze_prompt(examples.text, vocabulary_entries.expression) as cloze_prompt
        from public.examples
        left join lateral (
          select example_translations.text, example_translations.answer_language_tag
          from public.example_translations
          where example_translations.example_id = examples.id
            and example_translations.learner_id = current_learner_id
            and example_translations.answer_language_tag = preferred_answer_language_tag
            and length(btrim(example_translations.text)) > 0
          limit 1
        ) as example_translation on true
        where examples.sense_id = senses.id
          and examples.learner_id = current_learner_id
      ) as candidate
    ) as sense_example on true
    left join public.lesson_attempts
      on lesson_attempts.sense_id = senses.id
      and lesson_attempts.learner_id = senses.learner_id
    where senses.learner_id = current_learner_id
      and vocabulary_entries.learning_language_id = p_learning_language_id
      and learning_vocabulary_entries.learning_language_id = p_learning_language_id
      and public.lesson_collection_includes(p_collection_id, learning_vocabulary_entries.id)
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
      translation.text, translation.answer_language_tag,
      sense_example.example_text, sense_example.example_translation, sense_example.example_translation_tag,
      sense_example.cloze_example_text, sense_example.cloze_example_translation,
      sense_example.cloze_example_translation_tag, sense_example.cloze_prompt
    order by count(lesson_attempts.id), random_order
    limit target_count
  ) as selected;

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

    if final_is_cloze then
      selected_revealed_example := selected_sense.cloze_example_text;
      selected_revealed_example_translation := selected_sense.cloze_example_translation;
      selected_revealed_example_translation_tag := selected_sense.cloze_example_translation_tag;
    else
      selected_revealed_example := selected_sense.example_text;
      selected_revealed_example_translation := selected_sense.example_translation;
      selected_revealed_example_translation_tag := selected_sense.example_translation_tag;
    end if;

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
      revealed_meaning_answer_language_tag,
      revealed_example,
      revealed_example_translation,
      revealed_example_translation_answer_language_tag
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
      selected_revealed_meaning_tag,
      selected_revealed_example,
      selected_revealed_example_translation,
      selected_revealed_example_translation_tag
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

alter table public.vocabulary_entries drop column suspended;

alter table public.learning_vocabulary_entries drop column suspended;
