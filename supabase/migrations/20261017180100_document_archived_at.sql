-- Non-destructive archive flag for document tables (filterable; Delete remains destructive).
alter table public.progress_notes
  add column if not exists archived_at timestamptz;

alter table public.letters
  add column if not exists archived_at timestamptz;

alter table public.working_documents
  add column if not exists archived_at timestamptz;

alter table public.reports
  add column if not exists archived_at timestamptz;

alter table public.practice_items
  add column if not exists archived_at timestamptz;

create index if not exists progress_notes_archived_idx
  on public.progress_notes (owner_id, client_id, archived_at);

create index if not exists letters_archived_idx
  on public.letters (owner_id, client_id, archived_at);

create index if not exists working_documents_archived_idx
  on public.working_documents (owner_id, client_id, archived_at);

create index if not exists reports_archived_idx
  on public.reports (owner_id, client_id, archived_at);

create index if not exists practice_items_archived_idx
  on public.practice_items (owner_id, archived_at);
