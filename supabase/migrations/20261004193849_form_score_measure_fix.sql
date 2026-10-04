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
