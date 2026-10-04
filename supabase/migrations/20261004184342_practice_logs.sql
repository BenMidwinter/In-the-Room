-- CPD and supervision logs owned by one clinician.
-- Notes stay in encrypted_payload. Date, hours, and supervision direction stay in columns so they can be reported later.

create table public.cpd_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  minutes integer not null,
  label text not null,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cpd_entries_minutes_range check (minutes >= 0 and minutes <= 60000),
  constraint cpd_entries_label_not_blank check (char_length(btrim(label)) > 0)
);

create index cpd_entries_owner_date_idx
  on public.cpd_entries (owner_id, occurred_on desc);

create trigger cpd_entries_set_updated_at
  before update on public.cpd_entries
  for each row execute function public.set_updated_at();

alter table public.cpd_entries enable row level security;

create policy cpd_entries_owner_all on public.cpd_entries
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.cpd_entries to authenticated;
grant all on public.cpd_entries to service_role;

create table public.supervision_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  occurred_on date not null,
  minutes integer not null,
  direction text not null check (direction in ('delivered', 'received')),
  label text not null,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint supervision_entries_minutes_range check (minutes >= 0 and minutes <= 60000),
  constraint supervision_entries_label_not_blank check (char_length(btrim(label)) > 0)
);

create index supervision_entries_owner_date_idx
  on public.supervision_entries (owner_id, occurred_on desc);

create trigger supervision_entries_set_updated_at
  before update on public.supervision_entries
  for each row execute function public.set_updated_at();

alter table public.supervision_entries enable row level security;

create policy supervision_entries_owner_all on public.supervision_entries
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.supervision_entries to authenticated;
grant all on public.supervision_entries to service_role;
