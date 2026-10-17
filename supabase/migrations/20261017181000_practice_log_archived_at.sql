-- Archive flag for clinician journal and practice logs (same pattern as documents).
alter table public.journal_entries
  add column if not exists archived_at timestamptz;

alter table public.cpd_entries
  add column if not exists archived_at timestamptz;

alter table public.supervision_entries
  add column if not exists archived_at timestamptz;

create index if not exists journal_entries_archived_idx
  on public.journal_entries (author_id, archived_at);

create index if not exists cpd_entries_archived_idx
  on public.cpd_entries (owner_id, archived_at);

create index if not exists supervision_entries_archived_idx
  on public.supervision_entries (owner_id, archived_at);
