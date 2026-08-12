-- supabase/migrations/20260102000000_sync_rls.sql

alter table public.sync_records enable row level security;
alter table public.sync_records force row level security;
revoke all on public.sync_records from anon, authenticated;
grant select, insert, update, delete on public.sync_records to authenticated;
create policy sync_records_select_own on public.sync_records for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_records_insert_own on public.sync_records for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_records_update_own on public.sync_records for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_records_delete_own on public.sync_records for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_devices enable row level security;
alter table public.sync_devices force row level security;
revoke all on public.sync_devices from anon, authenticated;
grant select, insert, update, delete on public.sync_devices to authenticated;
create policy sync_devices_select_own on public.sync_devices for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_devices_insert_own on public.sync_devices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_devices_update_own on public.sync_devices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_devices_delete_own on public.sync_devices for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_blobs enable row level security;
alter table public.sync_blobs force row level security;
revoke all on public.sync_blobs from anon, authenticated;
grant select, insert, update, delete on public.sync_blobs to authenticated;
create policy sync_blobs_select_own on public.sync_blobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy sync_blobs_insert_own on public.sync_blobs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy sync_blobs_update_own on public.sync_blobs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_blobs_delete_own on public.sync_blobs for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.sync_watermarks enable row level security;
alter table public.sync_watermarks force row level security;
revoke all on public.sync_watermarks from anon, authenticated;
grant select on public.sync_watermarks to authenticated;
create policy sync_watermarks_select_own on public.sync_watermarks for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.sync_bounds(bigint) from public;
grant execute on function public.sync_bounds(bigint) to authenticated;

revoke all on function public.purge_my_sync_data() from public;
grant execute on function public.purge_my_sync_data() to authenticated;
