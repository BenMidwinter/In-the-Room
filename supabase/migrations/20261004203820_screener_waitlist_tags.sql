-- Screener is the arrival list. Waitlist is the list after a clinician accepts someone.

alter table public.clients drop constraint if exists clients_status_check;

update public.clients
set status = 'screener'
where status = 'waitlist';

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'inactive', 'screener', 'waitlist', 'rejected'));

alter table public.form_definitions
  add column if not exists place_on_screener boolean not null default false,
  add column if not exists letterhead_id uuid references public.letterheads (id) on delete set null;

update public.form_definitions
set place_on_screener = true
where audience = 'public';

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  kind text not null check (kind in ('client', 'waitlist')),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tags_name_not_blank check (char_length(btrim(name)) > 0)
);

create unique index if not exists tags_owner_kind_name_uidx
  on public.tags (owner_id, kind, lower(name));

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

create table if not exists public.client_tag_links (
  client_id uuid not null references public.clients (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (client_id, tag_id)
);

create table if not exists public.waitlist_placements (
  client_id uuid primary key references public.clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  preferred_times text not null default '',
  information text not null default '',
  service_id uuid references public.services (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger waitlist_placements_set_updated_at
  before update on public.waitlist_placements
  for each row execute function public.set_updated_at();

alter table public.tags enable row level security;
alter table public.client_tag_links enable row level security;
alter table public.waitlist_placements enable row level security;

drop policy if exists tags_owner_all on public.tags;
create policy tags_owner_all on public.tags
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists client_tag_links_owner_all on public.client_tag_links;
create policy client_tag_links_owner_all on public.client_tag_links
  for all to authenticated
  using (
    exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tags t
      where t.id = tag_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists waitlist_placements_owner_all on public.waitlist_placements;
create policy waitlist_placements_owner_all on public.waitlist_placements
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.client_tag_links to authenticated;
grant select, insert, update, delete on public.waitlist_placements to authenticated;
grant all on public.tags to service_role;
grant all on public.client_tag_links to service_role;
grant all on public.waitlist_placements to service_role;

create or replace function public.form_link_open(token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  sub public.form_submissions%rowtype;
  title text;
  letterhead jsonb;
begin
  select * into sub
  from public.form_submissions
  where access_token = form_link_open.token;
  if not found then
    raise exception 'This link does not open a form.';
  end if;

  select f.name into title
  from public.form_definitions f
  where f.id = sub.form_definition_id;

  select case
    when l.id is null then null
    else jsonb_build_object(
      'practiceName', coalesce(l.practice_name, l.name, ''),
      'logoUrl', coalesce(l.logo_url, ''),
      'clinicianName', coalesce(p.display_name, ''),
      'professionalTitle', coalesce(p.professional_title, ''),
      'addressLines', coalesce((
        select jsonb_agg(line order by ord)
        from (
          select ord, btrim(val) as line
          from unnest(array[
            l.address_line1, l.address_line2, l.address_line3, l.postcode, l.country
          ]) with ordinality as unpacked(val, ord)
          where btrim(coalesce(val, '')) <> ''
        ) lines
      ), '[]'::jsonb)
    )
  end
  into letterhead
  from public.form_definitions f
  left join public.letterheads l on l.id = f.letterhead_id
  left join public.profiles p on p.id = f.owner_id
  where f.id = sub.form_definition_id;

  return jsonb_build_object(
    'title', coalesce(title, 'Form'),
    'status', sub.status,
    'schema', coalesce(sub.encrypted_payload -> 'schema', '{"v":1,"blocks":[]}'::jsonb),
    'measures', coalesce(sub.encrypted_payload -> 'measures', '{}'::jsonb),
    'answers', coalesce(sub.encrypted_payload -> 'answers', '{}'::jsonb),
    'letterhead', letterhead
  );
end;
$fn$;

create or replace function public.form_link_submit(token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  sub public.form_submissions%rowtype;
  blocks jsonb;
  block jsonb;
  answers jsonb;
  measures jsonb;
  patch jsonb := '{}'::jsonb;
  bind text;
  val text;
  i integer;
  new_client uuid;
  new_episode uuid;
  first_name text;
  surname text;
  mid uuid;
  mschema jsonb;
  scored jsonb;
  identity jsonb;
  on_screener boolean := false;
begin
  select * into sub
  from public.form_submissions
  where access_token = form_link_submit.token
  for update;

  if not found then
    raise exception 'This link does not open a form.';
  end if;
  if sub.status = 'submitted' then
    return jsonb_build_object('status', 'submitted');
  end if;
  if sub.status <> 'in_progress' then
    raise exception 'This form can no longer be changed.';
  end if;

  select coalesce(d.place_on_screener, false) into on_screener
  from public.form_definitions d
  where d.id = sub.form_definition_id;

  blocks := sub.encrypted_payload -> 'schema' -> 'blocks';
  answers := coalesce(sub.encrypted_payload -> 'answers', '{}'::jsonb);
  measures := coalesce(sub.encrypted_payload -> 'measures', '{}'::jsonb);
  if jsonb_typeof(blocks) <> 'array' then
    blocks := '[]'::jsonb;
  end if;
  if jsonb_array_length(blocks) > 200 then
    raise exception 'This form is too large to save.';
  end if;

  for i in 0 .. jsonb_array_length(blocks) - 1 loop
    block := blocks -> i;
    if block ->> 'type' = 'client' then
      bind := block ->> 'bind';
      if bind ~ '^[a-z][a-z0-9_]{0,40}$' then
        val := btrim(coalesce(answers ->> (block ->> 'id'), ''));
        if char_length(val) > 4000 then
          raise exception 'One of the answers is too long.';
        end if;
        if val <> '' then
          patch := patch || jsonb_build_object(bind, val);
        end if;
      end if;
    end if;
    if block ->> 'type' not in ('measure', 'prose')
       and coalesce(block ->> 'required', '') = 'true'
       and btrim(coalesce(answers ->> (block ->> 'id'), '')) = '' then
      raise exception 'Fill in the required questions before sending.';
    end if;
  end loop;

  if sub.client_id is null and on_screener then
    first_name := coalesce(nullif(patch ->> 'first_name', ''), 'New');
    surname := coalesce(nullif(patch ->> 'surname', ''), 'referral');
    insert into public.clients (
      owner_id,
      organization_id,
      status,
      encrypted_pseudonym
    ) values (
      sub.owner_id,
      sub.organization_id,
      'screener',
      jsonb_build_object('v', 0, 'label', btrim(first_name || ' ' || left(surname, 1)))
    )
    returning id into new_client;

    identity := jsonb_build_object(
      'v', 0,
      'first_name', first_name,
      'surname', surname,
      'dob', coalesce(patch ->> 'dob', ''),
      'school', coalesce(patch ->> 'school', ''),
      'diagnosis', coalesce(patch ->> 'diagnosis', ''),
      'medication', coalesce(patch ->> 'medication', ''),
      'gender', coalesce(patch ->> 'gender', '')
    ) || patch;

    insert into public.client_identities (
      client_id,
      owner_id,
      organization_id,
      encrypted_payload
    ) values (
      new_client,
      sub.owner_id,
      sub.organization_id,
      identity
    );

    insert into public.episodes (
      owner_id,
      organization_id,
      client_id,
      episode_number,
      status,
      referral_date,
      start_date,
      encrypted_payload
    ) values (
      sub.owner_id,
      sub.organization_id,
      new_client,
      1,
      'active',
      (timezone('utc', now()))::date,
      (timezone('utc', now()))::date,
      '{"v":0}'::jsonb
    )
    returning id into new_episode;
  elsif sub.client_id is null then
    new_client := null;
    new_episode := null;
  else
    perform 1
    from public.clients c
    where c.id = sub.client_id
      and c.owner_id = sub.owner_id;
    if not found then
      raise exception 'This form is not attached to a client.';
    end if;
    new_client := sub.client_id;
    new_episode := sub.episode_id;
    if new_episode is null then
      select e.id into new_episode
      from public.episodes e
      where e.client_id = new_client
        and e.owner_id = sub.owner_id
        and e.status = 'active'
      limit 1;
    end if;

    update public.client_identities
    set encrypted_payload = encrypted_payload || patch
    where client_id = new_client
      and owner_id = sub.owner_id;
  end if;

  if new_episode is not null then
    perform 1
    from public.episodes e
    where e.id = new_episode
      and e.client_id = new_client
      and e.owner_id = sub.owner_id;
    if not found then
      raise exception 'This form is not attached to a course.';
    end if;
  end if;

  for i in 0 .. jsonb_array_length(blocks) - 1 loop
    block := blocks -> i;
    if block ->> 'type' <> 'measure' then
      continue;
    end if;
    if new_episode is null and sub.client_id is null and not on_screener then
      continue;
    end if;
    begin
      mid := (block ->> 'measureId')::uuid;
    exception when invalid_text_representation then
      mid := null;
    end;
    if mid is null then
      raise exception 'A questionnaire on this form is missing.';
    end if;
    perform 1
    from public.outcome_measure_defs d
    where d.id = mid
      and d.owner_id = sub.owner_id;
    if not found then
      raise exception 'A questionnaire on this form is missing.';
    end if;
    mschema := measures -> (mid::text);
    if mschema is null or jsonb_typeof(mschema) <> 'object' then
      raise exception 'A questionnaire on this form is missing.';
    end if;
    if new_episode is null then
      raise exception 'This form is not attached to a course.';
    end if;
    scored := public.form_score_measure(mschema, answers -> (block ->> 'id'));
    insert into public.outcome_entries (
      owner_id,
      organization_id,
      client_id,
      episode_id,
      measure_id,
      recorded_on,
      completion_status,
      encrypted_payload
    ) values (
      sub.owner_id,
      sub.organization_id,
      new_client,
      new_episode,
      mid,
      (timezone('utc', now()))::date,
      'complete',
      jsonb_build_object(
        'v', 0,
        'total', (scored ->> 'total')::integer,
        'items', coalesce(scored -> 'items', '{}'::jsonb),
        'submission_id', sub.id
      )
    );
  end loop;

  update public.form_submissions
  set status = 'submitted',
      submitted_at = timezone('utc', now()),
      client_id = new_client,
      episode_id = coalesce(new_episode, episode_id)
  where id = sub.id;

  return jsonb_build_object('status', 'submitted');
end;
$fn$;
