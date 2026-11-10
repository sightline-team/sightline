import 'server-only';

import { createNearClient, type NearClient } from '@/lib/near-ai/client';
import { isAllowed, readModelMetadata, type ModelMetadata } from '@/lib/near-ai/models';
import {
  inspectCompletionBody,
  isAllowedOrigin,
  isModelAllowed,
  resolveRequest,
  statusFor,
  UPSTREAM_ORIGIN,
  UPSTREAM_V1_BASE,
  withinSizeCap,
  type Rejection,
} from '@/lib/server/allowlist';
import { clientIp, rateLimit, type RateLimitStore } from '@/lib/server/rateLimit';
import { relayApiKey, serverConfig, type ServerConfig } from '@/lib/server/env';

/**
 * The Mode B relay (item **F-05**), as one function with injectable collaborators so the route file
 * can stay five lines and the tests can point it at a double instead of at the service holding our
 * key.
 *
 * The rules it enforces are AGENTS.md §4 rule 9, and each one is a refusal that happens **before**
 * anything is forwarded:
 *
 * 1. the operator must have enabled the relay, with a key and a model list (`lib/server/env.ts`);
 * 2. the path must be one of the four in `lib/server/allowlist.ts`, matched on the encoded segment;
 * 3. the query may carry only the keys that path uses;
 * 4. this client's hourly bucket must not be full (**F-06**);
 * 5. the body must fit the cap, parse, name a model, not ask for a stream, and carry one page;
 * 6. that model must be in the operator's list **and** its live catalog metadata must pass
 *    `isAllowed` — attested, verifiable, not forwarded off `.near.ai`, ready, image-capable
 *    (**ADR-18** as amended, AGENTS.md §4 rule 3).
 *
 * ### What it forwards, byte for byte
 *
 * A completion's signature is SHA-256 of the exact request body and the exact response text
 * (**ADR-19**), so a relay that re-serialised the JSON — `JSON.parse` then `JSON.stringify` — would
 * be signing bytes nobody sent and breaking the check the product is built on. This module therefore
 * reads the body into a `Uint8Array`, parses a *copy* of the text only to decide the refusals above,
 * and hands the original bytes to upstream untouched; the response is streamed through rather than
 * rebuilt. Nothing here keeps a body, and nothing here logs one: the only values that ever leave in a
 * response are a refusal code and a model id, which is product configuration.
 *
 * ### What it does not do
 *
 * It is not a general proxy. There is no caller-supplied URL, no host header read, no wildcard path,
 * no `GET /v1/models` or `/v1/model/list` pass-through (that widening is a human decision — see
 * `listCandidates()` in `lib/near-ai/models.ts`), and no `stream` upstream (**ADR-22**: a streamed
 * completion is signed by the gateway, not by the enclave, so the receipt would claim less than the
 * product does). And if ADR-16's browser E2EE ever lands, the bytes forwarded are ciphertext; until
 * then the relay does see the document in transit, unstored, and the claims ladder says so.
 */

export interface RelayDeps {
  fetchImpl?: typeof fetch;
  /** Injected in tests; production reads `process.env` through the same schema the page renders. */
  config?: ServerConfig;
  /** Injected in tests. Production: `relayApiKey()`, and never anything else. */
  apiKey?: string;
  rateStore?: RateLimitStore;
  /** A clock, so a test can put a request anywhere in an hour. */
  nowMs?: number;
}

/**
 * How long a model's TEE verdict is reused. Long enough that a five-page document asks once rather
 * than five times, short enough that a model pulled from the catalog stops being forwarded within one
 * page-run's time. A *failed* read is never cached: an unreadable row is a reason to try again on the
 * next request, not a verdict to hold for a quarter of an hour.
 */
const METADATA_TTL_MS = 15 * 60_000;

const metadataCache = new Map<string, { metadata: ModelMetadata; at: number }>();

export async function handleRelay(request: Request, deps: RelayDeps = {}): Promise<Response> {
  const config = deps.config ?? serverConfig();

  // Config first, because a relay with no key and no list has nothing it could correctly forward, and
  // `serverConfig` has already decided that in production. The body is never read on this path.
  if (!config.relayEnabled) return disabled(config);

  if (!isAllowedOrigin(request.headers)) return refuse('origin_not_allowed');

  const resolved = resolveRequest(new URL(request.url), request.method);
  if (!resolved.ok) return refuse(resolved.reason);

  const bucket = await rateLimit(clientIp(request.headers), config.rateLimitPerIpPerHour, deps.rateStore, deps.nowMs);
  if (!bucket.allowed) {
    return refuse('rate_limited', { retry_after_seconds: bucket.retryAfterSeconds }, { 'retry-after': String(bucket.retryAfterSeconds) });
  }

  const apiKey = deps.apiKey ?? relayApiKey();
  if (apiKey.length === 0) return disabled({ ...config, relayEnabled: false, relayDisabledReason: 'no_key' });

  const target: RelayTarget = { method: resolved.request.method, url: `${UPSTREAM_ORIGIN}${resolved.request.upstreamPath}${resolved.request.search}` };
  let body: Uint8Array<ArrayBuffer> | undefined;

  if (resolved.request.endpoint === 'chat_completions') {
    const bytes = new Uint8Array(await request.arrayBuffer());
    const size = withinSizeCap(bytes.byteLength);
    if (!size.allowed) return refuse('body_too_large');

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return refuse('invalid_json');
    }

    const inspected = inspectCompletionBody(parsed);
    if (!inspected.ok) return refuse(inspected.reason);

    // The operator's list is the first gate because it costs nothing and is deterministic. The live
    // metadata read is the second because a list is a thing somebody typed, and rule 3 is about the
    // machine the model actually runs in.
    const listed = isModelAllowed(inspected.model, config.allowedModels);
    if (!listed.allowed) return refuse('model_not_allowed', { model: inspected.model });

    const tee = isAllowed(await modelMetadata(inspected.model, apiKey, deps.fetchImpl), config.allowedModels);
    if (!tee.allowed) return refuse('model_not_allowed', { model: inspected.model, tee_reason: tee.reason });

    body = bytes;
  }

  return forward(request, target, body, apiKey, deps.fetchImpl ?? globalThis.fetch);
}

interface RelayTarget {
  method: 'GET' | 'POST';
  url: string;
}

/** The live verdict for one model id, from the cache when it is fresh and from the catalog when it is not. */
async function modelMetadata(model: string, apiKey: string, fetchImpl?: typeof fetch): Promise<ModelMetadata | undefined> {
  const hit = metadataCache.get(model);
  if (hit !== undefined && Date.now() - hit.at < METADATA_TTL_MS) return hit.metadata;
  // `createNearClient` in direct mode is the only thing in this repo that may talk to
  // `cloud-api.near.ai`, and the relay uses it rather than re-implementing a second fetch stack: the
  // host pin, the one-retry rule and the "never log a body" discipline come along with it.
  const client: NearClient = createNearClient({
    mode: 'direct',
    baseUrl: UPSTREAM_V1_BASE,
    headers: () => ({ authorization: `Bearer ${apiKey}` }),
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
    retryDelayMs: 0,
  });
  try {
    const metadata = await readModelMetadata(model, client);
    metadataCache.set(model, { metadata, at: Date.now() });
    return metadata;
  } catch {
    // A catalog we cannot read is a model we cannot vouch for. `isAllowed(undefined, …)` refuses it,
    // which is rule 6 doing its job rather than an outage being waved through.
    return undefined;
  }
}

/**
 * One upstream call, with our key and nobody else's headers.
 *
 * The client's request headers are **not** copied forward. It arrives with `cookie`, `origin`,
 * `referer` and, in a misconfigured Mode A, possibly an `authorization` of its own — forwarding any of
 * that would hand a third party either the person's session or a key, and would let the caller choose
 * the `host` this request goes to. The header set below is the whole of what upstream sees from us.
 */
async function forward(request: Request, target: RelayTarget, body: Uint8Array<ArrayBuffer> | undefined, apiKey: string, fetchImpl: typeof fetch): Promise<Response> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${apiKey}`,
    ...(target.method === 'POST' ? { 'content-type': request.headers.get('content-type') ?? 'application/json' } : {}),
  };

  let upstream: Response;
  const timeoutSignal = AbortSignal.timeout(55_000);
  const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal;
  try {
    upstream = await fetchImpl(target.url, {
      method: target.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal,
    });
  } catch {
    // Deliberately uninformative: an undici failure message can carry the URL it tried, and this one
    // has our key's host in it. A status and a code are enough for the person watching the screen.
    return json({ error: 'upstream_unreachable', relay_enabled: true }, 502);
  }

  const retryAfter = upstream.headers.get('retry-after');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      ...(retryAfter === null ? {} : { 'retry-after': retryAfter }),
    },
  });
}

function disabled(config: ServerConfig): Response {
  return json({ error: 'relay_disabled', relay_enabled: false, reason: config.relayDisabledReason }, 503);
}

/**
 * A refusal: a status, a code, and nothing else. No path (a refused path is a probe worth not
 * echoing), no body, no header value, no key — and the model id only where it is product
 * configuration the operator already typed into `ALLOWED_MODELS`.
 */
function refuse(reason: Rejection, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json({ error: reason, relay_enabled: true, ...dropUndefined(extra) }, statusFor(reason), headers);
}

function dropUndefined(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
