# IN THE ROOM — CORE SECURITY & ENCRYPTION DIRECTIVES

You are an expert full-stack engineer and security architect building "In the Room", a clinical documentation and evaluation platform for creative arts therapists. You must adhere to the following non-negotiable security, cryptographic, and architectural constraints on EVERY code generation, refactor, and database migration.

---

## 1. THE GOLDEN RULE (CLIENT-SIDE ENCRYPTION ONLY)

- **Zero Plaintext at Rest:** The database (Supabase / PostgreSQL) MUST NEVER receive, process, or store unencrypted clinical data, notes, formulations, assessments, or patient-identifiable data (PID/PII).
- **Client-Side Boundary:** All sensitive text, process notes, and identifiers must be encrypted in the browser (via the WebCrypto API) BEFORE hitting the network or any Supabase client API call.
- **Strict Server Blindness:** The backend server and Supabase database are treated as untrusted storage. If the entire database were leaked publicly, an attacker must only see opaque ciphertext blobs.

---

## 2. CRYPTOGRAPHIC ARCHITECTURE (HYBRID ENVELOPE ENCRYPTION)

To give individual clinicians complete privacy today while enabling workplace delegation and supervisor access later without re-encrypting notes, follow this Hybrid Envelope Encryption model:

### A. User Keys (Generated at Registration)

1. **Key Pair Generation:**
   - Each user generates an asymmetric key pair in-browser using WebCrypto (`RSA-OAEP` with 4096-bit keys and SHA-256, or `ECDH` P-256).
   - `public_key`: Exported as SPKI format and stored in plaintext in `profiles.public_key`.
   - `private_key`: Exported as PKCS#8 format and encrypted client-side using a Key Encryption Key (KEK).
2. **KEK Derivation:**
   - Derived client-side from the clinician's master passphrase via PBKDF2 (SHA-256, >= 600,000 iterations) or Argon2id with a unique 16-byte random salt.
   - The master passphrase is NEVER sent to the server or saved to disk.
3. **Emergency Recovery Escrow:**
   - A high-entropy 24-word recovery phrase (or 256-bit hex key) is generated during onboarding.
   - The user's private key is also encrypted with a key derived from this recovery phrase and stored in `profiles.encrypted_private_key_recovery`.
   - The UI must enforce printing or saving this recovery sheet so clinicians satisfy statutory record retention obligations even if passphrases are forgotten.

### B. Record Encryption (DEK - Data Encryption Key)

1. Each record (session, client profile, formulation) generates its own random 256-bit symmetric DEK (`AES-GCM-256`).
2. The payload is serialized to JSON and encrypted using the DEK with a fresh 12-byte initialization vector (`iv`).
3. Database storage structure for ciphertext columns:

   ```json
   {
     "iv": "<base64_12_bytes>",
     "ciphertext": "<base64_encrypted_payload>",
     "tag_length": 128
   }
   ```

4. **Future Workplace Key Delegation (`record_access_keys` table):**
   - The DEK is encrypted with the clinician's `public_key`.
   - Store wrapped DEKs in a dedicated access table:
     - `record_id` (UUID)
     - `user_id` (UUID)
     - `wrapped_dek` (text, base64)
   - When delegating a case to a supervisor or workplace in Phase 2:
     - The clinician's client decrypts the 32-byte DEK using their own private key.
     - The client encrypts that same DEK with the supervisor's `public_key`.
     - The client inserts a new row into `record_access_keys` for that supervisor.
     - The underlying clinical record and ciphertext remain untouched.

---

## 3. DATABASE & SUPABASE SECURITY RULES

1. **Table Separation (Demographics vs. Clinical Records):**
   - `clients`: Internal UUID, encrypted pseudonym, status. Never store raw names, contact numbers, or addresses here.
   - `client_identities`: Encrypted PII (full name, emergency contacts, DOB), separate table with strict access controls.
   - `contacts`: People linked to a client (parents, billing payers, referrers) with encrypted contact payload.
   - `episodes`: Discrete periods of care per client; returning clients open a new episode.
   - `appointments` / `progress_notes`: Queryable schedule and note metadata; clinical bodies in `encrypted_payload` JSONB.
   - Full table list and column rules: see **SUPABASE DATA SCHEMA (FOUNDATION)** below.
2. **Mandatory Row Level Security (RLS):**
   - Every single table MUST run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
   - Do not rely solely on client-side encryption. RLS policies must strictly verify `auth.uid() = owner_id` (or `user_id` on access-key tables) or check authorized entries in `record_access_keys`.
   - Never write permissive `USING (true)` policies, even in local development or test migrations.
3. **Prevent URL Query Parameter Leaks:**
   - PostgREST logs all URL query parameters by default.
   - NEVER filter or search across sensitive values via URL parameters (e.g., `?notes=eq.something` is prohibited).
   - Encrypted data must be sent and retrieved through request bodies or indexed primary key lookups (`?id=eq.<uuid>`).
4. **Multi-Tenancy Preparation:**
   - Include a nullable `organization_id` (UUID) on caseload and clinical tables from Day 1.
   - In the Freelance tier, `organization_id` defaults to `NULL` (individual practitioner ownership).
5. **Audit + timeline:**
   - `audit_events` is append-only and written for every meaningful mutation.
   - `timeline_events` projects client-visible care events (onboarding, episodes, sessions, notes, forms, invoices, etc.) onto the profile timeline.

---

## 4. FRONTEND & STATE SECURITY (REACT / NEXT.JS)

1. **In-Memory Key Handling:**
   - Decrypted private keys and DEKs must live strictly in memory (React context, closures, or non-persisted state).
   - NEVER write the decrypted private key, KEK, or plain DEKs to `localStorage`, `sessionStorage`, or `IndexedDB`.
   - If the tab closes or refreshes, the clinician must re-authenticate with their master passphrase to derive the KEK and decrypt their private key back into memory.
2. **No Third-Party Telemetry:**
   - Never inject session recording scripts (e.g., Hotjar, FullStory) or third-party client analytics on pages where clinical notes are viewed or edited.
3. **DOM Sanitization:**
   - All decrypted Markdown or rich-text notes rendered in the DOM must pass through `DOMPurify` before display to block Stored XSS.

---

## 5. NON-NEGOTIABLE VERIFICATION CHECKLIST

Before producing any database migration, API route, or frontend component, verify:

- [ ] Is any plaintext clinical or identifying text being sent over the network to Supabase? (If yes, reject and encrypt client-side).
- [ ] Is RLS enabled with explicit restrictive policies?
- [ ] Is the DEK stored separately in an encrypted format per authorized user?
- [ ] Does the cryptographic implementation use standard WebCrypto (`window.crypto.subtle`) primitives exclusively?

---

# IN THE ROOM — PRODUCT SCOPE (FREELANCE FIRST)

- **Primary market:** private / freelance creative arts therapists.
- **Phase 1:** individual practitioner tooling (clients, episodes of care, sessions/appointments, progress notes, calendar, profile, clinician-designed forms & templates, contacts, client timeline, reporting, audit log, finance placeholders for Xero).
- **Later:** workplace contracts, multi-user delegation, and org features — do not build these ahead of the freelance core.
- **Out of scope for now:** workplace team admin, service-lead org consoles, and safeguarding workflows.
- **Language:** product copy and schema naming stay practice/freelance-scoped. Do not describe Reporting or caseload as “organisation-wide” or “workplace” in Phase 1.

---

# IN THE ROOM — FRONTEND & MODULAR ARCHITECTURE DIRECTIVES

You are building "In the Room" following a strict **Thin-Page / Encapsulated-Module** pattern. Every page route acts solely as a structural shell, while all business logic, editor states, cryptographic binds, and complex interactions live inside isolated, composable modules.

---

## 1. THE THIN-PAGE / BLOCKED-MODULE PRINCIPLE

### A. Route Pages Must Be "Anemic" Layout Shells

- Page files (`src/app/**/page.tsx` or `src/pages/**`) MUST NOT contain complex business logic, raw Supabase fetches, state machines, or extensive DOM trees.
- Page responsibilities are strictly limited to:
  1. Reading route parameters and search query params.
  2. Verifying master-key session unlocking (redirecting/blocking if keys are locked).
  3. Composing layout grids (e.g., header, breadcrumb, split-pane) and mounting one or more Module Blocks.
- Maximum page file target: under 60–80 lines of code.

### B. Module Blocks Are Self-Contained Features

- Complex functionality lives in `src/modules/<ModuleName>/`.
- Each Module Block owns its:
  - Internal state management (e.g., form inputs, active toolbars, view toggles).
  - Cryptographic read/write cycle (fetching ciphertext via hooks, decrypting in-memory, encrypting before dispatch).
  - Autosave debounce triggers and error boundaries.
  - Standardized header/toolbar and body layout.

---

## 2. MODULAR REUSE & THE UNIFIED RICH-TEXT ENGINE

The core of the clinical workflow is narrative documentation (letters, progress notes, formulation reports, supervision records).

1. **The Core Document Module (`EditorModule`):**
   - Must be decoupled from any specific clinical table.
   - Accepts generic input contracts:

     ```typescript
     interface DocumentEditorProps {
       recordId: string;
       initialEncryptedPayload?: EncryptedPayload;
       onSave: (encryptedPayload: EncryptedPayload) => Promise<void>;
       mode: 'session_note' | 'clinical_letter' | 'assessment_report';
       metadataHeader?: React.ReactNode;
       readOnly?: boolean;
     }
     ```

   - Standardized formatting plugins: Prose/markdown blocks, qualitative tags (affect, modality, medium), and collapsible evaluative sections.
2. **Specialized Wrappers:**
   - Pages do not instantiate the raw editor engine directly; they instantiate domain-specific wrappers:
     - `<SessionNoteBlock sessionId={id} />`
     - `<ClientLetterBlock letterId={id} recipientType={type} />`
     - `<ReportBuilderBlock reportId={id} />`
   - These wrappers configure the `EditorModule` with specific schemas and handle their respective cryptographic keys.

---

## 3. STYLESHEET & CSS ARCHITECTURE RULES

Because modules (editor, calendar, metric sliders) will be embedded inside different page shells, split views, drawers, and modal sheets, styling must obey strict isolation rules:

1. **Token Foundation Before Module Styling:**
   - All styling must reference core design tokens (CSS variables defined in `globals.css` or Tailwind theme).
   - Never use arbitrary inline color/spacing hex values or pixel heights (e.g., avoid `h-[642px]`, `bg-[#242b35]`).
2. **Container Query & Fluid Sizing:**
   - Modules must adapt to their container, not the viewport. Use `@container` queries or fluid flex/grid layouts so the `CalendarModule` or `EditorModule` renders seamlessly whether occupying a full-width page, a 50% split pane, or an off-canvas drawer.
3. **Editor Typography Scoping:**
   - Rich-text editor styles must be strictly scoped to a `.clinical-prose` wrapper.
   - Styling inside `.clinical-prose` must not leak to surrounding module buttons, toolbars, or page chrome.
   - Modifiers for print/PDF export styles must be isolated via `@media print` rules within the document module.

---

## 4. STRICT BUILD ORDER (DEPENDENCY SEQUENCE)

Do NOT generate higher-tier features out of order. Development must follow this exact sequential pipeline:

```text
Phase 1: Crypto & Key Store  ──▶  Phase 2: Theme Tokens & Typography
           │                                 │
           ▼                                 ▼
Phase 3: Base Primitives UI  ──▶  Phase 4: Independent Engine Modules (Editor / Calendar)
           │                                 │
           ▼                                 ▼
Phase 5: Domain Feature Blocks ─▶ Phase 6: Thin Page Routes & Routing Shells
```

### Stage Breakdown

1. **Stage 1 — Cryptographic Primitives & Key Context (`src/lib/crypto/*`, `src/context/KeyContext`):**
   - Implement WebCrypto primitives (AES-GCM, PBKDF2, RSA/ECDH key wrapping).
   - Setup in-memory key state (unlocked private key held in React Context; never disk/localStorage).
2. **Stage 2 — Design Tokens & Base Styles (`src/styles/*`, `tailwind.config.ts`):**
   - Palette (clinical, low-contrast, calming, high-readability).
   - Typography scales, spacing tokens, container query plugin setup.
3. **Stage 3 — Atomic UI Primitives (`src/components/ui/*`):**
   - Buttons, Inputs, Dialogs, Toolbars, Dropdowns, Badges, Tabs.
   - Zero business logic, purely presentational with keyboard accessibility.
4. **Stage 4 — Independent Engine Modules (`src/modules/editor/*`, `src/modules/calendar/*`):**
   - Build the standalone Rich Text Editor engine with local dummy state.
   - Build the standalone Calendar/Timeline engine.
   - Ensure these render cleanly in isolation.
5. **Stage 5 — Domain Feature Blocks (`src/modules/sessions/*`, `src/modules/clients/*`):**
   - Connect the Stage 4 engines with the Stage 1 encryption hooks.
   - Create the domain-specific data blocks (`SessionNoteBlock`, `ClientSummaryBlock`).
6. **Stage 6 — Thin Page Routes (`src/app/*`):**
   - Assemble pages by composing the domain blocks into layouts.

---

## 5. DIRECTORY STRUCTURE CONVENTION

```text
src/
├── app/                        # Next.js App Router (Anemic Page Shells)
│   ├── (auth)/                 # Login, Setup Keyring, Recovery
│   ├── (dashboard)/
│   │   ├── clients/
│   │   │   ├── [id]/page.tsx   # Shell: mounts ClientSummaryBlock & SessionHistoryBlock
│   │   ├── sessions/
│   │   │   ├── [id]/page.tsx   # Shell: mounts SessionNoteBlock
│   │   └── calendar/page.tsx   # Shell: mounts CalendarScheduleBlock
├── modules/                    # Self-contained feature blocks
│   ├── editor/                 # The reusable Rich-Text Engine
│   │   ├── components/         # Toolbars, floating formatting menus
│   │   ├── plugins/            # Modality tags, timestamps, evaluative markers
│   │   └── EditorModule.tsx    # Core export
│   ├── sessions/               # Domain block: Session notes & evaluations
│   ├── clients/                # Domain block: Client identities & portfolios
│   └── calendar/               # Domain block: Booking, schedule, rhythms
├── components/
│   └── ui/                     # Design-system atomic primitives (Buttons, Modals)
├── hooks/                      # Custom hooks (e.g., useEncryptedRecord, useAutosave)
├── lib/
│   ├── crypto/                 # WebCrypto implementations (Zero-knowledge engine)
│   └── supabase/               # Typed Supabase client (Row-Level Security)
└── context/                    # InMemory Keyring Provider & Session Auth
```

---

## 6. CODE QUALITY & IMPLEMENTATION INVARIANTS

- **No Premature Monoliths:** Never build a page that includes its own input handlers and raw fetch requests. Break them immediately into `modules/`.
- **Encrypted-At-Rest Verification:** Any module initiating an API mutation must pass data through the client encryption hook before invoking the Supabase client.
- **Fail Gracefully on Locked Keys:** If a module mounts and finds the user's master key is not in memory (e.g., user refreshed tab), it must render an inline `<UnlockKeyringNotice />` instead of throwing an unhandled decrypt error.

---

# IN THE ROOM — SUPABASE DATA SCHEMA (FOUNDATION)

Living schema brief for Supabase. Every table: RLS enabled, `owner_id` (= `auth.uid()` in freelance), nullable `organization_id` for later workplaces. Clinical/PII content lives in `encrypted_payload` JSONB (`{ v, alg, iv, ciphertext, tag_length }`) unless noted as queryable metadata. Companion `record_access_keys(record_table, record_id, user_id, wrapped_dek)` supports future delegation.

Ciphertext must never be filtered via PostgREST query-string search; fetch by id / owner / date indexes only.

## A. Ownership, crypto, audit

### `profiles`
1:1 with `auth.users`. Clinician identity, practice letterhead, timezone, and key material.

- Queryable: `id`, `display_name`, `email`, `job_title`, `professional_title`, `registration_number`, `phone`, `photo_url`, `timezone`, practice letterhead fields, `public_key`, timestamps
- Sensitive key material: `encrypted_private_key`, `encrypted_private_key_recovery`
- Optional plaintext (owner’s own practice copy): `bio`

### `record_access_keys`
`id`, `record_table`, `record_id`, `user_id`, `wrapped_dek`, `created_at`

### `audit_events` (append-only foundation)
Every meaningful mutation writes a row. Clinicians may `INSERT` + `SELECT` only (no update/delete).

- `id`, `owner_id`, `organization_id` null, `actor_id`
- `action` (stable codes: `client.created`, `episode.opened`, `appointment.updated`, `note.signed_off`, `form.submitted`, `invoice.issued`, …)
- `entity_type`, `entity_id`, optional `client_id`, optional `request_id`
- `metadata` jsonb — **non-sensitive only** (status enums, field names, service slug, dates)
- optional `encrypted_detail` jsonb — rare narrative that must not be plaintext
- `created_at`

Never store names, note bodies, DOB, or decrypted clinical text in `metadata`.

## B. Clinician offers & calendar availability

### `services`
What the clinician offers. Drives calendar colours, bookable modalities, and Google/ICS mapping.

- `service_type`: `appointment` | `support` | `admin` | `busy`
- `default_duration_minutes` — **client-facing** session length (e.g. 50)
- `follow_on_service_id` + `follow_on_duration_minutes` — optional auto-attached support activity after the session (e.g. 10 minutes report writing). Client confirms 50; clinician calendar + Google hold 50 + 10.
- `buffer_minutes` — optional gap after the full pair before the next bookable slot
- Also: `id`, `owner_id`, `name`, `slug`, `description`, `color`, `is_active`, timestamps

### `availability_rules`
Weekly hours + which `service_ids` apply (replaces nested workplace settings for freelance).

- `id`, `owner_id`, `timezone`, `weekly_hours` jsonb, `service_ids` uuid[], timestamps

### `availability_exceptions`
Holidays, one-off blocks, extended hours: `starts_at`, `ends_at`, `kind` (`unavailable`|`available`), optional `reason`, optional `service_ids`.

Calendar free slots = rule window − exceptions − overlapping appointments.

## C. Clients, contacts, episodes

### `clients`
Caseload row (no raw PII).

- `id`, `owner_id`, `organization_id` null, `status` (`active`|`inactive`), `encrypted_pseudonym`, timestamps

### `client_identities`
Encrypted PII: legal name, DOB, school, addresses, emergency details.

### `client_clinical_profiles`
Encrypted formulation / goals / sensory / modality notes (profile summary fields).

### `contacts`
People linked to a client (e.g. parents who pay invoices).

- Queryable: `id`, `owner_id`, `client_id`, `role` (`parent`|`guardian`|`referrer`|`gp`|`school`|`billing`|`other`), `is_billing_contact` bool, `is_primary` bool, timestamps
- `encrypted_payload`: name, phone, email, address, relationship notes, invoice preferences

A contact may later link to finance/Xero payers via `is_billing_contact` without putting payer PII on `clients`.

### `episodes`
Discrete periods of care. A returning client years later opens a **new** episode — never one continuous stream.

- Queryable: `id`, `owner_id`, `client_id`, `episode_number` (per-client integer, starting at 1), `status` (`active`|`paused`|`discharged`), `referral_date`, `start_date`, `end_date`, timestamps
- `encrypted_payload`: referral source detail, presenting issue, discharge summary, goals for this episode

Invariant: at most one `active` episode per client (enforce in app + partial unique index). Opening episode N+2 requires N+1 closed/paused.

## D. Scheduling

### `appointments`
Hybrid schedule row for the calendar.

- Queryable: `id`, `owner_id`, `client_id` (nullable for admin/busy/support), `clinician_id`, `episode_id`, `service_id`, `appointment_type`, `starts_at`, `ends_at`, `attendance_status`, `block_role` (`client_session`|`support`|`admin`|`busy`), `parent_appointment_id` (support child → session), optional `series_id`, timestamps
- `encrypted_payload`: location, session notes, other_info
- Booking an `appointment` service with `follow_on_service_id` creates two rows: client session + support block.

## E. Progress notes (within an episode)

### `progress_notes`

- Queryable metadata:
  - `id`, `owner_id`, `client_id`, `episode_id` (**required**), `appointment_id` (nullable), `author_id`
  - `note_number` — integer sequence **within the episode** (1, 2, 3…)
  - `session_date` — date of the session this note is about
  - `noted_at` — timestamptz when the note was captured/written (time of note)
  - `status` (`draft`|`signed_off`), `signed_off_at`, `lock_until`
  - optional `template_id`
  - timestamps (`created_at` / `updated_at`)
- `encrypted_payload`: title, rich content, modality_used, therapeutic_theme, artwork attachment metadata

Rules:

1. `session_date` may differ from `noted_at` (write-up after the session).
2. Prefer linking `appointment_id`; when linked, default `session_date` from the appointment and inherit `episode_id`.
3. `note_number` is allocated per `episode_id` on create (not global per client).
4. Timeline and Reporting use queryable fields only; body stays encrypted.

## F. Clinician-designed templates & forms

Templates and forms are clinician-authored structures (not org/workplace libraries in Phase 1).

### `templates`
Unified template registry:

- `id`, `owner_id`, `kind` (`progress_note`|`letter`|`report`|`working_document`), `name`, `description`, `is_active`, timestamps
- `encrypted_payload` or structured `schema` jsonb for body/boilerplate (encrypt if content may include clinical examples)

### `form_definitions`
Clinician-designed intake / information-gathering forms (distinct from RTE “provide information” docs).

- `id`, `owner_id`, `name`, `slug`, `description`, `status` (`draft`|`published`|`archived`), `version`, `is_onboarding` bool (submission may create a client), `schema` jsonb (field defs — structure is not clinical data), timestamps
- Public/share token handling later; never put clinical answers in the definition row

### `form_submissions`

- Queryable: `id`, `owner_id`, `form_definition_id`, `form_version`, `client_id` (null until linked/created), `submitted_at`, `status` (`received`|`linked`|`rejected`)
- `encrypted_payload`: answers
- Onboarding flow: published form with `is_onboarding` → decrypt/map answers → create `clients` + `client_identities` (+ optional first `episodes` row) → set `client_id` → emit timeline + audit events

Forms **collect** information; letters/reports/working docs/progress notes **produce** information. Keep those product paths separate in UI and schema (`form_*` vs `templates` + document tables).

## G. Clinical documents (produced artefacts)

Each: `id`, `owner_id`, `client_id`, optional `episode_id`, `author_id`, optional `template_id`, timestamps + `encrypted_payload`.

- `letters` — plus queryable `letter_date`; recipient inside payload or encrypted
- `working_documents`
- `reports` — clinical/formulation reports generated for a client/episode (distinct from analytics Reporting page)
- `journal_entries` — clinician’s private journal (`author_id`, `entry_date`, `somatic_state` queryable; body encrypted)

## H. Client timeline (projection of care)

### `timeline_events`
First-class event log for the client profile timeline (not only derived at read time). Writers upsert an event whenever a care-relevant record is created/changed.

- Queryable: `id`, `owner_id`, `client_id`, `episode_id` (nullable for pre-episode onboarding), `event_date` (date shown on timeline), `occurred_at` timestamptz, `event_type`, `ref_table`, `ref_id`, `actor_id`, timestamps
- `encrypted_summary` optional short label ciphertext (prefer type + date in UI when enough)

**`event_type` vocabulary (extensible):**

| Type | Typical source |
|---|---|
| `client_created` / `onboarded` | client insert / onboarding form |
| `episode_opened` / `episode_paused` / `episode_discharged` | episodes |
| `appointment_scheduled` / `appointment_attended` / `appointment_dna` / `appointment_cancelled` | appointments |
| `progress_note` | progress_notes |
| `form_received` / `form_linked` | form_submissions |
| `letter` / `report` / `working_document` | document tables |
| `contact_added` | contacts |
| `invoice_issued` / `payment_received` | finance (later) |
| `offboarded` | client inactive / discharge pathway |

UI lists by `event_date` / `occurred_at` and filters by `episode_id` so episodic care is obvious. Prefer writing timeline rows in the same mutation path as the source record (+ `audit_events`).

## I. Reporting & outcomes

Analytics Reporting is **practice-scoped** (not organisation-wide).

### `report_definitions`
Saved/system report configs: `key`, `name`, `params` jsonb, `is_system`, `owner_id`

### `report_exports`
Export runs: `report_key`/`definition_id`, `params`, `format` (`csv`|`pdf`), `status`, optional `storage_path`, `row_count`, timestamps — always paired with `audit_events` `report.exported`

### `outcome_measure_defs` + `outcome_entries`
Stub for completion-rate reports: defs hold measure structure; entries hold `client_id`, optional `appointment_id`/`episode_id`, `recorded_on`, `completion_status`, `encrypted_payload` (scores).

Aggregations use queryable columns only (`appointments.starts_at`, `service_id`, `attendance_status`, `clients.status`, `audit_events`, outcome completion flags).

## J. Relationship map

```
profiles
  ├── services, availability_*, templates, form_definitions
  ├── audit_events, report_*
  └── clients
        ├── client_identities, client_clinical_profiles
        ├── contacts
        ├── form_submissions → (onboarding may create client)
        ├── episodes
        │     ├── appointments → services
        │     └── progress_notes (note_number per episode; session_date + noted_at)
        ├── letters / reports / working_documents
        └── timeline_events (points at any of the above)
```

## K. Google Workspace / Calendar sync (Splose-style)

Splose combines two mechanisms; we mirror that hybrid:

1. **Outbound calendar feed (ICS / webcal)** — private token URL the clinician adds in Google/Apple/Outlook. Pushes appointments, admin/busy blocks, and travel-style holds outward. Not real-time (client refresh often 30–60 minutes) but simple and works without Google API review for the feed itself.
2. **Google OAuth connection** — pull free/busy (and optionally event shells) into In the Room so personal Google events block double-booking; optionally push appointment updates via Calendar API; optionally create **Google Meet** links on telehealth services.

### Privacy rules (non-negotiable)

- Default `push_privacy = busy_only`: Google sees “Busy” (or service label), **never** decrypted client legal names from `client_identities`.
- OAuth tokens live in `calendar_connections.encrypted_credentials` (ciphertext), never plaintext columns.
- Prefer scopes `calendar.freebusy` + `calendar.events` (not full calendar ACL owner).
- Inbound titles only when `pull_external_details` is explicitly enabled; store as `encrypted_title`.

### Tables

- `calendar_connections` — Google account link, sync flags, encrypted OAuth credentials
- `calendar_feed_tokens` — hashed ICS feed secrets (`token_hash` only; raw token shown once)
- `external_calendar_blocks` — cached inbound busy ranges for calendar overlay
- `appointment_external_links` — map `appointments` ↔ Google `event_id` (+ optional `meet_url`)

### Product UX

- Profile → **Calendar sync** block: Connect Google, manage feed URL, privacy mode, Meet toggle
- Calendar module overlays `external_calendar_blocks` under practice appointments
- Appointment save path: write `appointments` → audit/timeline → enqueue push to linked Google calendar when `push_appointments`

### Edge functions (planned)

1. **`calendar-ics-feed`** — public GET `?token=…` validates `calendar_feed_tokens.token_hash`, emits ICS of the clinician’s future `appointments` (+ support/admin/busy) using `push_privacy` / feed `privacy_mode` (default busy-only). No auth cookie; token is the secret.
2. **`google-oauth-start` / `google-oauth-callback`** — OAuth code flow; stores encrypted refresh token on `calendar_connections`.
3. **`google-calendar-sync`** — cron/queue worker: pull freeBusy → `external_calendar_blocks`; push `client_session` + `support` (+ admin/busy) as separate Google events (or one busy span) per `appointment_external_links`; optional Meet link when `create_meet_links`.

### Service types → Google mapping

| In the Room `service_type` / `block_role` | Client sees | Clinician calendar | Google (default privacy) |
|---|---|---|---|
| `appointment` / `client_session` | 50m session | 50m coloured event | Busy (or service label) |
| follow-on `support` | nothing extra | 10m support after | Busy immediately after |
| `admin` | — | admin block | Busy |
| `busy` | — | personal hold | Busy |
| inbound Google | — | overlay from `external_calendar_blocks` | source |

Total bookable occupancy for a 50+10 service = 60 minutes (+ `buffer_minutes` before next slot).

## L. Near-term product workstreams

1. **Forms builder + submissions** (next larger piece) — clinician-designed forms on `form_definitions` / `form_submissions`, including onboarding that creates clients.
2. **Rich Text Editor usability** — progress notes / letters / reports / working documents templates and editing UX (paired with Forms).
3. Wire Calendar module persistence to Supabase `appointments` (so Meet + ICS push use real UUIDs end-to-end).

## M. Suggested migration / build order

1. ~~`profiles` + crypto columns + `record_access_keys` + `audit_events`~~ (applied)
2. ~~`services` + `availability_*`~~ (applied)
3. ~~`clients` + identities/profiles + `contacts` + `episodes` + `timeline_events`~~ (applied)
4. ~~`appointments` + templates/forms + clinical docs + reporting~~ (applied)
5. ~~Google calendar sync tables~~ (applied)
6. Wire auth + Profile (identity/services/availability) to Supabase
7. Calendar reads `appointments` + overlays `external_calendar_blocks`
8. ICS feed edge function + Google OAuth edge function
9. Clients / episodes / timeline / forms onboarding / notes
10. Reporting queries + exports

Every write path must emit `audit_events` and, when client-visible, `timeline_events`.
