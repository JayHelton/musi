-- Remove the default execute grants from the helper functions.
--
-- Supabase grants EXECUTE on every new function in the `public` schema to
-- `anon`, `authenticated`, and `service_role`. A `revoke ... from public` does
-- not remove those grants, because each role holds an explicit grant. The
-- Supabase security advisor reports the result as
-- "Public Can Execute SECURITY DEFINER Function".
--
-- No data leaked. `sync_bounds` and `purge_my_sync_data` stop at once when
-- `auth.uid()` is null, and PostgreSQL refuses a direct call to a trigger
-- function. The grants are still surface that nobody needs, so this migration
-- removes them.
--
-- A trigger keeps working without an execute grant. PostgreSQL checks the
-- privilege when a person creates the trigger, not when the trigger fires.

-- Trigger functions. Nobody may call these through the API.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.sync_records_assign_rev() from public, anon, authenticated;
revoke all on function public.sync_blobs_assign_rev() from public, anon, authenticated;
revoke all on function public.broadcast_sync_record_change() from public, anon, authenticated;
revoke all on function public.enforce_sync_payload_size() from public, anon, authenticated;
revoke all on function public.enforce_sync_row_cap() from public, anon, authenticated;
revoke all on function public.enforce_sync_storage_cap() from public, anon, authenticated;

-- RPCs the app calls. A signed-in user keeps access. Nobody else gets it.
revoke all on function public.sync_bounds(bigint) from public, anon;
grant execute on function public.sync_bounds(bigint) to authenticated;

revoke all on function public.purge_my_sync_data() from public, anon;
grant execute on function public.purge_my_sync_data() to authenticated;
