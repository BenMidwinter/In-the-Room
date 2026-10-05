-- Quantity on a line, a printed For name, and payments recorded against an invoice.
-- Partially paid and overdue are derived from these rows, the total, and the due date.

alter table public.invoice_lines
  add column quantity integer not null default 1;

alter table public.invoice_lines
  drop constraint if exists invoice_lines_quantity_check;

alter table public.invoice_lines
  add constraint invoice_lines_quantity_check
  check (quantity >= 1);

comment on column public.invoice_lines.unit_pence is
  'Price of one unit, in pence. The line total is unit_pence times quantity. includes_vat means this amount already includes VAT.';

comment on column public.invoice_lines.quantity is
  'How many of this line. A session stays at 1. A free line can be more than one.';

alter table public.invoices
  add column for_name text not null default '';

comment on column public.invoices.for_name is
  'Who the work was for, when that person is not the one the invoice is addressed to. A shared payer can cover more than one client.';

create table public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  amount_pence integer not null check (amount_pence > 0),
  paid_on date not null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, paid_on);

comment on table public.invoice_payments is
  'Money recorded against an invoice. Partially paid and overdue are worked out from these rows, the total, and the due date.';

alter table public.invoice_payments enable row level security;

create policy invoice_payments_owner_all on public.invoice_payments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.invoices
      where invoices.id = invoice_payments.invoice_id
        and invoices.owner_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.invoice_payments to authenticated;
grant all on public.invoice_payments to service_role;
