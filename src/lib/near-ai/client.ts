import { notBuilt } from '@/lib/not_built';
import type { Mode } from '@/types';

/**
 * Typed fetch wrapper for NEAR AI Cloud (item **F-03**). One code path serves all
 * three modes: the base URL and the header provider are injected, so relay,
 * direct and fixture replay differ only by construction (`docs/ARCHITECTURE.md` §4).
 *
 * Contract the implementation must keep:
 * - Paths come from this union. Callers can never supply a URL (AGENTS.md §4 rule 9).
 * - Aborts through `AbortSignal`; one retry on transient errors, never on a
 *   verification failure (fail closed, rule 6).
 * - Nothing request- or response-derived is ever logged (rule 7).
 *
 * Endpoint shapes were resolved by reading, not guessed — see `docs/SPIKE_RESULTS.md`
 * §1, §3, §5. A completion carries no signature: it is fetched separately.
 */
/**
 * The four endpoints Sightline uses, named exactly as `docs/SPIKE_RESULTS.md` §1/§3/§4/§5
 * records them. `signature/{chat_id}` and `model/{model_name}` each take **one** path
 * parameter, substituted by this client from a typed argument — a caller can never supply a
 * path or a host (AGENTS.md §4 rule 9).
 *
 * `GET /v1/models` is deliberately **not** here: it returns no `attestationSupported`,
 * `providerType` or `verifiable` (ADR-18), so it cannot be used to decide whether a model is
 * safe to send a document to, and every path we can ask for is a path the relay must consider.
 */
export const NEAR_PATHS = [
  'chat/completions',
  'attestation/report',
  'signature/{chat_id}',
  'model/{model_name}',
] as const;

export type NearPath = (typeof NEAR_PATHS)[number];

export interface NearClient {
  readonly mode: Mode;
  readonly baseUrl: string;
  /** Raw text of the exact bytes sent, needed later to rebuild `request_hash` (ADR-19). */
  post(path: Extract<NearPath, 'chat/completions'>, body: unknown, init?: { signal?: AbortSignal }): Promise<unknown>;
  get(path: Exclude<NearPath, 'chat/completions'>, query?: Record<string, string>, init?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface NearClientConfig {
  mode: Mode;
  baseUrl: string;
  /** Mode A: the user's own key from sessionStorage. Mode B: never used — the relay holds the key. */
  headers?: () => Promise<Record<string, string>> | Record<string, string>;
  fetchImpl?: typeof fetch;
}

export function createNearClient(_config: NearClientConfig): NearClient {
  return notBuilt('F-03', 'The NEAR AI Cloud client') as never;
}
