export default function DpaDocument() {
  return (
    <article className="legal-doc">
      <header className="legal-doc__header">
        <h1>Data Processing Agreement</h1>
        <p className="legal-doc__meta">Last Updated: October 2026</p>
        <p className="legal-doc__meta">Document Version: 1.0</p>
        <p className="legal-doc__meta">Effective Date: Upon account creation or sign-off</p>
      </header>

      <p>
        This Data Processing Agreement (“<strong>DPA</strong>”) is entered into by and between:
      </p>
      <ol>
        <li>
          <strong>The Customer</strong> (“<strong>Controller</strong>” or “<strong>Customer</strong>”),
          being the individual practitioner, organisation, or clinic registering for the Process&Note service; and
        </li>
        <li>
          <strong>Process&Note</strong> (“<strong>Processor</strong>”, “<strong>Provider</strong>”, “<strong>we</strong>”, or “<strong>us</strong>”),
          operating the Process&Note clinical documentation platform.
        </li>
      </ol>
      <p>Both parties agree to the following terms regarding the processing of personal data.</p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>“Applicable Data Protection Law”</strong>: The UK GDPR (as defined in section 3(10) of the Data Protection Act 2018), the Data Protection Act 2018, and all applicable UK statutory guidance issued by the Information Commissioner’s Office (ICO).
        </li>
        <li>
          <strong>“Customer Personal Data”</strong>: Any Personal Data processed by the Provider on behalf of the Customer in the course of providing the Process&Note service.
        </li>
        <li>
          <strong>“Designated Region”</strong>: The AWS and Supabase region <code>eu-west-2</code> (London, United Kingdom).
        </li>
        <li>
          <strong>“Encryption Keys”</strong>: Any cryptographic key, secret, or token utilised to encrypt or decrypt Customer Personal Data at rest.
        </li>
        <li>
          <strong>“Sub-processor”</strong>: Any third-party data processor engaged by the Provider to assist in delivering the Service.
        </li>
        <li>
          <strong>“Controller”</strong>, <strong>“Processor”</strong>, <strong>“Data Subject”</strong>, <strong>“Personal Data”</strong>, <strong>“Special Category Data”</strong>, <strong>“Processing”</strong>, and <strong>“Personal Data Breach”</strong> shall have the meanings given in the UK GDPR.
        </li>
      </ul>

      <h2>2. Processing Mandate & Article 28 Compliance</h2>
      <p>
        <strong>2.1. Roles:</strong> The Customer is the Data Controller of Customer Personal Data. The Provider is the Data Processor.
      </p>
      <p>
        <strong>2.2. Documented Instructions:</strong> The Provider shall process Customer Personal Data solely on the documented instructions of the Customer, including with respect to data location and encryption parameters, unless required to do so by statutory UK law. The Customer&apos;s configuration and day-to-day use of the Service constitutes documented instructions.
      </p>
      <p>
        <strong>2.3. Customer Warranties:</strong> The Customer confirms that it has a lawful basis under Article 6 of the UK GDPR (and an applicable condition under Article 9 for Special Category Data) to upload and process client and clinical records within the Service.
      </p>

      <h2>3. Strict UK Data Residency & Cryptographic Key Management</h2>
      <p>
        <strong>3.1. Primary Database Storage:</strong> All Customer Personal Data (including session notes, client files, and metadata) shall be hosted and processed exclusively on database infrastructure located within the <strong><code>eu-west-2</code> (London)</strong> region of Supabase.
      </p>
      <p>
        <strong>3.2. Key Storage and Cryptographic Isolation:</strong> All decryption keys, encryption keys, and cryptographic secret material managing access to Customer Personal Data shall reside exclusively in <strong>AWS Key Management Service (AWS KMS) / AWS Secrets Manager in the <code>eu-west-2</code> (London)</strong> region.
      </p>
      <p><strong>3.3. Zero Third-Country Data Transfers:</strong> The Provider guarantees that:</p>
      <ul>
        <li>Neither Customer Personal Data nor its associated decryption keys shall be transferred, mirrored, backed up, or replicated outside of the <code>eu-west-2</code> (London) geographic boundary.</li>
        <li>No international data transfers (as defined under Chapter V of the UK GDPR) shall take place in relation to Customer Personal Data without the explicit, written, prior instruction of the Customer.</li>
      </ul>

      <h2>4. Technical and Organisational Measures (Article 32)</h2>
      <p>4.1. The Provider implements and maintains robust technical and organisational security measures, including:</p>
      <ul>
        <li><strong>Encryption at Rest:</strong> All stored databases and backups encrypted using AES-256.</li>
        <li><strong>Encryption in Transit:</strong> Strict TLS 1.3/1.2 requirements on all network interfaces.</li>
        <li><strong>Key Separation:</strong> Decryption keys remain cryptographically decoupled and isolated in AWS <code>eu-west-2</code>, preventing unauthorised physical or logical cross-tenant access.</li>
        <li><strong>Access Control:</strong> Least-privilege role-based access control (RBAC), multi-factor authentication (MFA) on all production services, and zero routine employee access to unencrypted clinical notes.</li>
        <li><strong>Audit Logging:</strong> Tamper-evident logging of authentication events and data operations.</li>
      </ul>

      <h2>5. Sub-processors</h2>
      <p>
        <strong>5.1. Authorised Sub-processors:</strong> The Customer grants general authorization for the Provider to engage the following sub-processors, strictly bound to the locations listed:
      </p>
      <div className="legal-doc__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sub-processor</th>
              <th>Purpose</th>
              <th>Region / Data Location</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase Inc.</td>
              <td>Primary relational database, authentication, and file storage</td>
              <td><code>eu-west-2</code> (London, UK) exclusively</td>
            </tr>
            <tr>
              <td>Amazon Web Services (AWS EMEA SARL / AWS UK)</td>
              <td>Key management (AWS KMS), secrets vault, and cryptographic processing</td>
              <td><code>eu-west-2</code> (London, UK) exclusively</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>5.2. Sub-processor Obligations:</strong> The Provider guarantees that any sub-processor engaged is subject to contractual data protection terms at least as stringent as those contained in this DPA.
      </p>
      <p>
        <strong>5.3. Changes to Sub-processors:</strong> The Provider shall give the Customer at least fourteen (14) days&apos; notice of any intended addition or replacement of a Sub-processor. The Customer may object on legitimate data protection grounds within this period.
      </p>

      <h2>6. Confidentiality & Personnel</h2>
      <p>
        The Provider shall ensure that all persons authorised to access or process Customer Personal Data (such as platform engineers) are under appropriate statutory or contractual duties of confidentiality.
      </p>

      <h2>7. Data Subject Rights & Regulatory Assistance</h2>
      <p>
        <strong>7.1. Data Subject Rights:</strong> Taking into account the nature of the processing, the Provider shall provide technical features or direct assistance to enable the Customer to respond to Data Subject requests (access, rectification, erasure, restriction, or data portability).
      </p>
      <p>
        <strong>7.2. Compliance Assistance:</strong> The Provider shall reasonably assist the Customer in meeting its obligations under Articles 32 to 36 of the UK GDPR (security, breach notifications, and Data Protection Impact Assessments).
      </p>

      <h2>8. Personal Data Breaches</h2>
      <p>
        <strong>8.1.</strong> The Provider shall notify the Customer without undue delay (and in any event within <strong>48 hours</strong>) after becoming aware of any confirmed Personal Data Breach impacting Customer Personal Data.
      </p>
      <p><strong>8.2.</strong> The notification shall detail:</p>
      <ul>
        <li>The nature of the breach, including categories of data and approximate records affected;</li>
        <li>Remedial and mitigation actions taken;</li>
        <li>Contact details for the Provider’s data protection lead.</li>
      </ul>

      <h2>9. Deletion and Return of Data</h2>
      <p>
        <strong>9.1.</strong> Upon termination of the Service or account deletion by the Customer, the Provider shall securely delete all Customer Personal Data and destroy associated cryptographic access keys, unless retention is required by UK statutory law.
      </p>
      <p>
        <strong>9.2.</strong> Automated backup snapshots containing encrypted data will be purged according to standard 30-day lifecycle policies. Following key destruction in AWS KMS <code>eu-west-2</code>, any remaining backup shards become irreversibly unreadable (cryptographic erasure).
      </p>

      <h2>10. Governing Law</h2>
      <p>
        This DPA shall be governed by and construed in accordance with the laws of <strong>England and Wales</strong>. Both parties submit to the exclusive jurisdiction of the courts of England and Wales.
      </p>

      <h2>Schedule 1: Data Processing Details</h2>
      <ul>
        <li><strong>Subject Matter:</strong> Provision of note-taking, structure, and clinical record tools via Process&Note.</li>
        <li><strong>Duration:</strong> The term of the Customer’s subscription plus deletion lifecycle.</li>
        <li><strong>Nature and Purpose:</strong> Ingestion, structure, search, encryption, storage, and retrieval of practice notes.</li>
        <li>
          <strong>Data Subjects:</strong>
          <ul>
            <li>The Customer (practitioner/user).</li>
            <li>Clients, patients, or service users of the Customer.</li>
            <li>Third parties referenced within clinical notes.</li>
          </ul>
        </li>
        <li>
          <strong>Categories of Data:</strong>
          <ul>
            <li>Identifying info (name, contact, dates).</li>
            <li>Session notes, treatment plans, clinical observations, formulation markers.</li>
          </ul>
        </li>
        <li>
          <strong>Special Category Data:</strong>
          <ul>
            <li>Health data, psychological notes, and therapy records.</li>
          </ul>
        </li>
        <li>
          <strong>Geographical Boundary:</strong> Exclusively <strong>London, UK (<code>eu-west-2</code>)</strong> for both database storage and cryptographic key management.
        </li>
      </ul>
    </article>
  )
}
