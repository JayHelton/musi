-- tests/020_quotas.sql
begin;
select plan(1);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'a@test.com', '', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select throws_ok(
  $$insert into public.sync_records (user_id, domain, record_id, device_id, content_hash, payload)
    values ('11111111-1111-1111-1111-111111111111', 'notes', 'big', 'd', 'h',
      jsonb_build_object('p', repeat('x', 300000)))$$,
  'P0001', 'sync_payload_too_large', 'oversize payload rejected');

select * from finish();
rollback;
