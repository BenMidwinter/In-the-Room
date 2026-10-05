-- Delivery columns so a later Resend batch send can record what happened
-- without another migration. Manual mark-as-sent uses the same columns.

alter table public.invoices
  add column recipient_email text not null default '',
  add column sent_at timestamptz,
  add column delivery_method text not null default 'manual',
  add column resend_batch_id text,
  add column last_delivery_error text;

alter table public.invoices
  drop constraint if exists invoices_delivery_method_check;

alter table public.invoices
  add constraint invoices_delivery_method_check
  check (delivery_method in ('manual', 'resend'));

update public.invoices
  set recipient_email = bill_to_email
  where recipient_email = '';

comment on column public.invoices.recipient_email is
  'Email address snapshotted when the invoice is created or sent.';

comment on column public.invoices.sent_at is
  'When the invoice was marked sent or accepted by the email provider.';

comment on column public.invoices.delivery_method is
  'manual until a Resend batch send writes resend.';

comment on column public.invoices.resend_batch_id is
  'Id of the Resend batch that sent this invoice.';

comment on column public.invoices.last_delivery_error is
  'Last failure from a send attempt. Cleared on a successful send.';
