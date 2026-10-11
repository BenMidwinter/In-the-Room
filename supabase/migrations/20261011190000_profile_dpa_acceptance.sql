-- Version 1.0 of the Data Processing Agreement.
-- The server stamps the time and version. A client-supplied timestamp or address is ignored.
-- dpa_accepted_ip stays null: the browser is not a reliable source for that address.

alter table public.profiles
  add column dpa_accepted boolean not null default false,
  add column dpa_accepted_at timestamptz,
  add column dpa_version varchar(20),
  add column dpa_accepted_ip inet;

alter table public.profiles
  add constraint profiles_dpa_record_ck check (
    (dpa_accepted = false and dpa_accepted_at is null and dpa_version is null)
    or (dpa_accepted = true and dpa_accepted_at is not null and dpa_version is not null)
  );

create or replace function public.stamp_profile_dpa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.dpa_accepted then
    new.dpa_accepted := true;
    new.dpa_accepted_at := old.dpa_accepted_at;
    new.dpa_version := old.dpa_version;
    new.dpa_accepted_ip := old.dpa_accepted_ip;
    return new;
  end if;

  if new.dpa_accepted then
    new.dpa_accepted_at := timezone('utc', now());
    new.dpa_version := '1.0';
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

create trigger profiles_stamp_dpa
  before insert or update on public.profiles
  for each row execute function public.stamp_profile_dpa();

revoke execute on function public.stamp_profile_dpa() from public, anon, authenticated;

-- Signup often has no session until the email is confirmed, so the acceptance
-- flag travels in the new user's metadata and is copied once, here.
-- The profile columns are the record after that. Metadata is not read again.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, dpa_accepted)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_user_meta_data ->> 'dpa_accepted', '') in ('true', 't', '1')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
