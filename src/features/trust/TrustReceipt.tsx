import { claimCopy } from '@/features/trust/claims';
import type { CheckResult, TrustPurpose, TrustRecord } from '@/types';

/**
 * `TrustReceipt` — item **T-09**, shown on `/trust` and at the end of the results view.
 *
 * Three parts, in this order: the computed sentence, every check with `ran` and `passed`, then
 * what the checks do **not** establish (`docs/ARCHITECTURE.md` §10). The last part is the reason
 * this component exists at all — a receipt that only lists what passed is advertising, not
 * verification.
 *
 * **One block per call.** Reading a document (P-03) and answering a question about it (P-06) are
 * two calls, each with its own attestation status, its own response signature and its own
 * response id, so each gets its own claim sentence and check list. Showing only the newest would
 * let a question rewrite the receipt for the document — which is how a receipt stops being a
 * record and starts being whichever claim was made last.
 *
 * The sentence comes from `features/trust/claims.ts` and is never written here (AGENTS.md §4
 * rule 1). Jargon ("TEE", "attestation", nonces) stays inside `<details>` (§8: plain language in
 * the main flow).
 */
const PURPOSE_WORDS: Record<TrustPurpose, string> = {
  transcribe: 'Reading the page',
  analyse: 'Reading the document',
  qa: 'Answering a question',
};

export function TrustReceipt({ records }: { records: TrustRecord[] }) {
  if (records.length === 0) {
    return (
      <section aria-labelledby="trust-heading">
        <h2 id="trust-heading">Verification</h2>
        <p>Nothing has been verified yet, because nothing has been read yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="trust-heading" data-testid="trust-receipt">
      <h2 id="trust-heading">Verification</h2>
      {records.length > 1 ? (
        // §8: nothing may go unannounced, and a listener who hears "Answering a question"
        // mid-receipt needs to know why a second block is there at all.
        <p className="muted" data-testid="record-count">
          Each answer below comes from a separate call, and each is checked on its own.
        </p>
      ) : null}

      {records.map((record) => (
        <RecordBlock key={record.id} record={record} />
      ))}

      <h3>What this does not tell you</h3>
      <p>
        A fact marked as matched means those words appear in the text Sightline was given. It does
        not mean the text is a correct reading of the original page, and it does not mean the
        answer is right.
      </p>
    </section>
  );
}

function RecordBlock({ record }: { record: TrustRecord }) {
  const checks = record.attestation.checks;
  const ran = checks.filter((check) => check.ran);
  const didNotRun = checks.filter((check) => !check.ran);

  return (
    <div className="trust-record" data-testid="trust-record">
      <h3>{PURPOSE_WORDS[record.purpose]}</h3>
      <p data-testid="trust-claim">{claimCopy(record.claim, checks)}</p>

      <h4>Checks that ran</h4>
      {ran.length === 0 ? (
        <p>No check ran in this call.</p>
      ) : (
        <CheckList checks={ran} />
      )}

      <h4>Checks that did not run</h4>
      {didNotRun.length === 0 ? (
        <p>Every check this call could run, it ran.</p>
      ) : (
        <CheckList checks={didNotRun} />
      )}

      <details>
        <summary>Technical details</summary>
        <ul className="detail-list">
          <li>
            Model named by the service: <code>{record.model}</code>
          </li>
          <li>
            Where the request went: <code>{record.endpoint}</code>
          </li>
          <li>
            Response id: <code>{record.requestId}</code>
          </li>
          <li>
            Signed by: <code>{record.signature.algo}</code>, verified: <code>{String(record.signature.verified)}</code>
          </li>
          <li>
            Encrypted end to end to the enclave key: <code>{String(record.e2ee)}</code>
          </li>
          <li>
            Attestation report fetched at:{' '}
            <code>{record.attestation.fetchedAt === 0 ? 'never' : new Date(record.attestation.fetchedAt).toISOString()}</code>
          </li>
          <li>
            Nonce used: <code>{record.attestation.nonce === '' ? 'none' : record.attestation.nonce}</code>
          </li>
        </ul>
      </details>
    </div>
  );
}

/**
 * `ran` and `passed` are shown as two separate words, never merged into one badge: `partial` must
 * not be readable as "verified" (AGENTS.md §4 rule 5), and a check that did not run has to look
 * different from one that ran and failed.
 */
function CheckList({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="check-list">
      {checks.map((check) => (
        <li key={check.name}>
          <span className={checkClass(check)}>{statusWords(check)}</span> {humanise(check.name)}
          {check.detail !== undefined ? <span className="muted"> — {check.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function checkClass(check: CheckResult): string {
  if (!check.ran) return 'check-skipped';
  return check.passed ? 'check-passed' : 'check-failed';
}

function statusWords(check: CheckResult): string {
  if (!check.ran) return 'Did not run';
  return check.passed ? 'Passed' : 'Did not pass';
}

/** "attestation_report" reads as "Attestation report" — no acronym is shown as an acronym. */
function humanise(name: string): string {
  const words = name.split('_').map((word) => (word.length <= 3 ? word : word[0]!.toUpperCase() + word.slice(1)));
  return words.join(' ');
}
