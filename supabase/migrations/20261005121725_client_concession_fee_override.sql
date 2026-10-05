-- A concession lives on the client. A custom price lives on the session.
-- The custom price replaces the service price and the concession for that session only.

alter table public.clients
  add column concession_kind text not null default 'none',
  add column concession_percent integer,
  add column concession_pence integer,
  add column concession_label text;

alter table public.clients
  drop constraint if exists clients_concession_kind_check;

alter table public.clients
  add constraint clients_concession_kind_check
  check (concession_kind in ('none', 'percent', 'amount'));

alter table public.clients
  drop constraint if exists clients_concession_percent_check;

alter table public.clients
  add constraint clients_concession_percent_check
  check (concession_percent is null or (concession_percent >= 1 and concession_percent <= 100));

alter table public.clients
  drop constraint if exists clients_concession_pence_check;

alter table public.clients
  add constraint clients_concession_pence_check
  check (concession_pence is null or concession_pence >= 1);

alter table public.clients
  drop constraint if exists clients_concession_shape_check;

alter table public.clients
  add constraint clients_concession_shape_check
  check (
    (concession_kind = 'none' and concession_percent is null and concession_pence is null)
    or (concession_kind = 'percent' and concession_percent is not null and concession_pence is null)
    or (concession_kind = 'amount' and concession_pence is not null and concession_percent is null)
  );

comment on column public.clients.concession_kind is
  'none, percent off the service price, or a fixed amount off. Applies to this client''s sessions until it is cleared.';

comment on column public.clients.concession_label is
  'Optional name for the concession, such as Student. Printed on the invoice line.';

alter table public.appointments
  add column fee_override_pence integer;

alter table public.appointments
  drop constraint if exists appointments_fee_override_pence_check;

alter table public.appointments
  add constraint appointments_fee_override_pence_check
  check (fee_override_pence is null or fee_override_pence >= 0);

comment on column public.appointments.fee_override_pence is
  'Price for this session only, in pence. Replaces the service price and any client concession. Empty means use those.';
