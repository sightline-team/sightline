import Link from 'next/link';

/**
 * Clean Web3 Hero for Sightline.
 *
 * Direct, meaningful, accessible:
 * - Headline & core assistive purpose.
 * - Why NEAR AI Cloud: Intel TDX enclaves vs general corporate cloud AI.
 * - 3 architectural pillars (CPU encryption, zero server custody, verifiable receipts).
 * - Smooth jump to document input workbench.
 */
export function LandingHero() {
  return (
    <section className="landing-hero" aria-label="Sightline overview and NEAR confidential AI architecture">
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
          Zero server storage. Cryptographic proof, not corporate promises.
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

      <div className="why-near-card" role="region" aria-label="Why Sightline uses NEAR AI Cloud">
        <div className="why-near-header">
          <span className="why-near-title">WHY NEAR AI CLOUD</span>
          <span className="why-near-subtitle">CONFIDENTIAL COMPUTING INFRASTRUCTURE</span>
        </div>

        <p className="why-near-text">
          Sightline is integrated deeply with NEAR AI Cloud’s Confidential Computing infrastructure (Intel TDX hardware enclaves).
          Rather than treating AI as a black box or relying on general corporate cloud APIs (where server administrators and third parties can view plaintext documents), Sightline uses NEAR AI Cloud to guarantee that sensitive documents are processed exclusively inside CPU-level encrypted hardware enclaves, backed by cryptographic math rather than trust.
        </p>

        <div className="why-near-grid">
          <div className="why-near-pillar">
            <span className="pillar-name">CPU-Level Encryption</span>
            <p className="pillar-desc">
              Intel TDX isolates document processing in hardware memory. Neither server operators nor cloud admins can inspect data.
            </p>
          </div>
          <div className="why-near-pillar">
            <span className="pillar-name">Zero Server Custody</span>
            <p className="pillar-desc">
              0 KB stored. No logs, no database persistence, and no model training on your private correspondence.
            </p>
          </div>
          <div className="why-near-pillar">
            <span className="pillar-name">Verifiable Receipts</span>
            <p className="pillar-desc">
              Every inference is cryptographically signed by enclave keys. Inspect raw Intel TDX quotes anytime on the Trust page.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
