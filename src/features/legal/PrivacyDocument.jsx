export default function PrivacyDocument({ embedded = false }) {
  return (
    <article className={embedded ? 'legal-doc legal-doc--embedded' : 'legal-doc'}>
      <header className="legal-doc__header">
        <h1>Privacy Notice</h1>
        <p className="legal-doc__meta">Last Updated: October 2026</p>
        <p className="legal-doc__meta">Operated by: Process&Note Ltd (in formation)</p>
        <p className="legal-doc__meta">Contact: support@processandnote.app</p>
      </header>

      <h2>1. Introduction and Scope</h2>
      <p>
        This Privacy Notice explains how <strong>Process&Note Ltd</strong> (“Process&Note”, “we”, “our”, or “us”) collects, uses, stores, and protects personal data when you use the Process&Note web application, access our website, or subscribe to our practice management services.
      </p>
      <p>
        Process&Note is designed specifically for UK-based psychological therapists, mental health practitioners, and allied health professionals operating in private practice. We operate in compliance with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and the Data (Use and Access) Act 2025.
      </p>

      <h2>2. Understanding Our Dual Roles (Controller vs Processor)</h2>
      <p>
        Data protection legislation categorises responsibilities into two distinct roles. How data is treated depends on whether it relates to <strong>you (the subscribing practitioner)</strong> or <strong>your clients</strong>:
      </p>
      <ol>
        <li>
          <strong>Process&Note as Data Controller (Your Account Data):</strong> We act as a Data Controller for the personal data provided to create, maintain, and pay for your subscriber account (for example, your name, professional registration details, contact details, and billing history).
        </li>
        <li>
          <strong>Process&Note as Data Processor (Your Clinical and Practice Data):</strong> You (the practitioner) are the Data Controller for all client notes, clinical records, client contact details, practice journals, and continuing professional development (CPD) logs uploaded to or created within Process&Note. We act strictly as a <strong>Data Processor</strong> acting upon your documented instructions. This processing is governed by our <strong>Data Processing Agreement (DPA)</strong>, agreed upon account creation.
        </li>
      </ol>

      <h2>3. Zero-Knowledge Architecture and Client-Side Encryption</h2>
      <p>Process&Note is built on a <strong>zero-knowledge</strong> model to protect special category health data:</p>
      <ul>
        <li>
          <strong>Client-side encryption:</strong> All clinical session notes, client documents, and confidential practice records (“My Practice” journals and CPD) are encrypted on your local device before transmission across the network.
        </li>
        <li>
          <strong>Envelope encryption and key custody:</strong> Data keys are managed using envelope encryption via AWS Key Management Service (AWS KMS) in the UK (<code>eu-west-2</code>), wrapped with an individual master key held solely by you.
        </li>
        <li>
          <strong>No administrative decryption:</strong> Our database administrators, support personnel, and infrastructure providers do not possess your private decryption key and have no cryptographic means to access, view, or recover your clinical content.
        </li>
        <li>
          <strong>Permanent loss warning:</strong> Because of this zero-knowledge architecture, <strong>if you lose your private key or recovery credentials, your encrypted data cannot be decrypted or recovered by Process&Note under any circumstances.</strong> You remain responsible for safeguarding your credentials and maintaining independent clinical records in accordance with your professional regulatory standards.
        </li>
      </ul>

      <h2>4. Personal Data We Collect as a Data Controller</h2>
      <p>When you register and use Process&Note, we collect:</p>
      <div className="legal-doc__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Specific data points</th>
              <th>Purpose and lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Identity and account</td>
              <td>Full name, professional email address</td>
              <td>Account creation and passwordless authentication (UK GDPR Art. 6(1)(b), performance of contract).</td>
            </tr>
            <tr>
              <td>Professional status</td>
              <td>Professional registration numbers (for example, HCPC), accreditation numbers (for example, BACP, NCIP, UKCP)</td>
              <td>Verifying eligibility for practitioner software and preventing service misuse (UK GDPR Art. 6(1)(f), legitimate interests).</td>
            </tr>
            <tr>
              <td>Billing and payments</td>
              <td>Transaction history, subscription tier, billing address</td>
              <td>Processing recurring subscriptions and accounting compliance (UK GDPR Art. 6(1)(b) and Art. 6(1)(c), legal obligation). Raw payment card details are handled directly by Stripe.</td>
            </tr>
            <tr>
              <td>Invoicing configuration</td>
              <td>Practice bank details</td>
              <td>Facilitating client invoice generation. Bank details stored for this feature are encrypted at rest (UK GDPR Art. 6(1)(b)).</td>
            </tr>
            <tr>
              <td>Communications</td>
              <td>Support queries and email correspondence</td>
              <td>Resolving technical issues and providing customer support (UK GDPR Art. 6(1)(b) and Art. 6(1)(f)).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Process&Note does not store passwords. Account access is verified via secure passwordless authentication tokens.</p>

      <h2>5. Third-Party Sub-Processors and Data Locations</h2>
      <p>
        To operate the platform, we engage vetted third-party service providers (“sub-processors”). All data handling complies with UK adequacy standards.
      </p>
      <div className="legal-doc__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Purpose</th>
              <th>Primary data location</th>
              <th>Transfer mechanism</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Primary relational database and authentication engine</td>
              <td>United Kingdom (<code>eu-west-2</code>, London)</td>
              <td>Stored within the UK</td>
            </tr>
            <tr>
              <td>Amazon Web Services (AWS)</td>
              <td>AWS KMS (envelope key management) and S3 (encrypted document storage)</td>
              <td>United Kingdom (<code>eu-west-2</code>, London)</td>
              <td>Stored within the UK</td>
            </tr>
            <tr>
              <td>Vercel Inc.</td>
              <td>Application deployment and frontend hosting</td>
              <td>Global edge network / UK and EU</td>
              <td>UK International Data Transfer Addendum / SCCs</td>
            </tr>
            <tr>
              <td>Stripe Payments Europe, Ltd.</td>
              <td>Payment gateway and subscription management</td>
              <td>United Kingdom / Ireland</td>
              <td>UK adequacy regulations / approved SCCs</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Transactional email delivery (login links, service notices)</td>
              <td>European Union (<code>eu-west-1</code>, Ireland)</td>
              <td>UK adequacy regulations</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>6. Backups and Disaster Recovery</h2>
      <ul>
        <li>
          <strong>Automated database backups:</strong> Automated backups of the database are executed every 24 hours via Supabase (<code>eu-west-2</code>, London).
        </li>
        <li>
          <strong>Cryptographic invariance:</strong> Backup archives contain clinical records exclusively in their client-side encrypted state. Backup restoration cannot expose unencrypted clinical records to unauthenticated parties.
        </li>
      </ul>

      <h2>7. Data Retention, Export, and Mandatory Account Offboarding</h2>
      <p>
        Practitioners carry independent statutory duties to retain client clinical records (frequently 7 years post-discharge, or until a minor client reaches age 25 or 26). To prevent unlawful data abandonment:
      </p>
      <ul>
        <li>
          <strong>Mandatory decrypted export prior to deletion:</strong> You cannot cancel your subscription or delete your account without first generating a complete, decrypted export of your clinical and practice data.
        </li>
        <li>
          <strong>Export delivery:</strong> Exports are compiled into a structured <code>.zip</code> archive delivered via a secure, time-limited, one-time download link.
        </li>
        <li>
          <strong>Immediate deletion:</strong> Once your export is verified and account closure is confirmed, your database records, encrypted documents, and account credentials are permanently wiped from active production systems.
        </li>
        <li>
          <strong>Financial records:</strong> Basic transactional billing logs are retained for up to 6 years to satisfy HM Revenue & Customs (HMRC) statutory tax obligations.
        </li>
      </ul>

      <h2>8. Cookies and Storage</h2>
      <p>
        Process&Note uses only <strong>strictly necessary session cookies and local storage tokens</strong> required to authenticate your identity, validate session activity, and maintain client-side cryptographic state. We do not use third-party advertising cookies, cross-site trackers, or invasive telemetry scripts.
      </p>

      <h2>9. Your Rights Under UK GDPR</h2>
      <p>As an individual subscriber, you possess statutory rights regarding personal data held about you as a Data Controller:</p>
      <ul>
        <li><strong>Right of access:</strong> Request copies of personal data we hold about you.</li>
        <li><strong>Right to rectification:</strong> Request correction of inaccurate or incomplete personal records.</li>
        <li><strong>Right to erasure:</strong> Request deletion of your personal account data, subject to statutory record-keeping requirements.</li>
        <li><strong>Right to restrict processing:</strong> Request restriction of processing under certain contested circumstances.</li>
        <li><strong>Right to data portability:</strong> Request delivery of your personal account data in a structured, machine-readable format.</li>
      </ul>
      <p>To exercise these rights, email <strong>support@processandnote.app</strong>.</p>
      <p>
        If a therapy client contacts Process&Note directly seeking access to or erasure of clinical notes, we will direct that individual to you as the Data Controller, as we cannot identify, view, or decrypt individual client records.
      </p>

      <h2>10. Data Protection Complaints Procedure</h2>
      <p>Under the Data (Use and Access) Act 2025, you have the right to submit a formal data protection complaint directly to us:</p>
      <ul>
        <li>Complaints should be sent to <strong>support@processandnote.app</strong> with the subject line “Data Protection Complaint”.</li>
        <li>We will acknowledge receipt of your complaint within 30 days and conclude our investigation without undue delay.</li>
        <li>If you remain dissatisfied with our handling of your complaint, you have the right to lodge a complaint with the UK supervisory authority:</li>
      </ul>
      <p>
        <strong>Information Commissioner’s Office (ICO)</strong><br />
        Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF<br />
        Website: <a href="https://ico.org.uk">https://ico.org.uk</a> | Helpline: 0303 123 1113
      </p>

      <h2>11. Amendments to this Notice</h2>
      <p>
        We may update this Privacy Notice from time to time. Any material changes will be communicated to your registered email address prior to taking effect.
      </p>
    </article>
  )
}
