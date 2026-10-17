# Process&Note: Technical, Legal and Compliance Roadmap

Living tracker. Items checked here are in the product. Corporate registrations and supplier contracts stay open until they are actually completed.

### 1. Legal and corporate setup
- [ ] **Companies House registration:** Formally incorporate Process&Note Ltd.
- [ ] **ICO controller registration:** Register Process&Note Ltd with the Information Commissioner's Office and pay the annual data protection fee.
- [x] **Data Processing Agreement (DPA):** Version 1.1 is presented at sign-up and again when an account's latest acceptance is older. Version 1.0 acceptances are kept.
- [ ] **Complaints handling workflow:** Establish an internal 30-day acknowledgment procedure for data protection complaints pursuant to the Data (Use and Access) Act 2025. The Privacy Notice states the 30-day acknowledgement. The internal procedure is still to be written.

### 2. Onboarding and compliance UX
- [ ] **Sole trader / institutional attestation:** Add a mandatory sign-up declaration checkbox:
  > "I confirm I am an independent sole trader / private practitioner, or have secured formal organisational authorisation (including an executed DPA and DPIA) to use Process&Note for my caseload."
- [ ] **Key custody education and warnings:** Implement onboarding screens emphasising that Process&Note cannot reset keys or recover notes if passphrases are lost.
- [ ] **Emergency recovery sheet:** Provide a printable or downloadable recovery key sheet during master key generation.

### 3. Authentication and key management UX
- [ ] **Two-factor authentication (2FA/MFA):** Implement TOTP authenticator app support within Supabase Auth prior to public launch.
- [ ] **Magic link delivery:** Test Resend integration via Supabase Auth for delivery rates and spam-filter edge cases.
- [ ] **Client-side envelope key wrapping:** Validate the client-side encryption and decryption loop with AWS KMS (`eu-west-2`) to verify no unencrypted payloads reach the database.

### 4. Offboarding and export service
- [ ] **Enforced export gate:** Build the UI barrier preventing account closure or subscription cancellation until a complete decrypted export has been generated.
- [x] **Secure temporary export worker:** A server job opens sealed records with the practice key, builds a `.zip`, and stores it in the private `eu-west-2` bucket.
- [x] **Time-limited single-use download:** The account email receives a link to a page on this site. Download works once, within 24 hours, and then the zip is deleted. Opening the page does not use the link.
- [ ] **Hard purge automation:** Implement a cascading delete that scrubs database records and AWS S3 objects when an account is closed.

### 5. Telemetry, error logging and privacy safeguards
- [ ] **Select error tracking solution:** Choose a telemetry tool (for example Sentry or GlitchTip).
- [ ] **Sanitisation middleware:** Scrub personal data, clinical text, session notes, encryption keys, and request payloads before sending reports to a monitoring service.

### 6. Analytics and cookie governance
- [ ] **Privacy-preserving analytics:** Select a cookieless analytics tool restricted to marketing pages, outside authenticated clinical writing views.
- [ ] **Cookie and storage notice:** Document essential session tokens and local storage keys. The Privacy Notice states that only strictly necessary storage is used.

### 7. Sub-processor verification and execution
- [ ] **Supabase:** Confirm database hosting and automated 24-hour backup residency in London (`eu-west-2`). Named in the Privacy Notice and DPA 1.1 for database and authentication.
- [ ] **AWS:** Confirm the S3 bucket and KMS master key residency in London (`eu-west-2`). Named in the Privacy Notice and DPA 1.1.
- [ ] **Vercel:** Execute a data processing addendum incorporating the UK International Data Transfer Addendum. Named in the Privacy Notice and DPA 1.1.
- [ ] **Stripe:** Verify the UK or EEA merchant data agreement. Named in the Privacy Notice and DPA 1.1 as Stripe Payments Europe, Ltd.
- [ ] **Resend:** Confirm EU data handling (`eu-west-1`, Ireland) and execute a DPA. Named in the Privacy Notice and DPA 1.1. Invoice email and export links use `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
