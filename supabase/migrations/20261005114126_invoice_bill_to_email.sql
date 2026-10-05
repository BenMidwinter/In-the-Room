-- Where an invoice will be sent. Empty until a client or billing contact has an email.
-- A later send uses this address, with reply-to set to the clinician.

alter table public.invoices
  add column bill_to_email text not null default '';

comment on column public.invoices.bill_to_email is
  'Recipient address copied when the invoice is created. Billing contacts override the client email.';
