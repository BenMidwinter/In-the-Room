export default function TermsDocument({ embedded = false }) {
  return (
    <article className={embedded ? 'legal-doc legal-doc--embedded' : 'legal-doc'}>
      <header className="legal-doc__header">
        <h1>Terms and Conditions of Service</h1>
        <p className="legal-doc__meta">Last Updated: October 2026</p>
        <p className="legal-doc__meta">Operated by: Process&Note Ltd (in formation)</p>
        <p className="legal-doc__meta">Contact: support@processandnote.app</p>
      </header>

      <h2>1. Introduction and Agreement</h2>
      <p>
        <strong>1.1.</strong> These Terms and Conditions (“<strong>Terms</strong>”, “<strong>Agreement</strong>”) constitute a legally binding contract between <strong>Process&Note Ltd</strong> (“<strong>Process&Note</strong>”, “<strong>we</strong>”, “<strong>us</strong>”, or “<strong>our</strong>”) and the practitioner or practice entity subscribing to the service (“<strong>Subscriber</strong>”, “<strong>Practitioner</strong>”, “<strong>you</strong>”, or “<strong>your</strong>”).
      </p>
      <p>
        <strong>1.2.</strong> By registering an account, accessing, or using the Process&Note web application and related services (collectively, the “<strong>Service</strong>”), you confirm that you have read, understood, and agreed to be bound by these Terms, our <strong>Privacy Notice</strong>, and our <strong>Data Processing Agreement (DPA)</strong>.
      </p>
      <p>
        <strong>1.3.</strong> Process&Note is a business-to-business (B2B) software service designed exclusively for qualified, registered, or trainee healthcare and psychological therapy professionals operating in the United Kingdom. It is not intended for non-professional consumer use.
      </p>
      <p>
        <strong>1.4. Intended audience and organisational restrictions.</strong> The Service is designed, licensed, and intended strictly for independent sole traders, freelance clinicians, and private practice practitioners operating in their capacity as independent Data Controllers. Clinicians employed by, contracted to, or delivering services within institutions, organisations, clinics, charities, schools, NHS trusts, or corporate healthcare providers <strong>must not</strong> adopt or use the Service on an individual, ad-hoc, or unauthorised basis for organisation-owned clinical caseloads. Use of the Service within or on behalf of an organisation is strictly prohibited unless and until:
      </p>
      <ul>
        <li><strong>(a)</strong> The employing or contracting organisation has formally evaluated and authorised the use of Process&Note; and</li>
        <li>
          <strong>(b)</strong> All requisite institutional data governance steps have been formally concluded, including the execution of a corporate Data Processing Agreement (DPA) between Process&Note Ltd and the organisation, and the completion of a Data Protection Impact Assessment (DPIA) where mandated under UK GDPR or organisational policy.
        </li>
      </ul>
      <p>
        Process&Note Ltd accepts no liability for any practitioner’s unauthorised deployment of the Service in breach of their employment contract, workplace policies, or organisational information governance rules.
      </p>

      <h2>2. Eligibility and Account Security</h2>
      <p>
        <strong>2.1. Professional standing.</strong> You warrant that you are a bona fide mental health, psychological therapy, or allied healthcare practitioner, or a trainee actively enrolled on an accredited clinical training programme, registered or affiliated with a recognised professional regulatory body (for example, HCPC, BACP, UKCP, NCIP, BPS, or equivalent).
      </p>
      <p>
        <strong>2.2. Independent practice warranty.</strong> You warrant that you are either: (a) an independent practitioner, sole trader, or partner in private practice acting as the legal Data Controller for your client records; or (b) duly authorised in writing by your organisation, having secured a formal institutional DPA and DPIA before uploading or processing organisation-owned client data.
      </p>
      <p>
        <strong>2.3. Authorised access.</strong> You must provide accurate, current, and complete registration information. You are solely responsible for maintaining the confidentiality of your authentication credentials, session tokens, and access hardware.
      </p>
      <p>
        <strong>2.4. Account sharing prohibited.</strong> Subscriptions are individual to the designated practitioner. You must not permit any third party, colleague, or administrative assistant to access or use your account without a separate licence.
      </p>

      <h2>3. Zero-Knowledge Architecture and Key Custody</h2>
      <p>
        <strong>3.1. Client-side encryption.</strong> The Service employs a zero-knowledge, client-side encryption framework. All clinical session notes, client personal records, and confidential practice files (“<strong>Encrypted Content</strong>”) are encrypted on your local device before transmission to hosting infrastructure.
      </p>
      <p>
        <strong>3.2. Sole key custody.</strong> The private master key, passphrase, or cryptographic credential required to decrypt your data is held solely and exclusively by you. Process&Note does not possess, store, or have access to your unencrypted private keys or passphrases.
      </p>
      <p>
        <strong>3.3. Irrecoverability of lost keys.</strong> <strong>If you lose, misplace, or forget your private key or recovery credentials, your Encrypted Content cannot be decrypted or recovered by Process&Note under any circumstances.</strong>
      </p>
      <p>
        <strong>3.4. Disclaimer of cryptographic liability.</strong> Process&Note disclaims all liability for any loss, corruption, permanent inaccessibility, or damage to Encrypted Content caused directly or indirectly by your loss, mishandling, or compromise of your encryption keys or recovery credentials.
      </p>

      <h2>4. Professional and Clinical Responsibilities</h2>
      <p>
        <strong>4.1. Administrative tool only.</strong> Process&Note is strictly a technical administrative and practice-management tool. It does not provide clinical advice, medical diagnoses, risk management, psychological treatment, or professional supervision.
      </p>
      <p>
        <strong>4.2. Duty of care.</strong> The professional, ethical, and clinical duty of care towards your clients rests entirely with you. You remain solely responsible for your therapeutic practice, risk assessments, safeguarding notifications, and clinical decision-making.
      </p>
      <p>
        <strong>4.3. Statutory record-keeping.</strong> You are solely responsible for complying with the clinical record-keeping standards, document retention periods, and statutory guidelines mandated by law and your regulatory or professional bodies (including statutory retention mandates for adult and child therapy records).
      </p>

      <h2>5. Data Protection and Client Confidentiality</h2>
      <p>
        <strong>5.1. Regulatory compliance.</strong> Both parties agree to adhere to their respective obligations under the Data Protection Act 2018, the UK GDPR, and the Data (Use and Access) Act 2025.
      </p>
      <p><strong>5.2. Controller and processor status.</strong></p>
      <ul>
        <li>You act as the <strong>Data Controller</strong> in respect of all client personal data and special category health data uploaded, stored, or processed within the Service.</li>
        <li>Process&Note acts as a <strong>Data Processor</strong> providing hosting, database, and infrastructure facilities strictly on your documented instructions.</li>
      </ul>
      <p>
        <strong>5.3. Data Processing Agreement.</strong> The terms governing our processing of personal data on your behalf are set out in our separate Data Processing Agreement (DPA), incorporated into these Terms by reference.
      </p>
      <p>
        <strong>5.4. Lawful basis.</strong> You warrant that you have established an appropriate lawful basis (and special category condition under Article 9 of the UK GDPR) to process your clients’ data and to store such data via secure cloud processors.
      </p>

      <h2>6. Subscriptions, Fees, and Invoicing</h2>
      <p>
        <strong>6.1. Billing cycle.</strong> Access to the Service is billed on a recurring subscription basis (monthly or annually) in advance.
      </p>
      <p>
        <strong>6.2. Payment processing.</strong> All subscription payments are processed securely via our third-party payment partner, <strong>Stripe</strong>. By subscribing, you authorise recurring billing to your nominated payment method.
      </p>
      <p>
        <strong>6.3. Failed payments and suspension.</strong> In the event of a failed subscription charge, we reserve the right to suspend access to your account following reasonable notice until outstanding balances are resolved.
      </p>
      <p>
        <strong>6.4. Price changes.</strong> We reserve the right to adjust subscription pricing with at least thirty (30) days’ prior written notice sent to your registered email address. Continued use of the Service following the notice period constitutes acceptance of the revised pricing.
      </p>

      <h2>7. Intellectual Property Rights</h2>
      <p>
        <strong>7.1. Our intellectual property.</strong> All software, interfaces, user experience designs, trademarks, database schemas, code, and documentation comprising the Service are the exclusive property of Process&Note Ltd and its licensors. You are granted a limited, non-exclusive, non-transferable, revocable licence to access and use the Service during an active subscription.
      </p>
      <p>
        <strong>7.2. Your content ownership.</strong> You retain full and unencumbered ownership of all intellectual property, copyright, and confidentiality rights in your clinical notes, practice documents, templates, and exported materials. Process&Note claims no ownership rights over your clinical content.
      </p>

      <h2>8. Cancellation, Mandatory Export, and Account Deletion</h2>
      <p>
        <strong>8.1. Cancellation by practitioner.</strong> You may cancel your subscription at any time via your account settings.
      </p>
      <p>
        <strong>8.2. Enforced decrypted export prior to deletion.</strong> To protect against accidental record abandonment and support your compliance with professional record-retention duties, you cannot complete account termination or deletion without first generating a complete, decrypted export of your data. Process&Note provides this export compiled into a structured archive (<code>.zip</code>) accessible via a secure, time-limited download link.
      </p>
      <p>
        <strong>8.3. Irreversible data purge.</strong> Upon successful validation of your export and final confirmation of account closure, your database records, authentication credentials, and encrypted cloud storage documents will be permanently and irreversibly purged from our active systems.
      </p>

      <h2>9. Service Availability, Maintenance, and Backups</h2>
      <p>
        <strong>9.1. Service level.</strong> We implement reasonable technical measures to ensure high availability and uptime. However, the Service is provided on an “as is” and “as available” basis.
      </p>
      <p>
        <strong>9.2. Scheduled maintenance.</strong> Routine maintenance and infrastructure upgrades will be scheduled during off-peak hours where reasonably practicable, with advance notification provided where feasible.
      </p>
      <p>
        <strong>9.3. Automated backups.</strong> We maintain automated daily backups of our encrypted database systems for disaster recovery. You acknowledge that backups contain notes exclusively in their client-side encrypted state and cannot be decrypted without your private key.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        <strong>10.1. Non-excludable liability.</strong> Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any other liability that cannot be excluded or limited under English law.
      </p>
      <p>
        <strong>10.2. Exclusion of consequential losses.</strong> To the maximum extent permitted by applicable law, Process&Note Ltd shall not be liable to you under contract, tort (including negligence), breach of statutory duty, or otherwise for:
      </p>
      <ul>
        <li>Loss of profits, sales, or business;</li>
        <li>Loss of agreements or contracts;</li>
        <li>Loss of anticipated savings;</li>
        <li>Loss of, or damage to, goodwill or professional reputation; or</li>
        <li>Any indirect, special, incidental, or consequential loss or damage.</li>
      </ul>
      <p>
        <strong>10.3. Financial liability cap.</strong> Process&Note’s total aggregate liability arising out of or in connection with the Service or these Terms, whether in contract, tort (including negligence), or otherwise, shall be strictly limited to the total subscription fees paid by you to Process&Note in the twelve (12) months immediately preceding the event giving rise to the claim.
      </p>
      <p><strong>10.4. Specific exclusions.</strong> Process&Note shall have no liability whatsoever for:</p>
      <ul>
        <li>Inability to access data resulting from forgotten passphrases or lost encryption keys;</li>
        <li>Unauthorised access resulting from compromised local devices or stolen practitioner hardware;</li>
        <li>Actions taken by professional bodies, insurers, or clients against you in connection with your clinical work.</li>
      </ul>

      <h2>11. Indemnity</h2>
      <p>
        You agree to defend, indemnify, and hold harmless Process&Note Ltd, its directors, officers, employees, and contractors from and against any third-party claims, liabilities, losses, costs, or damages (including legal expenses) arising out of or related to:
      </p>
      <ul>
        <li>Your breach of these Terms, the DPA, or applicable professional regulatory codes of conduct;</li>
        <li>Any clinical malpractice, safeguarding failure, or dispute between you and your therapy clients;</li>
        <li>Any unauthorised use of the Service within an organisational or employment context in violation of Clause 1.4;</li>
        <li>Your unlawful processing or uploading of third-party personal data to the Service.</li>
      </ul>

      <h2>12. Variations to Terms</h2>
      <p>
        We reserve the right to amend these Terms from time to time to reflect legislative changes, platform updates, or operational requirements. We will provide at least thirty (30) days’ notice of material changes via your registered email address. Continued use of the Service following the effective date of updated Terms indicates your agreement to be bound by them.
      </p>

      <h2>13. Governing Law and Jurisdiction</h2>
      <p>
        <strong>13.1.</strong> These Terms, their subject matter, and their formation (and any non-contractual disputes or claims) shall be governed by and construed in accordance with the laws of <strong>England and Wales</strong>.
      </p>
      <p>
        <strong>13.2.</strong> Both parties irrevocably agree that the courts of <strong>England and Wales</strong> shall have exclusive jurisdiction to settle any dispute or claim arising out of or in connection with these Terms or the Service.
      </p>

      <h2>14. Contact</h2>
      <p>For legal notices, billing queries, or technical assistance regarding these Terms, please contact:</p>
      <p>
        <strong>Process&Note Ltd</strong><br />
        Email: <strong>support@processandnote.app</strong>
      </p>
    </article>
  )
}
