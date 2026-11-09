import Link from 'next/link';

/**
 * Architecture & Technical Comparison (item **F-08**, **A-17**).
 *
 * Provides in-depth technical analysis for developers and hackathon judges:
 * - Direct architectural comparison between NEAR AI Cloud Intel TDX enclaves and standard commercial cloud AI.
 * - 3-stage verifiable execution pipeline (client-side sanitization, TEE inference, in-browser cryptographic checks).
 * - Verifiable fail-closed security properties.
 */
export default function ArchitecturePage() {
  return (
    <article className="arch-view" aria-labelledby="arch-heading">
      <header className="arch-header">
        <div className="hero-eyebrow">
          <span className="hero-near-tag">Ⓝ NEAR PROTOCOL</span>
          <span className="eyebrow-text">CONFIDENTIAL AI · INTEL TDX TEE</span>
        </div>
        <h1 id="arch-heading" tabIndex={-1}>
          Confidential Computing Architecture
        </h1>
        <p className="arch-lead">
          Sightline integrates deeply with NEAR AI Cloud’s Confidential Computing infrastructure.
          Rather than treating AI as a black box or relying on corporate trust promises, Sightline
          uses hardware-isolated CPU memory encryption to guarantee mathematical privacy for sensitive
          document processing.
        </p>
      </header>

      {/* SECTION 1: COMPARATIVE ARCHITECTURE MATRIX */}
      <section className="arch-sec" aria-labelledby="comp-heading">
        <h2 id="comp-heading">NEAR AI Cloud vs. Standard Commercial Cloud AI</h2>
        <p className="muted">
          A side-by-side comparison of privacy boundaries, hardware isolation, and custody guarantees.
        </p>

        <div className="comp-grid">
          {/* Card 1: Execution Host */}
          <div className="comp-card">
            <h3 className="comp-dimension">1. Execution Host &amp; Isolation</h3>
            <div className="comp-split">
              <div className="comp-side is-near">
                <span className="side-label">NEAR AI Cloud (Intel TDX)</span>
                <strong>Hardware-Isolated Enclaves</strong>
                <p>
                  Inference executes inside CPU-encrypted Virtual Machines (Intel Trust Domain Extensions).
                  Host kernel, hypervisor, and adjacent tenants cannot inspect guest memory.
                </p>
              </div>
              <div className="comp-side is-cloud">
                <span className="side-label">Standard Corporate AI</span>
                <strong>Multi-Tenant Virtualized Cloud</strong>
                <p>
                  Inference executes on general shared virtual machines without memory encryption.
                  Host hypervisors and system processes have complete read access to memory buffers.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Operator Access */}
          <div className="comp-card">
            <h3 className="comp-dimension">2. Operator &amp; Third-Party Access</h3>
            <div className="comp-split">
              <div className="comp-side is-near">
                <span className="side-label">NEAR AI Cloud (Intel TDX)</span>
                <strong>Cryptographically Blocked</strong>
                <p>
                  Neither NEAR AI infrastructure engineers, datacenter technicians, nor root administrators
                  can view plaintext documents or model activations during execution.
                </p>
              </div>
              <div className="comp-side is-cloud">
                <span className="side-label">Standard Corporate AI</span>
                <strong>Visible in Plaintext</strong>
                <p>
                  Cloud provider administrators, internal platform engineers, and human QA / moderation review
                  teams can inspect inputs, chat logs, and uploaded files.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Storage & Persistence */}
          <div className="comp-card">
            <h3 className="comp-dimension">3. Data Retention &amp; Storage Lifetime</h3>
            <div className="comp-split">
              <div className="comp-side is-near">
                <span className="side-label">NEAR AI Cloud (Intel TDX)</span>
                <strong>0 KB Stored (Zero Custody)</strong>
                <p>
                  Enclave RAM is completely ephemeral. Nothing is persisted to databases, object storage, or server disk.
                  Data is purged when the session terminates or when the user clicks Forget.
                </p>
              </div>
              <div className="comp-side is-cloud">
                <span className="side-label">Standard Corporate AI</span>
                <strong>Persisted in Cloud Infrastructure</strong>
                <p>
                  Prompts and uploads are routinely retained in API logging databases, diagnostic caches, backup volumes,
                  and training datasets for future model fine-tuning.
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: Verification & Attestation */}
          <div className="comp-card">
            <h3 className="comp-dimension">4. Verification Proof</h3>
            <div className="comp-split">
              <div className="comp-side is-near">
                <span className="side-label">NEAR AI Cloud (Intel TDX)</span>
                <strong>Hardware Attestation &amp; Ed25519 Signatures</strong>
                <p>
                  Client browser verifies Intel TDX quote before sending documents and validates model-generated
                  Ed25519 cryptographic signatures on completion. Verifiable math, not promises.
                </p>
              </div>
              <div className="comp-side is-cloud">
                <span className="side-label">Standard Corporate AI</span>
                <strong>Unverifiable Terms of Service</strong>
                <p>
                  Privacy relies entirely on corporate legal policies and reputation. End-users have zero cryptographic
                  means to independently audit or verify data handling.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: 3-STAGE EXECUTION PIPELINE */}
      <section className="arch-sec" aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading">3-Stage Verifiable Execution Pipeline</h2>
        <div className="pipeline-deck">
          <div className="pipeline-item">
            <span className="pipeline-step-num">01</span>
            <div className="pipeline-step-body">
              <h3>Client-Side Sanitization &amp; Nonce Generation</h3>
              <p>
                When taking photographs on mobile devices, EXIF metadata, camera device tags, and GPS coordinates are
                permanently purged in browser memory via HTML5 Canvas before network transit. A fresh, cryptographically
                random 32-byte session nonce is generated to prevent replay attacks.
              </p>
            </div>
          </div>

          <div className="pipeline-item">
            <span className="pipeline-step-num">02</span>
            <div className="pipeline-step-body">
              <h3>Hardware Enclave Inference (NEAR AI Cloud)</h3>
              <p>
                Requests are dispatched non-streamed to TEE-hosted vision and language models (e.g.{' '}
                <code>Qwen/Qwen3.8-27B</code> and <code>z-ai/glm-5.3-flash</code>) running inside Intel TDX enclaves.
                CPU-level encryption guarantees memory isolation from the host OS and hypervisor.
              </p>
            </div>
          </div>

          <div className="pipeline-item">
            <span className="pipeline-step-num">03</span>
            <div className="pipeline-step-body">
              <h3>In-Browser Cryptographic Verification</h3>
              <p>
                Before displaying results, the browser independently checks the hardware attestation quote (8 client-side
                checks including TDX authenticity, non-debug attributes, and nonce binding) and verifies the
                enclave&apos;s Ed25519 signature over the completion bytes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: ACTIONS & NAVIGATION */}
      <section className="arch-actions" aria-label="Next steps">
        <Link href="/" className="cta-launch">
          Back to document reader
        </Link>
        <Link href="/trust" className="cta-verify">
          Inspect live trust receipt
        </Link>
      </section>
    </article>
  );
}
