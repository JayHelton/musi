-- supabase/migrations/20260102000003_sync_cron_purge.sql

do $$ begin
  execute $cron$
    select cron.unschedule('purge_sync_tombstones') where exists (
      select 1 from cron.job where jobname = 'purge_sync_tombstones'
    )
  $cron$;
  perform cron.schedule('purge_sync_tombstones', '0 4 * * *', $$
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
  $$);
exception when others then
  raise notice 'pg_cron purge_sync_tombstones not scheduled: %', sqlerrm;
end $$;
