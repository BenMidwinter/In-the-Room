-- Forms can be sent to an existing client (private) or opened from a link (public).
-- A completion is one outcome_entries row. Population norms are not stored here.

alter table public.form_definitions
  add column audience text not null default 'private'
  check (audience in ('public', 'private'));

do $drop$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'form_submissions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.form_submissions drop constraint %I', constraint_name);
  end loop;
end $drop$;

alter table public.form_submissions
  add constraint form_submissions_status_check
  check (status in ('in_progress', 'submitted', 'received', 'linked', 'rejected'));

alter table public.form_submissions
  alter column status set default 'in_progress';

alter table public.form_submissions
  alter column submitted_at drop not null;

alter table public.form_submissions
  alter column submitted_at drop default;

alter table public.form_submissions
  add column episode_id uuid references public.episodes (id) on delete set null;

alter table public.form_submissions
  add column access_token uuid not null default gen_random_uuid();

create unique index form_submissions_access_token_idx
  on public.form_submissions (access_token);

create index form_submissions_episode_idx
  on public.form_submissions (episode_id);

create index outcome_entries_measure_idx
  on public.outcome_entries (owner_id, measure_id, recorded_on desc);
