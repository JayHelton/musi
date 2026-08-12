-- Declarative source for supabase db diff.
-- Base migration 20260101000000_sync_schema.sql mirrors this file set in dependency order.

-- pg_cron runs the tombstone purge. Some local stacks do not offer it, and a
-- hard failure here would stop the whole migration chain. Musi keeps working
-- without the purge, so the extension stays optional.
do $$ begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron is not available: %', sqlerrm;
end $$;
