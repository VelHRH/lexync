begin;

select plan(38);

select has_column('public', 'lesson_questions', 'revealed_meaning', 'a Lesson Question can record a revealed meaning snapshot');
select col_is_null('public', 'lesson_questions', 'revealed_meaning', 'the revealed meaning snapshot is nullable');
select has_column('public', 'lesson_questions', 'revealed_meaning_answer_language_tag', 'a Lesson Question can record the Answer Language of its revealed meaning snapshot');
select col_is_null('public', 'lesson_questions', 'revealed_meaning_answer_language_tag', 'the revealed meaning Answer Language tag is nullable');
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.lesson_questions'::regclass and conname = 'lesson_questions_revealed_meaning_check') is not null,
  'the revealed meaning pairing constraint exists on the Lesson Question table'
);

insert into auth.users (id) values ('16300000-0000-0000-0000-000000000001');

insert into public.learning_languages (id, learner_id, language_tag)
values ('16300000-0000-0000-0000-000000000002', '16300000-0000-0000-0000-000000000001', 'zz');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', '16300000-0000-0000-0000-000000000002', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 0, 5);

select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_meaning, revealed_meaning_answer_language_tag) values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', 1, 'meaning without tag prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', 'house', null)$$,
  '23514',
  null,
  'a revealed meaning snapshot with no Answer Language tag is rejected'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_meaning, revealed_meaning_answer_language_tag) values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', 2, 'tag without meaning prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', null, 'en')$$,
  '23514',
  null,
  'an Answer Language tag with no revealed meaning snapshot is rejected'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_meaning, revealed_meaning_answer_language_tag) values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', 3, 'blank meaning prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', '   ', 'en')$$,
  '23514',
  null,
  'a blank revealed meaning snapshot is rejected'
);
select lives_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_meaning, revealed_meaning_answer_language_tag) values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', 4, 'both null meaning prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', null, null)$$,
  'a Translation Question with no revealed meaning snapshot at all is accepted'
);
select throws_ok(
  $$insert into public.lesson_questions (lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer) values ('16300000-0000-0000-0000-000000000003', '16300000-0000-0000-0000-000000000001', 5, 'cloze shape prompt', 'cloze', null, 'en', array['a', 'b'], 'a')$$,
  '23514',
  null,
  'a Cloze Question carrying an Answer Language tag is still rejected by the Lesson Question shape constraint'
);

insert into auth.users (id) values
  ('16301000-0000-0000-0000-000000000001'),
  ('16301000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '16301000-0000-0000-0000-000000000001', true);

select public.create_learning_language('aa');
select set_config('test.ll_a', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'aa'), true);
select set_config('test.b1_it', (public.capture_learning_language_entry(current_setting('test.ll_a')::uuid, 'it', 'uno', 'one')->>'translationId'), true);
select set_config('test.b1_fr1', (public.capture_learning_language_entry(current_setting('test.ll_a')::uuid, 'fr', 'due', 'two')->>'translationId'), true);
select set_config('test.b1_fr2', (public.capture_learning_language_entry(current_setting('test.ll_a')::uuid, 'fr', 'tre', 'three')->>'translationId'), true);
set local role postgres;
update public.translations set last_used_at = '2026-09-01T00:00:00Z' where id = current_setting('test.b1_it')::uuid;
update public.translations set last_used_at = '2026-01-01T00:00:00Z' where id in (current_setting('test.b1_fr1')::uuid, current_setting('test.b1_fr2')::uuid);
set local role authenticated;
select is(
  public.preferred_answer_language(current_setting('test.ll_a')::uuid),
  'fr',
  'an Answer Language with more distinct translated Senses wins over one with fewer, even when the loser was used more recently'
);

select public.create_learning_language('ab');
select set_config('test.ll_b', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'ab'), true);
select set_config('test.b2_it1', (public.capture_learning_language_entry(current_setting('test.ll_b')::uuid, 'it', 'quattro', 'four')->>'translationId'), true);
select set_config('test.b2_it2', (public.capture_learning_language_entry(current_setting('test.ll_b')::uuid, 'it', 'cinque', 'five')->>'translationId'), true);
select set_config('test.b2_fr1', (public.capture_learning_language_entry(current_setting('test.ll_b')::uuid, 'fr', 'sei', 'six')->>'translationId'), true);
select set_config('test.b2_fr2', (public.capture_learning_language_entry(current_setting('test.ll_b')::uuid, 'fr', 'sette', 'seven')->>'translationId'), true);
set local role postgres;
update public.translations set last_used_at = '2026-01-01T00:00:00Z' where id in (current_setting('test.b2_it1')::uuid, current_setting('test.b2_it2')::uuid);
update public.translations set last_used_at = '2026-02-01T00:00:00Z' where id in (current_setting('test.b2_fr1')::uuid, current_setting('test.b2_fr2')::uuid);
set local role authenticated;
select is(
  public.preferred_answer_language(current_setting('test.ll_b')::uuid),
  'fr',
  'with equal distinct-Sense counts, the more recently used Answer Language wins'
);

select public.create_learning_language('ac');
select set_config('test.ll_c', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'ac'), true);
select set_config('test.b3_fr', (public.capture_learning_language_entry(current_setting('test.ll_c')::uuid, 'fr', 'huit', 'eight')->>'translationId'), true);
select set_config('test.b3_de', (public.capture_learning_language_entry(current_setting('test.ll_c')::uuid, 'de', 'neun', 'nine')->>'translationId'), true);
set local role postgres;
update public.translations set last_used_at = '2026-01-01T00:00:00Z' where id in (current_setting('test.b3_fr')::uuid, current_setting('test.b3_de')::uuid);
set local role authenticated;
select is(
  public.preferred_answer_language(current_setting('test.ll_c')::uuid),
  'de',
  'with counts and recency tied, the lexicographically smaller Answer Language tag wins'
);

select public.create_learning_language('ad');
select set_config('test.ll_d', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'ad'), true);
select is(
  public.preferred_answer_language(current_setting('test.ll_d')::uuid),
  null,
  'a Learning Language with no translated Senses derives no Preferred Answer Language'
);

select public.create_learning_language('ae');
select set_config('test.ll_e', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'ae'), true);
select public.capture_learning_language_entry(current_setting('test.ll_e')::uuid, 'pt', 'dez', 'ten');
select public.create_learning_language('af');
select set_config('test.ll_f', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'af'), true);
select public.capture_learning_language_entry(current_setting('test.ll_f')::uuid, 'nl', 'onze', 'eleven');
select public.capture_learning_language_entry(current_setting('test.ll_f')::uuid, 'nl', 'doze', 'twelve');
select public.capture_learning_language_entry(current_setting('test.ll_f')::uuid, 'nl', 'treze', 'thirteen');
select is(
  public.preferred_answer_language(current_setting('test.ll_e')::uuid),
  'pt',
  'the derivation is scoped to the given Learning Language: Translations under a different Learning Language of the same Learner do not influence it'
);

select set_config('request.jwt.claim.sub', '16301000-0000-0000-0000-000000000002', true);
select public.create_learning_language('ah');
select set_config('test.ll_h', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'ah'), true);
select public.capture_learning_language_entry(current_setting('test.ll_h')::uuid, 'sv', 'ett', 'one');
select public.capture_learning_language_entry(current_setting('test.ll_h')::uuid, 'sv', 'tva', 'two');
select public.capture_learning_language_entry(current_setting('test.ll_h')::uuid, 'sv', 'tre', 'three');
select set_config('request.jwt.claim.sub', '16301000-0000-0000-0000-000000000001', true);
select is(
  public.preferred_answer_language(current_setting('test.ll_h')::uuid),
  null,
  'it is scoped to the calling Learner: another Learner''s Translations under a Learning Language the caller does not own do not influence it'
);

set local role postgres;
insert into auth.users (id) values ('16302000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '16302000-0000-0000-0000-000000000001', true);

select public.create_learning_language('es');
select set_config('test.fixture1_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'), true);
select set_config('app.lesson_min_questions', '8', true);
select set_config('app.lesson_max_questions', '8', true);

select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'casa', 'house', 'Esta frase contiene casa.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'casa', 'house too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'perro', 'dog', 'Esta frase contiene perro.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'perro', 'dog too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'nube', 'cloud', 'Esta frase contiene nube.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'nube', 'cloud too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'libro', 'book', 'Esta frase contiene libro.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'libro', 'book too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'mesa', 'table', 'Esta frase contiene mesa.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'mesa', 'table too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'puerta', 'door', 'Esta frase contiene puerta.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'puerta', 'door too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'agua', 'water', 'Esta frase contiene agua.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'agua', 'water too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'camino', 'road', 'Esta frase contiene camino.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'camino', 'road too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'arbol', 'tree', 'Esta frase contiene arbol.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'arbol', 'tree too', null, current_setting('test.tmp_sense')::uuid);
select set_config('test.tmp_sense', (public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'luz', 'light', 'Esta frase contiene luz.')->>'senseId'), true);
select public.capture_learning_language_entry(current_setting('test.fixture1_ll')::uuid, 'en', 'luz', 'light too', null, current_setting('test.tmp_sense')::uuid);

select set_config('test.fixture1_lesson_id', (public.start_or_resume_vocabulary_lesson(current_setting('test.fixture1_ll')::uuid)->>'id'), true);

select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'cloze') > 0,
  'the fixture produces at least one Cloze Question to examine'
);
select is(
  (
    select count(*)
    from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and questions.question_type = 'cloze'
      and questions.revealed_meaning is distinct from (
        select string_agg(translations.text, ', ' order by translations.created_at, translations.id)
        from public.translations
        where translations.sense_id = questions.sense_id
          and translations.answer_language_tag = 'en'
      )
  ),
  0::bigint,
  'every generated Cloze row snapshots all of its Sense Translations in the Preferred Answer Language, joined by a comma and space'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'cloze' and revealed_meaning_answer_language_tag is distinct from 'en'),
  0::bigint,
  'every generated Cloze row carries the Preferred Answer Language tag alongside its revealed meaning'
);
select ok(
  exists (
    select 1 from public.lesson_questions as questions
    where questions.lesson_id = current_setting('test.fixture1_lesson_id')::uuid
      and questions.question_type = 'cloze'
      and (select count(*) from public.translations where translations.sense_id = questions.sense_id and translations.answer_language_tag = 'en') = 2
  ),
  'at least one examined Cloze Question is asked about a Sense carrying two Translations in the Preferred Answer Language'
);
select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'translation') > 0,
  'the fixture also produces at least one translation Question to examine'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture1_lesson_id')::uuid and question_type = 'translation' and (revealed_meaning is not null or revealed_meaning_answer_language_tag is not null)),
  0::bigint,
  'every generated translation Question carries null for both revealed meaning fields in this ticket'
);

set local role postgres;
insert into auth.users (id) values ('16302000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '16302000-0000-0000-0000-000000000002', true);

select public.create_learning_language('es');
select set_config('test.fixture2_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'es'), true);
select set_config('app.lesson_min_questions', '12', true);
select set_config('app.lesson_max_questions', '12', true);

select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'casa', 'house');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'perro', 'dog');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'nube', 'cloud');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'libro', 'book');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'mesa', 'table');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'puerta', 'door');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'agua', 'water');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'camino', 'road');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'en', 'arbol', 'tree');

select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'uk', 'luz', 'light', 'Esta frase contiene luz.');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'uk', 'mar', 'sea', 'Esta frase contiene mar.');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'uk', 'pan', 'bread', 'Esta frase contiene pan.');
select public.capture_learning_language_entry(current_setting('test.fixture2_ll')::uuid, 'uk', 'reloj', 'clock', 'Esta frase contiene reloj.');

select set_config('test.fixture2_lesson_id', (public.start_or_resume_vocabulary_lesson(current_setting('test.fixture2_ll')::uuid)->>'id'), true);

select is(
  public.preferred_answer_language(current_setting('test.fixture2_ll')::uuid),
  'en',
  'the dominant Answer Language in the fallback fixture is the Preferred Answer Language'
);
select ok(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and question_type = 'cloze') > 0,
  'the fallback fixture produces at least one Cloze Question to examine'
);
select is(
  (select count(*) from public.lesson_questions where lesson_id = current_setting('test.fixture2_lesson_id')::uuid and question_type = 'cloze' and (revealed_meaning is not null or revealed_meaning_answer_language_tag is not null)),
  0::bigint,
  'a Cloze row whose asked Sense has no Translation in the Preferred Answer Language carries null for both revealed meaning fields, with no silent fallback to another Answer Language'
);
select ok(
  (
    select count(*)
    from public.lesson_questions as questions
    join public.translations on translations.sense_id = questions.sense_id and translations.learner_id = questions.learner_id
    where questions.lesson_id = current_setting('test.fixture2_lesson_id')::uuid
      and questions.question_type = 'cloze'
      and translations.answer_language_tag = 'uk'
  ) > 0,
  'the Cloze-eligible Senses do carry a Translation, only not in the Preferred Answer Language, ruling out absence as the explanation for the null snapshot'
);

set local role postgres;

insert into auth.users (id) values ('16303000-0000-0000-0000-000000000001');

insert into public.learning_languages (id, learner_id, language_tag)
values ('16303000-0000-0000-0000-000000000002', '16303000-0000-0000-0000-000000000001', 'zy');

insert into public.lessons (id, learner_id, learning_language_id, status, created_at, completed_at, correct_count, total_count)
values ('16303000-0000-0000-0000-000000000003', '16303000-0000-0000-0000-000000000001', '16303000-0000-0000-0000-000000000002', 'completed', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', 0, 1);

insert into public.lesson_questions (id, lesson_id, learner_id, ordinal, prompt, question_type, direction, answer_language_tag, choices, correct_answer, revealed_meaning, revealed_meaning_answer_language_tag)
values ('16303000-0000-0000-0000-000000000004', '16303000-0000-0000-0000-000000000003', '16303000-0000-0000-0000-000000000001', 1, 'withheld meaning prompt', 'translation', 'recognition', 'en', array['a', 'b'], 'a', 'house', 'en');

select is(
  (select revealed_meaning from public.lesson_questions where id = '16303000-0000-0000-0000-000000000004'),
  'house',
  'the stored revealed meaning snapshot holds a value before the Question is answered'
);
select is(
  (select revealed_meaning_answer_language_tag from public.lesson_questions where id = '16303000-0000-0000-0000-000000000004'),
  'en',
  'the stored revealed meaning Answer Language tag holds a value before the Question is answered'
);
select is(
  (public.lesson_payload('16303000-0000-0000-0000-000000000003'::uuid, '16303000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_meaning'),
  null,
  'the Lesson payload withholds the revealed meaning while the Question is unanswered even though the stored row already holds one'
);
select is(
  (public.lesson_payload('16303000-0000-0000-0000-000000000003'::uuid, '16303000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_meaning_answer_language_tag'),
  null,
  'the Lesson payload withholds the revealed meaning Answer Language tag while the Question is unanswered even though the stored row already holds one'
);

update public.lesson_questions
set selected_answer = 'a', is_correct = true, answered_at = '2026-01-01T00:04:00Z'
where id = '16303000-0000-0000-0000-000000000004';

select is(
  (public.lesson_payload('16303000-0000-0000-0000-000000000003'::uuid, '16303000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_meaning'),
  'house',
  'the Lesson payload exposes the stored revealed meaning once the Question is answered'
);
select is(
  (public.lesson_payload('16303000-0000-0000-0000-000000000003'::uuid, '16303000-0000-0000-0000-000000000001'::uuid)->'questions'->0->>'revealed_meaning_answer_language_tag'),
  'en',
  'the Lesson payload exposes the stored revealed meaning Answer Language tag once the Question is answered'
);

insert into auth.users (id) values ('16304000-0000-0000-0000-000000000001');

set local role authenticated;

select set_config('request.jwt.claim.sub', '16304000-0000-0000-0000-000000000001', true);

select public.create_learning_language('zx');
select set_config('test.e_ll', (select id::text from public.learning_languages where learner_id = auth.uid() and language_tag = 'zx'), true);
select set_config('app.lesson_min_questions', '2', true);
select set_config('app.lesson_max_questions', '2', true);

select set_config(
  'test.e_lesson_id',
  (public.create_dynamic_lesson(current_setting('test.e_ll')::uuid, jsonb_build_array(
    jsonb_build_object(
      'question_type', 'cloze',
      'prompt', 'dynamic meaning cloze prompt ____',
      'choices', jsonb_build_array('casa', 'perro'),
      'correct_answer', 'casa',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 0, 'similarity', 0.9, 'passage_text', 'Dynamic meaning cloze passage text.'))
    ),
    jsonb_build_object(
      'question_type', 'translation',
      'prompt', 'dynamic meaning translation prompt',
      'direction', 'recognition',
      'answer_language_tag', 'en',
      'choices', jsonb_build_array('casa', 'house'),
      'correct_answer', 'house',
      'passages', jsonb_build_array(jsonb_build_object('passage_id', gen_random_uuid(), 'material_id', gen_random_uuid(), 'passage_ordinal', 1, 'similarity', 0.88, 'passage_text', 'Dynamic meaning translation passage text.'))
    )
  ))->>'id'),
  true
);
select set_config(
  'test.e_cloze_question_id',
  (select id::text from public.lesson_questions where lesson_id = current_setting('test.e_lesson_id')::uuid and question_type = 'cloze' order by ordinal limit 1),
  true
);

select is(
  (select revealed_meaning from public.lesson_questions where id = current_setting('test.e_cloze_question_id')::uuid),
  null,
  'a Dynamic Lesson Cloze Question stores no revealed meaning snapshot'
);
select is(
  (select revealed_meaning_answer_language_tag from public.lesson_questions where id = current_setting('test.e_cloze_question_id')::uuid),
  null,
  'a Dynamic Lesson Cloze Question stores no revealed meaning Answer Language tag'
);
select is(
  (public.lesson_overview(current_setting('test.e_ll')::uuid)->'questions'->0->>'revealed_meaning'),
  null,
  'an unanswered Dynamic Lesson Cloze Question payload carries no revealed meaning'
);
select is(
  (public.lesson_overview(current_setting('test.e_ll')::uuid)->'questions'->0->>'revealed_meaning_answer_language_tag'),
  null,
  'an unanswered Dynamic Lesson Cloze Question payload carries no revealed meaning Answer Language tag'
);

select public.submit_lesson_answer(current_setting('test.e_lesson_id')::uuid, current_setting('test.e_cloze_question_id')::uuid, 'casa');

select is(
  (
    select questions.value->>'revealed_meaning'
    from jsonb_array_elements(public.lesson_overview(current_setting('test.e_ll')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.e_cloze_question_id')
  ),
  null,
  'an answered Dynamic Lesson Cloze Question payload still carries no revealed meaning'
);
select is(
  (
    select questions.value->>'revealed_meaning_answer_language_tag'
    from jsonb_array_elements(public.lesson_overview(current_setting('test.e_ll')::uuid)->'questions') as questions
    where questions.value->>'id' = current_setting('test.e_cloze_question_id')
  ),
  null,
  'an answered Dynamic Lesson Cloze Question payload still carries no revealed meaning Answer Language tag'
);

select * from finish();
rollback;
