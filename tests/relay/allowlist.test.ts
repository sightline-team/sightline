import { describe, expect, it } from 'vitest';
import {
  inspectCompletionBody,
  type BodyDecision,
  isAllowedOrigin,
  isModelAllowed,
  MAX_BODY_BYTES,
  MAX_COMPLETION_TOKENS,
  resolveRequest,
  statusFor,
  withinSizeCap,
} from '@/lib/server/allowlist';
import { clientIp, createInMemoryStore, createRestStore, rateLimit } from '@/lib/server/rateLimit';

/**
 * The relay's refusal logic on its own (**F-05**, **F-06**), before any handler is involved.
 *
 * This file is where the allowlist's *shape* is pinned: what counts as one of the four paths, what a
 * model id has to look like to get through, how big a body may be, and how the hour is counted. The
 * behaviour that only exists once they are wired together — nothing forwarded, headers not copied,
 * bytes preserved — is `tests/relay/relay.test.ts` (**A-09**).
 */

const BASE = 'http://localhost:3000';

function url(path: string): URL {
  return new URL(`${BASE}${path}`);
}

describe('the exact-path allowlist', () => {
  it('accepts the four resolved endpoints and nothing else', () => {
    const accepted = [
      ['/api/relay/v1/chat/completions', 'POST'],
      ['/api/relay/v1/attestation/report', 'GET'],
      ['/api/relay/v1/signature/chatcmpl-7?signing_algo=ed25519', 'GET'],
      ['/api/relay/v1/model/z-ai%2Fglm-5.3-flash', 'GET'],
    ] as const;
    for (const [path, method] of accepted) {
      const result = resolveRequest(url(path), method);
      expect(result.ok, `${path} ${method}`).toBe(true);
    }
  });

  /**
   * Every one of these is a request the relay must not make on somebody's behalf. `/v1/models` and
   * `/v1/model/list` are here because they are *real NEAR endpoints that work* — an allowlist that
   * only rejects nonsense has never been tested against the thing it exists to stop.
   */
  const refused: [string, string, 'path_not_allowed' | 'method_not_allowed' | 'query_not_allowed'][] = [
    ['/api/relay/v1/models', 'GET', 'path_not_allowed'],
    ['/api/relay/v1/model/list', 'GET', 'path_not_allowed'],
    ['/api/relay/v1/chat/completions', 'GET', 'method_not_allowed'],
    ['/api/relay/v1/attestation/report', 'POST', 'method_not_allowed'],
    ['/api/relay/v1/attestation/report?api_key=sk-secret', 'GET', 'query_not_allowed'],
    ['/api/relay/v1/attestation/report?model=x&callback=steal', 'GET', 'query_not_allowed'],
    ['/api/relay/v1/signature/chatcmpl-7?model=x&signing_algo=ed25519&nonce=deadbeef', 'GET', 'query_not_allowed'],
    ['/api/relay/v1/chat/completions/extra', 'POST', 'path_not_allowed'],
    ['/api/relay/v1/signature/a/b', 'GET', 'path_not_allowed'],
    ['/api/relay/v1/signature/', 'GET', 'path_not_allowed'],
    ['/api/relay/v1/model', 'GET', 'path_not_allowed'],
    ['/api/relay/v1', 'GET', 'path_not_allowed'],
    ['/api/relay/v1/anything/else', 'GET', 'path_not_allowed'],
    // `..` never reaches us as a path: `new URL` resolves it away, and the resolved path is not ours.
    ['/api/relay/v1/../../admin', 'GET', 'path_not_allowed'],
    ['/api/other/v1/chat/completions', 'POST', 'path_not_allowed'],
    ['/api/relay/chat/completions', 'POST', 'path_not_allowed'],
  ];
  it.each(refused)('refuses %s (%s) as %s', (path, method, reason) => {
    const result = resolveRequest(url(path), method);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('refuses a method that is neither GET nor POST before looking at the path', () => {
    const result = resolveRequest(url('/api/relay/v1/chat/completions'), 'DELETE');
    expect(!result.ok && result.reason).toBe('method_not_allowed');
  });

  it('keeps a percent-encoded model id inside one segment, both upstream and in the answer', () => {
    const result = resolveRequest(url('/api/relay/v1/model/Qwen%2FQwen3.8-27B'), 'GET');
    if (!result.ok) throw new Error('the encoded segment was refused');
    // The forwarded path is the arrived path. Decoding it here would put the slash back and turn one
    // approved segment into two unapproved steps (`lib/near-ai/client.ts`'s `encodeSegment` note).
    expect(result.request.upstreamPath).toBe('/v1/model/Qwen%2FQwen3.8-27B');
  });

  it('maps each refusal to the status the client is allowed to retry on', () => {
    // A 404 on a GET is the documented signature-cache transient and the client retries it; a refused
    // path must not wear that costume, or every probe costs two requests and a real 404 stops meaning
    // anything.
    expect(statusFor('path_not_allowed')).toBe(403);
    expect(statusFor('model_not_allowed')).toBe(403);
    expect(statusFor('rate_limited')).toBe(429);
    expect(statusFor('body_too_large')).toBe(413);
  });
});

describe('the size cap', () => {
  it('takes exactly MAX_BODY_BYTES and refuses one byte more', () => {
    expect(withinSizeCap(MAX_BODY_BYTES).allowed).toBe(true);
    expect(withinSizeCap(MAX_BODY_BYTES + 1).allowed).toBe(false);
    expect(withinSizeCap(MAX_BODY_BYTES + 1).reason).toBe('body_too_large');
  });

  it('is 8 MiB, which is measured headroom rather than a guess', () => {
    // SPIKE_RESULTS §9: a prepared five-page document is 726,910 bytes of body, one page per request.
    expect(MAX_BODY_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_BODY_BYTES / 726_910).toBeGreaterThan(11);
  });
});

describe('the model allowlist', () => {
  it('matches the full id exactly, case-sensitively', () => {
    const list = ['deepseek-ai/DeepSeek-V4.1-Flash-1017'];
    expect(isModelAllowed('deepseek-ai/DeepSeek-V4.1-Flash-1017', list).allowed).toBe(true);
    // The live catalog contains both of these ids, one attested and one proxied, differing only by
    // namespace and case. A normalised comparison would forward the proxied one.
    expect(isModelAllowed('deepseek/deepseek-v4.1-flash-1017', list).allowed).toBe(false);
    expect(isModelAllowed('DEEPSEEK-AI/DEEPSEEK-V4.1-FLASH-1017', list).allowed).toBe(false);
    expect(isModelAllowed('z-ai/glm-5.3-flash', []).reason).toBe('model_not_allowed');
  });
});

/** The union is deliberately narrow, so a test reads the refusal through this instead of `.reason`. */
function reasonOf(decision: BodyDecision): string {
  return decision.ok ? 'allowed' : decision.reason;
}

describe('what a completion body may ask for', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    model: 'z-ai/glm-5.3-flash',
    messages: [
      { role: 'system', content: 'You are a reader.' },
      { role: 'user', content: 'How many lines are in this letter?' },
    ],
    ...over,
  });

  it('reads the model out of a plain request', () => {
    const result = inspectCompletionBody(body());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe('z-ai/glm-5.3-flash');
  });

  it('refuses a body that is not a JSON object', () => {
    for (const value of ['a string', 42, null, ['array']]) {
      expect(inspectCompletionBody(value)).toEqual({ ok: false, reason: 'invalid_json' });
    }
  });

  it('refuses a request that names no model, because there is nothing to allowlist', () => {
    expect(inspectCompletionBody({ messages: [] })).toEqual({ ok: false, reason: 'missing_model' });
    expect(inspectCompletionBody(body({ model: '   ' }))).toEqual({ ok: false, reason: 'missing_model' });
  });

  it('refuses a stream, in whatever shape the caller asked for one (ADR-22)', () => {
    // A streamed completion is signed by the gateway rather than by the enclave serving the model, so
    // forwarding one hands the browser a receipt that says less than the product claims.
    expect(reasonOf(inspectCompletionBody(body({ stream: true })))).toBe('streaming_not_supported');
    expect(reasonOf(inspectCompletionBody(body({ stream: 1 })))).toBe('streaming_not_supported');
    expect(reasonOf(inspectCompletionBody(body({ stream: 'true' })))).toBe('streaming_not_supported');
    // `stream: false` and no `stream` at all are the same request, and both are fine.
    expect(inspectCompletionBody(body({ stream: false })).ok).toBe(true);
  });

  it('refuses more than one page in a single request (rule 9 in AGENTS.md §4)', () => {
    const image = (url: string) => ({ type: 'image_url', image_url: { url } });
    const onePage = { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'read it' }, image('data:image/jpeg;base64,AA')] }] };
    const twoPages = { model: 'm', messages: [{ role: 'user', content: [image('data:image/jpeg;base64,AA'), image('data:image/jpeg;base64,BB')] }] };
    expect(inspectCompletionBody(onePage).ok).toBe(true);
    expect(reasonOf(inspectCompletionBody(twoPages))).toBe('too_many_pages');
  });

  it('refuses a reply budget larger than the largest one this app sends', () => {
    // The app sends `STEP_PLANS`' 16,384. A hand-built body can ask for the model's whole ceiling —
    // glm advertises 1,048,576 output tokens — and one request would cost ~64× a real answer.
    expect(inspectCompletionBody(body({ max_tokens: MAX_COMPLETION_TOKENS })).ok).toBe(true);
    expect(reasonOf(inspectCompletionBody(body({ max_tokens: MAX_COMPLETION_TOKENS + 1 })))).toBe('max_tokens_too_high');
    expect(reasonOf(inspectCompletionBody(body({ max_completion_tokens: 1_048_576 })))).toBe('max_tokens_too_high');
    expect(reasonOf(inspectCompletionBody(body({ max_tokens: Number.POSITIVE_INFINITY })))).toBe('max_tokens_too_high');
    // Absent is not an error: the service's own default applies and it is below the ceiling.
    expect(inspectCompletionBody(body()).ok).toBe(true);
  });

  it('says nothing about the body it read', () => {
    const sentinel = 'The diagnosis said';
    const result = inspectCompletionBody({ model: 'm', messages: [{ role: 'user', content: `${sentinel} something terrible` }] });
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });
});

describe('the hourly bucket', () => {
  const HOUR = 3_600_000;

  it('lets `limit` requests through and refuses the next one', async () => {
    const store = createInMemoryStore();
    const now = 1_770_000_000_000;
    for (let i = 1; i <= 20; i += 1) {
      expect((await rateLimit('203.0.113.7', 20, store, now)).allowed, `call ${i}`).toBe(true);
    }
    const refused = await rateLimit('203.0.113.7', 20, store, now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it('counts each client separately and resets when the hour rolls', async () => {
    const store = createInMemoryStore();
    const now = 1_770_000_000_000;
    await rateLimit('203.0.113.7', 1, store, now);
    expect((await rateLimit('203.0.113.7', 1, store, now)).allowed).toBe(false);
    expect((await rateLimit('198.51.100.4', 1, store, now)).allowed).toBe(true);
    // The window is the clock hour, so a client that spent its budget at :59 gets a fresh one after
    // the roll — and the retry-after the relay hands back points at that moment.
    expect((await rateLimit('203.0.113.7', 1, store, now + HOUR)).allowed).toBe(true);
  });

  it('holds across two processes that share a store, and only then', async () => {
    // This is F-06's done-when in miniature. A real deployment's store is a hosted KV; what this test
    // proves is the property that makes one worth deploying: the count lives in the store, so two
    // independently constructed limiters pointed at the same store reach the limit together. Two
    // separate stores — which is what two serverless instances with an in-memory counter are — each
    // allow the full budget, which is exactly why `env.ts` keeps the relay off without a shared one.
    const shared = createInMemoryStore();
    expect((await rateLimit('203.0.113.7', 2, shared, 0)).allowed).toBe(true);
    expect((await rateLimit('203.0.113.7', 2, shared, 0)).allowed).toBe(true);
    expect((await rateLimit('203.0.113.7', 2, shared, 0)).allowed).toBe(false);

    const instanceA = createInMemoryStore();
    const instanceB = createInMemoryStore();
    expect((await rateLimit('203.0.113.7', 2, instanceA, 0)).allowed).toBe(true);
    expect((await rateLimit('203.0.113.7', 2, instanceB, 0)).allowed).toBe(true);
    expect((await rateLimit('203.0.113.7', 2, instanceA, 0)).allowed).toBe(true);
  });

  it('never puts the address in the bucket it reports', async () => {
    const result = await rateLimit('203.0.113.7', 20, createInMemoryStore(), 0);
    expect(result.bucket).not.toContain('203.0.113.7');
    expect(result.bucket).toMatch(/^hour:\d+\/[0-9a-f]{12}$/);
    // Two calls from the same client in the same window share a bucket; a different client does not.
    expect((await rateLimit('203.0.113.7', 20, createInMemoryStore(), 0)).bucket).toBe(result.bucket);
  });
});

describe('whose address is it', () => {
  it('reads the proxy header, preferring unforgeable x-real-ip over client-supplied x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('trusts the last hop of x-forwarded-for, not the entry the client wrote', () => {
    // A proxy *appends*, so the first entry is whatever the caller claimed. Reading it (as this used to)
    // let a caller pick their own bucket on any host that forwards the list verbatim.
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('70.41.3.18');
  });

  it('refuses a value that is not an address rather than hashing it', () => {
    // A malformed header can only put its sender in the shared bucket — never in somebody else's.
    expect(clientIp(new Headers({ 'x-forwarded-for': 'not-an-ip' }))).toBe('unproxied');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, garbage' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'x-real-ip': 'evil' }))).toBe('unproxied');
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.4:41234' }))).toBe('198.51.100.4');
  });

  it('says so plainly when nothing fronted the request', () => {
    // Local development has no proxy header. Sharing one bucket is the honest fallback: pretending to
    // invent an address would make the limit look enforced when it is not.
    expect(clientIp(new Headers())).toBe('unproxied');
  });
});

describe('origin validation for relay requests', () => {
  it('refuses a POST that carries no Origin, which no browser sends', () => {
    // Every browser sends `Origin` on a non-GET request. Requiring it is what stopped a headerless
    // `curl` from reaching the completion forwarder on the deployment (measured 2026-11-13).
    expect(isAllowedOrigin(new Headers(), 'POST')).toBe(false);
    expect(isAllowedOrigin(new Headers({ host: 'sightline.app' }), 'POST')).toBe(false);
    expect(isAllowedOrigin(new Headers({ origin: 'https://sightline.app', host: 'sightline.app' }), 'POST')).toBe(true);
    // The document-free reads stay reachable without it: a probe for a report is not a spend.
    expect(isAllowedOrigin(new Headers(), 'GET')).toBe(true);
  });

  it('refuses cross-site calls and origin mismatches', () => {
    expect(isAllowedOrigin(new Headers({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isAllowedOrigin(new Headers({ origin: 'https://evil.com', host: 'sightline.app' }))).toBe(false);
    expect(isAllowedOrigin(new Headers({ origin: 'https://sightline.app', host: 'sightline.app' }))).toBe(true);
    expect(isAllowedOrigin(new Headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isAllowedOrigin(new Headers())).toBe(true);
  });

  it('assigns 403 to origin_not_allowed', () => {
    expect(statusFor('origin_not_allowed')).toBe(403);
  });
});

/**
 * The shared counter `env.ts` has required in production since F-06 and nothing built.
 *
 * Before 2026-11-13 `rateLimit` always fell back to the module-level map, so the "shared store" was
 * per warm instance — the exact shape `env.ts:67` calls "no limit at all". This is driven against a
 * fetch double, because no live store is configured here: the wire shape asserted below is
 * Upstash's `["INCR", key]` / `["EXPIRE", key, seconds]` command form.
 */
describe('the shared counter over REST', () => {
  function double(answers: unknown[]) {
    const calls: unknown[][] = [];
    const impl = (async (_url: string, init?: { body?: string }) => {
      const args = JSON.parse(String(init?.body)) as unknown[];
      calls.push(args);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify({ result: answer }), { status: answer === 'fail' ? 500 : 200 });
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('counts with INCR and sets one expiry, so a window cannot live forever', async () => {
    const { impl, calls } = double([1, 1, 2]);
    const store = createRestStore({ url: 'https://kv.example', token: 't', fetchImpl: impl });
    expect(await store.increment('abcd', 29_000_000)).toBe(1);
    expect(await store.increment('abcd', 29_000_000)).toBe(2);
    expect(calls).toEqual([
      ['INCR', 'abcd:29000000'],
      ['EXPIRE', 'abcd:29000000', 3660],
      ['INCR', 'abcd:29000000'],
    ]);
  });

  it('treats an answer without a count as unavailable, not as zero', async () => {
    const store = createRestStore({ url: 'https://kv.example', fetchImpl: double(['fail']).impl });
    await expect(store.increment('k', 1)).rejects.toThrow();
  });
});
