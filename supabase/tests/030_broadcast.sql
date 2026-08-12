-- tests/030_broadcast.sql
begin;
select plan(2);

select has_function('public', 'broadcast_sync_record_change', 'broadcast fn exists');
select has_function('public', 'sync_bounds', ARRAY['bigint'], 'sync_bounds fn exists');

select * from finish();
rollback;
