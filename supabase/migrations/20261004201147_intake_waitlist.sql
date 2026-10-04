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
      and rel.relname = 'clients'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.clients drop constraint %I', constraint_name);
  end loop;
end
$drop$;

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'inactive', 'waitlist'));

update public.clients c
set status = 'waitlist'
where c.status = 'active'
  and exists (
    select 1
    from public.form_submissions s
    join public.form_definitions d on d.id = s.form_definition_id
    where s.client_id = c.id
      and d.audience = 'public'
      and s.status = 'submitted'
  );
