import { NotBuilt } from '@/lib/not_built';
import type { ErrorCode } from '@/types';

/**
 * The one mode that still refuses at the door: **Mode A**, browsing straight to `cloud-api.near.ai`
 * with the person's own key (item **T-13**).
 *
 * Mode B does not live here any more. It used to: `refusedGate` and `refusedSignatureVerifier` were
 * what every live run was handed, because there was no relay to reach and no allowlist to name a
 * model with (**F-04**, **F-05**). Both were built and measured — `lib/server/relay.ts` forwards the
 * four approved paths (**A-09**, SPIKE §10) and `lib/near-ai/models.ts` answers rule 3 for one model
 * id — so the live wiring is now in `collaborators.ts` and Mode B runs. What is left here is the
 * single missing piece that is genuinely missing: Mode A has no key to send. The attestation report
 * and the signature both require one (ADR-17), and nothing in this build can collect it, because the
 * Settings page deliberately has no key field (ADR-21) and the field belongs to **T-13**.
 *
 * It stays a *throwing* refusal rather than a plausible-looking collaborator, for the reason that
 * made this file in the first place: handing a run a transport that cannot authenticate is a claim
 * about a check that cannot run (AGENTS.md §4 rules 5 and 6). The door check in each composition
 * root means a person never sees this throw; it exists so a future change that drops that check
 * fails loudly instead of quietly.
 *
 * These are capability statements, never privacy statements — nothing here may assert what left the
 * device (`features/trust/claims.ts` owns that, and `tests/unit/claims.test.ts` scans for it).
 */

/** What to say when Mode A is asked to read a document. */
export const DIRECT_MODE_UNAVAILABLE: { code: ErrorCode; userMessage: string; retryable: boolean } = {
  code: 'model_unavailable',
  userMessage:
    'Sightline cannot read a document with your own key yet: the place to enter that key is not built. Demo mode reads demo documents and says so on every page.',
  retryable: false,
};

/** What to say when Mode A is asked a question about a document. */
export const DIRECT_MODE_QA_UNAVAILABLE: { code: ErrorCode; userMessage: string; retryable: boolean } = {
  code: 'model_unavailable',
  userMessage:
    'Sightline cannot answer questions with your own key yet: the place to enter that key is not built. Demo mode answers the questions written for its demo documents.',
  retryable: false,
};

/**
 * The door itself. One function, called by the wiring in `collaborators.ts` rather than by the
 * hooks, so a mode that has no transport cannot be handed out a half-built set of collaborators by
 * accident. **T-13** is the item that deletes it, and `tests/verification/attestation.test.ts` fails
 * if that item is ever marked finished while this still names it.
 */
export function refuseDirectMode(): never {
  throw new NotBuilt('T-13', 'A Mode A transport: the app has no place to hold the key a direct call needs, so it cannot authenticate');
}
