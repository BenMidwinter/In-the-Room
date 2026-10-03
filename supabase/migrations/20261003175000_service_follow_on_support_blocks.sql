-- Appointment types can auto-attach a support activity (e.g. 50m session + 10m notes)

alter table public.services drop constraint if exists services_service_type_check;
alter table public.services
  add constraint services_service_type_check
  check (service_type in ('appointment', 'support', 'admin', 'busy'));

alter table public.services
  add column if not exists follow_on_service_id uuid references public.services (id) on delete set null,
  add column if not exists follow_on_duration_minutes integer
    check (follow_on_duration_minutes is null or follow_on_duration_minutes > 0);

comment on column public.services.default_duration_minutes is
  'Client-facing session length in minutes (what the client is booked for).';
comment on column public.services.follow_on_service_id is
  'Optional support/admin service auto-created immediately after this appointment.';
comment on column public.services.follow_on_duration_minutes is
  'Duration of the follow-on block; defaults to follow-on service default_duration_minutes when null.';
comment on column public.services.buffer_minutes is
  'Optional gap after the session (+ follow-on) before the next bookable slot.';

alter table public.appointments
  add column if not exists parent_appointment_id uuid references public.appointments (id) on delete cascade,
  add column if not exists block_role text not null default 'client_session'
    check (block_role in ('client_session', 'support', 'admin', 'busy'));

create index if not exists appointments_parent_idx
  on public.appointments (parent_appointment_id);

comment on column public.appointments.block_role is
  'client_session is shown to clients; support/admin/busy are clinician-side calendar blocks.';
comment on column public.appointments.parent_appointment_id is
  'For support blocks auto-attached to a client_session appointment.';
