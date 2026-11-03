import { NotBuilt } from '@/lib/not_built';
import type { AttestationGate, SignatureVerifier } from '@/lib/near-ai/verification';

/**
 * What live modes do today, in one place (items **T-01**, **T-02**, blockers B-05).
 *
 * Both composition roots — reading a document (P-05) and asking about it (P-06) — have to give
 * the pipeline a gate and a signature verifier, and neither exists yet. Two things follow, and
 * both are the reason this file is separate from the hooks:
 *
 *  - the run must **refuse at the door** rather than construct a plausible-looking collaborator.
 *    A gate that returned `verified` would be a privacy claim written by a stub, and the receipt
 *    would show a check that never ran (AGENTS.md §4 rules 1, 5 and 6).
 *  - the refusal has to be the *same* sentence in both hooks. Two copies of "this mode is not
 *    built yet" drift into two different promises about what the app can do.
 *
 * These are capability statements, never privacy statements — nothing here may assert what left
 * the device (`features/trust/claims.ts` owns that, and `tests/unit/claims.test.ts` scans for it).
 */

/** What to say when a live mode is asked to read a document. */
export const LIVE_MODE_UNAVAILABLE = {
  code: 'model_unavailable' as const,
  userMessage:
    'Sightline cannot read a document in this mode yet: the verification steps and the model allowlist are not built. Demo mode reads demo documents and says so on every page.',
  retryable: false,
};

/** What to say when a live mode is asked a question about a document. */
export const LIVE_MODE_QA_UNAVAILABLE = {
  code: 'model_unavailable' as const,
  userMessage:
    'Sightline cannot answer questions in this mode yet: the verification steps and the model allowlist are not built. Demo mode answers the questions written for its demo letters.',
  retryable: false,
};

/**
 * Placeholders that *throw* rather than return. If a future change makes fixture mode reach
 * either of them, the run fails loudly instead of inventing a check — which is the guard the
 * composition roots depend on.
 */
export const refusedGate: AttestationGate = () => {
  throw new NotBuilt('T-01', 'The attestation gate');
};

export const refusedSignatureVerifier: SignatureVerifier = () => {
  throw new NotBuilt('T-02', 'The response signature check');
};
