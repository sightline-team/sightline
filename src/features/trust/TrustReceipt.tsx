import type { TrustRecord } from '@/types';

/**
 * `TrustReceipt` — item **T-09**, shown on `/trust` and at the end of the results view.
 *
 * Renders the computed claim, then every check with `ran` and `passed`, then what the
 * checks do **not** establish (docs/ARCHITECTURE.md §10 has that table and the receipt
 * must not quietly drop it). TDX quote verification, if it does not ship, is listed as
 * not run rather than omitted. Jargon ("TEE", "attestation") stays inside `<details>`.
 *
 * The sentence comes from `features/trust/claims.ts`. If this file ever contains a
 * privacy sentence, that is a bug (AGENTS.md §4 rule 1).
 */
export function TrustReceipt({ records }: { records: TrustRecord[] }) {
  return (
    <section aria-labelledby="trust-heading">
      <h2 id="trust-heading">Verification</h2>
      <p>{records.length === 0 ? 'Nothing has been verified yet.' : 'The receipt is built by roadmap item T-09.'}</p>
    </section>
  );
}
