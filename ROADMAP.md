# Process&Note — Product Roadmap

Living plan. The clinical workspace (caseload, calendar, notes, services, forms, screener, Google Calendar busy sync) is in use.

The next pass is the sequence below. Encryption stays on the list after it. MFA stays off. Dummy rows stay.

---

## Next, in this order

Do not commit secrets, the production origin, the from address, or the bucket name. `SITE_URL` is already the production origin. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are already Edge Function secrets. The private export bucket is already in `eu-west-2`, and its credentials are already secrets. Do not wipe dummy rows. Do not turn on MFA. When this pass works on the live domain, push it to main.

### 1. Privacy policy and terms

Settings → Legal already has the tabs. Privacy policy and Terms and conditions still render “This document has not been added yet” inside a settings card. The DPA does not: `DpaDocument` is a `legal-doc` article, embedded on the settings tab and published at `/legal/dpa`.

- [ ] Put the October 2026 Privacy Notice and Terms on those two tabs, in that same article, embedded the way the DPA is. The copy is the notice and the terms supplied with this request (Process&Note Ltd, in formation; support@processandnote.app).
- [ ] Publish the same articles at `/legal/privacy` and `/legal/terms`, in the same public shell as `/legal/dpa`. Only `/legal/dpa` is routed today.

### 2. Data processing agreement, version 1.1

Version 1.0 is done and stays on record. Nothing in the product chooses a later number, so the next agreement is **1.1**.

What 1.0 actually does, and what 1.1 has to change:

- The text, `src/lib/dpa.js`, and `stamp_profile_dpa()` are all hardcoded to `1.0`.
- Once a profile has accepted, that trigger copies the old flag, time, and version back on every later update. A 1.0 acceptance cannot be replaced through the current trigger.
- Sign-in only checks `dpa_accepted`. It does not look at `dpa_version`, so someone who accepted 1.0 is never asked again.
- Signup stores a version in user metadata, then `handle_new_user` copies only the boolean, and the trigger stamps `1.0`.

- [ ] Issue version 1.1. New signups stamp 1.1. Keep every 1.0 acceptance (who, version, server time). Do not overwrite that stamp. `dpa_accepted_ip` stays empty.
- [ ] Anyone whose latest acceptance is not 1.1 accepts 1.1 at the next sign-in, on the same screen 1.0 uses now (`DpaSignOff`).
- [ ] Add three rows to the sub-processor table. Each is limited to the location in the Privacy Notice:
  - **Resend** — transactional email (invoices, export links, service notices). European Union (`eu-west-1`, Ireland). UK adequacy.
  - **Amazon Web Services, S3** — private file storage and export zips. United Kingdom (`eu-west-2`, London) only. This is a new row. The existing AWS row stays key management, secrets, and cryptographic processing, still `eu-west-2` only.
  - **Vercel** — application hosting. Global edge network / UK and EU. UK International Data Transfer Addendum / SCCs.
- [ ] Version 1.0 says nothing leaves `eu-west-2`. That sentence cannot stay once Resend (Ireland) and Vercel (edge) are named. Limit each processor to its own row. London stores stay in `eu-west-2`.
- [ ] The 1.0 Supabase row includes file storage. Private files and export zips are the London bucket, so the Supabase purpose in 1.1 is the database and authentication.
- [ ] The Privacy Notice also names Stripe (United Kingdom / Ireland). The 1.0 DPA does not. Publishing both as written leaves the processor lists different. Align them in 1.1: add Stripe on the notice’s terms, or take Stripe out of the notice.

### 3. Export by email

`src/lib/clinicalExport.ts` downloads one note, letter, or form as a PDF in the browser. That is not this export. There is no Settings → Export page, no client export action, and no job. The audit table that exists is `audit_events`. The `audit_logs` sketch further down is not built. Write `export.requested` and `export.downloaded` on `audit_events`.

- [ ] **One client, from the client profile.** An Export action. Tick what to include, or select all: profile, contacts, notes, letters, documents, working documents, reports, forms and scores, appointments, support, and invoices.
- [ ] **The whole practice, from Settings → Export.** The same client groups, for every client, plus services, availability, journal, practice documents, CPD, supervision, templates, form designs, questionnaires, tags, and letterheads. A date range can limit notes, appointments, invoices, the journal, and the logs. Bank and invoice details are included, because they belong to the account.
- [ ] The file is one `.zip`. Each note, letter, document, report, and form is its own file under that client. Lists such as appointments and contacts are tables inside the same zip. A contents list names every file.
- [ ] The request is stored, then a background job builds the zip. It opens sealed text through the existing clinical record path, for the clinician who asked. The response that created the job does not contain the zip, and the browser session does not download it from that request.
- [ ] The finished zip sits in the private London bucket. A random token is stored only as a hash. The message goes through Resend, using the secrets already set, to the account email only. Not to an address typed on the form. Not through Supabase Auth email. The link uses `SITE_URL`.
- [ ] The link opens a page on this site with a Download button. Opening the page does not use the token, so a mail scanner does not expire it, and it does not count as a download. The button works once, and only within 24 hours of the file being ready. After that the zip is deleted.
- [ ] Settings can show preparing, emailed, or expired. It does not offer the file. A stolen sign-in can ask for an export, and still cannot collect the zip without the account inbox.
- [ ] Record `export.requested` when the job is asked for, and `export.downloaded` when the button is used. The download page has no session, so the download event is written by the function that serves the file.
- [ ] Splose also lets a workspace pick which colleague receives a client export, and its settings page can download the file directly. This plan keeps the email link and the checklist, and leaves those two out.

### 4. Invoice email

`send-invoice-batch` already posts to Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both set, and returns “Email is not connected yet” when either is missing. The send dialog already probes that and offers email when the probe succeeds. The secrets are set. Do not add a second mailer, and do not commit the key or the from address.

- [ ] Confirm the deployed function sees those secrets. If Send still answers “Email is not connected yet”, redeploy this function. A draft with a recipient then goes out through Resend, and the invoice stores the recipient, the sent time, and the delivery method as it does now.

### 5. Interface

Check each of these on a phone-width screen.

- [ ] **Mobile notes editor.** The rich text editor draws a paper sheet (`doc-editor__page`, capped at 210mm, with its own border and shadow) inside the desktop page padding, so the writing area is a small box. The client page already hides its nav while a document is open. On a phone the open editor should use the screen, with that surrounding chrome out of the way.
- [ ] **Mobile calendar.** Appointment blocks overlap the time labels down the left (`.calendar-time-grid__hour-label`). Below 720px the gutter narrows to about 3.4rem and the day columns narrow with it. Keep those times readable, and keep the events in the grid beside them.
- [ ] **Archive and delete.** A clinician needs to archive a document so it leaves the working list and can be brought back. Follow All Invoices, where the last column is an Open button on the right of each row. Put a Delete button in that same place on the document tables: notes, letters, working documents, reports, practice documents, and the other document lists. Notes history and letters have no actions column today. Archive is the non-destructive action. Delete is the row button. Form definitions already have an archived status; that is the form catalogue, not this.
- [ ] **Closed on the waitlist, in this same pass.** The lists are Screener, Waitlist, then Rejected. Client status allows `screener`, `waitlist`, and `rejected`. Add Closed before Rejected. A person who was on the waitlist and later was not seen is marked Closed from the row menu, leaves the working waitlist, and stays on Closed. Rejected stays for a referral that was never taken on. The profile status needs to show Closed as well.
- [ ] **Nested boxes, as a global phone style.** On a phone, page padding, a section card, and the panel inside it stack, as on the home dashboard. One style, used across the app, so a phone-width screen does not show a box inside a box inside a box.

---

## 1. Missing features

- [x] **Reporting.** Overview, Appointments & Notes, Clients, Waitlist, My Practice, and Finance. It opens on a rolling week, and every section can take other dates. Efficiency is appointment, support, and admin time as a percentage of availability minus busy time.
- [x] **Invoicing.** The hub has All Invoices and Unbilled Sessions, using the same filter and sort tables as the rest of the app. A new invoice starts by choosing a client. Batch Invoice drafts one invoice per client or billing contact for a date range, in arrears or in advance. The send function already calls Resend when its secrets are present; confirming that on the live function is item 4 above. The invoice stores the recipient email, sent time, and delivery method. The invoice itself is one document: recipient, lines, and payment terms. People who share a Send invoices to contact still go on one invoice. Xero sync and expenses are still to do.

Service prices, including whether the price already includes VAT, live on each service.

## Interface tweaks

Noted from the hosted site. The open items are in the next pass, above.

- [x] Standardise text size between pages.
- [ ] Evaluate the calendar layout. The text is a bit squeezed.
- [x] Make back buttons return to the previous screen.
- [x] Rename the product to Process&Note, and use the logos already chosen.
- [x] **Browser memory.** IndexedDB on this device keeps the calendar view, report filters, and each table’s filters and sorting. Further preferences can be added to the same store.

## 2. Encryption and login

Encryption wiring stays on the list. It is not this pass. Organisation id is the owner of the clients, ready for a later workspace. The people using the app now are freelance clinicians, one account each. MFA stays off. Enrolment and the second-factor lock are a final step, after the rest of the product is in place.

- [ ] Envelope encryption for client text and editor text, on top of notes, letters, reports, form answers, and outcome totals. Client names, contacts, clinical profiles, appointment notes, waitlist text, tags, and invoice addressees are included. Journal, working documents, practice documents, templates, form wording, questionnaires, and CPD or supervision notes are included. Bank details are included. The clinician’s name, email, phone, bio, registration, and letterhead stay readable so an account can be supported. Operational columns stay readable: appointment times, attendance, note status, invoice amounts, and service prices.
- [ ] Keep the current dummy rows. New writes use the envelope. Existing rows stay plain, so the two can be compared. Wipe every test row in one go only when a stable beta is ready.
- [x] Data processing agreement, version 1.0. Accepted at signup, or on the next sign-in for an account that does not have one yet. Version 1.1 is item 2 of the next pass. The second-factor lock stays off until MFA is enrolled as a final step.

## 3. Data management

- [ ] Private document storage in a London S3 bucket, linked to AWS, with short-lived upload and download links. The export zip uses the private bucket that already exists. Uploading and opening a client’s own files is still this item.
- [ ] **Export by email.** Specified in the next pass. One client, or the whole practice, as a `.zip` of the individual files. The clinician chooses what is included. The server builds the file and emails a one-time link to the account address. The browser session never receives the file.

The export uses the private London store for the zip, and the same mail provider as invoice email for the link. Supabase Auth email only sends sign-in messages, so it cannot carry this link. Clinical text is decrypted on the server for the person who asked, then placed in the zip.

## Later, not this pass

- [x] **Add clients to the waitlist manually.** On the waitlist, Add client moves someone who is already a client onto the waitlist.
- [ ] **Groups.** Record who attended a group session, with a note and a fee for each person, and invoice those people from that session. On the list, and not a priority.
- [ ] **Mandatory MFA, as a final step.** Enrol a phone code, then turn on the second-factor lock so a clinical payload is readable only after that code. Leave it until the rest of the product is in place. Do not turn it on in the next pass.

---

## Later detail: Authentication Hardening, DPA Governance, & Data Portability

### Account Security, Legal Compliance (DPA), & Caseload Portability

- [x] **UK GDPR Article 28 Data Processing Agreement, version 1.0**
  - Public agreement at `/legal/dpa`. Signup cannot finish until it is accepted. An existing account signs off once after login.
  - The registering practitioner or clinic is the Data Controller. Process&Note is the Data Processor.
  - Version 1.0 names two sub-processors, both in `eu-west-2` (London) only: Supabase (database, authentication, and file storage) and AWS (KMS, secrets, and cryptographic processing).
  - The agreement includes the 48-hour breach notice, deletion and cryptographic erasure, and the laws of England and Wales.
  - Acceptance is stored on the profile: `dpa_accepted`, a server-stamped `dpa_accepted_at`, and `dpa_version` `1.0`. `dpa_accepted_ip` is present and left empty.
- [ ] Version 1.1, the privacy policy, and the terms are item 1 and item 2 of the next pass. That version adds Resend, the London S3 bucket, and Vercel, and it keeps the 1.0 acceptances.

- [ ] **Hardened Authentication & Session Lifecycle (Supabase Auth)**
  - **Mandatory TOTP MFA Enrollment:**
    - Enforce Time-based One-Time Passwords (TOTP via Google Authenticator, 1Password, Apple Passwords) before allowing route access beyond `/onboarding/mfa`.
    - Block access to all clinical API routes/tables if `auth.jwt() -> app_metadata -> aal != 'aal2'` (Supabase Authenticator Assurance Level 2).
    - Provide secure recovery codes generated on enrollment (hashed with bcrypt before DB storage).
  - **Session Management & Inactivity Lock:**
    - Configure JWT access token expiration to 15–30 minutes with secure HTTP-only refresh tokens.
    - Implement a client-side inactivity timer: Automatically mask the screen and lock the session after 15 minutes of idle time, requiring biometric/password re-auth to resume without terminating unsaved form state.
  - **Immutable Audit Logging:**
    - `audit_events` already records an action, an entity, and an optional client for the signed-in clinician. Export uses that table. A second `audit_logs` table is not required for the next pass. The wider access log (views of notes, documents, and assessments, with an address) is still to do:
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

- [ ] **Export plan (Splose-style, emailed to the account).** Specified in the next pass. The checklist, the one-time link, and the rule that Settings does not offer the file all live there.

---

## Later detail: Confidential document storage

### Low-Velocity Confidential Document Storage (AWS S3 + Supabase Architecture)

The export zip uses the private London bucket that already exists. The items below are still the design for a clinician uploading and opening a client’s own files.

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
