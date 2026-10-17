-- Allow waitlist referrals that were never seen to move to Closed.
alter table public.clients drop constraint if exists clients_status_check;

alter table public.clients
  add constraint clients_status_check
  check (status in ('active', 'inactive', 'screener', 'waitlist', 'closed', 'rejected'));
