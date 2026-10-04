-- Clinician practice library: folders and rich-text documents owned by one account.

create table public.practice_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.practice_items (id) on delete cascade,
  kind text not null check (kind in ('folder', 'document')),
  name text not null,
  encrypted_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint practice_items_name_not_blank check (char_length(btrim(name)) > 0),
  constraint practice_items_not_self_parent check (parent_id is null or parent_id <> id)
);

create index practice_items_owner_parent_idx
  on public.practice_items (owner_id, parent_id);

create index practice_items_parent_idx
  on public.practice_items (parent_id);

create trigger practice_items_set_updated_at
  before update on public.practice_items
  for each row execute function public.set_updated_at();

create or replace function public.practice_items_enforce_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_kind text;
  parent_owner uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select kind, owner_id
    into parent_kind, parent_owner
  from public.practice_items
  where id = new.parent_id;

  if parent_kind is distinct from 'folder' or parent_owner is distinct from new.owner_id then
    raise exception 'Practice items can only live inside a folder you own';
  end if;

  return new;
end;
$$;

create trigger practice_items_enforce_parent
  before insert or update of parent_id, owner_id on public.practice_items
  for each row execute function public.practice_items_enforce_parent();

revoke execute on function public.practice_items_enforce_parent() from public, anon, authenticated;

alter table public.practice_items enable row level security;

create policy practice_items_owner_all on public.practice_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.practice_items to authenticated;
grant all on public.practice_items to service_role;
