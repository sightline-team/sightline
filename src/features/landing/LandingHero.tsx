import Link from 'next/link';

/**
 * Clean Web3 Hero for Sightline.
 *
 * Direct, meaningful, zero-fluff:
 * - Headline & core value proposition.
 * - Hardware proof metrics (0 KB custody, Intel TDX enclaves, Ed25519 signature, local EXIF strip).
 * - Smooth jump to document input workbench.
 */
export function LandingHero() {
  return (
    <section className="landing-hero" aria-label="Sightline overview and cryptographic guarantees">
      <div className="hero-eyebrow">
        <span className="hero-near-tag">Ⓝ NEAR PROTOCOL</span>
        <span className="eyebrow-text">CONFIDENTIAL AI · INTEL TDX TEE</span>
      </div>

      <header className="landing-header">
        <h2 className="landing-headline">
          Private AI for sensitive documents.
        </h2>
        <p className="landing-description">
          Read medical letters, council tax bills, and bank statements independently.
          Processed exclusively inside Intel TDX hardware enclaves on NEAR AI Cloud.
          Zero server storage. Cryptographic proof, not promises.
        </p>
      </header>

      <div className="landing-cta-row">
        <a href="#workbench" tabIndex={-1} className="cta-launch">
          Add a document
        </a>
        <Link href="/trust" tabIndex={-1} className="cta-verify">
          Inspect trust receipt
        </Link>
      </div>

      <div className="manifest-card" role="region" aria-label="Hardware enclave verification telemetry">
        <div className="manifest-header">
          <span className="manifest-title">NEAR AI CLOUD ATTESTATION TELEMETRY</span>
          <span className="manifest-status">INTEL TDX · CRYPTOGRAPHIC AUDIT</span>
        </div>

        <div className="manifest-metrics">
          <div className="metric-cell">
            <span className="metric-num">0 KB</span>
            <span className="metric-label">Disk Storage</span>
            <span className="metric-desc">Zero document bytes written to database or disk</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">32 B</span>
            <span className="metric-label">Session Nonce</span>
            <span className="metric-desc">Fresh client nonce bound to attestation quote</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">Ed25519</span>
            <span className="metric-label">Hardware Signature</span>
            <span className="metric-desc">Signed by ephemeral key generated in enclave RAM</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">100%</span>
            <span className="metric-label">EXIF Stripped</span>
            <span className="metric-desc">Camera GPS coordinates purged in local memory</span>
          </div>
        </div>
      </div>
    </section>
  );
}
