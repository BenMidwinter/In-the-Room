-- Emailed record exports. The download token is stored only as a hash.
-- The browser that asks for the export never receives the zip.

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('client', 'practice')),
  client_id uuid references public.clients (id) on delete set null,
  include jsonb not null default '[]'::jsonb,
  date_from date,
  date_to date,
  status text not null default 'preparing'
    check (status in ('preparing', 'emailed', 'expired', 'failed')),
  token_hash text,
  s3_key text,
  ready_at timestamptz,
  emailed_at timestamptz,
  downloaded_at timestamptz,
  expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index data_exports_owner_created_idx
  on public.data_exports (owner_id, created_at desc);

create unique index data_exports_token_hash_idx
  on public.data_exports (token_hash)
  where token_hash is not null;

alter table public.data_exports enable row level security;

create policy data_exports_select_own
  on public.data_exports
  for select to authenticated
  using (owner_id = auth.uid());

revoke insert, update, delete on public.data_exports from anon, authenticated;
grant select on public.data_exports to authenticated;
grant all on public.data_exports to service_role;

notify pgrst, 'reload schema';
