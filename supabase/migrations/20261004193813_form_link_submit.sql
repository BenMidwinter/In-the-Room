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
      if bind = any (array['first_name', 'surname', 'dob', 'gender', 'school', 'diagnosis', 'medication']) then
        val := btrim(coalesce(answers ->> (block ->> 'id'), ''));
        if char_length(val) > 4000 then
          raise exception 'One of the answers is too long.';
        end if;
        if val <> '' then
          patch := patch || jsonb_build_object(bind, val);
        end if;
      end if;
    end if;
    if block ->> 'type' is distinct from 'measure'
       and coalesce(block ->> 'required', '') = 'true'
       and btrim(coalesce(answers ->> (block ->> 'id'), '')) = '' then
      raise exception 'Fill in the required questions before sending.';
    end if;
  end loop;

  if sub.client_id is null then
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
      'active',
      jsonb_build_object('v', 0, 'label', btrim(first_name || ' ' || left(surname, 1)))
    )
    returning id into new_client;

    insert into public.client_identities (
      client_id,
      owner_id,
      organization_id,
      encrypted_payload
    ) values (
      new_client,
      sub.owner_id,
      sub.organization_id,
      jsonb_build_object(
        'v', 0,
        'first_name', first_name,
        'surname', surname,
        'dob', coalesce(patch ->> 'dob', ''),
        'school', coalesce(patch ->> 'school', ''),
        'diagnosis', coalesce(patch ->> 'diagnosis', ''),
        'medication', coalesce(patch ->> 'medication', ''),
        'gender', coalesce(patch ->> 'gender', '')
      )
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

revoke execute on function public.form_score_measure(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.form_public_start(uuid) from public, anon, authenticated;
revoke execute on function public.form_link_open(uuid) from public, anon, authenticated;
revoke execute on function public.form_link_save(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.form_link_submit(uuid) from public, anon, authenticated;

grant execute on function public.form_public_start(uuid) to anon, authenticated;
grant execute on function public.form_link_open(uuid) to anon, authenticated;
grant execute on function public.form_link_save(uuid, jsonb) to anon, authenticated;
grant execute on function public.form_link_submit(uuid) to anon, authenticated;

