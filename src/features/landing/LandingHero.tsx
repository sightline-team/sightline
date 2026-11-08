import Link from 'next/link';

/**
 * Web3 Landing Hero (Taste-skill & Land-book inspired).
 *
 * Built strictly according to project invariants:
 * - NO AI slop: Concrete, plain, verifiable facts only.
 * - NO gradient colors: Pure solid flat surfaces and crisp 1px borders.
 * - Anti-slop Web3 technical brutalism: Enclave state badges, monospaced chips,
 *   step-button micro-interactions, equal left and right edges.
 * - Fully accessible native HTML with keyboard & screen reader support.
 */
export function LandingHero() {
  return (
    <section className="landing-hero" aria-label="Sightline overview and cryptographic guarantees">
      <div className="enclave-pill" data-testid="enclave-status-pill">
        <span className="pulse-indicator" aria-hidden="true" />
        <span className="enclave-pill-text">NEAR AI CLOUD TEE · INTEL TDX ATTESTED</span>
      </div>

      <header className="landing-header">
        <h2 className="landing-headline">
          Private AI for Sensitive Documents.
          <span className="landing-subheadline">Hardware-Attested by Proof, Not Trust.</span>
        </h2>
        <p className="landing-description">
          Sightline helps blind and low-vision individuals privately understand confidential
          mail, medical records, and bank statements. The model executes inside a hardware-isolated
          enclave on NEAR AI Cloud with zero server disk persistence and cryptographic execution receipts.
        </p>
      </header>

      <div className="landing-cta-row">
        <a href="#workbench" className="cta-launch">
          Launch Reader
        </a>
        <Link href="/trust" className="cta-verify">
          Verify Architecture
        </Link>
      </div>

      <div className="proof-grid" role="region" aria-label="Cryptographic properties">
        <div className="proof-card">
          <div className="proof-badge">0 KB</div>
          <div className="proof-title">Zero Persistence</div>
          <p className="proof-text">
            Documents, images, and transcripts never touch a database, disk, or server logs.
          </p>
        </div>

        <div className="proof-card">
          <div className="proof-badge">INTEL TDX</div>
          <div className="proof-title">Hardware Enclave</div>
          <p className="proof-text">
            CPU-level memory encryption on NEAR AI Cloud prevents host operators from inspecting data.
          </p>
        </div>

        <div className="proof-card">
          <div className="proof-badge">ED25519</div>
          <div className="proof-title">Signed Output</div>
          <p className="proof-text">
            Every completion is cryptographically signed by the private key generated inside the enclave.
          </p>
        </div>

        <div className="proof-card">
          <div className="proof-badge">CLIENT-SIDE</div>
          <div className="proof-title">EXIF Stripped</div>
          <p className="proof-text">
            Camera metadata, GPS coordinates, and device tags are purged in local browser memory before transit.
          </p>
        </div>
      </div>

      <div className="pipeline-card" role="region" aria-label="Verifiable execution flow">
        <div className="pipeline-header">
          <span className="pipeline-title">{'// VERIFIABLE_EXECUTION_PIPELINE'}</span>
          <span className="pipeline-badge">3 STAGES</span>
        </div>
        <ol className="pipeline-steps">
          <li className="pipeline-step">
            <span className="step-num">01</span>
            <div className="step-content">
              <strong>Client-Side Sanitization</strong>
              <p>In-browser canvas EXIF/GPS metadata purge + fresh cryptographic session nonce.</p>
            </div>
          </li>
          <li className="pipeline-step">
            <span className="step-num">02</span>
            <div className="step-content">
              <strong>Intel TDX Hardware Enclave</strong>
              <p>Ephemeral model inference inside NEAR AI Cloud TEE with isolated CPU memory.</p>
            </div>
          </li>
          <li className="pipeline-step">
            <span className="step-num">03</span>
            <div className="step-content">
              <strong>Cryptographic Verification</strong>
              <p>Browser verifies hardware attestation quote and Ed25519 signature before display.</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}
