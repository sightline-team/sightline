import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { NotBuilt } from '@/lib/not_built';
import { DIRECT_MODE_QA_UNAVAILABLE, DIRECT_MODE_UNAVAILABLE } from '@/app/_flow/refused_steps';
import { collaboratorsFor, modelFor } from '@/app/_flow/collaborators';
import { bindReport, createTrustSession, fetchReport, verifyWithServer } from '@/lib/near-ai/attestation';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { initialSession } from '@/lib/session/reducer';
import { checkSignature, createSignatureVerifier, sha256Hex } from '@/lib/near-ai/signatures';
import { decryptResponseContent, encryptRequest, E2EE_PROVEN_IN_BROWSER } from '@/lib/near-ai/e2ee';
import { CLAIM_COPY, FIXTURES_BANNER } from '@/features/trust/claims';
import type { Mode, Session } from '@/types';
import type { NearClient, NearResponse } from '@/lib/near-ai/client';

/**
 * Verification tests for the trust path.
 *
 * T-01 and T-02 now exist, so what they can be held to is what they can actually decide: byte
 * binding, key shapes, nonce freshness, and reading a refused verifier as a failure. What they
 * cannot decide stays listed below as `it.todo` rather than being faked into a pass — and since
 * 2026-11-05 the missing thing is not access: a key arrived (B-05 closed) and two live reports are
 * recorded (`fixtures/attestation/`, **T-08**, asserted in `attestation-fixtures.test.ts`). What is
 * missing is the verifier: the TDX quote and the NRAS verdict need **B-12**, and `/api/verify`
 * answering 501 is read as `failed`, never as silence.
 */

/** A refusal may be synchronous (a stub) or a rejected promise (a real async implementation). */
async function expectRefusal(fn: () => unknown, item: string): Promise<void> {
  let result: unknown;
  try {
    result = fn();
  } catch (error) {
    expect(error, `${item}: wrong error type`).toBeInstanceOf(NotBuilt);
    expect((error as NotBuilt).item).toBe(item);
    return;
  }
  if (result instanceof Promise) {
    await expect(result, `${item}: resolved instead of refusing`).rejects.toThrow(NotBuilt);
    return;
  }
  throw new Error(`${item}: returned a value instead of refusing — a stub that fakes a result is worse than one that throws`);
}

describe('trust-path stubs refuse rather than invent an answer', () => {
  // T-01 and T-02 left this list when they stopped being stubs. T-10 is still one, and must stay
  // a refusal: it needs `@noble/ciphers`, which is not approved (B-07).
  const cases: [string, () => unknown][] = [
    ['T-10', () => encryptRequest('{"a":1}', 'aa'.repeat(32))],
    ['T-10', () => decryptResponseContent('beef', new Uint8Array(32), 'aa'.repeat(32))],
  ];

  it.each(cases)('a call owned by %s throws NotBuilt naming that item', (_item, fn) => expectRefusal(fn, _item));

  it('names the item in the message, so a user-visible failure tells us where to go', () => {
    try {
      encryptRequest('{}', 'aa'.repeat(32));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('ROADMAP item T-10');
    }
  });
});

describe('the door that still refuses names something that is genuinely missing', () => {
  // Mode B left this file when `collaborators.ts` wired the real gate and verifier to the relay, so
  // what remains behind a door is Mode A: a direct call needs a key the app has nowhere to keep
  // (**T-13**). A stale refusal is worse than no refusal — it points the next reader at work that is
  // already finished and hides the work that would actually delete it — so the guard is the ledger
  // itself: an item the roadmap marks `[x]` may not be the stated reason a run stops (AGENTS.md §9).
  //
  // `collaboratorsFor` reads two fields of a session: `mode` chooses the transport, `id` chooses the
  // trust session. The reducer's own empty session is the smallest input that is a real one.
  const start = initialSession('relay');
  const sessionIn = (mode: Mode): Session => ({ ...start, mode });

  it('Mode A has no collaborators to hand out, and says which item owns the missing piece', () => {
    expect(() => collaboratorsFor(sessionIn('direct'))).toThrow(NotBuilt);
    try {
      collaboratorsFor(sessionIn('direct'));
      expect.unreachable();
    } catch (error) {
      expect((error as NotBuilt).item).toBe('T-13');
    }
  });

  it('names T-13, which ROADMAP.md does not claim is finished', () => {
    const ledger = readFileSync('ROADMAP.md', 'utf8');
    const done = /^- \[x\] \*\*T-13\*\*/m.test(ledger);
    expect(done, 'T-13 is [x] in ROADMAP.md — this refusal is now a lie about the build').toBe(false);
  });

  it('the two sentences a user hears do not claim the verification steps are missing', () => {
    // T-01, T-02, F-04 and F-05 are built; what is missing is a place to put a key. If the copy drifts
    // back to blaming verification, the receipt and the doorstop disagree about what this build can do.
    for (const message of [DIRECT_MODE_UNAVAILABLE.userMessage, DIRECT_MODE_QA_UNAVAILABLE.userMessage]) {
      expect(message).not.toMatch(/verif/i);
      expect(message).toMatch(/not built/);
      // A capability sentence, never a privacy one (rule 1): no enclave, encryption or secrecy claim.
      expect(message).not.toMatch(/enclave|encrypt|private|nothing was sent/i);
    }
  });

  it('Mode B is not behind a door: the same call returns a real gate and a relay transport', () => {
    const relay = collaboratorsFor(sessionIn('relay'));
    expect(relay.transport.mode).toBe('relay');
    expect(relay.transport.baseUrl).toBe('/api/relay/v1');
    // Not the throw, not a stub that answers `verified`: a function that would ask the relay for a
    // report. Calling it against a transport that cannot be reached proves it is the real gate.
    expect(typeof relay.gate).toBe('function');
    expect(typeof relay.verifySignature).toBe('function');
    expect(relay.gate.name).not.toBe('');
  });

  it('one Sightline session gets one trust session, and a new id gets a new one (rule 4)', () => {
    // The nonce is minted when `createTrustSession` is called, so the gate closure is the observable
    // proof of which trust session this run is talking to: same id and the object is identical, which
    // is what keeps a five-page document from attesting five times under five nonces.
    const first = collaboratorsFor(sessionIn('relay'));
    expect(collaboratorsFor(sessionIn('relay'))).toBe(first);
    // `forgotten` mints a new session id (P-10), so the next document cannot reuse this one's nonce or
    // the enclave key attested under it.
    const next = collaboratorsFor({ ...start, id: 'a-different-session' });
    expect(next).not.toBe(first);
    expect(next.gate).not.toBe(first.gate);
    expect(next.transport).not.toBe(first.transport);
  });

  it('Mode F gets a throwing guard rather than a check result it cannot earn', () => {
    const fixtures = collaboratorsFor(sessionIn('fixtures'));
    expect(() => fixtures.gate({ model: 'x', signal: new AbortController().signal })).toThrow(/no enclave/);
    expect(() =>
      fixtures.verifySignature({ chatId: 'c', model: 'x', sentBody: 'b', rawText: 'r', signal: new AbortController().signal }),
    ).toThrow(/no enclave/);
    // …and no Mode F path reaches them: the transport it is handed is the replay client, which refuses
    // every verification GET of its own (rule 11).
    expect(fixtures.transport.mode).toBe('fixtures');
  });
});

describe('which model a step asks, in which mode (ADR-24)', () => {
  // The name reaches the receipt, so a wrong row here is a wrong claim on screen rather than a
  // harmless lookup. Mode F is the case that matters: its replay client only has answers for
  // `FIXTURE_MODEL`, and a live model id passed to it fails the run instead of faking a result.
  it.each(['transcribe', 'analyse', 'qa'] as const)('%s asks its own plan’s model, and the demo model in Mode F', (purpose) => {
    expect(modelFor('relay', purpose)).toBe(STEP_PLANS[purpose].model);
    expect(modelFor('direct', purpose)).toBe(STEP_PLANS[purpose].model);
    expect(modelFor('fixtures', purpose)).toBe(FIXTURE_MODEL);
  });
});

describe('one session, two models: each enclave is attested for the step that asks it (T-01, ADR-24)', () => {
  // A photographed run is two models — `STEP_PLANS.transcribe` for the pages and `STEP_PLANS.analyse`
  // for the reading — and **T-08**'s recorded reports proved those are two machines with two signing
  // keys. A session that keeps one attestation outcome would answer the second step with the first
  // step's enclave (nothing checked for the model that received the transcript) and then verify its
  // signature against a key that cannot match, which reads as "the service signed nothing".
  const PAGE = 'z-ai/glm-5.3-flash';
  const READING = 'Qwen/Qwen3.8-27B';
  const PAGE_KEY = new Uint8Array(32).fill(11);
  const READING_KEY = new Uint8Array(32).fill(22);
  const REQUEST = '{"model":"x","messages":[]}';
  const RESPONSE = '{"id":"chat-1","choices":[]}\n\n';
  const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const pub = (key: Uint8Array) => hex(ed25519.getPublicKey(key));
  const keyOf = (model: string) => (model === READING ? READING_KEY : model === PAGE ? PAGE_KEY : undefined);
  const signedTextFor = (model: string) => `${model}:${sha256Hex(REQUEST)}:${sha256Hex(RESPONSE)}`;
  const signal = new AbortController().signal;

  /**
   * A service that answers for **whichever model it was asked about**: a report bound to that model's
   * own key, and a signature made by it. `signsFor` is the seam that lets one case hand the reading
   * step's text a signature from the page enclave, which is the misbinding this test exists to forbid.
   */
  function service(asked: { path: string; query?: Record<string, string> }[], signsFor?: (model: string) => Uint8Array): NearClient {
    const reply = (json: unknown): NearResponse => ({ status: 200, path: 'attestation/report', rawText: JSON.stringify(json), json });
    return {
      mode: 'relay',
      baseUrl: '/api/relay/v1',
      post: async () => {
        throw new Error('a trust-session test never posts a completion');
      },
      get: (path: string, init?: { query?: Record<string, string> }) => {
        asked.push({ path, query: init?.query });
        const model = init?.query?.model ?? '';
        if (keyOf(model) === undefined) throw new Error(`the double was asked about a model it has no report for: ${model}`);
        if (path === 'attestation/report') {
          const nonce = init?.query?.nonce ?? '';
          return Promise.resolve(reply({ model_attestations: [{ request_nonce: nonce, signing_address: pub(keyOf(model)!), signing_algo: 'ed25519', signing_public_key: pub(keyOf(model)!) }] }));
        }
        const signer = signsFor?.(model) ?? keyOf(model)!;
        const text = signedTextFor(model);
        return Promise.resolve(
          reply({
            text,
            signature: hex(ed25519.sign(new TextEncoder().encode(text), signer)),
            signing_address: pub(signer),
            signing_algo: 'ed25519',
            signature_kind: 'provider_tee',
          }),
        );
      },
    } as unknown as NearClient;
  }

  /** A verifier that agrees the report is well formed, so the gate's own verdict is not what is under test. */
  const agrees: typeof fetch = async () =>
    new Response(JSON.stringify({ status: 'partial', checks: [{ name: 'server_verification', ran: true, passed: true }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as unknown as Response;

  const sessionFor = (asked: { path: string; query?: Record<string, string> }[], signsFor?: (model: string) => Uint8Array) =>
    createTrustSession({ client: service(asked, signsFor), fetchImpl: agrees });

  it('asks for a report per model, under one session nonce', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    const session = sessionFor(asked);
    await session.gate({ model: PAGE, signal });
    await session.gate({ model: READING, signal });
    const reports = asked.filter((a) => a.path === 'attestation/report');
    expect(reports.map((r) => r.query?.model)).toEqual([PAGE, READING]);
    expect(reports[0]?.query?.nonce).toBe(session.nonce());
    expect(reports[1]?.query?.nonce, 'rule 4 asks for a fresh nonce per session, not per model').toBe(reports[0]?.query?.nonce);
  });

  it('keeps each model’s outcome: the page step still binds to the page enclave after the reading step ran', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    const session = sessionFor(asked);
    const page = await session.gate({ model: PAGE, signal });
    const reading = await session.gate({ model: READING, signal });
    expect(page.signingKey?.keyOrAddress).toBe(pub(PAGE_KEY));
    expect(reading.signingKey?.keyOrAddress).toBe(pub(READING_KEY));
    // …and the second call did not evict the first: asking again inside the TTL answers from the
    // page's own report, so a two-step run cannot have its first step checked against the second's key.
    const before = asked.length;
    const again = await session.gate({ model: PAGE, signal });
    expect(again).toBe(page);
    expect(asked).toHaveLength(before);
  });

  it('verifies each answer against the key of the model that answered it', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    const session = sessionFor(asked);
    await session.gate({ model: PAGE, signal });
    await session.gate({ model: READING, signal });
    for (const model of [PAGE, READING]) {
      const outcome = await session.verifySignature({ chatId: 'chat-1', model, sentBody: REQUEST, rawText: RESPONSE, signal });
      expect(outcome.verified, `${model}: its own enclave signed these bytes`).toBe(true);
      expect(outcome.checks.find((c) => c.name === 'signed_by_model_enclave')).toMatchObject({ passed: true });
    }
  });

  it('a signature from the other enclave does not verify — the misbinding this per-model cache exists to stop', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    // The reading step's text, signed by the *page* enclave: exactly what a single-slot session would
    // have accepted or rejected for the wrong reason.
    const session = sessionFor(asked, (model) => (model === READING ? PAGE_KEY : READING_KEY));
    await session.gate({ model: PAGE, signal });
    await session.gate({ model: READING, signal });
    const outcome = await session.verifySignature({ chatId: 'chat-1', model: READING, sentBody: REQUEST, rawText: RESPONSE, signal });
    expect(outcome.verified).toBe(false);
    expect(outcome.checks.find((c) => c.name === 'response_signature')).toMatchObject({ ran: true, passed: false });
  });

  it('a model this session never attested gets no signature fetched and a failed check', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    const session = sessionFor(asked);
    await session.gate({ model: PAGE, signal });
    const outcome = await session.verifySignature({ chatId: 'chat-1', model: READING, sentBody: REQUEST, rawText: RESPONSE, signal });
    expect(outcome.verified).toBe(false);
    expect(outcome.checks[0]?.detail).toMatch(/no attestation has run for this model/);
    expect(asked.filter((a) => a.path === 'signature/{chat_id}'), 'refused before the round trip').toEqual([]);
  });

  it('attestation changed mid-session: re-fetch binds a different key, causing signature verification to fail and halt (T-07)', async () => {
    const asked: { path: string; query?: Record<string, string> }[] = [];
    let currentKey = PAGE_KEY;
    const dynamicService: NearClient = {
      mode: 'relay',
      baseUrl: '/api/relay/v1',
      post: async () => {
        throw new Error('no post');
      },
      get: (path: string, init?: { query?: Record<string, string> }) => {
        asked.push({ path, query: init?.query });
        const model = init?.query?.model ?? '';
        if (path === 'attestation/report') {
          const nonce = init?.query?.nonce ?? '';
          return Promise.resolve({
            status: 200,
            path: 'attestation/report',
            rawText: '{}',
            json: {
              model_attestations: [
                {
                  request_nonce: nonce,
                  signing_address: pub(currentKey),
                  signing_algo: 'ed25519',
                  signing_public_key: pub(currentKey),
                },
              ],
            },
          });
        }
        const text = signedTextFor(model);
        return Promise.resolve({
          status: 200,
          path: 'signature/{chat_id}',
          rawText: '{}',
          json: {
            text,
            signature: hex(ed25519.sign(new TextEncoder().encode(text), currentKey)),
            signing_address: pub(currentKey),
            signing_algo: 'ed25519',
            signature_kind: 'provider_tee',
          },
        });
      },
    } as unknown as NearClient;

    const session = createTrustSession({ client: dynamicService, fetchImpl: agrees });

    // 1. Initial gate call binds to initial key (PAGE_KEY)
    const initial = await session.gate({ model: PAGE, signal });
    expect(initial.signingKey?.keyOrAddress).toBe(pub(PAGE_KEY));

    // 2. Initial response signed by PAGE_KEY verifies
    const initialSig = await session.verifySignature({ chatId: 'chat-1', model: PAGE, sentBody: REQUEST, rawText: RESPONSE, signal });
    expect(initialSig.verified).toBe(true);

    // 3. Service replaces/redeploys model enclave mid-session with a new key
    currentKey = READING_KEY;

    // 4. Response signed by the new key does NOT verify against the session's attested key
    const changedSig = await session.verifySignature({ chatId: 'chat-1', model: PAGE, sentBody: REQUEST, rawText: RESPONSE, signal });
    expect(changedSig.verified).toBe(false);
    expect(changedSig.checks.find((c) => c.name === 'response_signature')).toMatchObject({ ran: true, passed: false });
  });
});

describe('the strong claim is unreachable without proof', () => {
  it('E2EE has not been proven from a browser, so no TrustRecord may claim it (AGENTS.md §4 rule 2)', () => {
    // Promoting this constant to true requires: a live enclave decrypting a browser-built
    // payload, the evidence line in ROADMAP T-10, and a §10 log entry. Not a code edit alone.
    expect(E2EE_PROVEN_IN_BROWSER).toBe(false);
  });

  it('the fixtures banner is exactly the promised sentence (AGENTS.md §4 rule 11)', () => {
    expect(FIXTURES_BANNER).toBe('Demo data. No real privacy guarantee.');
  });

  it('the weaker rung never says only the enclave can read the upload', () => {
    // The whole ladder is one rung apart on this phrase; if the fallback copy grows that claim
    // the privacy story silently upgrades itself.
    expect(CLAIM_COPY.attested_model_signed_responses).not.toMatch(/only the (verified )?enclave can read/i);
    expect(CLAIM_COPY.fixtures).not.toMatch(/enclave|encrypt|private/i);
  });

  it('every rung states what it does not cover, or is the fixtures warning', () => {
    expect(CLAIM_COPY.attested_model_signed_responses).toMatch(/standard secure web connections/);
  });
});

describe('nonce binding is decided by the bytes, not by politeness (T-01)', () => {
  const OURS = 'ab'.repeat(32);
  const KEY = new Uint8Array(32).fill(11);
  const PUB = [...ed25519.getPublicKey(KEY)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const report = (requestNonce: string | undefined) => ({
    model_attestations: [{ request_nonce: requestNonce, signing_address: PUB, signing_algo: 'ed25519' as const, signing_public_key: PUB }],
  });
  const bind = (requestNonce: string | undefined) => bindReport({ report: report(requestNonce), nonce: OURS, signingAlgo: 'ed25519' });

  it('a report whose request_nonce differs from ours fails the binding', () => {
    const { checks, status } = bind('cd'.repeat(32));
    expect(checks.find((c) => c.name === 'nonce_fresh')).toMatchObject({ ran: true, passed: false });
    expect(status).not.toBe('verified');
  });

  it('a report that carries no nonce at all is not given the benefit of the doubt', () => {
    const { checks, status } = bind(undefined);
    expect(checks.find((c) => c.name === 'nonce_fresh')).toMatchObject({ ran: true, passed: false, detail: /no request nonce/ });
    expect(status).toBe('partial');
  });

  it('our own nonce echoed back is the only case that can reach verified', () => {
    const { checks, status, signingKey } = bind(OURS.toUpperCase());
    expect(checks.every((c) => c.ran && c.passed)).toBe(true);
    expect(status).toBe('verified');
    expect(signingKey).toEqual({ algo: 'ed25519', keyOrAddress: PUB });
  });

  it('a signing address of the wrong length for the algorithm is a failed shape check', () => {
    const bad = { model_attestations: [{ request_nonce: OURS, signing_address: 'aa'.repeat(19), signing_algo: 'ed25519' as const, signing_public_key: PUB }] };
    const { checks } = bindReport({ report: bad, nonce: OURS, signingAlgo: 'ed25519' });
    expect(checks.find((c) => c.name === 'signing_address_shape')).toMatchObject({ ran: true, passed: false });
  });

  it('the report is asked for with our nonce in the query, and only through the typed client', async () => {
    const seen: { path: string; query?: Record<string, string> }[] = [];
    const client = fakeClient({ model_attestations: [{ request_nonce: OURS }] }, seen);
    await fetchReport(client, { model: 'deepseek-v3', nonce: OURS, signingAlgo: 'ed25519' });
    expect(seen[0]).toEqual({ path: 'attestation/report', query: { model: 'deepseek-v3', nonce: OURS, signing_algo: 'ed25519' } });
  });
});

describe('a verifier that says nothing is a failure, not an agreement (T-01, rule 6)', () => {
  const report = { model_attestations: [{ request_nonce: 'ab'.repeat(32) }] };

  it('a 501 from /api/verify is read as a failed check', async () => {
    const result = await verifyWithServer(report, 'ab'.repeat(32), {
      fetchImpl: async () => new Response(JSON.stringify({ error: 'not_implemented', item: 'T-03' }), { status: 501, headers: { 'content-type': 'application/json' } }) as unknown as Response,
    });
    expect(result.checks).toEqual([{ name: 'server_verification', ran: true, passed: false, detail: 'the verifier answered 501, which is a failure, not an absence of one' }]);
    expect(result.status).toBe('failed');
  });

  it('an unreachable verifier fails the same way, and never resolves to a pass', async () => {
    const result = await verifyWithServer(report, 'ab'.repeat(32), { fetchImpl: async () => { throw new TypeError('offline'); } });
    expect(result.status).toBe('failed');
    expect(result.checks[0]).toMatchObject({ name: 'server_verification', passed: false });
  });

  it('a 200 whose body is not the agreed shape is failure too, not silence', async () => {
    const result = await verifyWithServer(report, 'ab'.repeat(32), { fetchImpl: async () => new Response('nope', { status: 200 }) as unknown as Response });
    expect(result.status).toBe('failed');
  });

  it('named checks come back through as named checks', async () => {
    const body = { status: 'partial', checks: [{ name: 'tdx_quote', ran: false, passed: false, detail: 'not implemented in this build' }] };
    const result = await verifyWithServer(report, 'ab'.repeat(32), { fetchImpl: async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }) as unknown as Response });
    expect(result.checks).toEqual(body.checks);
    expect(result.status).toBe('partial');
  });
});

describe('the signed text is rebuilt from the exact wire bytes (ADR-19, T-02)', () => {
  const KEY = new Uint8Array(32).fill(11);
  const PUB = [...ed25519.getPublicKey(KEY)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const MODEL = 'meta-llama/Llama-3.3-70B';
  const REQUEST = '{"model":"meta-llama/Llama-3.3-70B","messages":[]}';
  // A streamed body ends with two newlines and they belong in the hash (SPIKE §5).
  const RESPONSE = '{"id":"chat-1","choices":[]}\n\n';
  const textFor = (responseBytes: string) => `${MODEL}:${sha256Hex(REQUEST)}:${sha256Hex(responseBytes)}`;
  const signWith = (key: Uint8Array, text: string) => [...ed25519.sign(new TextEncoder().encode(text), key)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sign = (text: string) => signWith(KEY, text);

  const recordOver = (responseBytes: string) => ({
    text: textFor(responseBytes),
    signature: sign(textFor(responseBytes)),
    signing_address: PUB,
    signing_algo: 'ed25519' as const,
    signature_kind: 'provider_tee' as const,
  });

  it('the trailing newlines are inside the hash: verified against the bytes as received', () => {
    const check = checkSignature(recordOver(RESPONSE), { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB });
    expect(check).toMatchObject({ verified: true, origin: 'provider_tee', algo: 'ed25519' });
  });

  it('the same signature over trimmed bytes fails — one newline changed and it is a different answer', () => {
    const trimmed = RESPONSE.trimEnd();
    const check = checkSignature(recordOver(RESPONSE), { requestBytes: REQUEST, responseBytes: trimmed, modelId: MODEL, attestedKeyOrAddress: PUB });
    expect(check.verified).toBe(false);
    expect(sha256Hex(trimmed)).not.toBe(sha256Hex(RESPONSE));
  });

  it('a signature over changed request bytes fails and says so', () => {
    const check = checkSignature(recordOver(RESPONSE), { requestBytes: REQUEST.replace('[]', '[{}]'), responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB });
    expect(check.verified).toBe(false);
  });

  it('a signature made by a key this session did not attest to does not verify', () => {
    const other = new Uint8Array(32).fill(22);
    const text = textFor(RESPONSE);
    const foreign = { text, signature: signWith(other, text), signing_address: PUB, signing_algo: 'ed25519' as const, signature_kind: 'provider_tee' as const };
    expect(checkSignature(foreign, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB }).verified).toBe(false);
  });

  it('the address the record claims is data: verification is against the key we attested, never against what was served', () => {
    // Same valid signature, `signing_address` swapped for someone else's. If the verifier trusted
    // the served field this would still pass, and a response could name its own authority.
    const otherPub = [...ed25519.getPublicKey(new Uint8Array(32).fill(22))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const record = { ...recordOver(RESPONSE), signing_address: otherPub };
    expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB }).verified).toBe(true);
    expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: otherPub }).verified).toBe(false);
  });

  it('the ECDSA path verifies EIP-191 personal-sign and recovers the attested address', () => {
    const priv = new Uint8Array(32).fill(3);
    const uncompressed = secp256k1.getPublicKey(priv, false);
    const address = [...keccak_256(uncompressed.slice(1)).slice(12)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const bytes = new TextEncoder().encode(textFor(RESPONSE));
    const framing = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`);
    const digest = keccak_256(new Uint8Array([...framing, ...bytes]));
    const wire = signEcdsaOverDigest(digest, priv, 0x1234567890abcdefn);
    const record = { text: textFor(RESPONSE), signature: wire, signing_address: '0x' + address, signing_algo: 'ecdsa' as const, signature_kind: 'provider_tee' as const };
    expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: address.toUpperCase() }).verified).toBe(true);
    // A different address claimed, the same signature: the compare is against the key we attested,
    // so an unattested signer must not pass.
    expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: '00'.repeat(20) }).verified).toBe(false);
    // And the text the signature actually covers must be the EIP-191 framing: a verifier that
    // recovered over the bare text would accept this, which is how a signature stops meaning
    // anything at all.
    const wrongFraming = signEcdsaOverDigest(keccak_256(bytes), priv, 0x1234567890abcdefn);
    expect(checkSignature({ ...record, signature: wrongFraming }, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: address }).verified).toBe(false);
  });

  it('a gateway signature is reported as a gateway signature, never as the model enclave', () => {
    const gatewayText = `${sha256Hex(REQUEST)}:${sha256Hex(RESPONSE)}`;
    const record = { text: gatewayText, signature: sign(gatewayText), signing_address: PUB, signing_algo: 'ed25519' as const, signature_kind: 'gateway' as const };
    const check = checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB });
    expect(check).toMatchObject({ verified: true, origin: 'gateway' });
    expect(check.detail).toMatch(/not by the enclave serving the model/);
  });

  it('an unstated signature_kind is tried both ways and the form that verifies is named', () => {
    const gatewayText = `${sha256Hex(REQUEST)}:${sha256Hex(RESPONSE)}`;
    const record = { text: gatewayText, signature: sign(gatewayText), signing_address: PUB, signing_algo: 'ed25519' as const };
    const check = checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB });
    expect(check).toMatchObject({ verified: true, origin: 'gateway' });
  });

  it('a stated kind that only verifies under the other form is a failure, not a shrug', () => {
    const gatewayText = `${sha256Hex(REQUEST)}:${sha256Hex(RESPONSE)}`;
    const record = { text: gatewayText, signature: sign(gatewayText), signing_address: PUB, signing_algo: 'ed25519' as const, signature_kind: 'provider_tee' as const };
    expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB }).verified).toBe(false);
  });

  it('an unrecognised signature encoding fails closed instead of being guessed at', () => {
    for (const bad of ['zz', 'aa'.repeat(63), 'base64:AAAA']) {
      const record = { text: textFor(RESPONSE), signature: bad, signing_address: PUB, signing_algo: 'ed25519' as const, signature_kind: 'provider_tee' as const };
      expect(checkSignature(record, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: MODEL, attestedKeyOrAddress: PUB }).verified).toBe(false);
    }
  });

  it('the verifier refuses to check anything before a gate has attested a key', async () => {
    const verifier = createSignatureVerifier({ client: fakeClient({}, []), attested: () => undefined });
    const outcome = await verifier({ chatId: 'chat-1', model: MODEL, sentBody: REQUEST, rawText: RESPONSE, signal: new AbortController().signal });
    expect(outcome.verified).toBe(false);
    expect(outcome.checks[0]).toMatchObject({ name: 'response_signature', passed: false, detail: /no attestation has run/ });
  });

  it('the served text must agree with the bytes we handled, as its own failed check', async () => {
    const record = { ...recordOver(RESPONSE), text: 'something:else:entirely' };
    const client = fakeClient(record, [], 'signature/{chat_id}');
    const verifier = createSignatureVerifier({ client, attested: () => ({ algo: 'ed25519', keyOrAddress: PUB }) });
    const outcome = await verifier({ chatId: 'chat-1', model: MODEL, sentBody: REQUEST, rawText: RESPONSE, signal: new AbortController().signal });
    expect(outcome.verified).toBe(false);
    expect(outcome.checks.find((c) => c.name === 'response_signature')?.detail).toMatch(/does not match the bytes we handled/);
    // The signature itself did verify; it is the pairing with our own bytes that failed.
    expect(outcome.checks.find((c) => c.name === 'signed_by_model_enclave')).toMatchObject({ passed: true });
  });
});

describe('decided verification set (ARCH §10) — what still needs a live verifier', () => {
  // Two of these stopped being todos when T-08 put real service bytes in the repo: nonce binding
  // against a recorded report, and the fact that `device_id` holds `SHA-256("")`, are now asserted
  // with those bytes in `attestation-fixtures.test.ts`. What is left is what no fixture can decide,
  // because reading a quote or a GPU verdict needs the dependency in B-12 — not a key, not a file.
  it.todo('NRAS GPU verdict: the device facts live inside nvidia_payload, which this build cannot open (T-01, gated on B-12)');
  it.todo('TDX quote: valid passes, tampered tcb fails, expired fails — the fixtures exist, the verifier does not (T-03, gated on B-12)');
  it.todo('partial status is rendered as the ran/passed list and never as "verified" (T-05, needs T-04 claimFor)');
  // T-07 (attestation changed mid-session) is implemented and verified above in 'per-model trust session'
  it.todo('e2ee_enclave is selected only when TrustRecord.e2ee is true and the flag is proven (T-04)');
});

/**
 * A 65-byte `r‖s‖v` signature over a caller-chosen 32-byte digest.
 *
 * Needed because `@noble/curves` 2.4 hashes its input inside `sign()`, so it cannot produce a
 * signature over an already-computed EIP-191 keccak digest — which is exactly what the service's
 * ECDSA signatures are. The scalar arithmetic is written out here so the vector is independent of
 * the code under test: same curve parameters, different path (this signs, the verifier recovers).
 * The fixed `k` makes the vector reproducible; it is a test signing key over synthetic text, never
 * a production one. If any of this arithmetic were wrong the verifier would reject the vector, so
 * the passing assertion below is what proves the signer.
 */
function signEcdsaOverDigest(digest: Uint8Array, privateKey: Uint8Array, k: bigint): string {
  // secp256k1 group order, spelled out rather than borrowed from the library under test.
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const d = toBig(privateKey);
  const aff = secp256k1.Point.BASE.multiply(k).toAffine();
  const r = mod(aff.x, n);
  const z = toBig(digest);
  let s = modMul(modInverse(k, n), modAdd(z, modMul(r, d, n), n), n);
  let recovery = Number(aff.y & 1n) | (aff.x >= n ? 2 : 0);
  if (s > n / 2n) {
    s = n - s;
    recovery ^= 1;
  }
  return toHex32(r) + toHex32(s) + (recovery + 27).toString(16).padStart(2, '0');
}

function toBig(bytes: Uint8Array): bigint {
  return BigInt('0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''));
}
function toHex32(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}
function mod(a: bigint, n: bigint): bigint {
  return ((a % n) + n) % n;
}
function modAdd(a: bigint, b: bigint, n: bigint): bigint {
  return mod(mod(a, n) + mod(b, n), n);
}
/** Double-and-add: bigint `*` on 256-bit scalars is fine in production, but this path stays explicit. */
function modMul(a: bigint, b: bigint, n: bigint): bigint {
  let result = 0n;
  let x = mod(a, n);
  let y = mod(b, n);
  while (y > 0n) {
    if (y & 1n) result = mod(result + x, n);
    x = mod(x * 2n, n);
    y >>= 1n;
  }
  return result;
}
function modInverse(a: bigint, n: bigint): bigint {
  let [old_r, r] = [mod(a, n), n];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, n);
}

/** A client that records what it was asked for and replays one canned body. */
function fakeClient(json: unknown, seen: { path: string; query?: Record<string, string> }[], path: string = 'attestation/report'): NearClient {
  const response: NearResponse = { status: 200, path: path as NearResponse['path'], rawText: JSON.stringify(json), json };
  return {
    mode: 'direct',
    baseUrl: 'https://cloud-api.near.ai/v1',
    post: async () => response,
    get: (asked: string, init?: { query?: Record<string, string> }) => {
      seen.push({ path: asked, query: init?.query });
      return Promise.resolve(response);
    },
  } as unknown as NearClient;
}
