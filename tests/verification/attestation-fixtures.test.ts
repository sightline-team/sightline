import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ed25519 } from '@noble/curves/ed25519.js';
import { POST } from '@/app/api/verify/route';
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
 * - It does **not** check Intel's signature over a TDX quote, and so cannot say the platform is still
 *   trusted or that the GPU was ever looked at. Those four gaps are T-03's remaining half, they need
 *   `dcap-qvl-node` and fresh evidence (**B-12**), and the gate now names them as gaps rather than
 *   quietly omitting them. A stored quote is stale by construction, which is why `report_expiry` is one
 *   of the four. What *does* run here — since T-03's dependency-free half landed — is the quote's own
 *   bytes: see the `QUOTE_CHECKS` list in the gate block below.
 * - A `verified` status from `bindReport` is *four shape-and-binding checks*, not proof an enclave made
 *   the report. The `foreign_key` case below is the demonstration: a report naming a key we invented
 *   passes every check the browser half can run.
 * - The gate is `failed` for every case here, good included, because the gate block below injects a
 *   verifier that answers 501. **T-03** has since built the real route, whose own contract is in
 *   `verify_route.test.ts`; the injection stays because "fail closed" has to be shown to still hold on
 *   real report bytes when the verifier says nothing.
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

/** T-03's dependency-free half, named here in order so the gate assertions below are a contract, not a count. */
const QUOTE_CHECKS = [
  'quote_is_tdx',
  'td_not_debug',
  'td_attributes_allowed',
  'quote_binds_our_nonce',
  'quote_binds_attested_key',
  'quote_binds_compose_hash',
  'quote_matches_report_measurements',
  'event_log_replays_rtmr0_to_2',
];
/** The half that needs `dcap-qvl-node` and fresh collateral (**B-12**): stated by name so the receipt says the gap. */
const GAPS = ['quote_signed_by_hardware', 'platform_still_trusted', 'gpu_evidence_verdict', 'report_expiry'];

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
      // `info` is the one place T-03 widened the schema, and this is the assertion that makes it a
      // decision rather than drift: the kept keys are exactly the measurements the quote is compared
      // against — the registers on `tcb_info`, `compose_hash` and `device_id` on both levels — in the
      // order the schema names them. Nothing else came back. `app_cert`, `instance_id`, `app_id`,
      // `mr_aggregated`, `key_provider_info` and `vm_config` are still stripped, and the compose body
      // T-03 must hash is still kept by digest only, in `_meta.redacted`.
      const modelInfo = keptModel.info as Record<string, unknown>;
      expect(Object.keys(modelInfo)).toEqual(['compose_hash', 'device_id', 'tcb_info']);
      expect(Object.keys(modelInfo.tcb_info as Record<string, unknown>)).toEqual([
        'mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3', 'os_image_hash', 'compose_hash', 'device_id',
      ]);
      const keptJson = JSON.stringify(keptModel.info);
      for (const banned of ['app_cert', 'instance_id', 'mr_aggregated', 'key_provider_info', 'vm_config', 'event_log']) {
        expect(keptJson, `${f.slug}: ${banned} came back through a schema that was only meant to see measurements`).not.toContain(banned);
      }
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
    // 30 s, not the default 5: the two recorded reports are ~300 KB each and this test stringifies
    // them repeatedly; under 38 parallel workers it starved past 5 s twice while passing alone in
    // 4 s. The assertions are unchanged — only the wall-clock allowance, same reason as A-17.3.
  }, 30_000);
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

/**
 * The app's own `/api/verify` handler behind a `fetch` signature, so a gate call in these tests runs
 * the route that actually ships (**T-03**) rather than a stand-in for it.
 */
const realRouteFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  return Promise.resolve(POST(new Request(url, { method: 'POST', body: typeof init?.body === 'string' ? init.body : null })));
};

describe('the gate refuses every shape of report when the verifier refuses (T-06, rule 6)', () => {
  const refusedFetch: typeof fetch = async () => new Response(JSON.stringify({ error: 'not_implemented', item: 'T-03' }), { status: 501, headers: { 'content-type': 'application/json' } }) as Response;

  const gateWith = async (client: NearClient, model: string) => {
    const session = createTrustSession({ client, fetchImpl: refusedFetch, ttlMs: 0 });
    return { outcome: await session.gate({ model, signal: new AbortController().signal }), session };
  };

  it('a service that echoes our fresh nonce in every place it is carried still cannot send: twelve passes and one loud failure', async () => {
    const f = fixtures[0]!;
    const { outcome } = await gateWith(livingClient(f.raw), f.meta.model);
    expect(outcome.status).toBe('failed');
    expect(outcome.checks.filter((c) => c.ran && !c.passed).map((c) => c.name)).toEqual(['server_verification']);
    expect(outcome.checks.filter((c) => c.ran && c.passed).map((c) => c.name)).toEqual([...f.meta.shouldPass, ...QUOTE_CHECKS]);
    expect(outcome.checks.filter((c) => !c.ran).map((c) => c.name)).toEqual(GAPS);
    // 4 from bindReport, 8 from the quote, 4 that need a verifier this build may not depend on yet
    // (B-12), 1 from `/api/verify`. The receipt has to carry all seventeen; rule 5.
    expect(outcome.checks).toHaveLength(4 + QUOTE_CHECKS.length + GAPS.length + 1);
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
    expect(outcome.checks.filter((c) => c.ran && !c.passed).map((c) => c.name).sort()).toEqual(['nonce_fresh', 'quote_binds_our_nonce', 'server_verification']);
    expect(check(outcome.checks, 'nonce_fresh')?.detail).toMatch(/different nonce/);
  });

  it('a service that re-echoes the JSON field but cannot rewrite the quote is caught by the quote', async () => {
    // `request_nonce` is a string the service types. The nonce in `report_data` is bytes the enclave wrote
    // into a quote Intel then signed. Rebinding only the first is the shape of a lie about a report — and
    // this case is what makes T-03's byte half worth running in the browser at all.
    const f = fixtures[0]!;
    const fieldOnly = replayClient(f.raw, undefined, (report, nonce) => {
      ((report as { model_attestations: Record<string, unknown>[] }).model_attestations?.[0] ?? {}).request_nonce = nonce;
    });
    const { outcome } = await gateWith(fieldOnly, f.meta.model);
    expect(outcome.status).toBe('failed');
    expect(check(outcome.checks, 'nonce_fresh')?.passed, 'the field claims freshness, and that half is fooled').toBe(true);
    expect(outcome.checks.filter((c) => c.ran && !c.passed).map((c) => c.name)).toEqual(['quote_binds_our_nonce', 'server_verification']);
  });

  it('a tampered echo and a replayed recording are the same refusal — one line of defence, two ways to trip it', async () => {
    const f = fixtures[0]!;
    const tampered = derive(f, 'tampered_nonce', (model0) => {
      model0.request_nonce = flipLastHex(String(model0.request_nonce));
    });
    const { outcome } = await gateWith(replayClient(tampered), f.meta.model);
    const replayed = await gateWith(replayClient(f.raw), f.meta.model);
    expect(outcome.status).toBe(replayed.outcome.status);
    expect(outcome.checks.filter((c) => c.ran && !c.passed).map((c) => c.name)).toEqual(replayed.outcome.checks.filter((c) => c.ran && !c.passed).map((c) => c.name));
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

  it('the README names exactly the checks the gate emits, under the heading each one belongs to (T-14)', async () => {
    // AGENTS.md §9 puts a "checks that ran / did not" list in the README and requires it to *match*
    // `CheckResult` output. A hand-copied list drifts the day a check is added, so the list is taken from
    // a real gate call over a recorded report and compared with the page in both directions: every name
    // the gate emitted must be on the page, under the column its own `ran`/`passed` puts it in, and every
    // name on the page must be one the gate emitted.
    //
    // **T-03** changed which gate call this has to be. While `/api/verify` was a 501 stub the honest list
    // came from a refusing verifier; the route now answers, so the published list is pinned against the
    // *real handler* behind the client's own fetch. The refusing-verifier columns stay on the page as a
    // case of their own (`verify_route.test.ts`), never as what this build does.
    const f = fixtures[0]!;
    const session = createTrustSession({ client: livingClient(f.raw), fetchImpl: realRouteFetch, ttlMs: 0 });
    const outcome = await session.gate({ model: f.meta.model, signal: new AbortController().signal });
    expect(outcome.status, 'a good recorded report with the route answering is the shape the page describes').toBe('partial');
    const readme = readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
    const line = (label: string): string[] => {
      const hit = readme.match(new RegExp(`^- \\*\\*${label}:\\*\\* (.+)$`, 'm'));
      if (hit === null) throw new Error(`README has no "- **${label}:**" line — T-14's list is that line`);
      const text = hit[1]!.trim();
      // An em dash is the page saying out loud that nothing belongs in the column. Silence from a
      // heading that exists is not the same as a heading that says "none", and only the second one
      // survives being read aloud.
      if (text === '—') return [];
      return text.split(',').map((token) => token.trim().replace(/^`|`$/g, ''));
    };
    const byColumn = {
      ranAndPassed: line('Ran, and passed'),
      ranAndFailed: line('Ran, and did not pass'),
      didNotRun: line('Did not run'),
    };
    const published = [...byColumn.ranAndPassed, ...byColumn.ranAndFailed, ...byColumn.didNotRun];
    expect(new Set(published).size, 'a check named under two headings is not one check').toBe(published.length);
    expect(published.sort(), 'the README and the gate disagree about which checks exist').toEqual(outcome.checks.map((c) => c.name).sort());
    for (const c of outcome.checks) {
      const column = c.ran ? (c.passed ? byColumn.ranAndPassed : byColumn.ranAndFailed) : byColumn.didNotRun;
      expect(column, `${c.name} is listed under the wrong heading`).toContain(c.name);
    }
  });
});

interface Asked {
  path: string;
  query?: Record<string, string>;
}

/**
 * A client that behaves the way the service was measured to behave (§3): it echoes back the nonce it
 * was just asked for, in both places the model attestation carries it — the `request_nonce` string and
 * the 32 bytes of `report_data` the enclave wrote (docs/SPIKE_RESULTS.md §3). Used to show that even a
 * *fully* cooperative service cannot get a document out of this build while the verifier refuses.
 */
function livingClient(source: unknown, asked?: Asked[]): NearClient {
  return replayClient(source, asked, (report, nonce) => {
    const model0 = (report as { model_attestations?: Record<string, unknown>[] }).model_attestations?.[0] ?? {};
    model0.request_nonce = nonce;
    writeQuoteNonce(model0, nonce);
  });
}

/**
 * Overwrite `report_data[32..64]` inside a v4 TDX quote: bytes 600..631 of the whole quote, which is
 * hex characters 1200..1263. Only the model attestation's quote is rewritten because only that quote is
 * read by the gate today.
 */
function writeQuoteNonce(model0: Record<string, unknown>, nonce: string): void {
  const quote = String(model0.intel_quote ?? '');
  if (quote.length < 1264) return;
  model0.intel_quote = `${quote.slice(0, 1200)}${nonce}${quote.slice(1264)}`;
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
