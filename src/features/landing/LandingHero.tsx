import Link from 'next/link';

/**
 * Modernist Anti-AI Web3 Landing Hero.
 *
 * Implemented strictly according to anti-ai-frontend-ui skill specifications:
 * - NO AI slop: Concrete, plain, verifiable facts only. No glowing announcement pills,
 *   no decorative looping animations, no slogan-heavy marketing copy.
 * - Restrained typography and hairlines: Clean sectioned card architecture (patterns.md).
 * - Real artifacts: Architectural invariants, verified comparison table,
 *   and concrete assistive AI edge detection proofs.
 * - WCAG 2.2 AA compliant, native HTML landmarks, 44px touch targets.
 */
export function LandingHero() {
  return (
    <section className="landing-hero" aria-label="Sightline overview and cryptographic guarantees">
      <div className="hero-eyebrow">
        <span className="eyebrow-text">CONFIDENTIAL DOCUMENT ASSISTANT · NEAR AI CLOUD TEE</span>
      </div>

      <header className="landing-header">
        <h2 className="landing-headline">
          Understand sensitive documents without anyone else seeing them.
        </h2>
        <p className="landing-description">
          Sightline helps blind and low-vision individuals privately read medical letters,
          tax bills, and financial statements. Paperwork is processed inside Intel TDX
          hardware enclaves on NEAR AI Cloud, guaranteeing privacy through cryptographic
          proof rather than corporate promises.
        </p>
      </header>

      <div className="landing-cta-row">
        <a href="#workbench" className="cta-launch">
          Read a document
        </a>
        <Link href="/trust" className="cta-verify">
          Inspect trust receipt
        </Link>
      </div>

      {/* Hairline-Sectioned Enclave Manifest Card (anti-ai-frontend-ui pattern) */}
      <div className="manifest-card" role="region" aria-label="Confidential Computing Manifest">
        <div className="manifest-header">
          <span className="manifest-title">CONFIDENTIAL COMPUTING MANIFEST</span>
          <span className="manifest-status">INTEL TDX · VERIFIED ENCLAVE</span>
        </div>

        <div className="manifest-metrics">
          <div className="metric-cell">
            <span className="metric-num">0 KB</span>
            <span className="metric-label">Disk persistence</span>
            <span className="metric-desc">Zero document bytes written to database, disk, or server logs</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">32 B</span>
            <span className="metric-label">Session nonce</span>
            <span className="metric-desc">Fresh client nonce bound to hardware attestation before upload</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">Ed25519</span>
            <span className="metric-label">Enclave signature</span>
            <span className="metric-desc">Every response signed by key generated inside CPU memory</span>
          </div>
          <div className="metric-cell">
            <span className="metric-num">100%</span>
            <span className="metric-label">Client EXIF purge</span>
            <span className="metric-desc">Camera GPS coordinates and device serials stripped in browser</span>
          </div>
        </div>

        <div className="manifest-table-sec">
          <div className="table-header-caption">ARCHITECTURE COMPARISON</div>
          <div className="comparison-list">
            <div className="comparison-row">
              <div className="comp-property">Execution Host</div>
              <div className="comp-col comp-sightline">
                <span className="comp-badge">Sightline (NEAR AI Cloud)</span>
                <span className="comp-desc">Isolated Intel TDX hardware enclave</span>
              </div>
              <div className="comp-col comp-cloud">
                <span className="comp-badge">Standard Commercial Cloud AI</span>
                <span className="comp-desc">Multi-tenant corporate server instance</span>
              </div>
            </div>

            <div className="comparison-row">
              <div className="comp-property">Operator Visibility</div>
              <div className="comp-col comp-sightline">
                <span className="comp-badge">Sightline (NEAR AI Cloud)</span>
                <span className="comp-desc">Cryptographically locked out via encrypted RAM</span>
              </div>
              <div className="comp-col comp-cloud">
                <span className="comp-badge">Standard Commercial Cloud AI</span>
                <span className="comp-desc">Host administrators and reviewers can view data</span>
              </div>
            </div>

            <div className="comparison-row">
              <div className="comp-property">Proof of Privacy</div>
              <div className="comp-col comp-sightline">
                <span className="comp-badge">Sightline (NEAR AI Cloud)</span>
                <span className="comp-desc">Hardware attestation quote + digital signature</span>
              </div>
              <div className="comp-col comp-cloud">
                <span className="comp-badge">Standard Commercial Cloud AI</span>
                <span className="comp-desc">Unverifiable privacy policy statements</span>
              </div>
            </div>

            <div className="comparison-row">
              <div className="comp-property">Data Lifecycle</div>
              <div className="comp-col comp-sightline">
                <span className="comp-badge">Sightline (NEAR AI Cloud)</span>
                <span className="comp-desc">Purged immediately on session close or Forget</span>
              </div>
              <div className="comp-col comp-cloud">
                <span className="comp-badge">Standard Commercial Cloud AI</span>
                <span className="comp-desc">Cached, logged, or retained for model training</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Assistive Feature Artifacts (Alternating Rows) */}
      <div className="feature-alternates" role="region" aria-label="Assistive reading capabilities">
        <div className="feature-row">
          <div className="feature-text">
            <h3 className="feature-heading">Severe capture faults trigger retakes. Missing text is never guessed.</h3>
            <p className="feature-description">
              When a camera photo is blurry, dark, or cropped at document edges, Sightline announces
              the specific edge to adjust instead of hallucinating missing numbers or words. If a page
              cannot be transcribed, it leaves a marked gap in the reading so you know exactly what was missed.
            </p>
          </div>
          <div className="feature-artifact">
            <div className="artifact-card">
              <div className="artifact-bar">{'// CAMERA_EDGE_VALIDATION'}</div>
              <ul className="artifact-list">
                <li><span className="art-pass">✓</span> <span className="art-key">cut_off_top</span>: <span className="art-val">false</span></li>
                <li><span className="art-pass">✓</span> <span className="art-key">cut_off_bottom</span>: <span className="art-val">false</span></li>
                <li><span className="art-pass">✓</span> <span className="art-key">blurry</span>: <span className="art-val">false</span></li>
                <li><span className="art-pass">✓</span> <span className="art-key">too_small_text</span>: <span className="art-val">false</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="feature-row is-flip">
          <div className="feature-text">
            <h3 className="feature-heading">Verbatim source grounding with clinical safety warnings.</h3>
            <p className="feature-description">
              Every extracted fact is linked to exact quotes in the transcript. Safety notices
              flag medication dosages and financial deadlines, directing you to confirm prescriptions
              with a doctor or pharmacist. Interactive questions answer strictly from verified text.
            </p>
          </div>
          <div className="feature-artifact">
            <div className="artifact-card">
              <div className="artifact-bar">{'// GROUNDED_FACT_VERIFICATION'}</div>
              <div className="artifact-sample">
                <div className="sample-label">Prescription</div>
                <div className="sample-val">Amoxicillin 500mg capsules</div>
                <div className="sample-quote">&ldquo;take 500mg capsules three times daily for 7 days&rdquo;</div>
                <div className="sample-flag">⚠ Safety Notice: Confirm dosage with a pharmacist</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
