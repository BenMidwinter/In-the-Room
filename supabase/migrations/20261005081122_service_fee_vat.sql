-- A service fee is stored in pence so later hour and session totals stay exact.
-- fee_includes_vat is only meaningful when a fee is set.

alter table public.services
  add column fee_pence integer,
  add column fee_includes_vat boolean not null default false;

alter table public.services
  drop constraint if exists services_fee_pence_check;

alter table public.services
  add constraint services_fee_pence_check
  check (fee_pence is null or fee_pence >= 0);

alter table public.services
  drop constraint if exists services_fee_includes_vat_check;

alter table public.services
  add constraint services_fee_includes_vat_check
  check (fee_pence is not null or fee_includes_vat = false);

comment on column public.services.fee_pence is
  'Fee in pence. Null means this service is not billed.';

comment on column public.services.fee_includes_vat is
  'True when fee_pence already includes VAT.';
