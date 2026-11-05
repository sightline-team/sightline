import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { attestationReportSchema, bindReport, createTrustSession, newNonce } from '@/lib/near-ai/attestation';
import type { AttestationReport, SigningAlgo } from '@/lib/near-ai/attestation';
import { checkSignature, createSignatureVerifier, sha256Hex } from '@/lib/near-ai/signatures';
import type { NearClient } from '@/lib/near-ai/client';
import type { CheckResult } from '@/types';

/**
 * **T-08**: the verification ladder walked over a *recorded* attestation report instead of a
 * hand-written one.
 *
 * `fixtures/attestation/good-*.json` are the two model reports this app's own recorder pulled off the
 * live service on 2026-11-05 (free, non-billable — `docs/SPIKE_RESULTS.md` §5), each bound to a nonce
 * the recorder minted and the service echoed. Everything else in this file is a **derivation**: one
 * named change to those bytes, made *before* the schema sees them, because that is where a hostile or
 * merely-changed service would put it. The derivations are not stored as fixtures — see
 * `fixtures/attestation/README.md` for why a file called `-tampered.json` is the artifact this
 * directory exists to distrust.
 *
 * Three things this file is careful not to claim:
 * - It does **not** verify a TDX quote or a GPU verdict. Those are T-03's, and they need `dcap-qvl-node`
 *   and fresh evidence (**B-12**). A stored quote is stale by construction.
 * - A `verified` status from `bindReport` is *four shape-and-binding checks*, not proof an enclave made
 *   the report. The `foreign_key` case below is the demonstration: a report naming a key we invented
 *   passes every check the browser half can run.
 * - The gate is `failed` for every case here, good included, because `/api/verify` answers 501. The last
 *   block asserts that, because "fail closed" has to be shown to still hold when the report is real.
 */

// ------------------------------------------------------------------------ the fixtures

interface RedactedField {
  path: string;
  bytes: number;
  sha256: string;
  reason: string;
}

interface FixtureMeta {
  case: 'good';
  provenance: 'recorded';
  redacted: RedactedField[];
  model: string;
  sentNonce: string;
  shouldPass: string[];
  shouldFail: string[];
  observedStatus: string;
  reportBytes: number;
  schemaDrops: { topLevel: string[]; modelAttestation: string[] };
  timeFields: string[];
  timeFieldCount: number;
  appCerts: { model: { present: boolean; subject?: string; validTo?: string }; gateway: { present: boolean } };
  deviceIdIsPlaceholder: { model: { info: boolean; tcb: boolean }; gateway: { info: boolean; tcb: boolean } };
  nonceEchoes: Record<string, unknown>;
  newestComposeAction: string;
  recordedAt: string;
}

interface Fixture {
  slug: string;
  meta: FixtureMeta;
  /** The stored wire shape, minus the declared redactions. What a client would hand us. */
  raw: Record<string, unknown>;
  /** `attestationReportSchema`'s verdict on those bytes — what `bindReport` is actually given. */
  report: AttestationReport;
  modelAttestation: Record<string, unknown>;
  text: string;
}

const DIRECTORY = path.join(__dirname, '..', '..', 'fixtures', 'attestation');
const FILES = ['good-z-ai-glm-5.3-flash.json', 'good-Qwen-Qwen3.8-27B.json'] as const;

function load(file: string): Fixture {
  const text = readFileSync(path.join(DIRECTORY, file), 'utf8');
  // `as unknown as`: the file's shape is this repository's own recorder's output, asserted field by
  // field below rather than trusted through a cast — a typed loader that only casts proves nothing.
  const doc = JSON.parse(text) as { _meta: FixtureMeta; report: Record<string, unknown> };
  const parsed = attestationReportSchema.safeParse(doc.report);
  if (!parsed.success) throw new Error(`${file}: the app's own schema rejected its recorded report — ${parsed.error.issues[0]?.message ?? 'no detail'}`);
  const attestations = doc.report.model_attestations as Record<string, unknown>[] | undefined;
  if (attestations === undefined || attestations.length === 0) throw new Error(`${file}: no model attestation to derive from`);
  return { slug: file.replace(/^good-/, '').replace(/\.json$/, ''), meta: doc._meta, raw: doc.report, report: parsed.data, modelAttestation: attestations[0]!, text };
}

const fixtures = FILES.map(load);

/**
 * One change to the recorded bytes, applied to a copy, before the schema. `what` names the case in the
 * test output so a reader can tell a derivation from the recording without opening this file.
 */
function derive(from: Fixture, what: string, change: (model0: Record<string, unknown>) => void): AttestationReport {
  const copy = JSON.parse(JSON.stringify(from.raw)) as Record<string, unknown>;
  change((copy.model_attestations as Record<string, unknown>[])[0]!);
  const parsed = attestationReportSchema.safeParse(copy);
  if (!parsed.success) throw new Error(`derivation ${what} produced bytes the schema rejects: ${parsed.error.issues[0]?.message ?? 'no detail'}`);
  return parsed.data;
}

/** Change the final hex character, deterministically, to whatever it is not already. */
function flipLastHex(hex: string): string {
  const last = hex.at(-1);
  return `${hex.slice(0, -1)}${last === 'f' ? 'e' : 'f'}`;
}

const check = (checks: CheckResult[], name: string): CheckResult | undefined => checks.find((c) => c.name === name);

// ------------------------------------------------------------------------ the recording itself

describe('the good fixture is a real report, and the app can still read it (T-08)', () => {
  it('the recorded bytes parse through the production schema, for both models this app asks', () => {
    expect(fixtures.map((f) => f.meta.model)).toEqual(['z-ai/glm-5.3-flash', 'Qwen/Qwen3.8-27B']);
    for (const f of fixtures) expect(f.report.model_attestations?.length).toBe(1);
  });

  it('the two models are two enclaves: different keys, different measurements (ADR-24)', () => {
    const [page, reading] = fixtures;
    expect(page!.modelAttestation.signing_public_key).not.toBe(reading!.modelAttestation.signing_public_key);
    const tcb = (f: Fixture) => (f.modelAttestation.info as Record<string, Record<string, unknown>>).tcb_info ?? {};
    expect(tcb(page!).rtmr3).not.toBe(tcb(reading!).rtmr3);
  });

  it('the nonce the recorder minted is the nonce the service echoed — stored separately, so this is a check', () => {
    for (const f of fixtures) {
      expect(f.meta.sentNonce).toMatch(/^[0-9a-f]{64}$/);
      expect(f.modelAttestation.request_nonce).toBe(f.meta.sentNonce);
      expect((f.raw.gateway_attestation as Record<string, unknown>).request_nonce).toBe(f.meta.sentNonce);
    }
  });

  it('what the schema drops is still what the schema drops — widening it must be a decision, not a drift', () => {
    for (const f of fixtures) {
      const kept = f.report as unknown as Record<string, unknown>;
      const droppedTop = Object.keys(f.raw).filter((key) => !(key in kept));
      expect(droppedTop).toEqual(f.meta.schemaDrops.topLevel);
      // The model list was measured on the live bytes, which still carried the GPU payload and the
      // launch log; those are declared redactions now, so the difference between the two lists is exactly
      // the redaction — and this assertion is what stops the redaction and the schema drifting apart.
      const keptModel = (f.report.model_attestations?.[0] ?? {}) as Record<string, unknown>;
      const droppedNow = Object.keys(f.modelAttestation).filter((key) => !(key in keptModel));
      const redacted = new Set(f.meta.redacted.map((r) => r.path.split('.').at(-1)));
      expect(droppedNow).toEqual(f.meta.schemaDrops.modelAttestation.filter((name) => !redacted.has(name)));
      expect([...redacted]).toContain('compose_manager_attestation');
      // `info` survives as exactly one key, and after the redaction that key is empty. Stated because it
      // is how little of the report the browser half can see: the compose body T-03 must hash is kept by
      // digest only, in _meta.redacted.
      const modelInfo = keptModel.info as Record<string, unknown>;
      expect(Object.keys(modelInfo)).toEqual(['tcb_info']);
      expect(Object.keys(modelInfo.tcb_info as Record<string, unknown>)).toEqual([]);
    }
  });

  it('the redaction is self-certifying: the bytes we dropped hash to the compose_hash the report keeps', () => {
    for (const f of fixtures) {
      const compose = f.meta.redacted.filter((r) => r.path.endsWith('app_compose'));
      expect(compose.length).toBe(2);
      const info = (node: unknown) => ((node as Record<string, unknown>).info as Record<string, unknown>).compose_hash;
      expect(compose[0]!.sha256).toBe(info(f.modelAttestation));
      expect(compose[1]!.sha256).toBe(info(f.raw.gateway_attestation));
    }
  });

  it('nothing account-derived or infra-shaped survived the redaction (AGENTS.md §5)', () => {
    for (const f of fixtures) {
      const report = JSON.stringify(f.raw);
      for (const banned of ['chat_id', 'api_key', 'bearer', 'dstack.internal', '${', 'environment:', 'private key']) {
        expect(report.toLowerCase(), `${f.slug} still carries ${banned}`).not.toContain(banned.toLowerCase());
      }
      expect(report).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    }
    // …and the scan is not a no-op: one of these strings is exactly what the redaction removes, so
    // a re-record that forgets `redactReport` would be caught here rather than in a review.
    const [page] = fixtures;
    const leaked = JSON.parse(JSON.stringify(page!.raw)) as Record<string, unknown>;
    (leaked as { gateway_attestation: Record<string, unknown> }).gateway_attestation.vpc = { vpc_hostname: 'cloud-api-prod-abcd.dstack.internal' };
    expect(JSON.stringify(leaked).toLowerCase()).toContain('dstack.internal');
  });
});

// ------------------------------------------------------------------------ the good case

describe('bindReport on a recorded live report (T-01, T-08)', () => {
  it('all four checks pass and the status is verified — the first time that word came from real bytes', () => {
    for (const f of fixtures) {
      const bound = bindReport({ report: f.report, nonce: f.meta.sentNonce, signingAlgo: 'ed25519' });
      expect(bound.checks.map((c) => c.name)).toEqual(f.meta.shouldPass);
      expect(bound.checks.every((c) => c.ran && c.passed)).toBe(true);
      expect(bound.status).toBe('verified');
      expect(bound.status).toBe(f.meta.observedStatus);
      expect(bound.signingKey).toEqual({ algo: 'ed25519', keyOrAddress: f.modelAttestation.signing_public_key });
    }
  });

  it('and it is the nonce that earned it: a different nonce, freshly minted, is refused by the same report', () => {
    // Without this, the test above could pass on a `bindReport` that ignores its `nonce` argument.
    for (const f of fixtures) {
      const bound = bindReport({ report: f.report, nonce: newNonce(), signingAlgo: 'ed25519' });
      expect(check(bound.checks, 'nonce_fresh')).toMatchObject({ ran: true, passed: false, detail: /different nonce/ });
      expect(bound.status).not.toBe('verified');
    }
  });
});

// ------------------------------------------------------------------------ the derived cases

describe('tampered_nonce: one character of the echo, and the binding fails (T-08)', () => {
  for (const f of fixtures) {
    const tampered = derive(f, 'tampered_nonce', (model0) => {
      model0.request_nonce = flipLastHex(String(model0.request_nonce));
    });
    const bound = bindReport({ report: tampered, nonce: f.meta.sentNonce, signingAlgo: 'ed25519' });

    it(`${f.slug}: our own nonce no longer matches, so nothing is sent`, () => {
      expect(check(bound.checks, 'nonce_fresh')).toMatchObject({ ran: true, passed: false });
      expect(bound.status).toBe('partial');
      // The other three still pass: it is the binding that broke, not the parse. Saying so keeps the
      // receipt honest — a report can be well-formed and still not ours.
      expect(check(bound.checks, 'attestation_report')?.passed).toBe(true);
      expect(check(bound.checks, 'signing_public_key_shape')?.passed).toBe(true);
    });
  }
});

describe('tampered_address: a key the wrong length, and the session has nothing to verify against', () => {
  for (const f of fixtures) {
    const tampered = derive(f, 'tampered_address', (model0) => {
      model0.signing_address = String(model0.signing_address).slice(0, -1);
    });
    const bound = bindReport({ report: tampered, nonce: f.meta.sentNonce, signingAlgo: 'ed25519' });

    it(`${f.slug}: the shape check fails, signingKey is absent, and the signature verifier refuses to run`, async () => {
      expect(check(bound.checks, 'signing_address_shape')).toMatchObject({ ran: true, passed: false, detail: /expected 32 bytes/ });
      expect(bound.signingKey).toBeUndefined();
      const asked: Asked[] = [];
      const verifier = createSignatureVerifier({ client: replayClient(f.raw, asked), attested: () => bound.signingKey });
      const outcome = await verifier({ chatId: 'chat-1', model: f.meta.model, sentBody: '{}', rawText: '{}', signal: new AbortController().signal });
      expect(outcome.verified).toBe(false);
      expect(check(outcome.checks, 'response_signature')?.detail).toMatch(/no attestation has run/);
      // …and it refuses *before* asking the service for a signature, so a session with no attested key
      // cannot be baited into a round trip whose answer it would then have to decide not to trust.
      expect(asked, 'the verifier fetched a signature it had no key to check against').toEqual([]);
    });
  }
});

describe('foreign_key: the browser half cannot tell whose key the report names (the ceiling on `verified`)', () => {
  const KEY = new Uint8Array(32).fill(7);
  const PUB = [...ed25519.getPublicKey(KEY)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const REQUEST = '{"model":"z-ai/glm-5.3-flash","messages":[]}';
  const RESPONSE = '{"id":"chat-1","choices":[]}\n\n';
  const signedText = (model: string) => `${model}:${sha256Hex(REQUEST)}:${sha256Hex(RESPONSE)}`;
  const signatureOver = (text: string) => [...ed25519.sign(new TextEncoder().encode(text), KEY)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const [page] = fixtures;

  it('a report naming OUR key passes all four checks — shape and binding are not authenticity', () => {
    const f = page!;
    const foreign = derive(f, 'foreign_key', (model0) => {
      model0.signing_address = PUB;
      model0.signing_public_key = PUB;
    });
    const bound = bindReport({ report: foreign, nonce: f.meta.sentNonce, signingAlgo: 'ed25519' });
    expect(bound.status).toBe('verified');
    expect(bound.signingKey).toEqual({ algo: 'ed25519', keyOrAddress: PUB });
    // Which is the honest ceiling on `verified` in this build: only the TDX quote ties a key to an
    // enclave, and the quote is T-03's unimplemented half (B-12). Nothing below this line pretends
    // otherwise, and nothing in the app may call this state "the enclave was verified".
    const reply = {
      text: signedText(f.meta.model),
      signature: signatureOver(signedText(f.meta.model)),
      signing_address: PUB,
      signing_algo: 'ed25519' as SigningAlgo,
      signature_kind: 'provider_tee' as const,
    };
    expect(checkSignature(reply, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: f.meta.model, attestedKeyOrAddress: PUB }).verified).toBe(true);
    expect(checkSignature(reply, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: f.meta.model, attestedKeyOrAddress: String(f.modelAttestation.signing_public_key) }).verified).toBe(false);
  });

  it('but the key is pinned byte-for-byte: change one character of it and a valid signature stops verifying', () => {
    const f = page!;
    const text = signedText(f.meta.model);
    const reply = { text, signature: signatureOver(text), signing_address: PUB, signing_algo: 'ed25519' as SigningAlgo, signature_kind: 'provider_tee' as const };
    const nibble = flipLastHex(PUB);
    // Same report, same checks, one hex character moved in the key the app pins its verification to.
    const bound = bindReport({
      report: derive(f, 'wrong_key', (model0) => {
        model0.signing_address = PUB;
        model0.signing_public_key = nibble;
      }),
      nonce: f.meta.sentNonce,
      signingAlgo: 'ed25519',
    });
    expect(bound.status).toBe('verified'); // the shape check cannot see the difference — 32 bytes is 32 bytes
    expect(bound.signingKey?.keyOrAddress).toBe(nibble);
    expect(checkSignature(reply, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: f.meta.model, attestedKeyOrAddress: nibble }).verified).toBe(false);
    expect(checkSignature(reply, { requestBytes: REQUEST, responseBytes: RESPONSE, modelId: f.meta.model, attestedKeyOrAddress: PUB }).verified).toBe(true);
  });
});

describe('stale: an expired report is the good report, to the half of the check that runs in a browser', () => {
  it('a report whose newest machine timestamp predates its own fetch binds as verified — and says so', () => {
    // There is deliberately no byte change here. That IS the finding: expiry in these bytes lives in the
    // quote and the GPU evidence (both opaque without `dcap-qvl-node`), and the only plaintext times —
    // the compose-manager action log — are not read by anything in this repo. `bindReport` takes no
    // clock, so it cannot fail one. If T-03 ever decides expiry, this test is the one that has to change
    // from "notice nothing" to "refuse", and nothing else.
    for (const f of fixtures) {
      const fetchedAt = Date.parse(f.meta.recordedAt);
      const newest = Date.parse(f.meta.newestComposeAction);
      const hours = (fetchedAt - newest) / 3_600_000;
      expect(hours, `${f.slug}: the action log is not older than the fetch, so this case stopped meaning what it says`).toBeGreaterThan(1);
      const bound = bindReport({ report: f.report, nonce: f.meta.sentNonce, signingAlgo: 'ed25519' });
      expect(bound.status).toBe('verified');
      expect(bound.checks.map((c) => c.name)).toEqual(f.meta.shouldPass);
      // And no time input exists to make it fail: the arguments are the bytes, our nonce and the algorithm.
      expect(bindReport.length, 'bindReport grew a clock — update this case to assert refusal').toBe(1);
    }
  });

  it('the report offers no expiry field to check, anywhere in the stored bytes', () => {
    for (const f of fixtures) {
      // The recorder's scan stops at 80 lines, so hitting the cap is the finding: there are more
      // time-shaped keys than it printed, and almost all of them are the compose action log — which
      // is exactly the body we redact. Nothing outside it is a timestamp an expiry could be read from.
      expect(f.meta.timeFieldCount, `${f.slug}: the scan no longer fills its buffer`).toBeGreaterThanOrEqual(80);
      expect(f.meta.timeFields.length, `${f.slug}: the survivor list grew — the action log is not the only time-shaped key any more`).toBeLessThan(10);
      for (const line of f.meta.timeFields) {
        expect(line, `${f.slug}: a new time field appeared — decide whose check it belongs to`).not.toMatch(/exp|issued|valid|created|stamp/i);
      }
    }
  });

  it.todo('an expired report fails a time check once /api/verify reads the quote and the NRAS EAT (T-03, blocked on B-12)');
});

describe('device_id is not a device identity, in either report, on either half (T-01\'s NRAS check cannot start here)', () => {
  it('all four fields hold SHA-256 of zero bytes, and bindReport never reads them', () => {
    const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    for (const f of fixtures) {
      expect(f.meta.deviceIdIsPlaceholder).toEqual({ model: { info: true, tcb: true }, gateway: { info: true, tcb: true } });
      const info = f.modelAttestation.info as Record<string, unknown>;
      const tcb = info.tcb_info as Record<string, unknown>;
      expect(info.device_id).toBe(EMPTY);
      expect(tcb.device_id).toBe(EMPTY);
      // A check written as "does the report name a device?" would pass on this. That is the trap this
      // test exists to keep visible while T-01's GPU todo stays open.
      expect(EMPTY).toBe(sha256Hex(''));
    }
  });
});

// ------------------------------------------------------------------------ fail closed, on real bytes

describe('the gate refuses every shape of report while /api/verify answers 501 (T-06, rule 6)', () => {
  const refusedFetch: typeof fetch = async () => new Response(JSON.stringify({ error: 'not_implemented', item: 'T-03' }), { status: 501, headers: { 'content-type': 'application/json' } }) as Response;

  const gateWith = async (client: NearClient, model: string) => {
    const session = createTrustSession({ client, fetchImpl: refusedFetch, ttlMs: 0 });
    return { outcome: await session.gate({ model, signal: new AbortController().signal }), session };
  };

  it('a service that echoes our fresh nonce still cannot send: four passes and one loud failure', async () => {
    const f = fixtures[0]!;
    const { outcome } = await gateWith(livingClient(f.raw), f.meta.model);
    expect(outcome.status).toBe('failed');
    expect(outcome.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(['server_verification']);
    expect(outcome.checks.filter((c) => c.ran && c.passed).map((c) => c.name)).toEqual(f.meta.shouldPass);
    expect(outcome.checks).toHaveLength(5);
    // The signing key the app would pin a response signature to exists here — and the run is still
    // refused. That is the difference between "we have a key" and "we are allowed to send".
    expect(outcome.signingKey).toEqual({ algo: 'ed25519', keyOrAddress: f.modelAttestation.signing_public_key });
  });

  it('the same genuine report, replayed from a recording, is refused on the nonce as well', async () => {
    // A cached or MITM'd copy of a real report is the attack the fresh nonce exists to stop, and this is
    // the only place in the repo that can show it with bytes that once came from the service.
    const f = fixtures[0]!;
    const { outcome } = await gateWith(replayClient(f.raw), f.meta.model);
    expect(outcome.status).toBe('failed');
    expect(outcome.checks.filter((c) => !c.passed).map((c) => c.name).sort()).toEqual(['nonce_fresh', 'server_verification']);
    expect(check(outcome.checks, 'nonce_fresh')?.detail).toMatch(/different nonce/);
  });

  it('a tampered echo and a replayed recording are the same refusal — one line of defence, two ways to trip it', async () => {
    const f = fixtures[0]!;
    const tampered = derive(f, 'tampered_nonce', (model0) => {
      model0.request_nonce = flipLastHex(String(model0.request_nonce));
    });
    const { outcome } = await gateWith(replayClient(tampered), f.meta.model);
    const replayed = await gateWith(replayClient(f.raw), f.meta.model);
    expect(outcome.status).toBe(replayed.outcome.status);
    expect(outcome.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(replayed.outcome.checks.filter((c) => !c.passed).map((c) => c.name));
  });

  it('the gate asks for the report of the model it was given, with the session nonce in the query', async () => {
    const asked: Asked[] = [];
    const f = fixtures[1]!;
    const { outcome, session } = await gateWith(livingClient(f.raw, asked), f.meta.model);
    expect(asked[0]).toEqual({ path: 'attestation/report', query: { model: f.meta.model, nonce: session.nonce(), signing_algo: 'ed25519' } });
    expect(session.nonce()).toMatch(/^[0-9a-f]{64}$/);
    expect(session.nonce()).not.toBe(f.meta.sentNonce);
    expect(outcome.nonce).toBe(session.nonce());
  });

  it('and a second gate call re-asks rather than trusting the first answer', async () => {
    const asked: Asked[] = [];
    const f = fixtures[0]!;
    const session = createTrustSession({ client: livingClient(f.raw, asked), fetchImpl: refusedFetch, ttlMs: 0 });
    await session.gate({ model: f.meta.model, signal: new AbortController().signal });
    await session.gate({ model: f.meta.model, signal: new AbortController().signal });
    expect(asked).toHaveLength(2);
    expect(asked[0]?.query?.nonce).toBe(asked[1]?.query?.nonce); // one nonce per session (rule 4), re-checked
  });
});

interface Asked {
  path: string;
  query?: Record<string, string>;
}

/**
 * A client that behaves the way the service was measured to behave (§3): it echoes back the nonce it
 * was just asked for. Used to show that a *cooperative* service still cannot get a document out of this
 * build while T-03 is a 501.
 */
function livingClient(source: unknown, asked?: Asked[]): NearClient {
  return replayClient(source, asked, (report, nonce) => {
    ((report as { model_attestations: Record<string, unknown>[] }).model_attestations[0] ?? {}).request_nonce = nonce;
  });
}

/** A client that hands back the recorded bytes unchanged: a replay, or a cache that never revalidated. */
function replayClient(source: unknown, asked?: Asked[], rebind?: (report: unknown, nonce: string) => void): NearClient {
  return {
    mode: 'direct',
    baseUrl: 'https://cloud-api.near.ai/v1',
    post: async () => {
      throw new Error('an attestation fixture never answers a completion');
    },
    get: (path: string, init?: { query?: Record<string, string> }) => {
      asked?.push({ path, query: init?.query });
      const report = JSON.parse(JSON.stringify(source)) as unknown;
      const nonce = init?.query?.nonce;
      if (rebind !== undefined && typeof nonce === 'string') rebind(report, nonce);
      const rawText = JSON.stringify(report);
      return Promise.resolve({ status: 200, path: 'attestation/report' as const, rawText, json: JSON.parse(rawText) });
    },
  } as unknown as NearClient;
}
