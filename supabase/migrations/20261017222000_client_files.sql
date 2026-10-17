-- Private client file metadata. The binary lives in the London S3 bucket.
-- The key must stay under clients/<owner>/<client>/ so a row cannot point at another account.

create table public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  file_name text not null check (char_length(file_name) between 1 and 200),
  file_type text not null check (char_length(file_type) between 1 and 200),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  s3_key text not null unique check (s3_key like 'clients/%'),
  created_at timestamptz not null default timezone('utc', now())
);

create index client_files_client_created_idx
  on public.client_files (client_id, created_at desc);

alter table public.client_files enable row level security;

create policy client_files_owner_all on public.client_files
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and s3_key like 'clients/' || auth.uid()::text || '/' || client_id::text || '/%'
    and exists (
      select 1 from public.clients
      where clients.id = client_files.client_id
        and clients.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.client_files to authenticated;
grant all on public.client_files to service_role;

notify pgrst, 'reload schema';
