alter table public.outcome_measure_defs
  add column if not exists status text not null default 'published';

alter table public.outcome_measure_defs
  drop constraint if exists outcome_measure_defs_status_check;

alter table public.outcome_measure_defs
  add constraint outcome_measure_defs_status_check
  check (status in ('draft', 'published'));
