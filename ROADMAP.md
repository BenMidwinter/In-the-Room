# Process&Note — Product Roadmap

Living plan. The clinical workspace (caseload, calendar, notes, services, forms, screener, Google Calendar busy sync) is in use. The order below is the broader list.

## Next, in this order

1. Add modules as a type of RTE editor. This includes adding the consent record as a default module, as well as the DAP note as a default module. Also add Supervision notes as a default module, which will allow people to add these things a bit more flexibly.
2. **Folders on Client files and Supervision Log.** The same idea as My Documents under My Practice: create a folder, open it, rename it, and delete it, then put a file in the folder you are looking at. Want the same for Supervision, so you can have your supervision log for each client.
3. **Encrypt file names in the S3 bucket.** Object bytes can already use SSE-KMS. The object key still ends with the readable file name (`clients/{owner}/{client}/{id}/{file name}`). Encrypt that name in the key. The display name can stay in `client_files` for the signed-in owner. Someone who reaches the bucket should not be able to read the name from the key.
4. **Recovery keys, an export gate, and account deletion.** A recovery sheet when the practice key is created. Closing or cancelling an account waits until a full export has been generated. Deletion then removes the database rows and the S3 objects.
5. **Audit logging.** Show it somewhere, or at least keep a behind-the-scenes record that is ready for more than one practice later. Export already writes `export.requested` and `export.downloaded` to `audit_events`.
6. **Sign-up through Stripe, with an admin code.** New accounts pay through Stripe. An admin code lets this practice open an account without that charge. Put a bot check on the form (Cloudflare Turnstile) so scripted sign-ups cannot spam it. This can run at the same time as item 7.
7. **Marketing site, and the app on its own host.** A public site that search engines and AI crawlers can read. Move the signed-in app to `app.processandnote.app`, or another name in front, so the marketing site can use the bare domain.
8. **Policies against the product.** Read the privacy notice, terms, and DPA against what the app actually does, and correct anything that has drifted.

The export file-format sprint stays on the list and is not in this sequence. It is written up in `docs/LegalComplianceChecklist.md`: PDFs for clinical writing, and other files left in their own formats.

---



## 1. Missing features

- [x] **Reporting.** Overview, Appointments & Notes, Clients, Waitlist, My Practice, and Finance. It opens on a rolling week, and every section can take other dates. Efficiency is appointment, support, and admin time as a percentage of availability minus busy time.
- [x] **Invoicing.** The hub has All Invoices and Unbilled Sessions, using the same filter and sort tables as the rest of the app. A new invoice starts by choosing a client. Batch Invoice drafts one invoice per client or billing contact for a date range, in arrears or in advance. Send can email through Resend, or mark an invoice as sent manually. The invoice itself is one document: recipient, lines, and payment terms. People who share a Send invoices to contact still go on one invoice. Xero sync and expenses are still to do.

Service prices, including whether the price already includes VAT, live on each service.

## Interface tweaks

Noted from the hosted site.

- [x] Standardise text size between pages.
- [ ] Evaluate the calendar layout. The text is a bit squeezed.
- [x] Make back buttons return to the previous screen.
- [x] Rename the product to Process&Note, and use the logos already chosen.
- [x] **Browser memory.** IndexedDB on this device keeps the calendar view, report filters, and each table’s filters and sorting. Further preferences can be added to the same store.
- [ ] **Mobile notes editor.** On a phone, the rich text editor opens inside the desktop page padding, so the writing surface is a small box. Make it behave like a notes app: the editor should use the screen, with the surrounding chrome out of the way.
- [ ] **Mobile calendar times.** In the phone calendar, appointment blocks overlap the time labels down the left. Keep those times readable, and keep the events in the grid beside them.
- [ ] **Archive and delete on document tables.** A clinician needs to archive a document so it leaves the working list and stays recoverable. Follow All Invoices: the row action is a button in the last column (Open, on the right of each invoice). Put a Delete button in that same place on pretty much every document-based table: notes, letters, working documents, reports, practice documents, and the other document lists. Archive is the non-destructive action. Delete is the row button.



## 2. Encryption and login

Encryption wiring is the next piece of work. Organisation id is the owner of the clients, ready for a later workspace. The people using the app now are freelance clinicians, one account each. TOTP enrolment is in Settings. A verified authenticator must be entered before clinical pages on that sign-in. Recovery codes and an API-level AAL2 lock are still later.

- [ ] Envelope encryption for client text and editor text, on top of notes, letters, reports, form answers, and outcome totals. Client names, contacts, clinical profiles, appointment notes, waitlist text, tags, and invoice addressees are included. Journal, working documents, practice documents, templates, form wording, questionnaires, and CPD or supervision notes are included. Bank details are included. The clinician’s name, email, phone, bio, registration, and letterhead stay readable so an account can be supported. Operational columns stay readable: appointment times, attendance, note status, invoice amounts, and service prices.
- [ ] Keep the current dummy rows. New writes use the envelope. Existing rows stay plain, so the two can be compared. Wipe every test row in one go only when a stable beta is ready.
- [x] Data processing agreement, version 1.1. Accepted at signup, or on the next sign-in for an account that does not have the current version yet. A verified authenticator, once enrolled, is asked for after that agreement.



## 3. Data management

- [x] Private document storage in a London S3 bucket, linked to AWS, with short-lived upload and download links. Client file metadata is in `client_files`. The browser talks to S3 directly.
- [x] **Export by email.** One client, or the whole practice, as a `.zip` of the individual files. The clinician chooses what is included. The server builds the file and emails a one-time link to the account address. The browser session never receives the file. Clinical writing in that zip is still HTML. The file-format sprint is in `docs/LegalComplianceChecklist.md`.

The export uses the private London store for the zip, and the same mail provider as invoice email for the link. Supabase Auth email only sends sign-in messages, so it cannot carry this link. Clinical text is decrypted on the server for the person who asked, then placed in the zip. See the export plan below.

## Later, not the next piece of work

- [x] **Add clients to the waitlist manually.** On the waitlist, Add client moves someone who is already a client onto the waitlist.
- [ ] **Groups.** Record who attended a group session, with a note and a fee for each person, and invoice those people from that session. On the list, and not a priority.
- [ ] **Mandatory MFA, as a final step.** Settings can enrol a TOTP authenticator, and a verified factor must be entered before clinical pages on that sign-in. Still to do: recovery codes, an inactivity lock, and blocking clinical API routes unless the session is AAL2.

---



## Later detail: Authentication Hardening, DPA Governance, & Data Portability



### Account Security, Legal Compliance (DPA), & Caseload Portability

- [x] **UK GDPR Article 28 Data Processing Agreement, version 1.0**
  - Public agreement at `/legal/dpa`. Signup cannot finish until it is accepted. An existing account signs off once after login.
  - The registering practitioner or clinic is the Data Controller. Process&Note is the Data Processor.
  - Version 1.0 names two sub-processors, both in `eu-west-2` (London) only: Supabase (database, authentication, and file storage) and AWS (KMS, secrets, and cryptographic processing).
  - The agreement includes the 48-hour breach notice, deletion and cryptographic erasure, and the laws of England and Wales.
  - Acceptance is stored on the profile: `dpa_accepted`, a server-stamped `dpa_accepted_at`, and `dpa_version` `1.0`. `dpa_accepted_ip` is present and left empty.
- [ ] Wider sub-processor register for services that are not in version 1.0 yet: document storage, hosting, billing, and transactional email.

- [ ] **Hardened Authentication & Session Lifecycle (Supabase Auth)**
  - **TOTP MFA enrolment (in place for an enrolled factor):**
    - Settings → Two-factor authentication enrols a TOTP authenticator (Google Authenticator, 1Password, Apple Passwords) with `supabase.auth.mfa`. Removing one asks for the current password.
    - `supabase/config.toml` has `[auth.mfa.totp]` `enroll_enabled` and `verify_enabled`.
    - When `getAuthenticatorAssuranceLevel()` reports `nextLevel === 'aal2'` and `currentLevel !== 'aal2'`, clinical routes show a code screen before the rest of the app. An account with no verified factor is not blocked.
  - **Still to do:**
    - Block access to all clinical API routes/tables if `auth.jwt() -> app_metadata -> aal != 'aal2'` (Supabase Authenticator Assurance Level 2).
    - Provide secure recovery codes generated on enrolment (hashed with bcrypt before DB storage).
  - **Session Management & Inactivity Lock:**
    - Configure JWT access token expiration to 15–30 minutes with secure HTTP-only refresh tokens.
    - Implement a client-side inactivity timer: Automatically mask the screen and lock the session after 15 minutes of idle time, requiring biometric/password re-auth to resume without terminating unsaved form state.
  - **Immutable Audit Logging:**
    - Implement a dedicated table and Postgres function to record all access to client notes, documents, and assessments:
      ```sql
      create table public.audit_logs (
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid references public.workspaces(id) on delete cascade not null,
        actor_id uuid references auth.users(id) not null,
        action text not null, -- 'VIEW_CLIENT', 'EDIT_NOTE', 'DOWNLOAD_DOCUMENT', 'EXPORT_CASELOAD'
        resource_type text not null,
        resource_id uuid not null,
        ip_address inet,
        created_at timestamptz default timezone('utc'::text, now()) not null
      );
      ```

- [ ] **Export plan (Splose-style, emailed to the account)**
  - Two places to ask:
    - A client profile action, **Export**. Tick what to include, or select all: profile, contacts, notes, letters, documents, working documents, reports, forms and scores, appointments, support, and invoices.
    - **Settings → Export** for the whole practice. Same client groups, for every client, plus services, availability, journal, practice documents, CPD, supervision, templates, form designs, questionnaires, tags, and letterheads. A date range can limit notes, appointments, invoices, the journal, and the logs. Bank and invoice details are included, because they belong to the account.
  - The file is one `.zip`. Each note, letter, document, report, and form is its own file under that client. Lists such as appointments and contacts are tables inside the same zip. A contents list names every file.
  - The request is stored, then a background job builds the zip. It opens sealed text through the existing clinical record path, for the signed-in clinician only. The browser does not download the zip from that request.
  - The finished zip sits in the private London bucket. A random token is stored only as a hash. The message goes to the account email, not to an address typed on the form.
  - The link opens a page on this site with a **Download** button. Opening the page does not use the token up, so a mail scanner does not expire it. The button works once, and only within 24 hours of the file being ready. After that the zip is deleted.
  - Settings can show that an export is preparing, emailed, or expired. It does not offer the file itself. A stolen sign-in can ask for an export, and still cannot collect the zip without the account inbox.
  - Record `export.requested` and `export.downloaded` in the audit log.
  - Splose also lets a workspace pick which colleague receives a client export, and its settings page can download the file directly. This plan keeps the email link and the checklist, and leaves those two out.

---



## Later detail: Confidential document storage



### Low-Velocity Confidential Document Storage (AWS S3 + Supabase Architecture)

The app side is in place. `client_files` stores metadata for the signed-in owner (`owner_id`), not a workspace. The `client-files` Edge Function returns a five-minute PUT URL and a 60-second GET URL in `eu-west-2`. The browser sends the file straight to S3. When `AWS_KMS_KEY_ID` is set, the upload is signed for SSE-KMS. Bucket lifecycle, public-access block, and object lock stay with the bucket itself.

- [ ] **AWS S3 Bucket Setup (London `eu-west-2`)**
  - Create a private S3 bucket in `eu-west-2` (strictly enforcing UK data residency under UK GDPR/NHS DSPT).
  - Enable **Block All Public Access** (100% private, no public read/write URLs).
  - Configure Server-Side Encryption using AWS KMS (`aws:kms`) with an isolated customer-managed key.
  - Apply Bucket Policy enforcing TLS 1.3 in transit (`aws:SecureTransport: true`).
  - Configure S3 Lifecycle Rules: Transition objects to **S3 Glacier Instant Retrieval** after 30 days to reduce storage costs while maintaining sub-second access for clinical reviews.
  - (Optional for full compliance) Configure S3 Object Lock in Compliance Mode aligned with NHS Records Management Code of Practice (20-year retention rule).

- [ ] **Supabase Metadata & Database Schema**
  - Create a `client_documents` table in Postgres:
    ```sql
    create table public.client_documents (
      id uuid primary key default gen_random_uuid(),
      client_id uuid references public.clients(id) on delete cascade not null,
      workspace_id uuid references public.workspaces(id) on delete cascade not null,
      uploaded_by uuid references auth.users(id) not null,
      file_name text not null,
      file_type text not null,
      file_size_bytes bigint not null,
      s3_key text not null unique,
      created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );
    ```
  - Enable Row-Level Security (RLS) on `client_documents` ensuring clinicians can only view/insert documents belonging to their assigned workspace/client.

- [ ] **Supabase Edge Functions for Presigned S3 Operations**
  - Implement `create-upload-url` Edge Function: Validates session JWT, checks workspace RLS permissions, and returns an AWS S3 PUT presigned URL (valid for 5 minutes).
  - Implement `get-document-url` Edge Function: Validates session JWT, verifies the clinician has access to the `client_id`, and returns an AWS S3 GET presigned URL (strictly expiring after 60 seconds).
  - Ensure zero document binary payload passes through Supabase compute; file data streams directly between client browser and AWS S3.

