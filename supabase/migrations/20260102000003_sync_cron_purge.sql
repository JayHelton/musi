-- supabase/migrations/20260102000003_sync_cron_purge.sql
--
-- Schedule the daily tombstone purge. The job keeps a deleted record for 90
-- days, so a device that syncs late still learns about the delete.
--
-- Dollar quoting needs care here. The job body is itself a dollar-quoted
-- string, so the outer block and the inner body must use different tags.
-- A plain `$$` for both ends the outer block early and breaks the migration.
--
-- A stack without pg_cron must not fail the migration chain, so the block traps
-- every error and reports it as a notice. Musi works without the purge.

do $purge_setup$
begin
  if exists (select 1 from cron.job where jobname = 'purge_sync_tombstones') then
    perform cron.unschedule('purge_sync_tombstones');
  end if;

  perform cron.schedule('purge_sync_tombstones', '0 4 * * *', $job$
    with deleted_records as (
      delete from public.sync_records where deleted and updated_at < now() - interval '90 days'
      returning user_id, rev
    ), deleted_blobs as (
      delete from public.sync_blobs where deleted and updated_at < now() - interval '90 days'
      returning user_id, rev
    ), deleted as (
      select user_id, rev from deleted_records union all select user_id, rev from deleted_blobs
    ), boundary as (select user_id, max(rev) as purged_rev from deleted group by user_id),
    live_max as (select user_id, max(rev) as max_rev from public.sync_records group by user_id),
    affected as (select user_id from boundary union select user_id from live_max)
    insert into public.sync_watermarks (user_id, purged_through_rev, max_rev, updated_at)
    select a.user_id, greatest(coalesce(w.purged_through_rev, 0), coalesce(b.purged_rev, 0)), lm.max_rev, now()
    from affected a
    left join boundary b on b.user_id = a.user_id
    left join live_max lm on lm.user_id = a.user_id
    left join public.sync_watermarks w on w.user_id = a.user_id
    on conflict (user_id) do update set
      purged_through_rev = greatest(sync_watermarks.purged_through_rev, excluded.purged_through_rev),
      max_rev = excluded.max_rev, updated_at = now();
  $job$);
exception when others then
  raise notice 'pg_cron purge_sync_tombstones not scheduled: %', sqlerrm;
end
$purge_setup$;
