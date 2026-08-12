-- tests/010_rls_sync_records.sql
begin;
select plan(1);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@test.com', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'b@test.com', '', now(), now());

insert into public.sync_records (user_id, domain, record_id, device_id, content_hash, payload)
  values ('11111111-1111-1111-1111-111111111111', 'notes', 'note-1', 'd', 'h', '{}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select is(
  (select count(*)::int from public.sync_records where record_id = 'note-1'),
  0,
  'user B cannot see user A rows'
);

select * from finish();
rollback;
