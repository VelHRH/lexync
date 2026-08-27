create or replace function public.account_vocabulary_snapshot()
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
                'suspended', vocabulary_entries.suspended,
                'senses', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', senses.id,
                      'translations', coalesce((
                        select jsonb_agg(jsonb_build_object('id', translations.id, 'text', translations.text) order by translations.created_at, translations.id)
                        from public.translations
                        where translations.learner_id = current_learner_id and translations.sense_id = senses.id
                      ), '[]'::jsonb),
                      'examples', coalesce((
                        select jsonb_agg(jsonb_build_object('id', examples.id, 'text', examples.text) order by examples.created_at, examples.id)
                        from public.examples
                        where examples.learner_id = current_learner_id and examples.sense_id = senses.id
                      ), '[]'::jsonb)
                    ) order by senses.created_at, senses.id
                  )
                  from public.senses
                  where senses.learner_id = current_learner_id and senses.vocabulary_entry_id = vocabulary_entries.id
                ), '[]'::jsonb)
              ) order by vocabulary_entries.created_at, vocabulary_entries.id
            )
            from public.vocabulary_entries
            where vocabulary_entries.learner_id = current_learner_id and vocabulary_entries.study_pair_id = study_pairs.id
          ), '[]'::jsonb)
        ) order by study_pairs.created_at, study_pairs.id
      )
      from public.study_pairs
      where study_pairs.learner_id = current_learner_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.account_vocabulary_snapshot() from public;
grant execute on function public.account_vocabulary_snapshot() to authenticated;
