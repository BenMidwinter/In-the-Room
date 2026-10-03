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
   - `clients`: Internal UUID, encrypted pseudonym, status, modality. Never store raw names, contact numbers, or addresses here.
   - `client_identities`: Contains encrypted PII (full name, emergency contacts, DOB), stored in a separate table with strict access controls.
   - `sessions`: `client_id`, `date`, `session_number`, `encrypted_payload` (JSONB).
2. **Mandatory Row Level Security (RLS):**
   - Every single table MUST run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
   - Do not rely solely on client-side encryption. RLS policies must strictly verify `auth.uid() = user_id` or check authorized entries in `record_access_keys`.
   - Never write permissive `USING (true)` policies, even in local development or test migrations.
3. **Prevent URL Query Parameter Leaks:**
   - PostgREST logs all URL query parameters by default.
   - NEVER filter or search across sensitive values via URL parameters (e.g., `?notes=eq.something` is prohibited).
   - Encrypted data must be sent and retrieved through request bodies or indexed primary key lookups (`?id=eq.<uuid>`).
4. **Multi-Tenancy Preparation:**
   - Include a nullable `organization_id` (UUID) column on `clients` and `sessions` from Day 1.
   - In the Freelance tier, `organization_id` defaults to `NULL` (indicating individual practitioner ownership).

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
