create table public.review_participations (
  id uuid primary key,
  learner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, learner_id),
  foreign key (card_id, learner_id) references public.cards(id, learner_id) on delete cascade
);

create index review_participations_chronological
on public.review_participations (card_id, occurred_at, id);

insert into public.review_participations (id, learner_id, card_id, occurred_at, created_at)
select id, learner_id, card_id, occurred_at, created_at
from public.review_events;

alter table public.review_participations enable row level security;

create policy learner_reads_review_participations on public.review_participations
for select to authenticated
using ((select auth.uid()) = learner_id);

revoke all on public.review_participations from anon, authenticated;
grant select on public.review_participations to authenticated;

drop function if exists public.confirm_scheduled_review_session(uuid, uuid, uuid, public.scheduled_review_rating, timestamptz);
drop function if exists public.confirm_scheduled_review(uuid, uuid, public.scheduled_review_rating, timestamptz);
drop function if exists public.start_or_resume_scheduled_review(uuid, uuid[]);
drop function if exists public.scheduled_review_session_overview(uuid);
drop function if exists public.end_scheduled_review_session(uuid);
drop function if exists public.learning_scheduled_review_overview(uuid);
drop function if exists public.scheduled_review_overview();

create or replace function public.account_learning_snapshot()
returns jsonb
language plpgsql
stable
security invoker
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
                'suspended', learning_vocabulary_entries.suspended,
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

revoke all on function public.account_learning_snapshot() from public;
grant execute on function public.account_learning_snapshot() to authenticated;

drop table public.scheduled_review_session_items;
drop table public.scheduled_review_sessions;
drop table public.review_events;
drop type public.scheduled_review_rating;

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
    perform 1
    from public.review_sessions
    where id = selected_session_id
      and learner_id = current_learner_id
      and status = 'active';

    if found then
      return public.review_session_payload(selected_session_id, current_learner_id);
    end if;

    selected_session_id := null;
  end if;

  setting_value := current_setting('app.review_session_min_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.review_session_min_size', true);
  end if;
  begin
    minimum_target := setting_value::integer;
  exception when others then
    minimum_target := 8;
  end;
  if setting_value is null or minimum_target is null then
    minimum_target := 8;
  end if;

  setting_value := current_setting('app.review_session_max_questions', true);
  if setting_value is null then
    setting_value := current_setting('app.review_session_max_size', true);
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
    with practice_counts as (
      select practice.sense_id, count(*) as practice_count
      from (
        select review_attempts.sense_id
        from public.review_attempts
        where review_attempts.learner_id = current_learner_id
        union all
        select cards.sense_id
        from public.review_participations
        join public.cards
          on cards.id = review_participations.card_id
          and cards.learner_id = review_participations.learner_id
        where review_participations.learner_id = current_learner_id
      ) as practice
      group by practice.sense_id
    )
    select
      senses.id as sense_id,
      senses.vocabulary_entry_id,
      vocabulary_entries.expression,
      coalesce(practice_counts.practice_count, 0) as practice_count
    from public.senses
    join public.vocabulary_entries
      on vocabulary_entries.id = senses.vocabulary_entry_id
      and vocabulary_entries.learner_id = senses.learner_id
    join public.learning_vocabulary_entries
      on learning_vocabulary_entries.id = vocabulary_entries.learning_vocabulary_entry_id
      and learning_vocabulary_entries.learner_id = vocabulary_entries.learner_id
    left join practice_counts
      on practice_counts.sense_id = senses.id
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
    order by coalesce(practice_counts.practice_count, 0), random()
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

revoke all on function public.start_or_resume_review_session(uuid) from public;
grant execute on function public.start_or_resume_review_session(uuid) to authenticated;
