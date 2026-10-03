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

---

# IN THE ROOM — FRONTEND & MODULAR ARCHITECTURE DIRECTIVES

You are building "In the Room" following a strict **Thin-Page / Encapsulated-Module** pattern (the ChromatiK architectural model). Every page route acts solely as a structural shell, while all business logic, editor states, cryptographic binds, and complex interactions live inside isolated, composable modules.

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
