-- supabase/migrations/20260102000001_realtime_messages_rls.sql

create policy realtime_sync_receive on realtime.messages for select to authenticated
  using (topic = 'sync:' || (select auth.uid())::text);
create policy realtime_sync_send on realtime.messages for insert to authenticated
  with check (topic = 'sync:' || (select auth.uid())::text);
