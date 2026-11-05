'use client';

import { createNearClient, RELAY_PREFIX, type NearClient } from '@/lib/near-ai/client';
import { createTrustSession } from '@/lib/near-ai/attestation';
import { createFixtureClient, FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { refuseDirectMode } from '@/app/_flow/refused_steps';
import type { CallPurpose } from '@/lib/near-ai/client';
import type { AttestationGate, SignatureVerifier } from '@/lib/near-ai/verification';
import type { ID, Mode, Session } from '@/types';

/**
 * Where a run's collaborators come from (item **F-05**'s last open half, and the reason **F-04**
 * and **F-05** could finally close).
 *
 * Every composition root used to build the same three objects by hand and hand over two placeholders
 * that threw. That duplication had one real purpose: it kept the *refusal* honest while there was
 * nothing to refuse for. There is something to refuse for still — Mode A has no key field (**T-13**) —
 * and one thing to build, which is what this file is. Putting it in one place is what makes the three
 * roots unable to disagree about the security-relevant question: *which transport, whose gate, whose
 * key*. A run that wires those three differently in two screens is a run whose receipt means something
 * different on each of them.
 *
 * ### Mode B: the relay, and one trust session per Sightline session
 *
 * The transport is `createNearClient` in relay mode, whose base URL is `RELAY_PREFIX` — a path on our
 * own origin, validated at construction, with the key held server-side (`lib/server/relay.ts`). The
 * gate and the verifier are `createTrustSession`'s real ones, so an attestation report is asked for
 * and read before any document byte leaves, and each answer's signature is checked against the key
 * that report bound.
 *
 * The session is keyed on `session.id` and held in one module-level slot, in memory, for one reason:
 * AGENTS.md §4 rule 4 asks for a **fresh nonce per session**, and `forgotten` mints a new session id
 * (P-10). So a person who presses Forget and starts again cannot reuse the last document's nonce or
 * the enclave key attested under it — the old session's material becomes unreachable, which is the
 * browser-side equivalent of what Forget does to everything else. Nothing here writes to storage: a
 * nonce and a public key are not document content, but the rule is the same as the session store's —
 * memory only (ADR-8).
 *
 * ### Mode F: the replay transport, and two guards that throw
 *
 * Mode F answers verification questions with `fixtureGate` / `fixtureSignature`, which `readCompletion`
 * reaches *without* asking this file, because there is no enclave in demo mode and saying `not_run` is
 * the only honest answer (rule 11). The two objects below are therefore unreachable on purpose. They
 * throw rather than return the `not_run` outcome: if a future change made Mode F call a gate, the run
 * must stop loudly instead of quietly getting a plausible-looking check result from a mode that has
 * nothing to check.
 *
 * ### Mode A: still refused
 *
 * `refuseDirectMode()` (**T-13**). The hooks stop at their own door with a plain-language sentence
 * before reaching here; this is the backstop that keeps a dropped door check from producing a
 * transport that cannot authenticate.
 */
export interface RunCollaborators {
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
}

/**
 * Which model a step asks, for this mode: the plan's row for a live run (**ADR-24**), the fixture's
 * own name for Mode F. The name lands in every receipt, so a demo run cannot be read as a TEE call and
 * a live page reading cannot be named after the model that summarised it.
 */
export function modelFor(mode: Mode, purpose: CallPurpose): string {
  return mode === 'fixtures' ? FIXTURE_MODEL : STEP_PLANS[purpose].model;
}

/** The trust session and transport for the current session id, or the first fresh one for the next. */
let held: { sessionId: ID; collaborators: RunCollaborators } | undefined;

export function collaboratorsFor(session: Session): RunCollaborators {
  if (session.mode === 'direct') return refuseDirectMode();

  if (session.mode === 'fixtures') {
    return {
      transport: createFixtureClient(),
      gate: () => unreachableInFixtureMode('the attestation gate'),
      verifySignature: () => unreachableInFixtureMode('the response-signature check'),
    };
  }

  if (held !== undefined && held.sessionId === session.id) return held.collaborators;

  // One client for both jobs, because the report, the completion and the signature all have to cross
  // the same relay under the same rules (ADR-19). Building it twice would be two retry budgets and two
  // sets of base-URL validation for one run.
  const transport = createNearClient({ mode: 'relay', baseUrl: RELAY_PREFIX });
  const trust = createTrustSession({ client: transport });
  const collaborators: RunCollaborators = { transport, gate: trust.gate, verifySignature: trust.verifySignature };
  held = { sessionId: session.id, collaborators };
  return collaborators;
}

/**
 * Mode F's guard. A plain `Error` and not `NotBuilt`: nothing here is unbuilt work waiting for an
 * owner, it is an invariant a mode may never cross, and naming a ROADMAP item would send the next
 * reader to look for a feature that should not exist.
 */
function unreachableInFixtureMode(what: string): never {
  throw new Error(`Fixture mode reached ${what}. Mode F has no enclave, so it runs no verification step — it reports the checks that did not run instead.`);
}
