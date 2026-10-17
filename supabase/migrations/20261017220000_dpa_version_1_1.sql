-- Data Processing Agreement 1.1.
-- The profile columns stay the first acceptance and are never rewritten.
-- Later acceptances, including 1.1 for an account that already signed 1.0,
-- are appended here. A conflict does not overwrite who, version, or time.

create table public.profile_dpa_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  dpa_version varchar(20) not null,
  accepted_at timestamptz not null,
  accepted_ip inet,
  unique (profile_id, dpa_version)
);

create index profile_dpa_acceptances_profile_idx
  on public.profile_dpa_acceptances (profile_id, accepted_at desc);

insert into public.profile_dpa_acceptances (profile_id, dpa_version, accepted_at, accepted_ip)
select id, dpa_version, dpa_accepted_at, dpa_accepted_ip
from public.profiles
where dpa_accepted = true
  and dpa_version is not null
  and dpa_accepted_at is not null;

alter table public.profile_dpa_acceptances enable row level security;

create policy profile_dpa_acceptances_select_own
  on public.profile_dpa_acceptances
  for select to authenticated
  using (profile_id = auth.uid());

revoke insert, update, delete on public.profile_dpa_acceptances from anon, authenticated;

-- New sign-ups stamp 1.1. An existing acceptance on the profile is left as it was.
create or replace function public.stamp_profile_dpa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.dpa_accepted then
    new.dpa_accepted := old.dpa_accepted;
    new.dpa_accepted_at := old.dpa_accepted_at;
    new.dpa_version := old.dpa_version;
    new.dpa_accepted_ip := old.dpa_accepted_ip;
    return new;
  end if;

  if new.dpa_accepted then
    new.dpa_accepted_at := timezone('utc', now());
    new.dpa_version := '1.1';
    new.dpa_accepted_ip := null;
  else
    new.dpa_accepted := false;
    new.dpa_accepted_at := null;
    new.dpa_version := null;
    new.dpa_accepted_ip := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.stamp_profile_dpa() from public, anon, authenticated;

create or replace function public.record_profile_dpa_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dpa_accepted and new.dpa_version is not null and new.dpa_accepted_at is not null then
    insert into public.profile_dpa_acceptances (profile_id, dpa_version, accepted_at, accepted_ip)
    values (new.id, new.dpa_version, new.dpa_accepted_at, new.dpa_accepted_ip)
    on conflict (profile_id, dpa_version) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.record_profile_dpa_acceptance() from public, anon, authenticated;

create trigger profiles_record_dpa_acceptance
  after insert or update of dpa_accepted, dpa_accepted_at, dpa_version, dpa_accepted_ip
  on public.profiles
  for each row execute function public.record_profile_dpa_acceptance();

-- Records version 1.1 for the signed-in user.
-- If the profile has no acceptance yet, the profile trigger stamps 1.1.
-- If it already has one, that profile row is not changed. The new version is appended.
create or replace function public.accept_dpa()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  update public.profiles
  set dpa_accepted = true
  where id = uid
    and dpa_accepted = false;

  insert into public.profile_dpa_acceptances (profile_id, dpa_version, accepted_at, accepted_ip)
  values (uid, '1.1', timezone('utc', now()), null)
  on conflict (profile_id, dpa_version) do nothing;
end;
$$;

revoke all on function public.accept_dpa() from public, anon;
grant execute on function public.accept_dpa() to authenticated;
