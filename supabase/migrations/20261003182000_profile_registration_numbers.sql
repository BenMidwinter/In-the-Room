alter table public.profiles
  add column if not exists registration_numbers jsonb not null default '[]'::jsonb;

comment on column public.profiles.registration_numbers is
  'Array of { body, number } professional registrations (e.g. HCPC, BACP).';

update public.profiles
set registration_numbers = jsonb_build_array(
  jsonb_build_object('body', 'HCPC', 'number', registration_number)
)
where coalesce(registration_number, '') <> ''
  and registration_numbers = '[]'::jsonb;
