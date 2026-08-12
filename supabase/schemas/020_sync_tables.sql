-- Declarative source for supabase db diff.
-- Base migration 20260101000000_sync_schema.sql mirrors this file set in dependency order.

create table public.sync_records (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  domain        text        not null,
  record_id     text        not null,
  payload       jsonb       not null default '{}'::jsonb,
  deleted       boolean     not null default false,
  updated_at    timestamptz not null default now(),
  device_id     text        not null,
  content_hash  text        not null,
  rev           bigserial   not null,
  constraint sync_records_pkey primary key (user_id, domain, record_id),
  constraint sync_records_domain_check check (domain in (
    'settings','progress','notes','songs','exercises','exerciseCategories',
    'workbooks','workbookFolders','routines','gpAnnotations','drumPatterns',
    'attachmentsMeta')),
  constraint sync_records_record_id_nonempty check (char_length(record_id) > 0),
  constraint sync_records_device_id_nonempty check (char_length(device_id) > 0)
);

create index sync_records_user_rev_idx on public.sync_records (user_id, rev);
create index sync_records_user_domain_rev_idx on public.sync_records (user_id, domain, rev);

create table public.sync_devices (
  user_id          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  device_id        text        not null,
  name             text,
  platform         text,
  app_version      text,
  last_seen_at     timestamptz not null default now(),
  last_pulled_rev  bigint      not null default 0,
  created_at       timestamptz not null default now(),
  constraint sync_devices_pkey primary key (user_id, device_id),
  constraint sync_devices_device_id_nonempty check (char_length(device_id) > 0)
);

create index sync_devices_user_last_seen_idx on public.sync_devices (user_id, last_seen_at desc);

create table public.sync_blobs (
  user_id        uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  attachment_id  text        not null,
  crc32          text        not null,
  size_bytes     bigint      not null,
  mime_type      text,
  storage_path   text        not null,
  deleted        boolean     not null default false,
  updated_at     timestamptz not null default now(),
  rev            bigserial   not null,
  constraint sync_blobs_pkey primary key (user_id, attachment_id),
  constraint sync_blobs_attachment_id_prefix check (attachment_id like 'att-%'),
  constraint sync_blobs_size_positive check (size_bytes > 0)
);

create index sync_blobs_user_rev_idx on public.sync_blobs (user_id, rev);
create index sync_blobs_user_crc32_size_idx on public.sync_blobs (user_id, crc32, size_bytes)
  where deleted = false;

create table public.sync_watermarks (
  user_id            uuid        primary key references auth.users (id) on delete cascade,
  purged_through_rev bigint      not null default 0,
  max_rev            bigint,
  updated_at         timestamptz not null default now()
);
