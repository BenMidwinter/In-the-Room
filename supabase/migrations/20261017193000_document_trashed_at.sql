-- Soft-trash for document lifecycle (Active → Archive → Trash).
-- Trash is retained for 30 days, then permanently deleted by app purge helpers.

alter table public.progress_notes
  add column if not exists trashed_at timestamptz;

alter table public.letters
  add column if not exists trashed_at timestamptz;

alter table public.working_documents
  add column if not exists trashed_at timestamptz;

alter table public.reports
  add column if not exists trashed_at timestamptz;

alter table public.practice_items
  add column if not exists trashed_at timestamptz;

alter table public.journal_entries
  add column if not exists trashed_at timestamptz;

alter table public.cpd_entries
  add column if not exists trashed_at timestamptz;

alter table public.supervision_entries
  add column if not exists trashed_at timestamptz;

create index if not exists progress_notes_trashed_idx
  on public.progress_notes (client_id, trashed_at);

create index if not exists letters_trashed_idx
  on public.letters (client_id, trashed_at);

create index if not exists working_documents_trashed_idx
  on public.working_documents (client_id, trashed_at);

create index if not exists reports_trashed_idx
  on public.reports (episode_id, trashed_at);

create index if not exists practice_items_trashed_idx
  on public.practice_items (owner_id, trashed_at);

create index if not exists journal_entries_trashed_idx
  on public.journal_entries (author_id, trashed_at);

create index if not exists cpd_entries_trashed_idx
  on public.cpd_entries (owner_id, trashed_at);

create index if not exists supervision_entries_trashed_idx
  on public.supervision_entries (owner_id, trashed_at);
