-- Availability: one rule row per owner + location
alter table public.availability_rules
  add column if not exists location_key text not null default 'private';

update public.availability_rules
set location_key = coalesce(organization_id::text, 'private')
where location_key = 'private' and organization_id is not null;

create unique index if not exists availability_rules_owner_location_uidx
  on public.availability_rules (owner_id, location_key);

comment on column public.availability_rules.location_key is
  'Workplace id, or ''private'' for private practice hours.';

-- Multiple letterheads per clinician
create table if not exists public.letterheads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  practice_name text,
  logo_url text,
  address_line1 text,
  address_line2 text,
  address_line3 text,
  postcode text,
  country text,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger letterheads_set_updated_at
  before update on public.letterheads
  for each row execute function public.set_updated_at();

create index if not exists letterheads_owner_idx
  on public.letterheads (owner_id);

alter table public.letterheads enable row level security;

drop policy if exists letterheads_owner_all on public.letterheads;
create policy letterheads_owner_all on public.letterheads
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.letterheads to authenticated;
grant all on public.letterheads to service_role;

-- Seed a letterhead from existing profile practice fields when none exist
insert into public.letterheads (
  owner_id, name, practice_name, logo_url,
  address_line1, address_line2, address_line3, postcode, country, is_default
)
select
  p.id,
  coalesce(nullif(trim(p.practice_name), ''), nullif(trim(p.display_name), ''), 'Practice letterhead'),
  p.practice_name,
  p.practice_logo_url,
  p.practice_address_line1,
  p.practice_address_line2,
  p.practice_address_line3,
  p.practice_postcode,
  p.practice_country,
  true
from public.profiles p
where not exists (
  select 1 from public.letterheads l where l.owner_id = p.id
)
and (
  coalesce(nullif(trim(p.practice_name), ''), '') <> ''
  or coalesce(nullif(trim(p.practice_address_line1), ''), '') <> ''
  or coalesce(nullif(trim(p.practice_logo_url), ''), '') <> ''
);
