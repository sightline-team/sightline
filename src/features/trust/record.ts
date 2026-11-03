import { claimFor } from '@/features/trust/claims';
import { newId } from '@/lib/session/reducer';
import type { GateOutcome, SignatureOutcome } from '@/lib/near-ai/verification';
import type { TrustPurpose, TrustRecord } from '@/types';

/**
 * The one place a `TrustRecord` is assembled (items **T-04**, **T-05**, and the receipt the
 * user reads in **T-09**).
 *
 * Every call that carries document data — the structure step (P-03) and a question (P-06) —
 * produces one record, and both build it here. That is deliberate: the record is the *only*
 * input the privacy sentence is computed from, so if two call sites each had their own
 * builder, one of them could grow a hand-written `claim` or drop a check list, and the
 * receipt would start telling a different story about a different call.
 *
 * `claim` is not a parameter (AGENTS.md §4 rule 1). `claimFor`'s input type omits it, so no
 * earlier step can pass the sentence it wants into the thing that decides the sentence.
 */
export function buildTrustRecord(args: {
  purpose: TrustPurpose;
  model: string;
  endpoint: TrustRecord['endpoint'];
  requestId: string;
  gate: GateOutcome;
  signature: SignatureOutcome;
}): TrustRecord {
  const { purpose, model, endpoint, requestId, gate, signature } = args;
  const facts = {
    id: newId(),
    purpose,
    model,
    endpoint,
    requestId,
    // Never true until T-10 has encrypted something for real. `claimFor` also refuses to
    // reach the strong rung while E2EE_PROVEN_IN_BROWSER is false, so this cannot overclaim.
    e2ee: false,
    attestation: {
      nonce: gate.nonce,
      fetchedAt: gate.fetchedAt,
      checks: [...gate.checks, ...signature.checks],
      // Mode F ran no check against a service, so it reports `not_run` whatever the injected
      // gate said — a fixture run cannot earn a verification status by construction.
      status: endpoint === 'fixtures' ? 'not_run' : gate.status,
    },
    signature: { algo: signature.algo, verified: signature.verified },
  };

  return { ...facts, claim: claimFor(facts) };
}
