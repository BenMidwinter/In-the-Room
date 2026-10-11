-- Seal client text, editor bodies, and bank details on new writes.
-- Existing rows stay payload_format plain so the dummy data can still be read.


do $$
declare
  target text;
begin
  foreach target in array array[
    'client_identities',
    'client_clinical_profiles',
    'contacts',
    'episodes',
    'appointments',
    'templates',
    'working_documents',
    'journal_entries',
    'practice_items',
    'cpd_entries',
    'supervision_entries',
    'timeline_events',
    'clients'
  ]
  loop
    execute format(
      'alter table public.%I add column payload_format text not null default %L check (payload_format in (%L, %L))',
      target, 'plain', 'plain', 'envelope'
    );
  end loop;
end $$;

alter table public.waitlist_placements
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.tags
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.invoices
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.invoice_lines
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.invoice_payments
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.form_definitions
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.outcome_measure_defs
  add column sealed_payload jsonb,
  add column payload_format text not null default 'plain' check (payload_format in ('plain', 'envelope'));

alter table public.profiles
  add column sealed_bank jsonb,
  add column bank_format text not null default 'plain' check (bank_format in ('plain', 'envelope'));

comment on column public.clients.payload_format is
  'plain keeps the old pseudonym JSON. envelope means the short label and concession name live in encrypted_pseudonym, and concession_label is empty.';

comment on column public.profiles.bank_format is
  'plain keeps bank details in the profile columns. envelope stores them in sealed_bank and clears those columns.';

comment on column public.form_definitions.payload_format is
  'plain keeps the form name and schema in their columns. envelope stores them in sealed_payload.';


drop function if exists public.form_link_commit_sealed(uuid, jsonb, jsonb, jsonb);

create or replace function public.form_link_commit_sealed(
  token uuid,
  plain_payload jsonb,
  sealed_payload jsonb,
  outcome_envelopes jsonb,
  sealed_identity jsonb,
  sealed_pseudonym jsonb,
  sealed_episode jsonb
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

  if sealed_identity is not null and (
       jsonb_typeof(sealed_identity) <> 'object'
       or coalesce(sealed_identity ->> 'alg', '') <> 'AES-256-GCM'
     ) then
    raise exception 'This form could not be sealed.';
  end if;
  if sealed_pseudonym is not null and (
       jsonb_typeof(sealed_pseudonym) <> 'object'
       or coalesce(sealed_pseudonym ->> 'alg', '') <> 'AES-256-GCM'
     ) then
    raise exception 'This form could not be sealed.';
  end if;
  if sealed_episode is not null and (
       jsonb_typeof(sealed_episode) <> 'object'
       or coalesce(sealed_episode ->> 'alg', '') <> 'AES-256-GCM'
     ) then
    raise exception 'This form could not be sealed.';
  end if;

  if sub.client_id is null and on_screener then
    if sealed_identity is null or sealed_pseudonym is null or sealed_episode is null then
      raise exception 'This form could not be sealed.';
    end if;
    insert into public.clients (
      owner_id,
      organization_id,
      status,
      encrypted_pseudonym,
      payload_format
    ) values (
      sub.owner_id,
      sub.organization_id,
      'screener',
      sealed_pseudonym,
      'envelope'
    )
    returning id into new_client;

    insert into public.client_identities (
      client_id,
      owner_id,
      organization_id,
      encrypted_payload,
      payload_format
    ) values (
      new_client,
      sub.owner_id,
      sub.organization_id,
      sealed_identity,
      'envelope'
    );

    insert into public.episodes (
      owner_id,
      organization_id,
      client_id,
      episode_number,
      status,
      referral_date,
      start_date,
      encrypted_payload,
      payload_format
    ) values (
      sub.owner_id,
      sub.organization_id,
      new_client,
      1,
      'active',
      (timezone('utc', now()))::date,
      (timezone('utc', now()))::date,
      sealed_episode,
      'envelope'
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

    if sealed_identity is not null then
      update public.client_identities
      set encrypted_payload = sealed_identity,
          payload_format = 'envelope'
      where client_id = new_client
        and owner_id = sub.owner_id;
    end if;
    if sealed_pseudonym is not null then
      update public.clients
      set encrypted_pseudonym = sealed_pseudonym,
          payload_format = 'envelope',
          concession_label = null
      where id = new_client
        and owner_id = sub.owner_id;
    end if;
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


revoke all on function public.form_link_commit_sealed(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.form_link_commit_sealed(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
