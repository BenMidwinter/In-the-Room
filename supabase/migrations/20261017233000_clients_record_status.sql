-- Client lifecycle matches documents: Active, Archive, then Trash for 30 days.
-- Permanent deletion, including stored files, is done by the app after the countdown.

alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists trashed_at timestamptz;

create index if not exists clients_owner_lifecycle_idx
  on public.clients (owner_id, archived_at, trashed_at);

notify pgrst, 'reload schema';
