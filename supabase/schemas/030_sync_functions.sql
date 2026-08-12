-- Declarative source for supabase db diff.
-- Base migration 20260101000000_sync_schema.sql mirrors this file set in dependency order.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

create trigger sync_records_touch_updated_at before update on public.sync_records
  for each row execute function public.touch_updated_at();
create trigger sync_blobs_touch_updated_at before update on public.sync_blobs
  for each row execute function public.touch_updated_at();

create or replace function public.sync_records_assign_rev()
returns trigger language plpgsql set search_path = public as $$
begin
  new.rev := nextval(pg_get_serial_sequence('public.sync_records', 'rev'));
  return new;
end; $$;

-- sync_records_assign_rev and sync_records_touch_updated_at are both before update.
-- Postgres fires before row triggers in name order, which is fine here.

create trigger sync_records_assign_rev before update on public.sync_records
  for each row execute function public.sync_records_assign_rev();

create or replace function public.sync_blobs_assign_rev()
returns trigger language plpgsql set search_path = public as $$
begin new.rev := nextval(pg_get_serial_sequence('public.sync_blobs', 'rev')); return new; end; $$;
create trigger sync_blobs_assign_rev before update on public.sync_blobs
  for each row execute function public.sync_blobs_assign_rev();

create or replace function public.broadcast_sync_record_change()
returns trigger language plpgsql security definer set search_path = public, realtime as $$
declare
  broadcast_new public.sync_records;
  broadcast_old public.sync_records;
begin
  broadcast_new := new;
  broadcast_new.payload := '{}'::jsonb;
  broadcast_old := null;
  if tg_op = 'UPDATE' then
    broadcast_old := old;
    broadcast_old.payload := '{}'::jsonb;
  end if;
  -- Some local stacks lack realtime.broadcast_changes; do not break writes.
  begin
    perform realtime.broadcast_changes(
      'sync:' || new.user_id::text, tg_op, tg_op, tg_table_name, tg_table_schema,
      broadcast_new, broadcast_old);
  exception
    when undefined_function or others then
      null;
  end;
  return new;
end; $$;

create trigger sync_records_broadcast after insert or update on public.sync_records
  for each row execute function public.broadcast_sync_record_change();

create or replace function public.enforce_sync_payload_size()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_column_size(new.payload) > 256 * 1024 then
    raise exception 'sync_payload_too_large' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger sync_records_payload_size before insert or update on public.sync_records
  for each row execute function public.enforce_sync_payload_size();

create or replace function public.enforce_sync_row_cap()
returns trigger language plpgsql set search_path = public as $$
declare row_count bigint;
begin
  select count(*) into row_count from public.sync_records where user_id = new.user_id;
  if row_count >= 50000 then raise exception 'sync_row_cap_exceeded' using errcode = 'P0001'; end if;
  return new;
end; $$;
create trigger sync_records_row_cap before insert on public.sync_records
  for each row execute function public.enforce_sync_row_cap();

create or replace function public.enforce_sync_storage_cap()
returns trigger language plpgsql set search_path = public as $$
declare total_bytes bigint;
begin
  select coalesce(sum(size_bytes),0) into total_bytes from public.sync_blobs
    where user_id = new.user_id and deleted = false;
  if total_bytes + new.size_bytes > 2147483648 then
    raise exception 'sync_storage_cap_exceeded' using errcode = 'P0001';
  end if;
  return new;
end; $$;
create trigger sync_blobs_storage_cap before insert on public.sync_blobs
  for each row execute function public.enforce_sync_storage_cap();

create or replace function public.sync_bounds(p_cursor bigint default 0)
returns table (purged_through_rev bigint, max_rev bigint, full_resync_required boolean)
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); wm public.sync_watermarks;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into wm from public.sync_watermarks where user_id = uid;
  if not found then
    purged_through_rev := 0;
    max_rev := coalesce((select max(rev) from public.sync_records where user_id = uid), 0);
  else
    purged_through_rev := wm.purged_through_rev; max_rev := coalesce(wm.max_rev, 0);
  end if;
  full_resync_required := purged_through_rev > 0 and p_cursor <= purged_through_rev;
  return next;
end; $$;

create or replace function public.purge_my_sync_data() returns void
language plpgsql security definer set search_path = public, storage as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.sync_records where user_id = uid;
  delete from public.sync_devices where user_id = uid;
  delete from public.sync_blobs where user_id = uid;
  delete from public.sync_watermarks where user_id = uid;
  delete from storage.objects where bucket_id = 'attachments'
    and (storage.foldername(name))[1] = uid::text;
end; $$;
