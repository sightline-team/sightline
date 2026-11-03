import { NotBuilt } from '@/lib/not_built';
import type { AttestationGate, SignatureVerifier } from '@/lib/near-ai/verification';

/**
 * Why a live mode still stops at the door (blockers **B-05**, items **F-04**, **F-05**).
 *
 * Both composition roots — reading a document (P-05) and asking about it (P-06) — need a gate and
 * a signature verifier. Those *exist*: `createTrustSession` (T-01) and `createSignatureVerifier`
 * (T-02) are implemented and tested in `tests/verification/attestation.test.ts`. What does not
 * exist is a way to reach a service that could answer them:
 *
 *  - **F-04** — nothing decides which model id is a TEE-hosted model, so there is no name to put
 *    in an attestation request. AGENTS.md §4 rule 3 says the allowlist comes before the document.
 *  - **F-05** — Mode B's relay answers 501 and forwards nothing, so a Mode B client cannot get a
 *    report, a completion or a signature at all.
 *  - **B-05** — with no key, no live report has ever been seen; the gate's `verified` status is
 *    unreachable by construction (see the honesty ceiling in `near-ai/attestation.ts`).
 *
 * So these two placeholders stay, and they stay *throwing*. Two reasons, and both are why this
 * file is separate from the hooks:
 *
 *  - the run must **refuse at the door** rather than construct a plausible-looking collaborator.
 *    Handing the pipeline a gate that returned `verified` would be a privacy claim written by a
 *    stub, and the receipt would show a check that never ran (AGENTS.md §4 rules 1, 5 and 6).
 *  - the refusal has to be the *same* sentence in both hooks. Two copies of "this mode is not
 *    built yet" drift into two different promises about what the app can do.
 *
 * Wiring the real gate and verifier in is the work F-04 and F-05 describe; when it happens the
 * refusal is deleted and nothing else about the run changes — the pipeline already awaits the gate
 * before it assembles a body (T-06).
 *
 * These are capability statements, never privacy statements — nothing here may assert what left
 * the device (`features/trust/claims.ts` owns that, and `tests/unit/claims.test.ts` scans for it).
 */

/** What to say when a live mode is asked to read a document. */
export const LIVE_MODE_UNAVAILABLE = {
  code: 'model_unavailable' as const,
  userMessage:
    'Sightline cannot read a document in this mode yet: choosing a suitable model and reaching the service are not built. Demo mode reads demo documents and says so on every page.',
  retryable: false,
};

/** What to say when a live mode is asked a question about a document. */
export const LIVE_MODE_QA_UNAVAILABLE = {
  code: 'model_unavailable' as const,
  userMessage:
    'Sightline cannot answer questions in this mode yet: choosing a suitable model and reaching the service are not built. Demo mode answers the questions written for its demo letters.',
  retryable: false,
};

/**
 * Placeholders that *throw* rather than return. If a future change makes fixture mode reach
 * either of them, the run fails loudly instead of inventing a check — which is the guard the
 * composition roots depend on. The item each one names is the one that deletes it.
 */
export const refusedGate: AttestationGate = () => {
  throw new NotBuilt('F-04', 'A live-mode gate: no model allowlist, so nothing to attest');
};

export const refusedSignatureVerifier: SignatureVerifier = () => {
  throw new NotBuilt('F-05', 'A live-mode signature check: the relay forwards nothing yet');
};
