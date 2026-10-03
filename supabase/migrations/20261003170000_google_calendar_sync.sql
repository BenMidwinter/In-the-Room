-- Google Workspace / Calendar sync (Splose-style hybrid)
-- 1) Outbound private ICS feed (In the Room → Google/Apple/Outlook)
-- 2) OAuth connection for inbound busy/events + optional Google Meet push

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  provider text not null default 'google'
    check (provider in ('google')),
  account_email text,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'revoked', 'error')),
  scopes text[] not null default '{}',
  -- Refresh/access tokens encrypted before storage (never plaintext).
  encrypted_credentials jsonb,
  google_calendar_id text not null default 'primary',
  pull_external_busy boolean not null default true,
  pull_external_details boolean not null default false,
  push_appointments boolean not null default true,
  -- What leaves In the Room into Google: never full client legal names by default.
  push_privacy text not null default 'busy_only'
    check (push_privacy in ('busy_only', 'service_label', 'pseudonym')),
  create_meet_links boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, provider, account_email)
);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

create index calendar_connections_owner_idx
  on public.calendar_connections (owner_id, status);

-- Secret ICS/webcal feed token (store only a hash; raw token shown once to clinician).
create table public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  token_hash text not null unique,
  label text,
  privacy_mode text not null default 'busy_only'
    check (privacy_mode in ('busy_only', 'service_label', 'pseudonym')),
  is_active boolean not null default true,
  last_accessed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

create index calendar_feed_tokens_owner_idx
  on public.calendar_feed_tokens (owner_id, is_active);

-- Cached inbound Google busy blocks / optional event shells for calendar overlay.
create table public.external_calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  busy_status text not null default 'busy'
    check (busy_status in ('busy', 'tentative', 'free', 'oof')),
  -- Titles/details only when pull_external_details is enabled; prefer encrypted.
  encrypted_title jsonb,
  etag text,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at),
  unique (connection_id, external_event_id)
);

create trigger external_calendar_blocks_set_updated_at
  before update on public.external_calendar_blocks
  for each row execute function public.set_updated_at();

create index external_calendar_blocks_owner_range_idx
  on public.external_calendar_blocks (owner_id, starts_at, ends_at);

-- Map our appointments ↔ Google Calendar events for push/update/delete.
create table public.appointment_external_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  external_event_id text not null,
  meet_url text,
  sync_status text not null default 'synced'
    check (sync_status in ('pending', 'synced', 'error', 'deleted_remote')),
  last_pushed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (appointment_id, connection_id),
  unique (connection_id, external_event_id)
);

create trigger appointment_external_links_set_updated_at
  before update on public.appointment_external_links
  for each row execute function public.set_updated_at();

create index appointment_external_links_owner_idx
  on public.appointment_external_links (owner_id, sync_status);

alter table public.calendar_connections enable row level security;
alter table public.calendar_feed_tokens enable row level security;
alter table public.external_calendar_blocks enable row level security;
alter table public.appointment_external_links enable row level security;

create policy calendar_connections_owner_all on public.calendar_connections
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy calendar_feed_tokens_owner_all on public.calendar_feed_tokens
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy external_calendar_blocks_owner_all on public.external_calendar_blocks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy appointment_external_links_owner_all on public.appointment_external_links
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
