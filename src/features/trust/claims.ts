import { E2EE_PROVEN_IN_BROWSER } from '@/lib/near-ai/e2ee';
import type { CheckResult, TrustRecord } from '@/types';

/**
 * The only place a privacy sentence exists (item **T-04**, AGENTS.md §4 rule 1).
 *
 * Components look text up from here; nothing hand-writes a privacy statement anywhere
 * else — not a page, not the README, not a demo post. The copy below is the claims
 * ladder from `docs/PRD.md` §8 **verbatim**, and a rung may be added only when the code
 * actually establishes it.
 *
 * The rule that decides the strong rung (ADR-16, `docs/SPIKE_RESULTS.md` §2): E2EE to
 * the attested key has to have *worked from a browser against a live enclave*, which as
 * of 2026-11-02 it has not been shown to do (`e2ee.ts` → `E2EE_PROVEN_IN_BROWSER = false`).
 * Documented is not measured. Until then `claimFor` can never return `e2ee_enclave`.
 */
export const CLAIM_COPY = {
  e2ee_enclave: 'Only the verified private enclave can read your document.',
  attested_model_signed_responses:
    'The AI model was verified as running in a private enclave and each answer was proven to come from it. Your upload travels over standard secure web connections to NEAR AI Cloud.',
  fixtures: 'Demo data. No real privacy guarantee.',
} as const;

/** The banner Mode F must always show (AGENTS.md §4 rule 11). */
export const FIXTURES_BANNER = CLAIM_COPY.fixtures;

/** What a rung is decided from: every fact in a record except the rung itself. */
export type ClaimInput = Omit<TrustRecord, 'claim'>;

/**
 * Which rung a record has earned — from its own facts, never from what a screen wants to
 * say (rule 1). The parameter type is the enforcement: a record cannot carry a claim *into*
 * this function, so nothing upstream can pre-seed the answer it wants. Three things must be
 * true at once for the strong rung, and a record that asserts `e2ee` while the browser path
 * is unproven is treated as the bug it is: it gets the rung it actually earned.
 *
 * `partial` is never presented as "verified" (rule 5); it is also what a record with
 * failed checks maps to, because "not verified" is the true statement in both cases.
 * A run that stopped before sending anything is T-06's path, not this one.
 */
export function claimFor(record: ClaimInput): TrustRecord['claim'] {
  if (record.endpoint === 'fixtures') return 'fixtures';
  const attested = record.attestation.status === 'verified';
  const signed = record.signature.verified;

  if (E2EE_PROVEN_IN_BROWSER && record.e2ee && attested && signed) return 'e2ee_enclave';
  if (attested && signed) return 'attested_model_signed_responses';
  return 'partial';
}

/** The sentence for the rung, so a component never assembles privacy prose itself. */
export function claimCopy(claim: TrustRecord['claim'], checks: CheckResult[]): string {
  if (claim === 'partial') return partialCopy(checks);
  return CLAIM_COPY[claim];
}

/**
 * `partial` has no fixed sentence: it is generated from the `ran` / `passed` list, so the
 * words always match the checks that actually happened (rule 5). Counts, never names —
 * the check names are for the receipt's list (T-09), and a screen reader would choke on
 * "quote_consistency, tcb_info" mid-sentence.
 */
export function partialCopy(checks: CheckResult[]): string {
  const passed = checks.filter((c) => c.ran && c.passed).length;
  const failed = checks.filter((c) => c.ran && !c.passed).length;
  const notRun = checks.filter((c) => !c.ran).length;

  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} did not pass`);
  if (notRun > 0) parts.push(`${notRun} could not run`);

  const detail = parts.length === 0 ? '' : `: ${parts.join(', ')}`;
  return `Partly checked, not verified${detail}. ${passed} of ${checks.length} checks passed. Treat the answers below as unverified.`;
}

/**
 * What to say when the fail-closed path stopped the run (T-06). This is a data-flow
 * claim ("nothing was sent"), so it belongs here and is emitted only when the pipeline
 * can prove no document bytes left the device.
 */
export function blockedCopy(): string {
  return 'Verification did not pass. Nothing was sent from your document.';
}
