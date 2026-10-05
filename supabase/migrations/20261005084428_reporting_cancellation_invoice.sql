-- Cancellation policy lives on the clinician. A marked session stores the
-- fee that policy produced, and Do not invoice overrides it.

alter table public.profiles
  add column cancel_notice_hours integer not null default 48,
  add column cancel_late_fee text not null default 'full',
  add column cancel_early_fee text not null default 'none',
  add column dna_fee text not null default 'full';

alter table public.profiles
  drop constraint if exists profiles_cancel_notice_hours_check;

alter table public.profiles
  add constraint profiles_cancel_notice_hours_check
  check (cancel_notice_hours >= 0 and cancel_notice_hours <= 720);

alter table public.profiles
  drop constraint if exists profiles_cancel_late_fee_check;

alter table public.profiles
  add constraint profiles_cancel_late_fee_check
  check (cancel_late_fee in ('full', 'half', 'none'));

alter table public.profiles
  drop constraint if exists profiles_cancel_early_fee_check;

alter table public.profiles
  add constraint profiles_cancel_early_fee_check
  check (cancel_early_fee in ('full', 'half', 'none'));

alter table public.profiles
  drop constraint if exists profiles_dna_fee_check;

alter table public.profiles
  add constraint profiles_dna_fee_check
  check (dna_fee in ('full', 'half', 'none'));

alter table public.appointments
  add column do_not_invoice boolean not null default false,
  add column charged_pence integer;

alter table public.appointments
  drop constraint if exists appointments_charged_pence_check;

alter table public.appointments
  add constraint appointments_charged_pence_check
  check (charged_pence is null or charged_pence >= 0);

comment on column public.profiles.cancel_notice_hours is
  'Hours before a session. Inside this window a cancellation uses the late fee.';

comment on column public.appointments.do_not_invoice is
  'Clinician override. The session is not billed even when the policy would charge it.';

comment on column public.appointments.charged_pence is
  'Fee in pence decided when attendance was marked. Null until attendance is logged.';
