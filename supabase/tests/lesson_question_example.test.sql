begin;

select plan(38);

select has_column('public', 'lesson_questions', 'revealed_example', 'a Lesson Question can record a revealed Example snapshot');
select col_is_null('public', 'lesson_questions', 'revealed_example', 'the revealed Example snapshot is nullable');
select has_column('public', 'lesson_questions', 'revealed_example_translation', 'a Lesson Question can record the Example Translation of its revealed Example snapshot');
select col_is_null('public', 'lesson_questions', 'revealed_example_translation', 'the revealed Example Translation snapshot is nullable');
select has_column('public', 'lesson_questions', 'revealed_example_translation_answer_language_tag', 'a Lesson Question can record the Answer Language of its revealed Example Translation snapshot');
select col_is_null('public', 'lesson_questions', 'revealed_example_translation_answer_language_tag', 'the revealed Example Translation Answer Language tag is nullable');

insert into auth.users (id) values ('16600000-0000-0000-0000-000000000001');

insert into public.learning_languages (id, learner_id, language_tag)
values ('16600000-0000-0000-0000-000000000002', '16600000-0000-0000-0000-000000000001', 'zz');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', '16600000-0000-0000-0000-000000000002', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 0, 6);

select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag) values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', 1, 'translation without example prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', null, 'This house is big.', 'en')$$,
  '23514',
  null,
  'a revealed Example Translation snapshot with no revealed Example is rejected'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag) values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', 2, 'example translation without tag prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', 'Esta casa es grande.', 'This house is big.', null)$$,
  '23514',
  null,
  'a revealed Example Translation snapshot with no Answer Language tag is rejected'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag) values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', 3, 'blank example prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', '   ', null, null)$$,
  '23514',
  null,
  'a blank revealed Example snapshot is rejected'
);
select lives_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag) values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', 4, 'untranslated example prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', 'Esta casa es grande.', null, null)$$,
  'a revealed Example snapshot carrying no Example Translation at all is accepted'
);
select lives_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag) values ('16600000-0000-0000-0000-000000000003', '16600000-0000-0000-0000-000000000001', 5, 'no example prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', null, null, null)$$,
  'a Lesson Question with no revealed Example snapshot at all is accepted'
);

insert into auth.users (id) values ('16601000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16601000-0000-0000-0000-000000000001', true);

select public.create_learning_language('es');
select set_config('test.fixture1_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'), true);
select set_config('app.lesson_min_questions', '8', true);
select set_config('app.lesson_max_questions', '8', true);

select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'casa', 'gloss casa', 'Esta frase contiene casa.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'casa', 'gloss casa', 'Esta otra frase contiene casa.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains casa.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'perro', 'gloss perro', 'Esta frase contiene perro.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'perro', 'gloss perro', 'Esta otra frase contiene perro.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains perro.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'nube', 'gloss nube', 'Esta frase contiene nube.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'nube', 'gloss nube', 'Esta otra frase contiene nube.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains nube.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'libro', 'gloss libro', 'Esta frase contiene libro.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'libro', 'gloss libro', 'Esta otra frase contiene libro.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains libro.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'mesa', 'gloss mesa', 'Esta frase contiene mesa.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'mesa', 'gloss mesa', 'Esta otra frase contiene mesa.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains mesa.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'puerta', 'gloss puerta', 'Esta frase contiene puerta.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'puerta', 'gloss puerta', 'Esta otra frase contiene puerta.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains puerta.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'agua', 'gloss agua', 'Esta frase contiene agua.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'agua', 'gloss agua', 'Esta otra frase contiene agua.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains agua.');
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'camino', 'gloss camino', 'Esta frase contiene camino.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'camino', 'gloss camino', 'Esta otra frase contiene camino.', current_setting('test.tmp_sense')::uuid, false, 'This other sentence contains camino.');

select set_config('test.fixture1_lesson_id', (public.start_or_resume_vocabulary_lesson(current_setting('test.fixture1_ll')::uuid)->>'id'), true);

select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'cloze') > 0,
  'the fixture produces at least one Cloze Question to examine'
);
select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'translation') > 0,
  'the fixture also produces at least one translation Question to examine'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and revealed_example is null),
  0::bigint,
  'every generated Question of either type snapshots an Example of its asked Sense'
);
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and not exists (
        select 1
        from public.examples
        where examples.sense_id = questions.sense_id
          and examples.learner_id = questions.learner_id
          and examples.text = questions.revealed_example
      )
  ),
  0::bigint,
  'every snapshotted Example sentence belongs to the Sense the Question asks about'
);
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and questions.revealed_example is distinct from (
        select examples.text
        from public.examples
        join public.example_translations
          on example_translations.example_id = examples.id
          and example_translations.learner_id = examples.learner_id
        where examples.sense_id = questions.sense_id
          and examples.learner_id = questions.learner_id
      )
  ),
  0::bigint,
  'the Example holding an Example Translation in the Preferred Answer Language wins over the untranslated Example of the same Sense'
);
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and questions.revealed_example_translation is distinct from (
        select example_translations.text
        from public.example_translations
        join public.examples
          on examples.id = example_translations.example_id
          and examples.learner_id = example_translations.learner_id
        where examples.sense_id = questions.sense_id
          and examples.learner_id = questions.learner_id
      )
  ),
  0::bigint,
  'every generated Question snapshots the Example Translation of the Example it snapshotted'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and revealed_example_translation_answer_language_tag is distinct from 'en'),
  0::bigint,
  'every generated Question carries the Preferred Answer Language tag alongside its snapshotted Example Translation'
);

set local role postgres;
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and questions.question_type = 'cloze'
      and public.lesson_cloze_prompt(questions.revealed_example, questions.correct_answer) is distinct from questions.prompt
  ),
  0::bigint,
  'a Cloze Question snapshots the very Example its cloze prompt was derived from, so blanking the asked Expression in the snapshot reproduces the prompt'
);
set local role authenticated;

set local role postgres;
insert into auth.users (id) values ('16602000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '16602000-0000-0000-0000-000000000001', true);

select public.create_learning_language('es');
select set_config('test.fixture2_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'), true);
select set_config('app.lesson_min_questions', '12', true);
select set_config('app.lesson_max_questions', '12', true);

select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'casa', 'gloss casa');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'perro', 'gloss perro');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'nube', 'gloss nube');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'libro', 'gloss libro');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'mesa', 'gloss mesa');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'puerta', 'gloss puerta');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'agua', 'gloss agua');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'camino', 'gloss camino');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'arbol', 'gloss arbol');

select set_config('test.riverbank_sense', (public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'banco', 'river bank', 'El banco del rio es verde.')->>'senseId'), true);
select set_config('test.bench_sense', (public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'banco', 'financial institution', null, null, true)->>'senseId'), true);
select set_config('test.unpreferred_sense', (public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'uk', 'luz', 'light', 'Esta frase contiene luz.', null, false, 'Це речення містить luz.')->>'senseId'), true);

select set_config('test.fixture2_lesson_id', (public.start_or_resume_vocabulary_lesson(current_setting('test.fixture2_ll')::uuid)->>'id'), true);

select is(
  public.preferred_answer_language(current_setting('test.fixture2_ll')::uuid),
  'en',
  'the dominant Answer Language of the absence fixture is the Preferred Answer Language'
);
select ok(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture2_lesson_id')::uuid
      and not exists (select 1 from public.examples where examples.sense_id = questions.sense_id and examples.learner_id = questions.learner_id)
  ) > 0,
  'the absence fixture asks about Senses that have no Example at all'
);
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture2_lesson_id')::uuid
      and not exists (select 1 from public.examples where examples.sense_id = questions.sense_id and examples.learner_id = questions.learner_id)
      and (questions.revealed_example is not null or questions.revealed_example_translation is not null or questions.revealed_example_translation_answer_language_tag is not null)
  ),
  0::bigint,
  'a Question about a Sense with no Example snapshots nothing'
);
select ok(
  exists (select 1 from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and sense_id = current_setting('test.bench_sense')::uuid),
  'the absence fixture asks about the Example-less Sense of a Vocabulary Entry whose other Sense does carry one'
);
select is(
  (select revealed_example from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and sense_id = current_setting('test.bench_sense')::uuid),
  null,
  'a Question never borrows the Example of another Sense of the same Vocabulary Entry'
);
select is(
  (select examples.text from public.examples where examples.sense_id = current_setting('test.riverbank_sense')::uuid),
  'El banco del rio es verde.',
  'the sibling Sense of that same Vocabulary Entry does hold an Example, ruling out absence as the explanation'
);
select is(
  (select revealed_example from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and sense_id = current_setting('test.unpreferred_sense')::uuid),
  'Esta frase contiene luz.',
  'an Example whose only Example Translation is outside the Preferred Answer Language is still snapshotted as a sentence'
);
select is(
  (select revealed_example_translation from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and sense_id = current_setting('test.unpreferred_sense')::uuid),
  null,
  'no Example Translation is snapshotted when the Example holds none in the Preferred Answer Language, with no silent fallback to another Answer Language'
);
select is(
  (select revealed_example_translation_answer_language_tag from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and sense_id = current_setting('test.unpreferred_sense')::uuid),
  null,
  'no Example Translation Answer Language tag is snapshotted alongside an untranslated Example snapshot'
);
select is(
  (
    select example_translations.answer_language_tag
    from public.example_translations
    join public.examples on examples.id = example_translations.example_id and examples.learner_id = example_translations.learner_id
    where examples.sense_id = current_setting('test.unpreferred_sense')::uuid
  ),
  'uk',
  'that Example does carry an Example Translation, only not in the Preferred Answer Language, ruling out absence as the explanation'
);

set local role postgres;

insert into auth.users (id) values ('16603000-0000-0000-0000-000000000001');

insert into public.learning_languages (id, learner_id, language_tag)
values ('16603000-0000-0000-0000-000000000002', '16603000-0000-0000-0000-000000000001', 'zy');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values ('16603000-0000-0000-0000-000000000003', '16603000-0000-0000-0000-000000000001', '16603000-0000-0000-0000-000000000002', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 0, 1);

insert into public.lesson_questions (id, lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_example, revealed_example_translation, revealed_example_translation_answer_language_tag)
values ('16603000-0000-0000-0000-000000000004', '16603000-0000-0000-0000-000000000003', '16603000-0000-0000-0000-000000000001', 1, 'withheld example prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', 'Esta casa es grande.', 'This house is big.', 'en');

select is(
  (select revealed_example from public.lesson_questions where id = '16603000-0000-0000-0000-000000000004'),
  'Esta casa es grande.',
  'the stored revealed Example snapshot holds a value before the Question is answered'
);
select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example'),
  null,
  'the Lesson payload withholds the revealed Example while the Question is unanswered even though the stored row already holds one'
);
select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example_translation'),
  null,
  'the Lesson payload withholds the revealed Example Translation while the Question is unanswered'
);
select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example_translation_answer_language_tag'),
  null,
  'the Lesson payload withholds the revealed Example Translation Answer Language tag while the Question is unanswered'
);

update public.lesson_questions
set selected_answer = 'a', is_correct = true, answered_at = '2026-01-01T00:04:00Z'
where id = '16603000-0000-0000-0000-000000000004';

select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example'),
  'Esta casa es grande.',
  'the Lesson payload exposes the stored revealed Example once the Question is answered'
);
select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example_translation'),
  'This house is big.',
  'the Lesson payload exposes the stored revealed Example Translation once the Question is answered'
);
select is(
  (public.lesson_payload('16603000-0000-0000-0000-000000000003'::uuid, '16603000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_example_translation_answer_language_tag'),
  'en',
  'the Lesson payload exposes the stored revealed Example Translation Answer Language tag once the Question is answered'
);

insert into auth.users (id) values ('16604000-0000-0000-0000-000000000001');

set local role authenticated;

select set_config('request.jwt.claim.sub', '16604000-0000-0000-0000-000000000001', true);

select public.create_learning_language('zx');
select set_config('test.dynamic_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'zx'), true);
select set_config('app.lesson_min_questions', '2', true);
select set_config('app.lesson_max_questions', '2', true);

select set_config(
  'test.dynamic_lesson_id',
  (public.create_dynamic_lesson(current_setting('test.dynamic_ll')::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'dynamic example cloze prompt ____',
      'choices', jsonb_build_array('casa', 'perro'),
      'correct_answer', 'casa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'Dynamic example cloze passage text.'))
    ),
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'dynamic example translation prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('casa', 'house'),
      'correct_answer', 'house',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Dynamic example translation passage text.'))
    )
  ))->>'id'),
  true
);

select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.dynamic_lesson_id')::uuid and (revealed_example is not null or revealed_example_translation is not null or revealed_example_translation_answer_language_tag is not null)),
  0::bigint,
  'a Dynamic Lesson Question, which has no Sense, stores no revealed Example snapshot of any kind'
);
select set_config(
  'test.dynamic_question_id',
  (select id::text from public.lesson_questions where lesson_id = current_setting('test.dynamic_lesson_id')::uuid and question_type = 'cloze' order by ordinal limit 1),
  true
);
select public.submit_lesson_answer(current_setting('test.dynamic_lesson_id')::uuid, current_setting('test.dynamic_question_id')::uuid, 'casa');
select is(
  (
    select questions.value->>'revealed_example'
    from jsonb_array_elements(public.lesson_overview(current_setting('test.dynamic_ll')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.dynamic_question_id')
  ),
  null,
  'an answered Dynamic Lesson Question payload carries no revealed Example'
);

select * from finish();
rollback;
