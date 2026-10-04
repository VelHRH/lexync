begin;

select plan(7);

select ok(
  to_regprocedure('public.fail_learning_material(uuid, uuid, integer, text)') is not null,
  'the Learning Material failure RPC accepts a failure reason'
);
select ok(
  to_regprocedure('public.fail_learning_material(uuid, uuid, integer)') is null,
  'the reasonless Learning Material failure RPC is retired'
);
select ok(
  has_function_privilege('authenticated', 'public.fail_learning_material(uuid, uuid, integer, text)', 'execute'),
  'authenticated clients can execute the Learning Material failure RPC'
);
select ok(
  not has_function_privilege('anon', 'public.fail_learning_material(uuid, uuid, integer, text)', 'execute'),
  'anonymous clients cannot execute the Learning Material failure RPC'
);

insert into auth.users (id) values ('11a00000-0000-0000-0000-000000000001');

insert into public.learning_languages (id, learner_id, language_tag, created_at)
values ('11a10000-0000-0000-0000-000000000001', '11a00000-0000-0000-0000-000000000001', 'es', '2026-10-04T08:00:00Z');

insert into public.learning_materials (id, learner_id, learning_language_id, file_name, storage_path, byte_size, status, processing_version)
values ('11a20000-0000-0000-0000-000000000001', '11a00000-0000-0000-0000-000000000001', '11a10000-0000-0000-0000-000000000001', 'notes.txt', '11a00000-0000-0000-0000-000000000001/11a10000-0000-0000-0000-000000000001/11a20000-0000-0000-0000-000000000001/notes.txt', 128, 'processing', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11a00000-0000-0000-0000-000000000001', true);

select is(
  (public.fail_learning_material('11a20000-0000-0000-0000-000000000001', '11a10000-0000-0000-0000-000000000001', 1, 'This Learning Material is written in Lithuanian, not Spanish.')).failure_reason,
  'This Learning Material is written in Lithuanian, not Spanish.',
  'a failed Learning Material keeps the reason it failed'
);

reset role;

update public.learning_materials
set status = 'ready',
    normalized_text = 'hola'
where id = '11a20000-0000-0000-0000-000000000001';

select is(
  (select failure_reason from public.learning_materials where id = '11a20000-0000-0000-0000-000000000001'),
  null,
  'a Learning Material that leaves the failed status drops its failure reason'
);

update public.learning_materials
set failure_reason = 'stale'
where id = '11a20000-0000-0000-0000-000000000001';

select is(
  (select failure_reason from public.learning_materials where id = '11a20000-0000-0000-0000-000000000001'),
  null,
  'a ready Learning Material cannot be given a failure reason'
);

select * from finish();

rollback;
