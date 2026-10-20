# Process&Note — Product roadmap

Living plan. The clinical workspace is in use: caseload, calendar, notes, services, forms, screener, and Google Calendar busy sync.

Open work is first. Finished work is ticked at the bottom.

## Next, in this order

1. **Editor modules.** Add modules as a type of rich text editor. Consent record, DAP note, and supervision notes are the default modules, so people can add these more flexibly.
2. **Folders on Client files and the Supervision log.** The same idea as My Documents under My Practice: create a folder, open it, rename it, and delete it, then put a file in the folder you are looking at. The same for Supervision, so a supervision log can be kept for each client.
3. **Encrypt file names in the S3 bucket.** Object bytes can already use SSE-KMS. The object key still ends with the readable file name (`clients/{owner}/{client}/{id}/{file name}`). Encrypt that name in the key. The display name can stay in `client_files` for the signed-in owner. Someone who reaches the bucket should not be able to read the name from the key.
4. **Recovery keys, an export gate, and account deletion.** A recovery sheet when the practice key is created. Closing or cancelling an account waits until a full export has been generated. Deletion then removes the database rows and the S3 objects.
5. **Audit logging.** `audit_events` already records some actions (client changes, services, letterheads, exports). Show that record somewhere, or keep it behind the scenes in a shape that is ready for more than one practice. It does not yet cover every view of a note, document, or assessment.
6. **Sign-up through Stripe, with an admin code.** New accounts pay through Stripe. An admin code lets this practice open an account without that charge. Put a bot check on the form (Cloudflare Turnstile) so scripted sign-ups cannot spam it. This can run at the same time as item 7.
7. **Marketing site, and the app on its own host.** A public site that search engines and AI crawlers can read. Move the signed-in app to `app.processandnote.app`, or another name in front, so the marketing site can use the bare domain.
8. **Policies against the product.** Read the privacy notice, terms, and DPA against what the app actually does, and correct anything that has drifted.

The export file-format sprint stays on the list and is not in this sequence. See below.

## Also open

- [ ] **Export file formats.** The zip, the emailed link, and the download page work. The remaining sprint is `export-data` and `supabase/functions/_shared/exportBundle.ts`. Clinical writing is still HTML (process notes, letters, working documents, reports, journal, templates, practice documents) and needs to be PDF, using the same layout as `src/lib/clinicalExport.ts`. That PDF path runs in the browser, so the worker needs a server-side version of it. Uploaded client files keep their own types. Contacts, appointments, invoices, services, tags, and letterheads stay CSV. Forms, scores, availability, form designs, and questionnaires stay JSON. Client uploads are still a placeholder text file and need to be the stored objects. Written up in `docs/LegalComplianceChecklist.md`.
- [ ] **Calendar layout.** The text is a bit squeezed. Decide whether the grid needs more room.
- [ ] **Mobile calendar times.** On a phone, appointment blocks can sit over the time labels down the left. Keep those times readable, and keep the events in the grid beside them.
- [ ] **Groups.** Record who attended a group session, with a note and a fee for each person, and invoice those people from that session. On the list, and not a priority.
- [ ] **Xero and expenses.** Invoicing itself is in place. Syncing to Xero, and recording expenses, are not.
- [ ] **Sign-in hardening still to do.** A verified authenticator is already asked for before clinical pages. Still to do: recovery codes, an inactivity lock, and blocking clinical API routes unless the session is AAL2. This is separate from the practice-key recovery sheet in item 4.
- [ ] **Plain rows from before the envelope.** New writes use the envelope. Older rows can still be read as plain text, so the two can be compared. Wipe every test row in one go only when a stable beta is ready.
- [ ] **Wider sub-processor contracts.** Services named in the privacy notice and DPA 1.1 still need their own checks: Supabase and AWS residency, a Vercel transfer addendum, the Stripe merchant agreement, and a Resend DPA. The same list is in `docs/LegalComplianceChecklist.md`.
- [ ] **S3 bucket compliance, on the bucket itself.** The app already uploads and downloads through short-lived links. Still to confirm on the London bucket: block all public access, a TLS-only bucket policy, lifecycle to Glacier Instant Retrieval, and object lock if the retention rule requires it.

---

## Done

### Features

- [x] **Reporting.** Overview, Appointments & Notes, Clients, Waitlist, My Practice, and Finance. It opens on a rolling week, and every section can take other dates. Efficiency is appointment, support, and admin time as a percentage of availability minus busy time.
- [x] **Invoicing.** All Invoices and Unbilled Sessions use the same filter and sort tables as the rest of the app. A new invoice starts by choosing a client. Batch Invoice drafts one invoice per client or billing contact for a date range, in arrears or in advance. Send can email through Resend, or mark an invoice as sent manually. The invoice itself is one document: recipient, lines, and payment terms. People who share a Send invoices to contact still go on one invoice. Service prices, including whether the price already includes VAT, live on each service.
- [x] **Add clients to the waitlist manually.** On the waitlist, Add client moves someone who is already a client onto the waitlist.
- [x] **Archive and delete.** The row action is the ellipsis menu, on notes, letters, working documents, reports, practice documents, the journal, CPD, supervision, invoices, and clients. Archive leaves the working list and stays recoverable. Trash shows a 30-day countdown, then the row can be removed. Deleting a client warns that the notes, letters, appointments, invoices, and London files go with them, and offers Export first. The same warning appears again on permanent delete, which removes those database rows and the S3 objects.

### Interface

- [x] Standardise text size between pages.
- [x] Make back buttons return to the previous screen.
- [x] Rename the product to Process&Note. The wordmark and the icon are both in use. The icon is separate from the wordmark.
- [x] **Browser memory.** IndexedDB on this device keeps the calendar view, report filters, and each table’s filters and sorting. Further preferences can be added to the same store.
- [x] **Notes editor.** Process notes, letters, working documents, reports, practice documents, the journal, and templates open in a full writing space (`DocumentWorkspace`, immersive editor). On a narrow screen the writing area uses the width of that space.

### Encryption, agreement, and sign-in

- [x] **Envelope encryption.** New clinical writes are sealed through `clinical-record` in London. That covers notes, letters, reports, form answers, outcome totals, client names, contacts, clinical profiles, appointment notes, waitlist text, tags, and invoice addressees. Journal, working documents, practice documents, templates, form wording, questionnaires, and CPD or supervision notes are included. Bank details are sealed on the profile. The clinician’s name, email, phone, bio, registration, and letterhead stay readable. Operational columns stay readable: appointment times, attendance, note status, invoice amounts, and service prices.
- [x] **Data processing agreement, version 1.1.** Accepted at signup, or on the next sign-in when the latest acceptance is older. Version 1.0 acceptances are kept. The public agreement is at `/legal/dpa`. The registering practitioner or clinic is the Data Controller. Process&Note is the Data Processor. The agreement includes the 48-hour breach notice, deletion and cryptographic erasure, and the laws of England and Wales.
- [x] **Authenticator at sign-in.** Settings → Two-factor authentication enrols a named TOTP authenticator. The code is entered in six boxes. When a verified factor exists, clinical routes ask for it before the rest of the app. After a correct code, sign-in continues to Home. An account with no verified factor is not blocked. A verified authenticator, once enrolled, is asked for after the data processing agreement.

### Files and export

- [x] **Client files in London.** `client_files` stores metadata for the signed-in owner. The `client-files` function returns a five-minute upload link and a 60-second download link in `eu-west-2`. The browser sends the file straight to S3. When `AWS_KMS_KEY_ID` is set, the upload is signed for SSE-KMS. Deleting a file removes the object, then the row.
- [x] **Export by email.** One client, from the client page, or the whole practice from Settings → Export. The clinician ticks what to include. The server builds one `.zip`, opens sealed text for that clinician only, and stores the zip in the private London bucket. A random token is stored only as a hash. The message goes to the account email, using the same branded template as invoice email. The link opens a page on this site with the logo, a short explanation, and a Download button. Opening the page does not use the token. The button works once, within 24 hours, and then the zip is deleted. The browser session never receives the file from the request itself. `export.requested` and `export.downloaded` are written to `audit_events`. Clinical writing in that zip is still HTML, which is the open file-format sprint above.
