import 'server-only';

import { notBuilt } from '@/lib/not_built';

/**
 * The relay's only job is to refuse things (item **F-05**). AGENTS.md §4 rule 9:
 * fixed upstream host in code, exact-path allowlist, model allowlist, size cap,
 * shared-store rate limit, no body logging.
 *
 * `NEAR_PATHS` in `lib/near-ai/client.ts` is the client-side mirror of this list; the
 * server must not trust the client to be the one enforcing it. Exact paths, never a
 * prefix or wildcard — a prefix match is what turns a relay into an open proxy and
 * invites host/path tricks.
 *
 * Resolved endpoints (`docs/SPIKE_RESULTS.md` §1, §3, §5) are the four F-05 names:
 * `POST /v1/chat/completions`, `GET /v1/attestation/report`, `GET /v1/signature/{chat_id}`,
 * plus `GET /v1/model/{model_name}` for the per-model TEE flags (ADR-18). `GET /v1/models` is
 * **not** on the list: the browser can read that catalog itself, and every extra path is another
 * surface to get wrong.
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export type Rejection = 'path_not_allowed' | 'body_too_large' | 'model_not_allowed' | 'rate_limited';

export interface RelayDecision {
  allowed: boolean;
  reason?: Rejection;
}

export function isPathAllowed(_pathname: string): RelayDecision {
  return notBuilt('F-05', 'Relay path allowlist') as never;
}

export function isModelAllowed(_modelId: string, _configAllowlist: string[]): RelayDecision {
  return notBuilt('F-05', 'Relay model allowlist') as never;
}

export function withinSizeCap(_byteLength: number): RelayDecision {
  return notBuilt('F-05', 'Relay size cap') as never;
}
