import { appError } from '@/lib/errors';
import type { AppError, Mode } from '@/types';

/**
 * Typed fetch wrapper for NEAR AI Cloud (item **F-03**). One code path serves all
 * three modes: the base URL and the header provider are injected, so relay,
 * direct and fixture replay differ only by construction (`docs/ARCHITECTURE.md` §4).
 *
 * Contract the implementation keeps:
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
type PostPath = Extract<NearPath, 'chat/completions'>;
type GetPath = Exclude<NearPath, 'chat/completions'>;

/**
 * What one call produced.
 *
 * `sentBody` and `rawText` are the **exact wire bytes**, and they are the reason this
 * returns a struct instead of the parsed JSON (ADR-19): `request_hash` is SHA-256 of the
 * exact JSON body sent and `response_hash` is SHA-256 of the exact response string
 * received. A client that parsed the body and dropped the text would make the signature
 * check unimplementable, and one that re-serialised before hashing would hash bytes that
 * were never sent — a check that passes against the wrong thing, which is worse than no
 * check.
 *
 * Both fields are document-derived, so they must never reach a log, a `console`, an error
 * message or storage (AGENTS.md §4 rule 7). `NearError` carries no body for that reason.
 */
export interface NearResponse {
  readonly status: number;
  readonly path: NearPath;
  /** Exact bytes we sent, for `request_hash`. Absent on GETs. */
  readonly sentBody?: string;
  /** Exact text received, un-trimmed. A streaming body ends with two newlines — keep them (§5). */
  readonly rawText: string;
  /** `JSON.parse(rawText)`. Present only when the body was valid JSON. */
  readonly json: unknown;
}

/** The failure shape this client raises. No body, no header value, no key — ever. */
export class NearError extends Error {
  readonly error: AppError;
  readonly status?: number;
  readonly path: NearPath;

  constructor(path: NearPath, error: AppError, status?: number) {
    // The message names the path and the status: enough to debug by, nothing document-derived.
    super(`NEAR AI call failed on ${path}${status === undefined ? '' : ` (HTTP ${status})`}`);
    this.name = 'NearError';
    this.error = error;
    this.status = status;
    this.path = path;
  }
}

export interface CallInit {
  signal?: AbortSignal;
}

export interface GetInit extends CallInit {
  query?: Record<string, string>;
}

export interface NearClient {
  readonly mode: Mode;
  readonly baseUrl: string;
  post(path: PostPath, body: unknown, init?: CallInit): Promise<NearResponse>;
  get(path: 'attestation/report', init?: GetInit): Promise<NearResponse>;
  get(path: 'signature/{chat_id}', init: GetInit & { chatId: string }): Promise<NearResponse>;
  get(path: 'model/{model_name}', init: GetInit & { modelName: string }): Promise<NearResponse>;
}

export interface NearClientConfig {
  mode: Mode;
  baseUrl: string;
  /** Mode A: the user's own key from sessionStorage. Mode B: never used — the relay holds the key. */
  headers?: () => Promise<Record<string, string>> | Record<string, string>;
  fetchImpl?: typeof fetch;
  /** Test seam. Production default 500 ms. */
  retryDelayMs?: number;
}

/** Hosts `next.config.ts`'s CSP `connect-src` allows, and the only ones Mode A may talk to. */
const NEAR_DIRECT_HOSTS = ['cloud-api.near.ai'] as const;

/** Where the relay lives: our own origin, under our own route handler. Never a caller-supplied host. */
const RELAY_PREFIX = '/api/relay/v1';

const DEFAULT_RETRY_DELAY_MS = 500;
/** `Retry-After` is honoured but capped: hammering a rate-limited relay slows everyone down. */
const MAX_RETRY_DELAY_MS = 5000;

/** Statuses worth a second attempt — none of them produced an answer we were charged for. */
const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504] as const;

function isRetryableStatus(status: number): boolean {
  return (RETRYABLE_STATUS as readonly number[]).includes(status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('cancelled', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * How long to wait before the single retry. A numeric `Retry-After` in seconds is
 * respected up to the cap; anything else (HTTP-date form, garbage) falls back to the
 * base delay rather than to zero.
 */
function retryDelay(headers: Headers | null, base: number): number {
  const raw = headers?.get('retry-after');
  if (raw === null || raw === undefined) return base;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return base;
  return Math.min(Math.round(seconds * 1000), MAX_RETRY_DELAY_MS);
}

/**
 * Map an HTTP status to an `AppError`. Deliberately conservative: this layer knows
 * statuses, not meanings, so anything it cannot name becomes `unknown` and the caller
 * (T-01, T-02, P-03) decides with `status` in hand.
 */
function appErrorForStatus(path: NearPath, status: number): AppError {
  if (status === 429) return appError('rate_limited');
  // A 404 or 5xx on a completion is the model not being there to answer.
  if (path === 'chat/completions' && (status === 404 || status >= 500)) return appError('model_unavailable');
  // 401/403 here means a key problem the relay or the gateway describes better than we can.
  return appError('unknown');
}

/**
 * One path segment, percent-encoded.
 *
 * `encodeURIComponent` is what keeps a model id such as `Qwen/Qwen3-VL-30B-A3B-Instruct`
 * inside **one** segment (`Qwen%2FQwen3-…`) instead of silently becoming two, which would
 * miss the relay's exact-path allowlist. F-05 must therefore match on the **encoded**
 * segment — recorded as a follow-up, because how Next's catch-all hands `%2F` to
 * `params.path` has not been observed and needs the live check (B-05).
 */
function encodeSegment(value: string, path: GetPath): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new NearError(path, appError('unknown'));
  return encodeURIComponent(trimmed);
}

/**
 * Concatenation, not `new URL`: the relay's base is a **relative** path (`/api/relay/v1`),
 * and resolving one needs an origin this module does not have on the server. Each piece is
 * already encoded here, so nothing a caller supplies can add a query, a fragment or a host.
 */
function buildUrl(baseUrl: string, path: NearPath, params: { chatId?: string; modelName?: string }, query?: Record<string, string>): string {
  let segment: string = path;
  if (path === 'signature/{chat_id}') segment = `signature/${encodeSegment(params.chatId ?? '', path)}`;
  if (path === 'model/{model_name}') segment = `model/${encodeSegment(params.modelName ?? '', path)}`;
  if (segment.includes('{') || segment.includes('}')) {
    // A placeholder that reached the URL means a substitution was skipped: refuse rather
    // than ask for a path that is not in the allowlist.
    throw new NearError(path, appError('unknown'));
  }

  const qs = query === undefined || Object.keys(query).length === 0 ? '' : `?${new URLSearchParams(query).toString()}`;
  return `${baseUrl.replace(/\/+$/, '')}/${segment}${qs}`;
}

/**
 * Fail closed at construction, not at call time: a client built for a mode it cannot
 * honestly serve is a privacy bug waiting for someone to press a button.
 */
function validateBaseUrl(mode: Mode, baseUrl: string): string {
  if (mode === 'relay') {
    // The prefix alone is not enough: `..` walks out of it while still starting with it, and
    // `//host` is a protocol-relative URL on someone else's origin. Check all three.
    const shapeOk = baseUrl === RELAY_PREFIX || baseUrl.startsWith(`${RELAY_PREFIX}/`);
    if (!shapeOk || baseUrl.includes('..') || baseUrl.includes('//')) {
      throw new Error(
        `Relay baseUrl must be a path under ${RELAY_PREFIX} on our own origin; got "${redactHost(baseUrl)}". The relay is not a general proxy (AGENTS.md §4 rule 9).`,
      );
    }
    return baseUrl;
  }

  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`Direct mode requires an https baseUrl, got "${url.protocol}//${url.host}"`);
  }
  if (!(NEAR_DIRECT_HOSTS as readonly string[]).includes(url.host)) {
    throw new Error(`Direct mode may only talk to ${NEAR_DIRECT_HOSTS.join(', ')}; got "${url.host}" (CSP connect-src, AGENTS.md §7)`);
  }
  return baseUrl;
}

/** A base URL can carry a key in its userinfo; never echo more than the host into an error. */
function redactHost(baseUrl: string): string {
  try {
    return new URL(baseUrl, 'http://localhost').host;
  } catch {
    return 'an unusable URL';
  }
}

export function createNearClient(config: NearClientConfig): NearClient {
  if (config.mode === 'fixtures') {
    // Mode F must never reach the network: it is the mode a reviewer with no key runs, and a
    // fixture client that fell through to fetch would spend someone's credits and show real
    // bytes under a "demo data" banner. F-09 built the replay client for that, in
    // `lib/fixtures/replay.ts`; this factory stays network-only so there is exactly one place
    // that can open a socket.
    throw new Error('createNearClient does not build a Mode F client. Use createFixtureClient() from lib/fixtures/replay.ts.');
  }

  const baseUrl = validateBaseUrl(config.mode, config.baseUrl);

  if (config.mode === 'direct' && config.headers === undefined) {
    throw new Error('Direct mode needs a header provider: the attestation and signature endpoints require a key (ADR-17).');
  }

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const baseRetryDelay = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  async function call(
    path: NearPath,
    method: 'GET' | 'POST',
    url: string,
    sentBody: string | undefined,
    init: CallInit,
  ): Promise<NearResponse> {
    let attempts = 0;

    for (;;) {
      attempts += 1;
      const mayRetry = attempts < 2;

      if (init.signal?.aborted) throw new NearError(path, appError('aborted'));

      const headers = {
        accept: 'application/json',
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
        ...((await config.headers?.()) ?? {}),
      };

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          ...(sentBody === undefined ? {} : { body: sentBody }),
          ...(init.signal === undefined ? {} : { signal: init.signal }),
        });
      } catch {
        if (init.signal?.aborted) throw new NearError(path, appError('aborted'));
        // A transport failure left no answer and nothing to log; one more attempt is safe
        // because the first never completed. The caught value is dropped on purpose — a fetch
        // error message can echo the request URL, and in Mode A the URL is ours but the
        // relay's upstream error is not something to forward.
        if (mayRetry) {
          await waitOrAbort(path, baseRetryDelay, init.signal);
          continue;
        }
        throw new NearError(path, appError('network_lost'));
      }

      // One read of the stream: the bytes we hash must be the bytes that arrived, so there is
      // no second `.json()` anywhere in this client.
      const rawText = await response.text();

      if (!response.ok) {
        // 404 on a GET is the documented transient for signatures ("cached on the node that
        // served your completion"; report retrieval is free and non-billable), so retrying it
        // once is what ADR-19 needs. A 404 on a POST is not transient — the model is not there.
        const transientGet404 = method === 'GET' && response.status === 404;
        if (mayRetry && (isRetryableStatus(response.status) || transientGet404)) {
          await waitOrAbort(path, retryDelay(response.headers, baseRetryDelay), init.signal);
          continue;
        }
        throw new NearError(path, appErrorForStatus(path, response.status), response.status);
      }

      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        // Never retried: this completion was charged for, and a second one returns different
        // bytes, so the signature fetched afterwards would match nothing the caller holds.
        throw new NearError(path, appError('invalid_model_output'), response.status);
      }

      return {
        status: response.status,
        path,
        ...(sentBody === undefined ? {} : { sentBody }),
        rawText,
        json,
      };
    }
  }

  /** Waiting between attempts must not turn a user's cancel into an unexplained throw. */
  async function waitOrAbort(path: NearPath, ms: number, signal?: AbortSignal): Promise<void> {
    try {
      await sleep(ms, signal);
    } catch {
      throw new NearError(path, appError('aborted'));
    }
  }

  return {
    mode: config.mode,
    baseUrl,
    // Both are `async` so that *every* failure — a bad argument as well as a failed call —
    // arrives as a rejection. Callers should not have to guard two shapes of the same error.
    async post(path: PostPath, body: unknown, init?: CallInit): Promise<NearResponse> {
      const sentBody = JSON.stringify(body);
      if (typeof sentBody !== 'string') {
        // JSON.stringify(undefined) is undefined. An empty POST whose hash is taken of the
        // string "undefined" would verify beautifully against bytes that were never sent.
        throw new NearError(path, appError('unknown'));
      }
      return call(path, 'POST', buildUrl(baseUrl, path, {}), sentBody, init ?? {});
    },
    async get(path: GetPath, init?: GetInit & { chatId?: string; modelName?: string }): Promise<NearResponse> {
      const params = {
        ...(init?.chatId === undefined ? {} : { chatId: init.chatId }),
        ...(init?.modelName === undefined ? {} : { modelName: init.modelName }),
      };
      return call(path, 'GET', buildUrl(baseUrl, path, params, init?.query), undefined, init ?? {});
    },
  };
}
