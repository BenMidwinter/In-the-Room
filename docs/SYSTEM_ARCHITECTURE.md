# IN THE ROOM — SYSTEM ARCHITECTURE & SECURITY DIRECTIVES

You are an expert full-stack engineer and security architect building "In the Room", a clinical documentation and evaluation platform for creative arts therapists. You must adhere to the following non-negotiable security, cryptographic, and architectural constraints on EVERY code generation, refactor, and database migration.

---

## 1. THE GOLDEN RULE (CLIENT-SIDE ENCRYPTION ONLY)

- **Zero-Plaintext at Rest:** The database (Supabase/PostgreSQL) MUST NEVER receive, process, or store unencrypted clinical data, notes, formulations, assessments, or patient-identifiable data (PID/PII).
- **Client-Side Boundary:** All sensitive text, process notes, and identifiers must be encrypted in the browser (via the WebCrypto API) BEFORE hitting the network or any Supabase client API call.
- **Strict Server Blindness:** The backend server and Supabase database are treated as an untrusted, semi-honest storage medium. If the entire database were dumped publicly, an attacker must only see opaque ciphertext blobs.

---

## 2. CRYPTOGRAPHIC ARCHITECTURE (ENVELOPE + HYBRID ASYMMETRIC)

To allow individual clinician ownership now while enabling seamless multi-user/workplace delegation later without re-encrypting data, implement a Hybrid Envelope Encryption model:

### A. User Keys (Generated at Registration)

1. **Key Pair Generation:** Each user generates an asymmetric key pair in-browser:
   - Modern WebCrypto RSA-OAEP (4096-bit, SHA-256) or ECDH (P-256).
   - `public_key`: Exported as SPKI and stored in plaintext in `profiles.public_key`.
   - `private_key`: Exported as PKCS#8 and encrypted client-side using a Key Encryption Key (KEK).
2. **KEK Derivation:**
   - Derived from the user's master passphrase via PBKDF2 (SHA-256, >=600,000 iterations) or Argon2id with a unique 16-byte random salt.
   - Master passphrase is NEVER transmitted or stored anywhere.
3. **Recovery Escrow Kit:**
   - A high-entropy 24-word BIP-39 mnemonic or 256-bit recovery key is generated.
   - The user's private key is also encrypted with a key derived from this recovery key.
   - Stored in `profiles.encrypted_private_key_recovery`.
   - User MUST be prompted to download/print this kit during setup to comply with clinical record retention rules.

### B. Record Encryption (DEK - Data Encryption Key)

1. Each client entity or session record has its own random 256-bit symmetric **DEK** (AES-GCM-256).
2. The payload (session notes, ratings, reflections, clinical data) is serialized to JSON and encrypted using the DEK with a unique 12-byte initialization vector (`iv`).
3. Payload schema in database:

   ```json
   {
     "iv": "<base64_12_bytes>",
     "ciphertext": "<base64_encrypted_payload>",
     "tag_length": 128
   }
   ```
