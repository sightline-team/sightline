import { notBuilt } from '@/lib/not_built';
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

/**
 * Chosen from the record's own facts — `e2ee` and the check results — never from what a
 * screen wants to say. `partial` never becomes "verified" (rule 5).
 */
export function claimFor(_record: TrustRecord): TrustRecord['claim'] {
  return notBuilt('T-04', 'Claim selection') as never;
}

/** `partial` has no fixed sentence: it is generated from the `ran` / `passed` list. */
export function partialCopy(_checks: CheckResult[]): string {
  return notBuilt('T-04', 'The partial-verification sentence') as never;
}

/**
 * What to say when the fail-closed path stopped the run (T-06). This is a data-flow
 * claim ("nothing was sent"), so it belongs here and is emitted only when the pipeline
 * can prove no document bytes left the device.
 */
export function blockedCopy(): string {
  return notBuilt('T-06', 'The blocked-before-sending sentence') as never;
}
