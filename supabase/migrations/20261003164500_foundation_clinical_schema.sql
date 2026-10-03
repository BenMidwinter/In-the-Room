-- In the Room — foundation clinical schema (freelance-first)
-- RLS on every table; clinical/PII in encrypted_payload unless noted as queryable metadata.

-- ── Helpers ───────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.current_uid()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- ── A. Profiles, access keys, audit ───────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  job_title text,
  professional_title text,
  registration_number text,
  phone text,
  bio text,
  photo_url text,
  timezone text not null default 'Europe/London',
  practice_name text,
  practice_logo_url text,
  practice_address_line1 text,
  practice_address_line2 text,
  practice_address_line3 text,
  practice_postcode text,
  practice_country text,
  public_key text,
  encrypted_private_key jsonb,
  encrypted_private_key_recovery jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.record_access_keys (
  id uuid primary key default gen_random_uuid(),
  record_table text not null,
  record_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  wrapped_dek jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (record_table, record_id, user_id)
);

create index record_access_keys_user_idx
  on public.record_access_keys (user_id);

create index record_access_keys_record_idx
  on public.record_access_keys (record_table, record_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  client_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  encrypted_detail jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_events_owner_created_idx
  on public.audit_events (owner_id, created_at desc);

create index audit_events_owner_entity_idx
  on public.audit_events (owner_id, entity_type, entity_id);

create index audit_events_owner_client_idx
  on public.audit_events (owner_id, client_id, created_at desc);

-- ── B. Services & availability ────────────────────────────────────────────

create table public.services (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  service_type text not null default 'appointment'
    check (service_type in ('appointment', 'admin', 'busy')),
  name text not null,
  slug text not null,
  description text,
  color text,
  default_duration_minutes integer not null default 50
    check (default_duration_minutes > 0),
  buffer_minutes integer not null default 0
    check (buffer_minutes >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, slug)
);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create index services_owner_active_idx
  on public.services (owner_id, is_active);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  timezone text not null default 'Europe/London',
  weekly_hours jsonb not null default '{}'::jsonb,
  service_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger availability_rules_set_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

create index availability_rules_owner_idx
  on public.availability_rules (owner_id);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null check (kind in ('unavailable', 'available')),
  reason text,
  service_ids uuid[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create trigger availability_exceptions_set_updated_at
  before update on public.availability_exceptions
  for each row execute function public.set_updated_at();

create index availability_exceptions_owner_range_idx
  on public.availability_exceptions (owner_id, starts_at, ends_at);

-- ── C. Clients, contacts, episodes, timeline ──────────────────────────────

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  encrypted_pseudonym jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create index clients_owner_status_idx
  on public.clients (owner_id, status);

create table public.client_identities (
  client_id uuid primary key references public.clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger client_identities_set_updated_at
  before update on public.client_identities
  for each row execute function public.set_updated_at();

create index client_identities_owner_idx
  on public.client_identities (owner_id);

create table public.client_clinical_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger client_clinical_profiles_set_updated_at
  before update on public.client_clinical_profiles
  for each row execute function public.set_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  role text not null default 'other'
    check (role in ('parent', 'guardian', 'referrer', 'gp', 'school', 'billing', 'other')),
  is_billing_contact boolean not null default false,
  is_primary boolean not null default false,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create index contacts_owner_client_idx
  on public.contacts (owner_id, client_id);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_number integer not null check (episode_number >= 1),
  status text not null default 'active'
    check (status in ('active', 'paused', 'discharged')),
  referral_date date,
  start_date date,
  end_date date,
  encrypted_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (client_id, episode_number)
);

create trigger episodes_set_updated_at
  before update on public.episodes
  for each row execute function public.set_updated_at();

create unique index episodes_one_active_per_client_idx
  on public.episodes (client_id)
  where status = 'active';

create index episodes_owner_client_idx
  on public.episodes (owner_id, client_id, start_date desc);

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  event_date date not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  event_type text not null,
  ref_table text,
  ref_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  encrypted_summary jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger timeline_events_set_updated_at
  before update on public.timeline_events
  for each row execute function public.set_updated_at();

create index timeline_events_client_occurred_idx
  on public.timeline_events (owner_id, client_id, occurred_at desc);

create index timeline_events_episode_idx
  on public.timeline_events (owner_id, episode_id, occurred_at desc);

-- FK for audit_events.client_id (added after clients exists)
alter table public.audit_events
  add constraint audit_events_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete set null;

-- ── D. Appointments ───────────────────────────────────────────────────────

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid references public.clients (id) on delete set null,
  clinician_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  appointment_type text not null default 'one_to_one'
    check (appointment_type in ('one_to_one', 'group', 'consultation')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  attendance_status text
    check (
      attendance_status is null
      or attendance_status in ('attended', 'did_not_attend', 'cancelled')
    ),
  series_id uuid,
  encrypted_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create index appointments_clinician_starts_idx
  on public.appointments (clinician_id, starts_at);

create index appointments_owner_starts_idx
  on public.appointments (owner_id, starts_at);

create index appointments_client_starts_idx
  on public.appointments (client_id, starts_at);

create index appointments_episode_idx
  on public.appointments (episode_id, starts_at);

-- ── E. Templates & forms ──────────────────────────────────────────────────

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  kind text not null
    check (kind in ('progress_note', 'letter', 'report', 'working_document')),
  name text not null,
  description text,
  is_active boolean not null default true,
  encrypted_payload jsonb,
  schema jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

create index templates_owner_kind_idx
  on public.templates (owner_id, kind, is_active);

create table public.form_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  version integer not null default 1 check (version >= 1),
  is_onboarding boolean not null default false,
  schema jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, slug)
);

create trigger form_definitions_set_updated_at
  before update on public.form_definitions
  for each row execute function public.set_updated_at();

create index form_definitions_owner_status_idx
  on public.form_definitions (owner_id, status);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  form_definition_id uuid not null references public.form_definitions (id) on delete cascade,
  form_version integer not null check (form_version >= 1),
  client_id uuid references public.clients (id) on delete set null,
  submitted_at timestamptz not null default timezone('utc', now()),
  status text not null default 'received'
    check (status in ('received', 'linked', 'rejected')),
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger form_submissions_set_updated_at
  before update on public.form_submissions
  for each row execute function public.set_updated_at();

create index form_submissions_owner_submitted_idx
  on public.form_submissions (owner_id, submitted_at desc);

create index form_submissions_client_idx
  on public.form_submissions (client_id, submitted_at desc);

-- ── F. Clinical documents ─────────────────────────────────────────────────

create table public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  author_id uuid not null references auth.users (id) on delete cascade,
  note_number integer not null check (note_number >= 1),
  session_date date not null,
  noted_at timestamptz not null default timezone('utc', now()),
  status text not null default 'draft'
    check (status in ('draft', 'signed_off')),
  signed_off_at timestamptz,
  lock_until timestamptz,
  template_id uuid references public.templates (id) on delete set null,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (episode_id, note_number)
);

create trigger progress_notes_set_updated_at
  before update on public.progress_notes
  for each row execute function public.set_updated_at();

create index progress_notes_client_session_idx
  on public.progress_notes (owner_id, client_id, session_date desc);

create index progress_notes_episode_idx
  on public.progress_notes (episode_id, note_number);

create index progress_notes_appointment_idx
  on public.progress_notes (appointment_id);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  author_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  letter_date date,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger letters_set_updated_at
  before update on public.letters
  for each row execute function public.set_updated_at();

create index letters_client_idx
  on public.letters (owner_id, client_id, letter_date desc);

create table public.working_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  author_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger working_documents_set_updated_at
  before update on public.working_documents
  for each row execute function public.set_updated_at();

create index working_documents_client_idx
  on public.working_documents (owner_id, client_id, updated_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  author_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid references public.templates (id) on delete set null,
  report_date date,
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create index reports_client_idx
  on public.reports (owner_id, client_id, report_date desc);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  author_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  somatic_state text
    check (
      somatic_state is null
      or somatic_state in (
        'Grounded', 'Activated', 'Fatigued', 'Open', 'Constricted', 'Settled'
      )
    ),
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

create index journal_entries_author_date_idx
  on public.journal_entries (author_id, entry_date desc);

-- ── G. Reporting & outcomes ───────────────────────────────────────────────

create table public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  key text not null,
  name text not null,
  description text,
  params jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, key)
);

create trigger report_definitions_set_updated_at
  before update on public.report_definitions
  for each row execute function public.set_updated_at();

create table public.report_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  definition_id uuid references public.report_definitions (id) on delete set null,
  report_key text not null,
  params jsonb not null default '{}'::jsonb,
  format text not null check (format in ('csv', 'pdf')),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  storage_path text,
  row_count integer,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index report_exports_owner_created_idx
  on public.report_exports (owner_id, created_at desc);

create table public.outcome_measure_defs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  name text not null,
  slug text not null,
  schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id, slug)
);

create trigger outcome_measure_defs_set_updated_at
  before update on public.outcome_measure_defs
  for each row execute function public.set_updated_at();

create table public.outcome_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  measure_id uuid not null references public.outcome_measure_defs (id) on delete cascade,
  recorded_on date not null,
  completion_status text not null default 'complete'
    check (completion_status in ('draft', 'complete', 'skipped')),
  encrypted_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger outcome_entries_set_updated_at
  before update on public.outcome_entries
  for each row execute function public.set_updated_at();

create index outcome_entries_client_idx
  on public.outcome_entries (owner_id, client_id, recorded_on desc);

-- ── Profile bootstrap on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.record_access_keys enable row level security;
alter table public.audit_events enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.clients enable row level security;
alter table public.client_identities enable row level security;
alter table public.client_clinical_profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.episodes enable row level security;
alter table public.timeline_events enable row level security;
alter table public.appointments enable row level security;
alter table public.templates enable row level security;
alter table public.form_definitions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.progress_notes enable row level security;
alter table public.letters enable row level security;
alter table public.working_documents enable row level security;
alter table public.reports enable row level security;
alter table public.journal_entries enable row level security;
alter table public.report_definitions enable row level security;
alter table public.report_exports enable row level security;
alter table public.outcome_measure_defs enable row level security;
alter table public.outcome_entries enable row level security;

-- Profiles: own row only
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Access keys: holder can read/manage their wrapped keys
create policy record_access_keys_select_own on public.record_access_keys
  for select to authenticated
  using (user_id = auth.uid());

create policy record_access_keys_insert_own on public.record_access_keys
  for insert to authenticated
  with check (user_id = auth.uid());

create policy record_access_keys_update_own on public.record_access_keys
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy record_access_keys_delete_own on public.record_access_keys
  for delete to authenticated
  using (user_id = auth.uid());

-- Audit: insert + select only
create policy audit_events_select_own on public.audit_events
  for select to authenticated
  using (owner_id = auth.uid());

create policy audit_events_insert_own on public.audit_events
  for insert to authenticated
  with check (owner_id = auth.uid() and actor_id = auth.uid());

-- Generic owner CRUD helper policies (per table)
create policy services_owner_all on public.services
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy availability_rules_owner_all on public.availability_rules
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy availability_exceptions_owner_all on public.availability_exceptions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy clients_owner_all on public.clients
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy client_identities_owner_all on public.client_identities
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy client_clinical_profiles_owner_all on public.client_clinical_profiles
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy contacts_owner_all on public.contacts
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy episodes_owner_all on public.episodes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy timeline_events_owner_all on public.timeline_events
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy appointments_owner_all on public.appointments
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy templates_owner_all on public.templates
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy form_definitions_owner_all on public.form_definitions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy form_submissions_owner_all on public.form_submissions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy progress_notes_owner_all on public.progress_notes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy letters_owner_all on public.letters
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy working_documents_owner_all on public.working_documents
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy reports_owner_all on public.reports
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy journal_entries_owner_all on public.journal_entries
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy report_definitions_owner_all on public.report_definitions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy report_exports_owner_all on public.report_exports
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy outcome_measure_defs_owner_all on public.outcome_measure_defs
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy outcome_entries_owner_all on public.outcome_entries
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
