\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- The owner seed is already there. Two test identities need their own entry,
-- which is itself proof that the gate blocks anybody who is not listed.
insert into public.signup_allowlist (email, note)
values ('owner@test.example', 'test'), ('attacker@test.example', 'test')
on conflict do nothing;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.example'),
  ('22222222-2222-2222-2222-222222222222', 'attacker@test.example')
on conflict do nothing;

insert into public.sync_records (user_id, domain, record_id, device_id, content_hash, payload)
values ('11111111-1111-1111-1111-111111111111', 'notes', 'note-secret', 'dev-a', 'h',
        '{"title":"private"}'::jsonb)
on conflict do nothing;

\echo ''
\echo '== 1. anon has no privilege on the sync tables =='
select t as check,
       case when has_table_privilege('anon', t, 'select')
              or has_table_privilege('anon', t, 'insert')
              or has_table_privilege('anon', t, 'update')
              or has_table_privilege('anon', t, 'delete')
            then 'FAIL' else 'PASS' end as result
from unnest(array['public.sync_records','public.sync_devices','public.sync_blobs','public.signup_allowlist']) t;

\echo ''
\echo '== 2. user B cannot read, change, or delete the rows of user A =='
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select 'B reads A rows' as check,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
from public.sync_records where record_id = 'note-secret';

with u as (
  update public.sync_records set payload = '{"title":"hacked"}'::jsonb
  where record_id = 'note-secret' returning 1
)
select 'B updates A rows' as check,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result from u;

with d as (
  delete from public.sync_records where record_id = 'note-secret' returning 1
)
select 'B deletes A rows' as check,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result from d;

do $check$
begin
  insert into public.sync_records (user_id, domain, record_id, device_id, content_hash, payload)
  values ('11111111-1111-1111-1111-111111111111', 'notes', 'spoofed', 'dev-b', 'h', '{}'::jsonb);
  raise notice 'B writes a row as A ....... FAIL (the spoofed row was written)';
exception when insufficient_privilege then
  raise notice 'B writes a row as A ....... PASS (RLS rejected the spoofed user_id)';
end
$check$;
commit;

\echo ''
\echo '== 3. user A still reads an unchanged row =='
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'A reads own row' as check,
       case when payload->>'title' = 'private' then 'PASS' else 'FAIL' end as result
from public.sync_records where record_id = 'note-secret';
commit;

\echo ''
\echo '== 4. quotas and the sign-up gate =='
do $check$
begin
  insert into public.sync_records (user_id, domain, record_id, device_id, content_hash, payload)
  values ('11111111-1111-1111-1111-111111111111', 'notes', 'huge', 'dev-a', 'h',
          jsonb_build_object('p', repeat('x', 300000)));
  raise notice 'payload cap ............... FAIL (an oversize payload was accepted)';
exception when raise_exception then
  raise notice 'payload cap ............... PASS (%)', sqlerrm;
end
$check$;

do $check$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@evil.example');
  raise notice 'sign-up by a stranger ..... FAIL (an account was created)';
exception when raise_exception then
  raise notice 'sign-up by a stranger ..... PASS (%)', sqlerrm;
end
$check$;

insert into public.signup_allowlist (email, note) values ('owner2@test.example', 'owner');
do $check$
begin
  insert into auth.users (id, email) values (gen_random_uuid(), 'OWNER2@test.example');
  raise notice 'sign-up by the owner ...... PASS (allowed, and the match ignores letter case)';
exception when raise_exception then
  raise notice 'sign-up by the owner ...... FAIL (%)', sqlerrm;
end
$check$;

\echo ''
\echo '== 5. policy coverage =='
select 'storage.objects policies' as check,
       case when count(*) = 4 then 'PASS' else 'FAIL (' || count(*) || ')' end as result
from pg_policies where schemaname = 'storage' and tablename = 'objects'
union all
select 'realtime.messages policies',
       case when count(*) = 2 then 'PASS' else 'FAIL (' || count(*) || ')' end
from pg_policies where schemaname = 'realtime' and tablename = 'messages';

\echo ''
\echo '== 6. row level security is enabled and forced =='
select relname as check,
       case when relrowsecurity and relforcerowsecurity then 'PASS' else 'FAIL' end as result
from pg_class where relname in ('sync_records','sync_devices','sync_blobs','sync_watermarks')
order by relname;
