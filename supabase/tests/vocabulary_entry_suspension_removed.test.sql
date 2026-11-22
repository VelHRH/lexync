begin;

select plan(9);

select hasnt_function('public', 'set_vocabulary_entry_suspended', 'the suspension setter RPC no longer exists');
select hasnt_function('public', 'sync_learning_vocabulary_entry_suspension', 'the suspension sync function no longer exists');
select hasnt_trigger('public', 'vocabulary_entries', 'sync_learning_vocabulary_entry_suspension', 'the suspension sync trigger no longer exists');
select hasnt_column('public', 'vocabulary_entries', 'suspended', 'Vocabulary Entries no longer store suspension');
select hasnt_column('public', 'learning_vocabulary_entries', 'suspended', 'Learning Vocabulary Entries no longer store suspension');

insert into auth.users (id) values ('5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e');

set local role authenticated;
select set_config('request.jwt.claim.sub', '5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e', true);

select public.create_study_pair('es', 'en');
select public.capture_manual_entry((select id from public.study_pairs), 'casa', 'house', null);
select public.capture_manual_entry((select id from public.study_pairs), 'perro', 'dog', null);
select set_config('test.learning_language_id', (select id::text from public.learning_languages), true);
select set_config('app.lesson_min_questions', '2', true);
select set_config('app.lesson_max_questions', '2', true);

select is(
  public.vocabulary_lesson_eligible_sense_count(current_setting('test.learning_language_id')::uuid),
  2::bigint,
  'every Vocabulary Entry is eligible for Vocabulary Lessons'
);
select set_config(
  'test.lesson_id',
  public.start_or_resume_vocabulary_lesson(current_setting('test.learning_language_id')::uuid)->>'id',
  true
);
select is(
  (select count(distinct senses.vocabulary_entry_id)
   from public.lesson_questions
   join public.senses on senses.id = lesson_questions.sense_id
   where lesson_questions.lesson_id = current_setting('test.lesson_id')::uuid),
  2::bigint,
  'every Vocabulary Entry owns a Lesson question'
);
select is(
  (select count(distinct senses.vocabulary_entry_id)
   from public.lesson_questions
   cross join lateral unnest(lesson_questions.choice_sense_ids) as choice(sense_id)
   join public.senses on senses.id = choice.sense_id
   where lesson_questions.lesson_id = current_setting('test.lesson_id')::uuid
     and choice.sense_id <> lesson_questions.sense_id),
  2::bigint,
  'every Vocabulary Entry serves as a distractor'
);
select is(
  (public.vocabulary_progress(current_setting('test.learning_language_id')::uuid)->>'total_count')::integer,
  2,
  'Vocabulary Progress counts every Vocabulary Entry'
);

select * from finish();
rollback;
