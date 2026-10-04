-- Scoring matches src/lib/formModel.ts. Not granted to API roles; submit calls it as owner.
create or replace function public.form_score_measure(measure_schema jsonb, answer jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  kind text := coalesce(measure_schema ->> 'kind', 'items');
  min_v integer;
  max_v integer;
  item jsonb;
  raw text;
  value integer;
  total integer := 0;
  items jsonb := '{}'::jsonb;
  n integer;
begin
  begin
    min_v := trunc(coalesce((measure_schema ->> 'min')::numeric, 0));
    max_v := trunc(coalesce((measure_schema ->> 'max')::numeric, 4));
  exception when others then
    raise exception 'The scale on this questionnaire needs a highest score above the lowest.';
  end;
  if max_v < min_v then
    raise exception 'The scale on this questionnaire needs a highest score above the lowest.';
  end if;

  if kind = 'overall' then
    if answer is null then
      raise exception 'Enter the score.';
    elsif jsonb_typeof(answer) = 'object' then
      raw := btrim(answer ->> 'score');
    elsif jsonb_typeof(answer) = 'number' then
      raw := btrim(answer #>> '{}');
    else
      raw := null;
    end if;
    if raw is null or raw !~ '^-?[0-9]+$' then
      raise exception 'Enter the score.';
    end if;
    value := raw::integer;
    if value < min_v or value > max_v then
      raise exception 'Scores run from % to %.', min_v, max_v;
    end if;
    return jsonb_build_object('total', value, 'items', jsonb_build_object('score', value));
  end if;

  if jsonb_typeof(measure_schema -> 'items') <> 'array'
     or jsonb_array_length(measure_schema -> 'items') = 0 then
    raise exception 'Add at least one statement.';
  end if;
  n := jsonb_array_length(measure_schema -> 'items');
  if n > 200 then
    raise exception 'This questionnaire has too many statements.';
  end if;
  if answer is null or jsonb_typeof(answer) <> 'object' then
    raise exception 'Enter a score for each statement.';
  end if;

  for item in
    select elem from jsonb_array_elements(measure_schema -> 'items') as unpacked(elem)
  loop
    raw := btrim(answer ->> coalesce(item ->> 'id', ''));
    if raw is null or raw !~ '^-?[0-9]+$' then
      raise exception 'Enter a score for each statement.';
    end if;
    value := raw::integer;
    if value < min_v or value > max_v then
      raise exception 'Scores run from % to %.', min_v, max_v;
    end if;
    items := items || jsonb_build_object(item ->> 'id', value);
    total := total + value;
  end loop;

  return jsonb_build_object('total', total, 'items', items);
end;
$fn$;

create or replace function public.form_public_start(form_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  def public.form_definitions%rowtype;
  measures jsonb := '{}'::jsonb;
  blocks jsonb;
  block jsonb;
  i integer;
  mid uuid;
  mschema jsonb;
  token uuid;
begin
  select * into def
  from public.form_definitions
  where id = form_public_start.form_id
    and status = 'published'
    and audience = 'public';
  if not found then
    raise exception 'This form is not available.';
  end if;

  blocks := def.schema -> 'blocks';
  if jsonb_typeof(blocks) = 'array' then
    if jsonb_array_length(blocks) > 200 then
      raise exception 'This form is not available.';
    end if;
    for i in 0 .. jsonb_array_length(blocks) - 1 loop
      block := blocks -> i;
      if block ->> 'type' = 'measure' and coalesce(block ->> 'measureId', '') <> '' then
        begin
          mid := (block ->> 'measureId')::uuid;
        exception when invalid_text_representation then
          mid := null;
        end;
        if mid is not null then
          select d.schema into mschema
          from public.outcome_measure_defs d
          where d.id = mid
            and d.owner_id = def.owner_id;
          if mschema is not null then
            measures := measures || jsonb_build_object(mid::text, mschema);
          end if;
        end if;
      end if;
    end loop;
  end if;

  insert into public.form_submissions (
    owner_id,
    organization_id,
    form_definition_id,
    form_version,
    status,
    submitted_at,
    encrypted_payload
  ) values (
    def.owner_id,
    def.organization_id,
    def.id,
    def.version,
    'in_progress',
    null,
    jsonb_build_object(
      'v', 0,
      'schema', def.schema,
      'measures', measures,
      'answers', '{}'::jsonb
    )
  )
  returning access_token into token;

  return token;
end;
$fn$;

create or replace function public.form_link_open(token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  sub public.form_submissions%rowtype;
  title text;
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

  return jsonb_build_object(
    'title', coalesce(title, 'Form'),
    'status', sub.status,
    'schema', coalesce(sub.encrypted_payload -> 'schema', '{"v":1,"blocks":[]}'::jsonb),
    'measures', coalesce(sub.encrypted_payload -> 'measures', '{}'::jsonb),
    'answers', coalesce(sub.encrypted_payload -> 'answers', '{}'::jsonb)
  );
end;
$fn$;

create or replace function public.form_link_save(token uuid, answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if form_link_save.answers is null or jsonb_typeof(form_link_save.answers) <> 'object' then
    raise exception 'These answers could not be saved.';
  end if;
  if octet_length(form_link_save.answers::text) > 500000 then
    raise exception 'This form is too large to save.';
  end if;

  update public.form_submissions
  set encrypted_payload = jsonb_set(
    encrypted_payload,
    '{answers}',
    form_link_save.answers,
    true
  )
  where access_token = form_link_save.token
    and status = 'in_progress';

  if not found then
    raise exception 'This form can no longer be changed.';
  end if;
end;
$fn$;

