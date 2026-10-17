alter table public.invoices
  add column if not exists archived_at timestamptz;

alter table public.invoices
  add column if not exists trashed_at timestamptz;

create index if not exists invoices_lifecycle_idx
  on public.invoices (owner_id, archived_at, trashed_at);
