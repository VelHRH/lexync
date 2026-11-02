begin;

select plan(13);

insert into auth.users (id) values ('17000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);

select public.create_learning_language('es');
select set_config('test.vocabulary_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'), true);
select set_config('app.lesson_min_questions', '8', true);
select set_config('app.lesson_max_questions', '8', true);

select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'casa', 'gloss casa');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'perro', 'gloss perro');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'nube', 'gloss nube');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'libro', 'gloss libro');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'mesa', 'gloss mesa');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'puerta', 'gloss puerta');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'agua', 'gloss agua');
select public.capture_learning_language_entry(current_setting('test.vocabulary_ll')::uuid, 'en', 'camino', 'gloss camino');

select public.set_vocabulary_entry_audio_clip(
  entries.id,
  entries.learner_id::text || '/' || entries.learning_language_id::text || '/' || entries.id::text || '/first-' || entries.expression || '.webm',
  1500
)
from public.learning_vocabulary_entries as entries
where entries.learner_id = auth.uid()
  and entries.learning_language_id = current_setting('test.vocabulary_ll')::uuid;

select is(
  (select count(*) from public.learning_vocabulary_entries where learner_id = auth.uid() and audio_clip_path is not null),
  8::bigint,
  'the fixture gives every Vocabulary Entry behind the Lesson an Audio Clip'
);

select set_config('test.vocabulary_lesson', (public.start_or_resume_vocabulary_lesson(current_setting('test.vocabulary_ll')::uuid)->>'id'), true);

select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.vocabulary_lesson')::uuid) > 1,
  'the fixture produces a Lesson of several Questions to examine'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'audio_clip_path' is not null
  ),
  0::bigint,
  'the Lesson payload offers no Audio Clip for any Question while every Question is unanswered'
);

select set_config(
  'test.vocabulary_question',
  (select id::text from public.lesson_questions where lesson_id = current_setting('test.vocabulary_lesson')::uuid and continued_at is null order by ordinal limit 1),
  true
);
select public.submit_lesson_answer(
  current_setting('test.vocabulary_lesson')::uuid,
  current_setting('test.vocabulary_question')::uuid,
  (select correct_answer from public.lesson_questions where id = current_setting('test.vocabulary_question')::uuid)
);

select is(
  (
    select questions.value->>'audio_clip_path'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  (
    select entries.audio_clip_path
    from public.lesson_questions as questions
    join public.senses on senses.id = questions.sense_id and senses.learner_id = questions.learner_id
    join public.vocabulary_entries as bridge on bridge.id = senses.vocabulary_entry_id and bridge.learner_id = senses.learner_id
    join public.learning_vocabulary_entries as entries on entries.id = bridge.learning_vocabulary_entry_id and entries.learner_id = bridge.learner_id
    where questions.id = current_setting('test.vocabulary_question')::uuid
  ),
  'an answered Question offers the Audio Clip of the Vocabulary Entry it asks about'
);
select is(
  (
    select questions.value->>'audio_clip_duration_ms'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  '1500',
  'an answered Question states how long its Audio Clip runs'
);
select is(
  (
    select questions.value->>'audio_clip_expression'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  (
    select entries.expression
    from public.lesson_questions as questions
    join public.senses on senses.id = questions.sense_id and senses.learner_id = questions.learner_id
    join public.vocabulary_entries as bridge on bridge.id = senses.vocabulary_entry_id and bridge.learner_id = senses.learner_id
    join public.learning_vocabulary_entries as entries on entries.id = bridge.learning_vocabulary_entry_id and entries.learner_id = bridge.learner_id
    where questions.id = current_setting('test.vocabulary_question')::uuid
  ),
  'an answered Question names the Expression its Audio Clip pronounces'
);
select is(
  (
    select count(*)
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'audio_clip_path' is not null
      and questions.value->>'id' <> current_setting('test.vocabulary_question')
  ),
  0::bigint,
  'the Questions still waiting for an answer offer no Audio Clip of their own'
);

select set_config(
  'test.asked_entry',
  (
    select entries.id::text
    from public.lesson_questions as questions
    join public.senses on senses.id = questions.sense_id and senses.learner_id = questions.learner_id
    join public.vocabulary_entries as bridge on bridge.id = senses.vocabulary_entry_id and bridge.learner_id = senses.learner_id
    join public.learning_vocabulary_entries as entries on entries.id = bridge.learning_vocabulary_entry_id and entries.learner_id = bridge.learner_id
    where questions.id = current_setting('test.vocabulary_question')::uuid
  ),
  true
);
select public.set_vocabulary_entry_audio_clip(current_setting('test.asked_entry')::uuid, null, null);

select is(
  (
    select questions.value->>'audio_clip_path'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  null,
  'an answered Question whose Vocabulary Entry has no Audio Clip offers none'
);

select public.set_vocabulary_entry_audio_clip(
  current_setting('test.asked_entry')::uuid,
  (select entries.learner_id::text || '/' || entries.learning_language_id::text || '/' || entries.id::text || '/second.webm' from public.learning_vocabulary_entries as entries where entries.id = current_setting('test.asked_entry')::uuid),
  2400
);

select is(
  (
    select questions.value->>'audio_clip_path'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  (select audio_clip_path from public.learning_vocabulary_entries where id = current_setting('test.asked_entry')::uuid),
  'a replacement recording reaches the answered Question instead of the retired one'
);
select is(
  (
    select questions.value->>'audio_clip_duration_ms'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.vocabulary_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.vocabulary_question')
  ),
  '2400',
  'the answered Question states the length of the replacement recording'
);

set local role postgres;

insert into auth.users (id) values ('17001000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '17001000-0000-0000-0000-000000000001', true);

select public.create_learning_language('zx');
select set_config('test.dynamic_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'zx'), true);
select set_config('app.lesson_min_questions', '2', true);
select set_config('app.lesson_max_questions', '2', true);

select public.capture_learning_language_entry(current_setting('test.dynamic_ll')::uuid, 'en', 'casa', 'gloss casa');
select public.set_vocabulary_entry_audio_clip(
  entries.id,
  entries.learner_id::text || '/' || entries.learning_language_id::text || '/' || entries.id::text || '/dynamic.webm',
  1500
)
from public.learning_vocabulary_entries as entries
where entries.learner_id = auth.uid()
  and entries.learning_language_id = current_setting('test.dynamic_ll')::uuid;

select set_config(
  'test.dynamic_lesson',
  (public.create_dynamic_lesson(current_setting('test.dynamic_ll')::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'dynamic audio cloze prompt ____',
      'choices', jsonb_build_array('casa', 'perro'),
      'correct_answer', 'casa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'Dynamic audio cloze passage text.'))
    ),
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'dynamic audio translation prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('casa', 'house'),
      'correct_answer', 'house',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Dynamic audio translation passage text.'))
    )
  ))->>'id'),
  true
);

select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.dynamic_lesson')::uuid and vocabulary_entry_id is not null),
  0::bigint,
  'a Dynamic Lesson Question stands behind no Vocabulary Entry even while the Learner owns a recorded word'
);

select set_config(
  'test.dynamic_question',
  (select id::text from public.lesson_questions where lesson_id = current_setting('test.dynamic_lesson')::uuid and continued_at is null order by ordinal limit 1),
  true
);
select public.submit_lesson_answer(
  current_setting('test.dynamic_lesson')::uuid,
  current_setting('test.dynamic_question')::uuid,
  (select correct_answer from public.lesson_questions where id = current_setting('test.dynamic_question')::uuid)
);

select is(
  (
    select questions.value->>'audio_clip_path'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.dynamic_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.dynamic_question')
  ),
  null,
  'an answered Dynamic Lesson Question offers no Audio Clip'
);
select is(
  (
    select questions.value->>'audio_clip_expression'
    from jsonb_array_elements(public.lesson_by_id(current_setting('test.dynamic_lesson')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.dynamic_question')
  ),
  null,
  'an answered Dynamic Lesson Question names no Expression to pronounce'
);

select * from finish();
rollback;
