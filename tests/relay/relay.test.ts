import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as relayGet, POST as relayPost } from '@/app/api/relay/[...path]/route';
import { handleRelay, type RelayDeps } from '@/lib/server/relay';
import { MAX_BODY_BYTES, statusFor, type Rejection } from '@/lib/server/allowlist';
import { createInMemoryStore } from '@/lib/server/rateLimit';
import type { ServerConfig } from '@/lib/server/env';

/**
 * The Mode B relay as an HTTP surface (**F-05**, and the four things **A-09** names: a rejected path,
 * an oversized body, the rate limit, and no content in the logs).
 *
 * The scaffold's version of this file proved the route answered 501 and forwarded nothing, because a
 * relay that reached upstream before its allowlist existed would be an open proxy holding our demo
 * key. F-05 replaced the stub, so the property those tests held is now held a different way: **a fetch
 * double counts every call**, and every refusal test asserts the count stayed at zero. "Forwards
 * nothing" is still the claim; it is just checked on a relay that can forward.
 *
 * The handler is driven through `handleRelay` with its collaborators injected — config, key, clock,
 * store, fetch — so nothing here touches the service. The first block is the exception: it calls the
 * **route exports**, which read the real `process.env`, and that is the point. With no key configured
 * the route must refuse before it could reach anything, which is what an operator who deploys this
 * without a `.env` gets.
 */

/** The status each A-09 refusal must arrive at, straight from the module that decides it. */
const STATUS: Record<string, number> = {
  path_not_allowed: statusFor('path_not_allowed' satisfies Rejection),
  method_not_allowed: statusFor('method_not_allowed' satisfies Rejection),
  query_not_allowed: statusFor('query_not_allowed' satisfies Rejection),
};

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

const CONFIG: ServerConfig = {
  relayEnabled: true,
  relayDisabledReason: null,
  allowedModels: ['z-ai/glm-5.3-flash', 'Qwen/Qwen3.8-27B'],
  // High enough that a test which is not about the bucket cannot run it dry; the rate-limit tests
  // below pass their own limit and their own store.
  rateLimitPerIpPerHour: 1000,
  // Likewise high: the global bucket is a second limit and a test about something else must not fill it.
  rateLimitGlobalPerHour: 10_000,
  hasSharedStore: true,
  hasApiKey: true,
};

const DEPS = { config: CONFIG, apiKey: 'test-key-never-printed', nowMs: 1_770_000_000_000 };

/** A catalog row that passes every branch of `isAllowed` — the shape the live endpoint returns. */
function teeRow(modelId: string) {
  return {
    modelId,
    metadata: {
      attestationSupported: true,
      verifiable: true,
      isReady: true,
      providerType: 'vllm',
      architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      contextLength: 131_072,
      maxOutputLength: 8_192,
    },
  };
}

interface Call {
  url: string;
  method?: string;
  headers: Headers;
  /** The exact bytes handed to fetch, if any — the thing ADR-19 depends on. */
  bodyBytes?: Uint8Array;
}

/**
 * A fetch double that records everything it was asked to do.
 *
 * `reply` sees the recorded call and answers it; the default answer for a model metadata GET is a
 * passing catalog row, because most tests in this file are not about the TEE check and should not have
 * to stage it.
 */
function recorder(reply?: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const impl = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const headers = new Headers((init?.headers ?? {}) as Record<string, string>);
    const raw = init?.body;
    const bodyBytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw instanceof Uint8Array ? raw : undefined;
    const call: Call = { url, method: init?.method, headers, ...(bodyBytes === undefined ? {} : { bodyBytes }) };
    calls.push(call);

    const answered = reply?.(call);
    if (answered !== undefined) return Promise.resolve(answered);
    // A model-metadata GET gets a passing row unless the test answers it itself, because most of
    // this file is about the other rules and should not have to stage rule 3 to test them.
    if (call.method === 'GET' && url.includes('/v1/model/')) {
      const modelId = decodeURIComponent(url.split('/v1/model/')[1]!.split('?')[0]!);
      return Promise.resolve(Response.json(teeRow(modelId)));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;

  return { impl, calls };
}

/**
 * A double that answers everything except a model-metadata GET, which keeps answering itself with a
 * passing row. Most tests here are about the size cap, the bucket or the headers; making them stage
 * rule 3 by hand would only be a second way to get it wrong.
 */
function completionsOnly(make: (call: Call) => Response): (call: Call) => Response | undefined {
  return (call) => (call.url.includes('/v1/model/') ? undefined : make(call));
}

function relay(path: string, init?: { method?: string; body?: string; headers?: Record<string, string>; deps?: Partial<RelayDeps> }): Promise<Response> {
  const request = new Request(`http://localhost:3000${path}`, {
    method: init?.method ?? (path.includes('chat/completions') ? 'POST' : 'GET'),
    ...(init?.body === undefined ? {} : { body: init.body }),
    // A browser request, which is what the relay is for: `Origin` and `Host` are always present on a
    // POST, and `isAllowedOrigin` now requires them (`llowlist.ts`). A test that wants a non-browser
    // caller passes its own headers and is refused — see "refuses a POST that carries no Origin".
    headers: { origin: 'http://localhost:3000', host: 'localhost:3000', ...init?.headers },
  });
  return handleRelay(request, { ...DEPS, ...init?.deps });
}

function completionBody(model = 'z-ai/glm-5.3-flash'): string {
  return JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'Read the document.' },
      { role: 'user', content: 'How many lines are in this letter?' },
    ],
    max_tokens: 8192,
  });
}

describe('the route as an operator meets it, with no key configured', () => {
  it('refuses a relay nobody enabled, at 503, and names why', async () => {
    const response = await relayPost(new Request('http://localhost:3000/api/relay/v1/chat/completions', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe('relay_disabled');
    expect(body.relay_enabled).toBe(false);
    expect(body.reason).toBe('not_requested');
  });

  it('reports the operator-visible reason the relay is unavailable, and never a key', async () => {
    process.env.RELAY_ENABLED = 'true';
    delete process.env.NEAR_AI_API_KEY;
    const response = await relayGet(new Request('http://localhost:3000/api/relay/v1/attestation/report?model=x&nonce=yy', { method: 'GET' }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.relay_enabled).toBe(false);
    expect(body.reason).toBe('no_key');
    // Only booleans, codes and counts leave this route (AGENTS.md §4 rule 7).
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|NEAR_AI/i);
  });

  it('says nothing that claims a document was protected', async () => {
    const request = new Request('http://localhost:3000/api/relay/v1/chat/completions', { method: 'POST', body: '{}' });
    const text = await relayPost(request).then((r) => r.text());
    expect(text.toLowerCase()).not.toMatch(/encrypt|secure|private|anonymi[sz]ed/);
  });
});

describe('A-09: a rejected path', () => {
  /**
   * The whole point of the allowlist is that these requests get **nothing** back from the service.
   * Each case therefore carries its own fetch double and asserts it was never called; a test that only
   * checked the status would still pass if the handler refused *after* forwarding.
   */
  const cases: { name: string; path: string; method: string; error: string }[] = [
    { name: 'the public model list', path: '/api/relay/v1/models', method: 'GET', error: 'path_not_allowed' },
    { name: 'the bulk catalog endpoint', path: '/api/relay/v1/model/list', method: 'GET', error: 'path_not_allowed' },
    { name: 'a completion by GET', path: '/api/relay/v1/chat/completions', method: 'GET', error: 'method_not_allowed' },
    { name: 'an attestation report by POST', path: '/api/relay/v1/attestation/report', method: 'POST', error: 'method_not_allowed' },
    { name: 'a path with a segment too many', path: '/api/relay/v1/signature/a/b', method: 'GET', error: 'path_not_allowed' },
    { name: 'a traversal back out of the prefix', path: '/api/relay/v1/../../admin', method: 'GET', error: 'path_not_allowed' },
    { name: 'a query key the path does not use', path: '/api/relay/v1/attestation/report?model=x&api_key=sk-1', method: 'GET', error: 'query_not_allowed' },
    { name: 'the bulk catalog spelled as a model name', path: '/api/relay/v1/model/list', method: 'GET', error: 'path_not_allowed' },
    { name: 'a completion sent somewhere else', path: '/api/relay/v1/chat/completio?s=x', method: 'POST', error: 'path_not_allowed' },
  ];

  it.each(cases)('$name — refused with $error and never forwarded', async ({ path, method, error }) => {
    const { impl, calls } = recorder();
    const response = await relay(path, { method, deps: { fetchImpl: impl } });
    expect(response.status, error).toBe(STATUS[error]);
    expect((await response.json()).error).toBe(error);
    expect(calls, 'the relay forwarded a request it had just refused').toEqual([]);
  });

  it('echoes nothing of the refused path back to the caller', async () => {
    const { impl } = recorder();
    const response = await relay('/api/relay/v1/signature/secret-chat-id', { deps: { fetchImpl: impl } });
    expect(await response.text()).not.toContain('secret-chat-id');
  });
});

describe('A-09: an oversized body', () => {
  it('refuses one byte over the cap and sends nothing upstream', async () => {
    const { impl, calls } = recorder();
    const pad = 'a'.repeat(MAX_BODY_BYTES);
    const body = `{"model":"z-ai/glm-5.3-flash","messages":[],"pad":"${pad}x"}`;
    const bytes = new TextEncoder().encode(body).length;
    expect(bytes).toBeGreaterThan(MAX_BODY_BYTES);
    const response = await relay('/api/relay/v1/chat/completions', { body, deps: { fetchImpl: impl } });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe('body_too_large');
    expect(calls).toEqual([]);
  });

  it('measures bytes, not characters, so a multi-byte body cannot talk its way past the cap', async () => {
    const { impl, calls } = recorder();
    const pad = 'é'.repeat(2_100_000); // 4,200,000 bytes for 2,100,000 characters
    const body = JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: [], pad, filler: 'a'.repeat(MAX_BODY_BYTES - 4_000_000) });
    expect(body.length).toBeLessThan(MAX_BODY_BYTES);
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(MAX_BODY_BYTES);
    const response = await relay('/api/relay/v1/chat/completions', { body, deps: { fetchImpl: impl } });
    expect(response.status).toBe(413);
    expect(calls).toEqual([]);
  });

  it('lets a body the size it was designed for through to the next check', async () => {
    // 726,910 bytes was the measured five-page body (SPIKE_RESULTS §9); one page per request is far inside.
    const { impl } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-1', choices: [] })));
    const pad = 'a'.repeat(700_000);
    const response = await relay('/api/relay/v1/chat/completions', { body: `{"model":"z-ai/glm-5.3-flash","messages":[],"pad":"${pad}"}`, deps: { fetchImpl: impl } });
    expect(response.status).not.toBe(413);
  });
});

describe('cross-site & origin validation (pre-launch hardening)', () => {
  it('refuses cross-site browser requests at 403', async () => {
    const { impl, calls } = recorder();
    const res = await relay('/api/relay/v1/chat/completions', {
      body: completionBody(),
      headers: { 'sec-fetch-site': 'cross-site' },
      deps: { fetchImpl: impl },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origin_not_allowed');
    expect(calls).toHaveLength(0);
  });

  it('refuses mismatching origin at 403', async () => {
    const { impl, calls } = recorder();
    const res = await relay('/api/relay/v1/chat/completions', {
      body: completionBody(),
      headers: { origin: 'https://attacker.site', host: 'localhost:3000' },
      deps: { fetchImpl: impl },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origin_not_allowed');
    expect(calls).toHaveLength(0);
  });

  it('refuses a POST that carries no Origin at all', async () => {
    // This is the shape a `curl` had: no `Origin`, no `Sec-Fetch-Site`, nothing a browser would omit.
    // Measured against the deployment, it used to reach the model check and only stop there.
    const { impl, calls } = recorder();
    const response = await handleRelay(
      new Request('http://localhost:3000/api/relay/v1/chat/completions', { method: 'POST', body: completionBody() }),
      { ...DEPS, fetchImpl: impl },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('origin_not_allowed');
    expect(calls).toHaveLength(0);
  });

  it('still forwards a report to a caller with no Origin, because a read is not a spend', async () => {
    const { impl, calls } = recorder();
    const response = await handleRelay(
      new Request('http://localhost:3000/api/relay/v1/attestation/report?model=z-ai%2Fglm-5.3-flash&nonce=ab12&signing_algo=ed25519'),
      { ...DEPS, fetchImpl: impl },
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe('A-09: the rate limit', () => {
  it('refuses the request after the hour’s budget is gone, with a Retry-After', async () => {
    const store = createInMemoryStore();
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-1', choices: [] })));
    const deps = { fetchImpl: impl, rateStore: store, config: { ...CONFIG, rateLimitPerIpPerHour: 3 } };

    for (let i = 0; i < 3; i += 1) {
      const ok = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps });
      expect(ok.status, `call ${i + 1}`).toBe(200);
    }
    const refused = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps });
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe('rate_limited');
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(calls.length, 'the refused call still reached the service').toBe(3);
  });

  it('counts per client, so one person’s budget is not another’s', async () => {
    const store = createInMemoryStore();
    const { impl } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-1', choices: [] })));
    const deps = { fetchImpl: impl, rateStore: store, config: { ...CONFIG, rateLimitPerIpPerHour: 1 } };
    const first = { 'x-forwarded-for': '203.0.113.7' };
    const second = { 'x-forwarded-for': '198.51.100.4' };
    expect((await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: first, deps })).status).toBe(200);
    expect((await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: first, deps })).status).toBe(429);
    expect((await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: second, deps })).status).toBe(200);
  });

  it('names the bucket without naming the client', async () => {
    const store = createInMemoryStore();
    const { impl } = recorder();
    const deps = { fetchImpl: impl, rateStore: store, config: { ...CONFIG, rateLimitPerIpPerHour: 1 } };
    await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: { 'x-forwarded-for': '203.0.113.99' }, deps });
    const refused = await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: { 'x-forwarded-for': '203.0.113.99' }, deps });
    expect(await refused.text()).not.toContain('203.0.113.99');
  });

  it('refuses a reply budget the app would never ask for, before any call is made', async () => {
    const { impl, calls } = recorder();
    const body = JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1_048_576 });
    const response = await relay('/api/relay/v1/chat/completions', { body, deps: { fetchImpl: impl } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('max_tokens_too_high');
    expect(calls).toHaveLength(0);
  });

  it('refuses once the process-wide budget is gone, whatever address the caller uses', async () => {
    // The per-IP bucket bounds one address; this bounds address rotation, which is the only way the
    // per-IP number could be spent without limit.
    const store = createInMemoryStore();
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'x' })));
    const deps = { fetchImpl: impl, rateStore: store, config: { ...CONFIG, rateLimitGlobalPerHour: 2 } };
    expect((await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: { 'x-real-ip': '203.0.113.1' }, deps })).status).toBe(200);
    expect((await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: { 'x-real-ip': '203.0.113.2' }, deps })).status).toBe(200);
    const refused = await relay('/api/relay/v1/chat/completions', { body: completionBody(), headers: { 'x-real-ip': '203.0.113.3' }, deps });
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe('global_rate_limited');
    expect(calls.length).toBe(2);
  });

  it('spends a unit on every relayed call, which is what bounds one client’s load on the key', async () => {
    // The arithmetic a reader needs to size the number: one attested run is a report fetch, a
    // completion, a signature fetch (plus the client's one retry on a transient 404), and a Q&A call.
    const store = createInMemoryStore();
    const { impl } = recorder(completionsOnly(() => Response.json({ id: 'x' })));
    const deps = { fetchImpl: impl, rateStore: store, config: { ...CONFIG, rateLimitPerIpPerHour: 2 } };
    await relay('/api/relay/v1/attestation/report?model=z-ai%2Fglm-5.3-flash&nonce=aa&signing_algo=ed25519', { deps });
    await relay('/api/relay/v1/signature/chatcmpl-1?model=z-ai%2Fglm-5.3-flash&signing_algo=ed25519', { deps });
    const third = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps });
    expect(third.status).toBe(429);
  });
});

describe('A-09: nothing document-derived leaves the relay', () => {
  it('logs nothing across a full forwarded exchange, in either direction', async () => {
    const documentSentinel = 'The diagnosis said';
    const replySentinel = 'Twelve lines, starting with a date.';
    const log = { log: vi.spyOn(console, 'log').mockImplementation(() => {}), error: vi.spyOn(console, 'error').mockImplementation(() => {}), warn: vi.spyOn(console, 'warn').mockImplementation(() => {}), info: vi.spyOn(console, 'info').mockImplementation(() => {}) };
    const { impl } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-9', choices: [{ message: { content: replySentinel } }] })));

    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps: { fetchImpl: impl } });
    expect(response.status).toBe(200);
    await response.text();

    const printed = [...log.log.mock.calls, ...log.error.mock.calls, ...log.warn.mock.calls, ...log.info.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join('\n');
    expect(printed).toBe('');
    expect(printed).not.toContain(documentSentinel);
    expect(printed).not.toContain(replySentinel);
  });

  it('does not put the prompt, the reply or the key in a refusal body', async () => {
    const { impl } = recorder(() => new Response('upstream said something long', { status: 500 }));
    const bodyWithDocument = JSON.stringify({ model: 'z-ai/glm-5.3-flash', messages: [{ role: 'user', content: 'The diagnosis said it is stage three' }] });
    const response = await relay('/api/relay/v1/chat/completions', { body: bodyWithDocument, deps: { fetchImpl: impl, config: { ...CONFIG, allowedModels: [] } } });
    const text = await response.text();
    expect(response.status).toBe(403);
    expect(text).not.toContain('diagnosis');
    expect(text).not.toContain('test-key-never-printed');
    expect(text).not.toContain('stage three');
  });

  it('does not put the key or the upstream body in a 502', async () => {
    const { impl } = recorder((call) => {
      if (call.url.includes('/v1/model/')) return Response.json(teeRow('z-ai/glm-5.3-flash'));
      // What undici actually says on a failed connect, URL and all — the thing the refusal must not echo.
      throw new TypeError("fetch failed: connect ECONNREFUSED https://cloud-api.near.ai/v1/chat/completions");
    });
    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps: { fetchImpl: impl } });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain('cloud-api');
    expect(text).not.toContain('test-key-never-printed');
    expect(text).not.toContain('glm');
  });
});

describe('what the relay does when it says yes', () => {
  it('forwards a completion to the fixed host, with the exact bytes it received', async () => {
    // ADR-19: `request_hash` is SHA-256 of the bytes that were actually sent. A relay that
    // re-serialised this body would produce a hash of bytes nobody sent, and the signature check
    // would then be verifying the wrong exchange — passing, and meaning nothing.
    const raw = '{"model":"z-ai/glm-5.3-flash",  "messages":[{"role":"user","content":"read this"}],"max_tokens":8192}';
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-1', choices: [] })));
    const response = await relay('/api/relay/v1/chat/completions', { body: raw, deps: { fetchImpl: impl } });
    expect(response.status).toBe(200);

    const completion = calls.find((call) => call.url.endsWith('/v1/chat/completions'));
    expect(completion?.url).toBe('https://cloud-api.near.ai/v1/chat/completions');
    expect(new TextDecoder().decode(completion?.bodyBytes)).toBe(raw);
    expect(JSON.parse(new TextDecoder().decode(completion?.bodyBytes)).max_tokens).toBe(8192);
  });

  it('adds its own key and copies none of the caller’s headers', async () => {
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-1' })));
    await relay('/api/relay/v1/chat/completions', {
      body: completionBody(),
      headers: { cookie: 'session=theirs', origin: 'http://localhost:3000', authorization: 'Bearer caller-owned-key', 'x-secret-thing': 'yes' },
      deps: { fetchImpl: impl },
    });
    const forwarded = calls.find((call) => call.url.endsWith('/v1/chat/completions'))!.headers;
    expect(forwarded.get('authorization')).toBe('Bearer test-key-never-printed');
    expect(forwarded.get('cookie')).toBeNull();
    expect(forwarded.get('origin')).toBeNull();
    expect(forwarded.get('x-secret-thing')).toBeNull();
    expect([...forwarded.keys()].sort()).toEqual(['accept', 'authorization', 'content-type']);
  });

  it('passes the upstream answer through with its status, its content type and its bytes', async () => {
    const upstreamBody = '{"id":"chatcmpl-2","choices":[{"message":{"content":"six lines"}}]}';
    const { impl } = recorder(completionsOnly(() => new Response(upstreamBody, { status: 201, headers: { 'content-type': 'application/json', 'x-upstream-whatever': 'ignored' } })));
    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps: { fetchImpl: impl } });
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-upstream-whatever')).toBeNull();
    expect(await response.text()).toBe(upstreamBody);
  });

  it('marks a document-derived answer as uncacheable', async () => {
    const { impl } = recorder(completionsOnly(() => Response.json({ id: 'chatcmpl-3', choices: [] })));
    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps: { fetchImpl: impl } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps a 429 a 429 and hands the Retry-After back to the client that honours it', async () => {
    const { impl } = recorder(completionsOnly(() => new Response('{}', { status: 429, headers: { 'retry-after': '3' } })));
    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody(), deps: { fetchImpl: impl } });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3');
  });

  it('forwards a report query and a signature path, and no body with either', async () => {
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'x' })));
    await relay('/api/relay/v1/attestation/report?model=z-ai%2Fglm-5.3-flash&nonce=ab12&signing_algo=ed25519', { deps: { fetchImpl: impl } });
    await relay('/api/relay/v1/signature/chatcmpl-7?model=z-ai%2Fglm-5.3-flash&signing_algo=ed25519', { deps: { fetchImpl: impl } });
    expect(calls.map((call) => call.url)).toEqual([
      'https://cloud-api.near.ai/v1/attestation/report?model=z-ai%2Fglm-5.3-flash&nonce=ab12&signing_algo=ed25519',
      'https://cloud-api.near.ai/v1/signature/chatcmpl-7?model=z-ai%2Fglm-5.3-flash&signing_algo=ed25519',
    ]);
    expect(calls.every((call) => call.bodyBytes === undefined)).toBe(true);
  });

  it('asks for one model’s metadata as one encoded segment, the way the client built it', async () => {
    const { impl, calls } = recorder(completionsOnly(() => Response.json({ id: 'x' })));
    await relay('/api/relay/v1/model/Qwen%2FQwen3.8-27B', { deps: { fetchImpl: impl } });
    expect(calls.map((call) => call.url)).toEqual(['https://cloud-api.near.ai/v1/model/Qwen%2FQwen3.8-27B']);
  });

  it('does not forward an empty body to a GET-only path, and does not accept a POST there', async () => {
    const { impl, calls } = recorder();
    const response = await relay('/api/relay/v1/model/z-ai%2Fglm-5.3-flash', { method: 'POST', body: '{}', deps: { fetchImpl: impl } });
    expect(response.status).toBe(405);
    expect(calls).toEqual([]);
  });
});

describe('rule 3 at the point where document bytes would leave', () => {
  it('refuses a model that is not on the operator’s list, without asking the catalog about it', async () => {
    const { impl, calls } = recorder();
    const response = await relay('/api/relay/v1/chat/completions', { body: completionBody('anthropic/claude-fable-5'), deps: { fetchImpl: impl } });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('model_not_allowed');
    expect(calls).toEqual([]);
  });

  it('refuses a listed model whose live metadata says it is forwarded somewhere that is not .near.ai', async () => {
    // `moonshotai/kimi-k2.6` is the measured case: attestationSupported true **and**
    // providerConfig.base_url = https://openrouter.ai/api/v1. The list alone would have waved it
    // through; this branch is why the relay reads the catalog rather than trusting the list.
    const proxied = {
      modelId: 'moonshotai/kimi-k2.6',
      metadata: {
        attestationSupported: true,
        verifiable: true,
        isReady: true,
        providerType: 'chutes',
        providerConfig: { backend: 'openai_compatible', base_url: 'https://openrouter.ai/api/v1' },
        architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      },
    };
    const { impl, calls } = recorder((call) => (call.url.includes('/v1/model/') ? Response.json(proxied) : undefined));
    const response = await relay('/api/relay/v1/chat/completions', {
      body: completionBody('moonshotai/kimi-k2.6'),
      deps: { fetchImpl: impl, config: { ...CONFIG, allowedModels: ['moonshotai/kimi-k2.6'] } },
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('model_not_allowed');
    expect(body.tee_reason).toBe('proxied_upstream');
    expect(calls.filter((call) => call.url.endsWith('/v1/chat/completions'))).toEqual([]);
  });

  it('refuses a model whose metadata it cannot read — an outage is not a pass', async () => {
    const { impl, calls } = recorder((call) => (call.url.includes('/v1/model/') ? new Response('{}', { status: 500 }) : undefined));
    const response = await relay('/api/relay/v1/chat/completions', {
      body: completionBody('deepseek-ai/DeepSeek-V4.1-Flash-1017'),
      deps: { fetchImpl: impl, config: { ...CONFIG, allowedModels: ['deepseek-ai/DeepSeek-V4.1-Flash-1017'] } },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).tee_reason).toBe('metadata_unavailable');
    expect(calls.filter((call) => call.url.endsWith('/v1/chat/completions'))).toEqual([]);
  });

  it('reads the catalog once per model and reuses the verdict for the rest of the run', async () => {
    // Five pages on one model, five completions, one catalog read — the cache is what keeps ADR-18's
    // per-model call from becoming a per-page tax on the run the person is waiting for.
    const model = 'test-runner/repeat-me';
    const { impl, calls } = recorder((call) => (call.url.endsWith('/v1/chat/completions') ? Response.json({ id: 'chatcmpl-3' }) : undefined));
    for (let page = 1; page <= 3; page += 1) {
      const response = await relay('/api/relay/v1/chat/completions', {
        body: completionBody(model),
        deps: { fetchImpl: impl, config: { ...CONFIG, allowedModels: [model] } },
      });
      expect(response.status, `page ${page}`).toBe(200);
    }
    expect(calls.filter((call) => call.url.includes('/v1/model/')).length).toBe(1);
    expect(calls.filter((call) => call.url.endsWith('/v1/chat/completions')).length).toBe(3);
  });

  it('refuses a body that names no model, a stream, or two pages — each before anything is sent', async () => {
    const cases: [string, object][] = [
      ['missing_model', { messages: [] }],
      ['streaming_not_supported', { model: 'z-ai/glm-5.3-flash', stream: true }],
      [
        'too_many_pages',
        {
          model: 'z-ai/glm-5.3-flash',
          messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:,a' } }, { type: 'image_url', image_url: { url: 'data:,b' } }] }],
        },
      ],
    ];
    for (const [error, body] of cases) {
      const { impl, calls } = recorder();
      const response = await relay('/api/relay/v1/chat/completions', { body: JSON.stringify(body), deps: { fetchImpl: impl } });
      expect(response.status, error).toBe(400);
      expect((await response.json()).error, error).toBe(error);
      expect(calls, `${error}: it forwarded anyway`).toEqual([]);
    }
  });

  it('refuses a body that is not JSON at all', async () => {
    const { impl, calls } = recorder();
    const response = await relay('/api/relay/v1/chat/completions', { body: 'not json', deps: { fetchImpl: impl } });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_json');
    expect(calls).toEqual([]);
  });
});
