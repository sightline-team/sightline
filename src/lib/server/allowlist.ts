import 'server-only';

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
 * surface to get wrong. Neither is `GET /v1/model/list`, which the spike measured as the cheaper
 * way to get the flags — adding a path to this set is a human decision (AGENTS.md §5), so the
 * relay ships with exactly the four and `listCandidates()` in `lib/near-ai/models.ts` still refuses.
 *
 * ### Why the matcher reads a `URL`, not Next's `params.path`
 *
 * A model id contains a slash, and `encodeSegment` in the client puts it on the wire as
 * `model/z-ai%2Fglm-5.3-flash` — **one** segment. Whether Next decodes that `%2F` before handing
 * segments to a catch-all was an open question (it is recorded as one in `docs/ARCHITECTURE.md` §8).
 * `url.pathname` is what actually arrived, so the allowlist matches the encoded form and the
 * forwarded path is byte-identical to the one the client built. A `%2F` that Next had already
 * turned into `/` would then show up as a third segment and be refused rather than forwarded as a
 * different path than the one we approved.
 */

/**
 * Measured, not guessed: a prepared five-page document is 726,910 bytes of body (**SPIKE_RESULTS**
 * §9), one page per request, so a page arrives at roughly 145 KB and the cap is ~57× that. The cap
 * exists to stop somebody using our key as a filing cabinet, not to constrain the product.
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Where this route is mounted. The client's relay base is the same string (`RELAY_PREFIX`). */
export const RELAY_PATH_PREFIX = '/api/relay/v1';

/** The one host document bytes may be sent to. Fixed in code; no caller-supplied URL exists. */
export const UPSTREAM_ORIGIN = 'https://cloud-api.near.ai';

/** `UPSTREAM_ORIGIN` plus the API version, for the client that reads per-model metadata. */
export const UPSTREAM_V1_BASE = `${UPSTREAM_ORIGIN}/v1`;

export type Rejection =
  | 'path_not_allowed'
  | 'method_not_allowed'
  | 'query_not_allowed'
  | 'body_too_large'
  | 'invalid_json'
  | 'missing_model'
  | 'model_not_allowed'
  | 'streaming_not_supported'
  | 'too_many_pages'
  | 'rate_limited';

/**
 * A refusal the relay answers with, and the status it answers it at.
 *
 * `path_not_allowed` and `model_not_allowed` are **403**, not 404: a 404 on a GET is the documented
 * transient the client retries once, so refusing a path with the status used for "not cached yet"
 * would make every refusal cost two requests and muddy a real signal. `rate_limited` is 429 because
 * that is the one status the client already honours with `Retry-After`.
 */
const STATUS_FOR: Record<Rejection, number> = {
  path_not_allowed: 403,
  model_not_allowed: 403,
  method_not_allowed: 405,
  query_not_allowed: 400,
  invalid_json: 400,
  missing_model: 400,
  streaming_not_supported: 400,
  too_many_pages: 400,
  body_too_large: 413,
  rate_limited: 429,
};

export function statusFor(reason: Rejection): number {
  return STATUS_FOR[reason];
}

export interface RelayDecision {
  allowed: boolean;
  reason?: Rejection;
}

export type RelayEndpoint = 'chat_completions' | 'attestation_report' | 'signature' | 'model_metadata';

export interface ResolvedRequest {
  endpoint: RelayEndpoint;
  method: 'GET' | 'POST';
  /** The upstream path, still encoded — `/v1/model/z-ai%2Fglm-5.3-flash`. Exactly what goes on the wire. */
  upstreamPath: string;
  /** The query to forward, `?`-prefixed, or empty. Already validated key by key. */
  search: string;
}

export type ResolveResult = { ok: true; request: ResolvedRequest } | { ok: false; reason: Rejection };

/**
 * Each path carries the query keys it may carry, and nothing else.
 *
 * A bodyless GET's parameters live in its query, so dropping this check would leave the path
 * allowlist half-finished: `?api_key=…`, `?callback=…` or a duplicated `model=` are all things a
 * proxy should not forward just because the path was right. `nonce` is here because the attestation
 * report is *for* a nonce — it is random, not document-derived, and the report is useless without it.
 */
interface EndpointRule {
  endpoint: RelayEndpoint;
  method: 'GET' | 'POST';
  /** The fixed second segment — `completions`, `report` — or absent when it is a parameter. */
  fixed?: string;
  query: readonly string[];
  /**
   * Second segments the parameterised form may never be. `GET /v1/model/list` is the bulk catalog —
   * a real endpoint, deliberately not on this allowlist — and it is also, spelling-wise, a legal
   * `GET /v1/model/{model_name}` for a model called `list`. Refusing the word is what stops the
   * parameterised path from quietly forwarding the path the human has not approved; no model in the
   * catalog is named `list`, so nothing loses a route.
   */
  reserved?: readonly string[];
}

/**
 * The four resolved endpoints, keyed by their first path segment.
 *
 * Each path carries the query keys it may carry, and nothing else. A bodyless GET's parameters live in
 * its query, so dropping that check would leave the path allowlist half-finished: `?api_key=…`,
 * `?callback=…` or a duplicated `model=` are all things a proxy should not forward just because the
 * path was right. `nonce` is on the report list because the report is *for* a nonce — random, not
 * document-derived, and useless without it.
 */
const RULES: Record<string, EndpointRule> = {
  chat: { endpoint: 'chat_completions', method: 'POST', fixed: 'completions', query: [] },
  attestation: { endpoint: 'attestation_report', method: 'GET', fixed: 'report', query: ['model', 'nonce', 'signing_algo'] },
  signature: { endpoint: 'signature', method: 'GET', query: ['model', 'signing_algo'] },
  model: { endpoint: 'model_metadata', method: 'GET', query: [], reserved: ['list'] },
};

function refuse(reason: Rejection): ResolveResult {
  return { ok: false, reason };
}

/**
 * The path segment after `chat/`, `attestation/`, `signature/` or `model/`, as exactly one segment.
 *
 * `undefined` means "not exactly one": `signature/a/b` is two segments and matches nothing, and an
 * empty one (`signature//`) is refused rather than forwarded as a path we never approved. `.` and `..`
 * are refused on the way through, even though `new URL` normally resolves them first.
 */
function singleSegment(segments: string[]): string | undefined {
  const [first, second] = [segments[0], segments[1]];
  if (first === undefined || second !== undefined) return undefined;
  if (first.length === 0 || first === '.' || first === '..') return undefined;
  return first;
}

/**
 * Turn an arrived URL into the one upstream request it is allowed to become, or refuse it.
 *
 * The checks are ordered so a refusal is decided before any byte of the body is read: a request for
 * a path that is not on the list is refused without touching its body at all, which is what keeps an
 * unauthenticated probe from making the relay hold a document in memory.
 */
export function resolveRequest(url: URL, method: string): ResolveResult {
  if (method !== 'GET' && method !== 'POST') return refuse('method_not_allowed');

  const segments = url.pathname.split('/');
  // `/api/relay/v1/chat/completions` → ['', 'api', 'relay', 'v1', 'chat', 'completions'].
  const [, head, second, third, ...tail] = segments;
  if (head !== 'api' || second !== 'relay' || third !== 'v1') return refuse('path_not_allowed');

  const group = tail[0];
  const rule = group === undefined ? undefined : RULES[group];
  if (rule === undefined) return refuse('path_not_allowed');

  const parameter = singleSegment(tail.slice(1));
  if (parameter === undefined) return refuse('path_not_allowed');
  if (rule.fixed !== undefined ? parameter !== rule.fixed : rule.reserved?.includes(parameter)) return refuse('path_not_allowed');
  if (rule.method !== method) return refuse('method_not_allowed');

  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !rule.query.includes(key))) return refuse('query_not_allowed');

  // A fixed path is rebuilt from the rule rather than from the segment that arrived, so an approved
  // path can never be forwarded as a slightly different string. A parameterised path forwards the
  // segment **exactly as it arrived**, which is what keeps `z-ai%2Fglm-5.3-flash` one encoded segment
  // on the wire upstream instead of two path steps.
  const upstreamPath = `/v1/${group}/${rule.fixed ?? parameter}`;

  return {
    ok: true,
    request: {
      endpoint: rule.endpoint,
      method: rule.method,
      upstreamPath,
      search: keys.length === 0 ? '' : `?${url.searchParams.toString()}`,
    },
  };
}

/** Does this body fit the cap? Measured in bytes, because a limit a caller can negotiate is not a limit. */
export function withinSizeCap(byteLength: number): RelayDecision {
  return byteLength > MAX_BODY_BYTES ? { allowed: false, reason: 'body_too_large' } : { allowed: true };
}

/**
 * The model check, server-side.
 *
 * Exact, case-sensitive, full-id membership in the operator's list — the same comparison
 * `isAllowed` makes first (`lib/near-ai/models.ts`), and deliberately not a normalised one: the
 * live catalog contains `deepseek-ai/DeepSeek-V4.1-Flash-1017` (attested) and
 * `deepseek/deepseek-v4.1-flash-1017` (proxied) two entries whose ids differ by namespace and case.
 * The relay's own TEE/host/readiness check runs on top of this in the handler, against the metadata
 * it fetches from `GET /v1/model/{model_name}` (ADR-18), so an id that is merely *listed* is not
 * enough to get document bytes forwarded.
 */
export function isModelAllowed(modelId: string, configAllowlist: string[]): RelayDecision {
  return configAllowlist.includes(modelId) ? { allowed: true } : { allowed: false, reason: 'model_not_allowed' };
}

/** What `inspectCompletionBody` found, or why it refused. */
export type BodyDecision = { ok: true; model: string } | { ok: false; reason: Rejection };

/**
 * Read the three things the relay must know about a completion request, and nothing else.
 *
 * It never returns the body's contents, a prompt, or a message count beyond the page guard, so the
 * caller cannot accidentally log what it read (AGENTS.md §4 rule 7). Three refusals, each a rule
 * that lives somewhere else in this repo:
 *
 * - `missing_model` — no model, no allowlist decision, so nothing may be sent.
 * - `streaming_not_supported` — **ADR-22**: a streamed completion is signed by the gateway rather
 *   than by the enclave serving the model, so forwarding one would hand the browser an answer whose
 *   receipt says less than the product claims. Anything that is not absent-or-`false` counts as a
 *   stream request; `stream: 1` is not a boolean but is somebody asking for a stream.
 * - `too_many_pages` — rule 9's "one page per request". The app already sends one page per call
 *   (**C-03**, **C-08**); enforcing it here is what stops the cap being a convention.
 */
export function inspectCompletionBody(json: unknown): BodyDecision {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { ok: false, reason: 'invalid_json' };
  const body = json as Record<string, unknown>;

  const model = body.model;
  if (typeof model !== 'string' || model.trim().length === 0) return { ok: false, reason: 'missing_model' };

  if (body.stream !== undefined && body.stream !== false) return { ok: false, reason: 'streaming_not_supported' };

  const messages = body.messages;
  if (Array.isArray(messages)) {
    let images = 0;
    for (const message of messages) {
      const content = (message as { content?: unknown })?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const type = (part as { type?: unknown })?.type;
        if (type === 'image_url' || type === 'image') images += 1;
      }
    }
    if (images > 1) return { ok: false, reason: 'too_many_pages' };
  }

  return { ok: true, model };
}
