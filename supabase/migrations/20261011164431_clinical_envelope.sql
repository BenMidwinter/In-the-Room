-- One wrapped data key per practice. Clinical bodies gain a plain/envelope flag.
-- Existing rows stay plain. New envelope rows are written by the clinical-record Edge Function.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Practice',
  created_at timestamptz not null default timezone('utc', now())
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'practitioner', 'practice_manager')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id)
);

create unique index organization_members_user_idx
  on public.organization_members (user_id);

create table public.organization_keys (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  wrapped_dek text not null,
  kms_key_id text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_keys enable row level security;

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = (select auth.uid())
    )
  );

create policy organization_members_select_own on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.organization_keys from anon, authenticated;
grant select on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant all on table public.organizations to service_role;
grant all on table public.organization_members to service_role;
grant all on table public.organization_keys to service_role;

revoke insert, update, delete on table public.organizations from anon, authenticated;
revoke insert, update, delete on table public.organization_members from anon, authenticated;

alter table public.progress_notes
  add column payload_format text not null default 'plain'
  check (payload_format in ('plain', 'envelope'));

alter table public.letters
  add column payload_format text not null default 'plain'
  check (payload_format in ('plain', 'envelope'));

alter table public.reports
  add column payload_format text not null default 'plain'
  check (payload_format in ('plain', 'envelope'));

alter table public.form_submissions
  add column payload_format text not null default 'plain'
  check (payload_format in ('plain', 'envelope'));

alter table public.outcome_entries
  add column payload_format text not null default 'plain'
  check (payload_format in ('plain', 'envelope'));

comment on column public.progress_notes.payload_format is
  'plain keeps the existing dummy JSON. envelope is AES-GCM under the practice data key.';

-- Submit a form from plaintext held only for this call. The stored bodies are the envelopes passed in.
create or replace function public.form_link_commit_sealed(
  token uuid,
  plain_payload jsonb,
  sealed_payload jsonb,
  outcome_envelopes jsonb
) returns jsonb
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
  env jsonb;
begin
  if plain_payload is null or jsonb_typeof(plain_payload) <> 'object' then
    raise exception 'This form could not be sent.';
  end if;
  if sealed_payload is null
     or jsonb_typeof(sealed_payload) <> 'object'
     or coalesce(sealed_payload ->> 'alg', '') <> 'AES-256-GCM' then
    raise exception 'This form could not be sealed.';
  end if;
  if outcome_envelopes is null or jsonb_typeof(outcome_envelopes) <> 'object' then
    raise exception 'This form could not be sealed.';
  end if;
  if octet_length(plain_payload::text) > 500000 then
    raise exception 'This form is too large to save.';
  end if;

  select * into sub
  from public.form_submissions
  where access_token = form_link_commit_sealed.token
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

  blocks := plain_payload -> 'schema' -> 'blocks';
  answers := coalesce(plain_payload -> 'answers', '{}'::jsonb);
  measures := coalesce(plain_payload -> 'measures', '{}'::jsonb);
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
    env := outcome_envelopes -> (mid::text);
    if env is null or jsonb_typeof(env) <> 'object' or coalesce(env ->> 'alg', '') <> 'AES-256-GCM' then
      raise exception 'A questionnaire score could not be sealed.';
    end if;
    insert into public.outcome_entries (
      owner_id,
      organization_id,
      client_id,
      episode_id,
      measure_id,
      recorded_on,
      completion_status,
      encrypted_payload,
      payload_format
    ) values (
      sub.owner_id,
      sub.organization_id,
      new_client,
      new_episode,
      mid,
      (timezone('utc', now()))::date,
      'complete',
      env,
      'envelope'
    );
  end loop;

  update public.form_submissions
  set status = 'submitted',
      submitted_at = timezone('utc', now()),
      client_id = new_client,
      episode_id = coalesce(new_episode, episode_id),
      encrypted_payload = sealed_payload,
      payload_format = 'envelope'
  where id = sub.id;

  return jsonb_build_object('status', 'submitted');
end;
$fn$;

revoke all on function public.form_link_commit_sealed(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.form_link_commit_sealed(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.form_score_measure(jsonb, jsonb) to service_role;
