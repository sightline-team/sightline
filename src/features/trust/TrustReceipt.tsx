import { claimCopy } from '@/features/trust/claims';
import type { TrustRecord } from '@/types';

/**
 * `TrustReceipt` — item **T-09**, shown on `/trust` and at the end of the results view.
 *
 * Three parts, in this order: the computed sentence, every check with `ran` and `passed`, then
 * what the checks do **not** establish (`docs/ARCHITECTURE.md` §10). The last part is the reason
 * this component exists at all — a receipt that only lists what passed is advertising, not
 * verification.
 *
 * The sentence comes from `features/trust/claims.ts` and is never written here (AGENTS.md §4
 * rule 1). Jargon ("TEE", "attestation", nonces) stays inside `<details>` (§8: plain language in
 * the main flow).
 */
export function TrustReceipt({ records }: { records: TrustRecord[] }) {
  // One record per call. Today's flow makes one call, so the newest record *is* the receipt;
  // when the photo path (C-03) and Q&A (P-06) add records, this shows the set as a list rather
  // than only the last — recorded here so the simplification is visible, not silent.
  const latest = records.at(-1);

  if (latest === undefined) {
    return (
      <section aria-labelledby="trust-heading">
        <h2 id="trust-heading">Verification</h2>
        <p>Nothing has been verified yet, because nothing has been read yet.</p>
      </section>
    );
  }

  const checks = latest.attestation.checks;
  const ran = checks.filter((check) => check.ran);
  const didNotRun = checks.filter((check) => !check.ran);

  return (
    <section aria-labelledby="trust-heading" data-testid="trust-receipt">
      <h2 id="trust-heading">Verification</h2>
      <p data-testid="trust-claim">{claimCopy(latest.claim, checks)}</p>

      <h3>Checks that ran</h3>
      {ran.length === 0 ? (
        <p>No check ran in this run.</p>
      ) : (
        <ul className="check-list">
          {ran.map((check) => (
            <li key={check.name}>
              <span className={check.passed ? 'check-passed' : 'check-failed'}>{check.passed ? 'Passed' : 'Did not pass'}</span>{' '}
              {humanise(check.name)}
              {check.detail !== undefined ? <span className="muted"> — {check.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {didNotRun.length > 0 ? (
        <>
          <h3>Checks that did not run</h3>
          <ul className="check-list">
            {didNotRun.map((check) => (
              <li key={check.name}>
                <span className="check-skipped">Did not run</span> {humanise(check.name)}
                {check.detail !== undefined ? <span className="muted"> — {check.detail}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>What this does not tell you</h3>
      <p>
        A fact marked as matched means those words appear in the text Sightline was given. It does
        not mean the text is a correct reading of the original page, and it does not mean the
        answer is right.
      </p>

      <details>
        <summary>Technical details</summary>
        <ul className="detail-list">
          <li>
            Model named by the service: <code>{latest.model}</code>
          </li>
          <li>
            Where the request went: <code>{latest.endpoint}</code>
          </li>
          <li>
            Response id: <code>{latest.requestId}</code>
          </li>
          <li>
            Signed by: <code>{latest.signature.algo}</code>, verified:{' '}
            <code>{String(latest.signature.verified)}</code>
          </li>
          <li>
            Encrypted end to end to the enclave key: <code>{String(latest.e2ee)}</code>
          </li>
          <li>
            Attestation report fetched at: <code>{latest.attestation.fetchedAt === 0 ? 'never' : new Date(latest.attestation.fetchedAt).toISOString()}</code>
          </li>
          <li>
            Nonce used: <code>{latest.attestation.nonce === '' ? 'none' : latest.attestation.nonce}</code>
          </li>
        </ul>
      </details>
    </section>
  );
}

/** "attestation_report" reads as "Attestation report" — no acronym is shown as an acronym. */
function humanise(name: string): string {
  const words = name.split('_').map((word) => (word.length <= 3 ? word : word[0]!.toUpperCase() + word.slice(1)));
  return words.join(' ');
}
