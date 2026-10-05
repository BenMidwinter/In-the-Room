-- Invoices a clinician can print and send. Amounts are pence.
-- xero_invoice_id is reserved for a later sync; this table is the source document.

alter table public.profiles
  add column invoice_account_name text,
  add column invoice_sort_code text,
  add column invoice_account_number text,
  add column invoice_payment_note text,
  add column invoice_due_days integer not null default 14,
  add column invoice_next_number integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_invoice_due_days_check;

alter table public.profiles
  add constraint profiles_invoice_due_days_check
  check (invoice_due_days >= 0 and invoice_due_days <= 365);

alter table public.profiles
  drop constraint if exists profiles_invoice_next_number_check;

alter table public.profiles
  add constraint profiles_invoice_next_number_check
  check (invoice_next_number >= 1);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  number text not null,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'void')),
  issued_on date,
  due_on date,
  bill_to_name text not null,
  payment_details text not null default '',
  total_pence integer not null default 0 check (total_pence >= 0),
  xero_invoice_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, number)
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index invoices_owner_created_idx
  on public.invoices (owner_id, created_at desc);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  position integer not null default 0,
  description text not null,
  session_date date,
  unit_pence integer not null check (unit_pence >= 0),
  includes_vat boolean not null default false,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index invoice_lines_invoice_idx
  on public.invoice_lines (invoice_id, position);

create unique index invoice_lines_one_open_appointment
  on public.invoice_lines (appointment_id)
  where appointment_id is not null and released_at is null;

comment on table public.invoices is
  'Printable client invoice. xero_invoice_id is empty until a Xero sync writes the remote id.';

comment on column public.invoice_lines.unit_pence is
  'Amount to pay for this line, in pence. Quantity is one. includes_vat means this amount already includes VAT.';

comment on column public.invoice_lines.released_at is
  'Set when the invoice is voided, so the session can be invoiced again.';

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy invoices_owner_all on public.invoices
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy invoice_lines_owner_all on public.invoice_lines
  for all to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.invoices
      where invoices.id = invoice_lines.invoice_id
        and invoices.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_lines to authenticated;
grant all on public.invoices to service_role;
grant all on public.invoice_lines to service_role;
