import { describe, expect, test, vi } from 'vitest';
import { NearError, NEAR_PATHS, createNearClient } from '@/lib/near-ai/client';
import type { NearClientConfig } from '@/lib/near-ai/client';

/**
 * Unit tests for the NEAR AI Cloud client (**F-03**), with fetch mocked.
 *
 * What this file is really protecting, in order:
 *  1. A caller cannot steer a request anywhere (paths are a closed union; base URLs are
 *     validated per mode) — AGENTS.md §4 rule 9.
 *  2. The bytes needed for ADR-19 survive the call: `sentBody` is exactly what went out and
 *     `rawText` is exactly what came back, newlines included.
 *  3. The retry is *one*, on transport trouble only, and never on something that was already
 *     answered for (rule 6: a verification-shaped failure must not be papered over by trying
 *     again until it passes).
 *  4. Nothing document-derived reaches an error object or a log (rule 7) — the sentinel tests
 *     below would fail loudly if a body were ever embedded in a thrown error.
 *
 * Deliberately not tested here: real endpoint behaviour. That is B-05 (no key yet), and
 * `docs/SPIKE_RESULTS.md` §1/§3/§5 is what the shapes come from.
 */

const RELAY_BASE = '/api/relay/v1';
const DIRECT_BASE = 'https://cloud-api.near.ai/v1';

/** Text that stands in for a user's document. If it ever appears in a thrown error, rule 7 is broken. */
const DOC_SENTINEL = 'Diagnosis: metastatic carcinoma';
const RESPONSE_SENTINEL = 'Your doctor wrote that the scan shows spread';

interface Call {
  url: string;
  init?: RequestInit;
}

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

/** A fetch double: records every call, then plays the queued responses (a queue item may be a Response or a throw). */
function mockFetch(script: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = script.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('mock fetch ran out of scripted responses');
    return next;
  });
  return { calls, impl: impl as unknown as typeof fetch };
}

function client(config: Partial<NearClientConfig> & { mode: NearClientConfig['mode']; baseUrl: string; fetchImpl: typeof fetch }) {
  return createNearClient({ retryDelayMs: 1, ...config });
}

describe('paths are a closed set (AGENTS.md §4 rule 9)', () => {
  test('the union is exactly the four endpoints SPIKE_RESULTS records, and /v1/models is not one of them', () => {
    expect(NEAR_PATHS).toEqual(['chat/completions', 'attestation/report', 'signature/{chat_id}', 'model/{model_name}']);
    expect(NEAR_PATHS).not.toContain('models');
  });

  test('a model id with a slash stays inside one path segment', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ metadata: {} })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await c.get('model/{model_name}', { modelName: 'Qwen/Qwen3-VL-30B-A3B-Instruct' });
    expect(calls[0]!.url).toBe(`${RELAY_BASE}/model/Qwen%2FQwen3-VL-30B-A3B-Instruct`);
  });

  test('a chat id is encoded, so it cannot add a segment, a query or a fragment', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ text: 'x' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await c.get('signature/{chat_id}', { chatId: '../admin?x=1#y' });
    expect(calls[0]!.url).toBe(`${RELAY_BASE}/signature/..%2Fadmin%3Fx%3D1%23y`);
  });

  test('an empty path parameter is refused instead of requesting a dangling path', async () => {
    const { calls, impl } = mockFetch([]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.get('signature/{chat_id}', { chatId: '   ' })).rejects.toThrow(NearError);
    expect(calls).toHaveLength(0);
  });

  test('query parameters are assembled and encoded, including the nonce', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ gateway_attestation: {} })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await c.get('attestation/report', { query: { model: 'Qwen/Model', nonce: 'a'.repeat(64), signing_algo: 'ed25519' } });
    const url = new URL(calls[0]!.url, 'http://localhost');
    expect(url.searchParams.get('model')).toBe('Qwen/Model');
    expect(url.searchParams.get('nonce')).toBe('a'.repeat(64));
    expect(url.searchParams.get('signing_algo')).toBe('ed25519');
  });

  test('a baseUrl cannot smuggle a host into relay mode', () => {
    expect(() => createNearClient({ mode: 'relay', baseUrl: 'https://evil.example/api/relay/v1' })).toThrow(/own origin/);
    expect(() => createNearClient({ mode: 'relay', baseUrl: '/api/relay/v1/../../other' })).toThrow(/own origin/);
    expect(() => createNearClient({ mode: 'relay', baseUrl: '/api/other' })).toThrow(/own origin/);
  });

  test('direct mode is pinned to the host the CSP allows and to https', () => {
    expect(() => createNearClient({ mode: 'direct', baseUrl: 'http://cloud-api.near.ai/v1', headers: () => ({}) })).toThrow(/https/);
    expect(() => createNearClient({ mode: 'direct', baseUrl: 'https://someone-elses-proxy.ai/v1', headers: () => ({}) })).toThrow(/connect-src/);
    expect(() => createNearClient({ mode: 'direct', baseUrl: DIRECT_BASE })).toThrow(/header provider/);
    expect(() => createNearClient({ mode: 'direct', baseUrl: DIRECT_BASE, headers: () => ({}) })).not.toThrow();
  });

  test('fixture mode refuses to build a network client (F-09 answers it in replay.ts)', () => {
    // F-09 exists now, and this factory is still the wrong door for Mode F: exactly one place
    // in the codebase may open a socket, and that place must never serve demo data.
    const m = mockFetch([]);
    try {
      createNearClient({ mode: 'fixtures', baseUrl: RELAY_BASE, fetchImpl: m.impl });
      throw new Error('returned a client instead of refusing');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toMatch(/createFixtureClient/);
    }
    expect(m.calls).toHaveLength(0);
  });
});

describe('the bytes ADR-19 hashes are the bytes that were sent and received', () => {
  test('post returns the exact request body it put on the wire', async () => {
    const body = { model: 'Qwen/Model', messages: [{ role: 'user', content: DOC_SENTINEL }] };
    const { calls, impl } = mockFetch([jsonResponse({ id: 'chat-1', choices: [] })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });

    const res = await c.post('chat/completions', body);
    expect(res.sentBody).toBe(JSON.stringify(body));
    expect(calls[0]!.init?.body).toBe(res.sentBody);
    expect(calls[0]!.init?.method).toBe('POST');
    expect((calls[0]!.init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  test('response text is returned un-trimmed, because a streaming body ends with two newlines', async () => {
    const raw = '{"id":"chat-2","choices":[]}\n\n';
    const { impl } = mockFetch([new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });

    const res = await c.post('chat/completions', { messages: [] });
    expect(res.rawText).toBe(raw);
    expect(res.json).toEqual({ id: 'chat-2', choices: [] });
  });

  test('a body that does not serialise is refused rather than posted empty', async () => {
    const { calls, impl } = mockFetch([]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', undefined)).rejects.toThrow(NearError);
    expect(calls).toHaveLength(0);
  });

  test('a GET carries no body and reports the status it got', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ text: 'x', signature: 'y' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const res = await c.get('signature/{chat_id}', { chatId: 'chat-1' });
    expect(res.status).toBe(200);
    expect(res.sentBody).toBeUndefined();
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(calls[0]!.init?.method).toBe('GET');
  });
});

describe('one retry, on transient failures only (fail closed, rule 6)', () => {
  test('a transport failure is retried once and then succeeds', async () => {
    const { calls, impl } = mockFetch([new TypeError('fetch failed'), jsonResponse({ id: 'chat-3' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const res = await c.post('chat/completions', { messages: [] });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('two transport failures stop with network_lost — the retry is one, not a loop', async () => {
    const { calls, impl } = mockFetch([new TypeError('fetch failed'), new TypeError('fetch failed')]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({
      error: { code: 'network_lost' },
    });
    expect(calls).toHaveLength(2);
  });

  test('a 429 is retried once and a persistent one reports the rate limit', async () => {
    const { calls, impl } = mockFetch([
      jsonResponse({ error: 'slow down' }, { status: 429, headers: { 'retry-after': '0' } }),
      jsonResponse({ error: 'slow down' }, { status: 429 }),
    ]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({
      error: { code: 'rate_limited' },
      status: 429,
    });
    expect(calls).toHaveLength(2);
  });

  test('a 5xx on a completion says the model is unavailable, after one retry', async () => {
    const { calls, impl } = mockFetch([jsonResponse({}, { status: 503 }), jsonResponse({}, { status: 503 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({
      error: { code: 'model_unavailable' },
      status: 503,
    });
    expect(calls).toHaveLength(2);
  });

  test('a 200 whose body is not JSON is never retried — the second completion would be different bytes', async () => {
    const { calls, impl } = mockFetch([new Response('<html>not json</html>', { status: 200 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({
      error: { code: 'invalid_model_output' },
    });
    expect(calls).toHaveLength(1);
  });

  test('a 400 is a real rejection, not something to try again', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ error: 'bad request' }, { status: 400 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(1);
  });

  test('a 404 on a signature lookup is retried once, because the cache is per-node (ADR-19)', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ error: 'Chat id not found or expired' }, { status: 404 }), jsonResponse({ text: 'x' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const res = await c.get('signature/{chat_id}', { chatId: 'chat-9' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  test('a 404 on a completion is not transient — the model is not there', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ error: 'not found' }, { status: 404 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).rejects.toMatchObject({
      error: { code: 'model_unavailable' },
      status: 404,
    });
    expect(calls).toHaveLength(1);
  });

  test('a non-numeric Retry-After does not turn into a zero-length or negative wait', async () => {
    const { calls, impl } = mockFetch([
      jsonResponse({}, { status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } }),
      jsonResponse({ ok: true }),
    ]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await expect(c.post('chat/completions', { messages: [] })).resolves.toMatchObject({ status: 200 });
    expect(calls).toHaveLength(2);
  });
});

describe('abort is the user stopping, not a network failure', () => {
  test('an already-aborted signal sends nothing', async () => {
    const { calls, impl } = mockFetch([]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const controller = new AbortController();
    controller.abort();
    await expect(c.post('chat/completions', { messages: [] }, { signal: controller.signal })).rejects.toMatchObject({
      error: { code: 'aborted' },
    });
    expect(calls).toHaveLength(0);
  });

  test('a fetch rejection after abort is reported as aborted, not as a lost connection', async () => {
    const controller = new AbortController();
    const { impl } = mockFetch([Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const promise = c.post('chat/completions', { messages: [] }, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ error: { code: 'aborted' } });
  });

  test('cancelling while waiting for the retry stops the retry', async () => {
    const controller = new AbortController();
    const { impl } = mockFetch([new TypeError('fetch failed'), jsonResponse({ id: 'late' })]);
    const c = createNearClient({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl, retryDelayMs: 50 });
    const promise = c.post('chat/completions', { messages: [] }, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ error: { code: 'aborted' } });
  });
});

describe('one code path, three modes (ARCH §4)', () => {
  test('relay mode sends no authorization header of its own — the server holds the key', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ id: 'c' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await c.post('chat/completions', { messages: [] });
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(calls[0]!.url).toBe(`${RELAY_BASE}/chat/completions`);
  });

  test('direct mode asks the provider per call, so a key pasted in Settings takes effect without rebuilding', async () => {
    const provider = vi.fn(() => Promise.resolve({ authorization: 'Bearer from-user-key' }));
    const { calls, impl } = mockFetch([jsonResponse({ id: 'c1' }), jsonResponse({ id: 'c2' })]);
    const c = createNearClient({ mode: 'direct', baseUrl: DIRECT_BASE, headers: provider, fetchImpl: impl, retryDelayMs: 1 });

    await c.post('chat/completions', { messages: [] });
    await c.get('attestation/report', { query: { nonce: 'b'.repeat(64) } });

    expect(provider).toHaveBeenCalledTimes(2);
    expect((calls[0]!.init?.headers as Record<string, string>).authorization).toBe('Bearer from-user-key');
    expect(calls[1]!.url.startsWith(`${DIRECT_BASE}/attestation/report?nonce=`)).toBe(true);
  });

  test('the accept header is on every request, so a gateway that returns HTML for browsers still fails as invalid output', async () => {
    const { calls, impl } = mockFetch([jsonResponse({ id: 'c' }), jsonResponse({ text: 'x' })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    await c.post('chat/completions', { messages: [] });
    await c.get('signature/{chat_id}', { chatId: 'c' });
    expect((calls[0]!.init?.headers as Record<string, string>).accept).toBe('application/json');
    expect((calls[1]!.init?.headers as Record<string, string>).accept).toBe('application/json');
  });
});

describe('nothing document-derived in a failure (AGENTS.md §4 rule 7)', () => {
  /** Everything a thrown error could leak through: message, name, the AppError, and a full serialisation. */
  function surfacesOf(e: unknown): string {
    if (!(e instanceof NearError)) throw new Error(`expected a NearError, got ${String(e)}`);
    return [e.message, e.name, e.error.userMessage, e.error.code, JSON.stringify({ ...e })].join(' | ');
  }

  test('a rejected completion body does not appear in the error', async () => {
    const { impl } = mockFetch([
      jsonResponse({ error: { message: RESPONSE_SENTINEL } }, { status: 500 }),
      jsonResponse({ error: { message: RESPONSE_SENTINEL } }, { status: 500 }),
    ]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const thrown = await c.post('chat/completions', { messages: [{ content: DOC_SENTINEL }] }).catch((e) => e);
    expect(surfacesOf(thrown)).not.toContain(RESPONSE_SENTINEL);
    expect(surfacesOf(thrown)).not.toContain(DOC_SENTINEL);
  });

  test('an unreadable 200 body does not appear in the error', async () => {
    const { impl } = mockFetch([new Response(RESPONSE_SENTINEL, { status: 200 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const thrown = await c.post('chat/completions', { messages: [{ content: DOC_SENTINEL }] }).catch((e) => e);
    expect(surfacesOf(thrown)).not.toContain(RESPONSE_SENTINEL);
    expect(surfacesOf(thrown)).not.toContain(DOC_SENTINEL);
  });

  test('the error message carries the path and the status, which is all a log is allowed to hold', async () => {
    const { impl } = mockFetch([jsonResponse({}, { status: 403 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const thrown = await c.post('chat/completions', { messages: [] }).catch((e) => e);
    expect((thrown as NearError).message).toBe('NEAR AI call failed on chat/completions (HTTP 403)');
  });

  test('no user message in this file asserts a data-flow guarantee (rule 1 lives in claims.ts)', async () => {
    const { impl } = mockFetch([jsonResponse({}, { status: 502 })]);
    const c = client({ mode: 'relay', baseUrl: RELAY_BASE, fetchImpl: impl });
    const thrown = await c.post('chat/completions', { messages: [] }).catch((e) => e);
    expect(surfacesOf(thrown)).not.toMatch(/encrypted|only the enclave|nothing was sent|not stored/i);
  });
});
