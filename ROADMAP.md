# In the Room — Product Roadmap

Living plan. The clinical workspace (caseload, calendar, notes, services, forms, screener, Google Calendar busy sync) is in use. The order below is the broader list.

---

## 1. Missing features

- [ ] **Reporting.** A practice dashboard of hours, attendance, caseload, fees, and outcome totals. See the reporting notes in the product discussion. Do not invent population norms or clinical cutoffs.
- [ ] **Invoicing.** Start by tallying hours and session totals from service prices. A full invoice, expenses, and accounting sync come after the tally.

Service prices, including whether the price already includes VAT, live on each service.

## 2. Data management

- [ ] Private document storage in a London S3 bucket, linked to AWS, with short-lived upload and download links.
- [ ] A caseload export the clinician can open, with clinical records decrypted for them.

The decrypted export has to follow encryption. Hours, fees, and attendance can be exported before that, because they are not the clinical note.

## 3. Encryption

- [ ] Encrypt clinical records end to end: notes, letters, reports, form answers, and outcome totals.

## 4. Login, DPA, and account security

The data processing agreement belongs with this patch, including mandatory MFA. It waits until the three items above.

---

## Later detail: Authentication Hardening, DPA Governance, & Data Portability

### Account Security, Legal Compliance (DPA), & Caseload Portability

- [ ] **UK GDPR Article 28 Data Processing Agreement (DPA) Framework**
  - Draft an in-app click-through DPA integrated directly into user registration/checkout terms.
  - Define clear legal roles: Subscribing Clinician = **Data Controller**; Platform Entity = **Data Processor**.
  - Document and maintain a public **Sub-Processor Register** with regional pin guarantees (`eu-west-2` London):
    - Database & Auth: Supabase (AWS London)
    - Document Cold Storage: AWS S3 (London)
    - Web Application CDN/Hosting: Vercel / Cloudflare
    - Subscription Billing: Stripe Payments UK Ltd
    - Transactional Email: Resend / Postmark
  - Add explicit commitments to the terms:
    - 48-hour data breach notification window to Controllers.
    - Statutory data processing instructions strictly limited to app functionality.
    - Explicit DPA consent timestamp tracking stored in database:
      ```sql
      create table public.dpa_consents (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users(id) on delete cascade not null,
        dpa_version text not null,
        ip_address inet,
        consented_at timestamptz default timezone('utc'::text, now()) not null
      );
      ```

- [ ] **Hardened Authentication & Session Lifecycle (Supabase Auth)**
  - **Mandatory TOTP MFA Enrollment:**
    - Enforce Time-based One-Time Passwords (TOTP via Google Authenticator, 1Password, Apple Passwords) before allowing route access beyond `/onboarding/mfa`.
    - Block access to all clinical API routes/tables if `auth.jwt() -> app_metadata -> aal != 'aal2'` (Supabase Authenticator Assurance Level 2).
    - Provide secure recovery codes generated on enrollment (hashed with bcrypt before DB storage).
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

- [ ] **Self-Serve Caseload Portability & Off-Boarding Engine**
  - Build a background worker / Supabase Edge Function to generate an asynchronous **Full Caseload Export**:
    - Serialises client demographics, clinical session notes, outcome measures, and assessment scores into clean JSON and CSV formats.
    - Fetches and bundles all associated client PDFs (psychiatrist letters, reports) from AWS S3 storage.
    - Bundles everything into an encrypted `.zip` archive delivered via a time-limited, signed S3 download link (valid for 24 hours).
  - Guarantees zero vendor lock-in, enabling clinicians to satisfy HCPC/NCIP statutory retention duties or migrate data if closing an account.
  - Automatically records an audit log event upon export request and download completion.

---

## Later detail: Confidential document storage

### Low-Velocity Confidential Document Storage (AWS S3 + Supabase Architecture)

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
