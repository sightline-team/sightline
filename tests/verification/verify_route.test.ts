import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { POST } from '@/app/api/verify/route';
import { createTrustSession, newNonce } from '@/lib/near-ai/attestation';
import type { NearClient } from '@/lib/near-ai/client';
import type { CheckResult } from '@/types';

/**
 * **T-03**, decided: `POST /api/verify` answers from the checks that need nothing but the report's own
 * bytes and SHA-384 (ADR-33).
 *
 * The property this file exists to hold is the narrow one: **a verifier that answers is a verifier that
 * can say no.** Two directions follow, and both are tested against the two *recorded* live reports
 * (`fixtures/attestation/`, **T-08**) rather than a hand-written report, because a check that has only
 * ever seen invented bytes is a check nobody has actually run:
 *
 * - Bytes that disagree with themselves, or with the nonce we sent, come back `failed` — and the gate
 *   then halts the run, exactly as it did while the route answered 501. The route landing must not be
 *   the reason a bad report started passing.
 * - Bytes that agree come back `partial`, never `verified`, because the four checks that need Intel's
 *   certificate service or NVIDIA's service (**B-12**) are still unanswered. A `verified` from this
 *   handler would be the strong word on a partial set (AGENTS.md §4 rule 5).
 *
 * The middle block runs the *real handler* behind the client's own `fetch`, so the composed gate is
 * measured too: `server_verification` appears once, no name appears twice, and a good live report ends
 * at `partial` with all four gaps still standing. That is what changed for a person using the app — a
 * live-mode run used to stop at the door because our own route said nothing, and silence is read as
 * failure on purpose (rule 6).
 */

const DIRECTORY = path.join(__dirname, '..', '..', 'fixtures', 'attestation');
const FILES = ['good-z-ai-glm-5.3-flash.json', 'good-Qwen-Qwen3.8-27B.json'] as const;

interface Fixture {
  slug: string;
  nonce: string;
  raw: Record<string, unknown>;
}

const fixtures: Fixture[] = FILES.map((file) => {
  const doc = JSON.parse(readFileSync(path.join(DIRECTORY, file), 'utf8')) as { _meta: { sentNonce: string }; report: Record<string, unknown> };
  return { slug: file.replace(/^good-/, '').replace(/\.json$/, ''), nonce: doc._meta.sentNonce, raw: doc.report };
});

const ask = async (body: unknown): Promise<Answer> => {
  const response = await POST(new Request('http://localhost/api/verify', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  // Read once: a `Response` body is a stream, and a helper that re-reads it to assert a second thing
  // fails with "Body is unusable" instead of failing a claim.
  const text = await response.text();
  return { status: response.status, text, body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>) };
};

interface Answer {
  status: number;
  text: string;
  body: Record<string, unknown>;
}

const askWith = (report: Record<string, unknown>, nonce: string, algo = 'ed25519') => ask({ report, nonce, signing_algo: algo });

const checksOf = (answer: Answer): CheckResult[] => (answer.body.checks as CheckResult[]) ?? [];
const server = (checks: CheckResult[]): CheckResult => checks.find((c) => c.name === 'server_verification')!;
const verdict = (answer: Answer): CheckResult => server(checksOf(answer));

describe('the verifier agrees only with bytes that agree with themselves (T-03, rule 6)', () => {
  for (const f of fixtures) {
    it(`${f.slug}: a recorded report and the nonce it was bound to come back partial, not verified`, async () => {
      const answer = await askWith(f.raw, f.nonce);
      expect(answer.status).toBe(200);
      expect(answer.body.status, 'the reachable ceiling while the four gaps stand').toBe('partial');
      const check = verdict(answer);
      expect(check.ran).toBe(true);
      expect(check.passed).toBe(true);
      expect(check.detail, 'the receipt says what this check is worth, in the same breath').toContain('second opinion');
      expect(answer.text, 'no path through this handler emits the strong word').not.toContain('verified');
    });

    it(`${f.slug}: a different nonce is a failure the verifier states, not a shrug`, async () => {
      const answer = await askWith(f.raw, newNonce());
      expect(verdict(answer).passed).toBe(false);
      expect(verdict(answer).detail).toContain('nonce_fresh');
      expect(answer.body).toMatchObject({ status: 'failed' });
    });

    it(`${f.slug}: a report whose quote was rewritten to name another key is refused`, async () => {
      const copy = JSON.parse(JSON.stringify(f.raw)) as { model_attestations: Record<string, unknown>[] };
      const quote = Buffer.from(String(copy.model_attestations[0]!.intel_quote), 'hex');
      // `report_data[0..32]` is the signing key half (SPIKE §3): flip its last byte and the quote names
      // an enclave that is not the one the report's own `signing_address` field offers.
      quote[48 + 520 + 31]! ^= 0x01;
      copy.model_attestations[0]!.intel_quote = quote.toString('hex');
      const check = verdict(await askWith(copy, f.nonce));
      expect(check.passed).toBe(false);
      expect(check.detail).toContain('quote_binds_attested_key');
    });

    it(`${f.slug}: a report with no model attestation fails instead of passing an empty set`, async () => {
      const check = verdict(await askWith({ model_attestations: [] }, f.nonce));
      expect(check.passed, 'nothing in the report is a failure, never an absence of one').toBe(false);
      expect(check.detail).toContain('attestation_report');
    });

    it(`${f.slug}: a report with no quote is stated as a thin re-read, not as agreement with everything`, async () => {
      const copy = JSON.parse(JSON.stringify(f.raw)) as { model_attestations: Record<string, unknown>[] };
      copy.model_attestations[0]!.intel_quote = '';
      const check = verdict(await askWith(copy, f.nonce));
      // Eight of the twelve checks cannot run without the quote, and the passing line has to carry that
      // count: "agreed with all of them" over four would read as a clean bill of health on twelve.
      expect(check.detail).toContain("ran 4 of the report's own 12 checks");
      expect(check.passed, 'no disagreement is not the same as a halt — the gate stops this one, see below').toBe(true);
    });
  }
});

describe('what the handler refuses to read at all', () => {
  const f = fixtures[0]!;

  it.each([
    ['a body that is not JSON', 'this is not json at all'],
    ['a body that is not an object', '"a string"'],
    ['a body with no report', JSON.stringify({ nonce: 'ab'.repeat(32) })],
  ])('%s is a 400 with a reason and nothing else', async (_label, raw) => {
    const answer = await ask(raw);
    expect(answer.status).toBe(400);
    expect(answer.body).toEqual({ error: 'invalid_request', item: 'T-03' });
  });

  it('rejects a nonce that is not 32 bytes of hex', async () => {
    for (const nonce of ['', 'short', `${'ab'.repeat(32)}cd`, 'zz'.repeat(32)]) {
      expect((await askWith(f.raw, nonce)).status, `nonce ${JSON.stringify(nonce)}`).toBe(400);
    }
  });

  it('takes the nonce it was given as data: a report bound to it passes, a mismatch fails', async () => {
    const uppercase = await askWith(f.raw, f.nonce.toUpperCase());
    expect(verdict(uppercase).passed, 'hex case is not a security boundary').toBe(true);
  });

  it('refuses an oversized body with 413 and never parses it', async () => {
    const huge = JSON.stringify({ report: f.raw, nonce: f.nonce, padding: 'a'.repeat(5 * 1024 * 1024) });
    expect(huge.length).toBeGreaterThan(4 * 1024 * 1024);
    const answer = await ask(huge);
    expect(answer.status).toBe(413);
    expect(answer.body).toEqual({ error: 'body_too_large', item: 'T-03' });
  });

  it('refuses early when content-length header exceeds cap before buffering stream', async () => {
    const res = await POST(new Request('http://localhost/api/verify', {
      method: 'POST',
      headers: { 'content-length': String(5 * 1024 * 1024) },
      body: 'small body but huge header',
    }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'body_too_large', item: 'T-03' });
  });

  it('measures the cap in bytes, because a limit a caller can negotiate is not a limit', async () => {
    // Two bytes per character on the wire, under the cap in `raw.length`: a caller that picks its
    // alphabet should not be able to double the size of what the handler agrees to parse.
    const pad = 'é'.repeat(2_202_009);
    const body = JSON.stringify({ report: f.raw, nonce: f.nonce, padding: pad });
    expect(body.length, 'under the cap by characters').toBeLessThan(4 * 1024 * 1024);
    expect(new TextEncoder().encode(body).length, 'over it by bytes').toBeGreaterThan(4 * 1024 * 1024);
    expect((await ask(body)).status).toBe(413);
  });

  it('echoes nothing back: no quote bytes, no key material, no report fields in the answer', async () => {
    const answer = await askWith(f.raw, f.nonce);
    const quote = String((f.raw.model_attestations as Record<string, unknown>[])[0]!.intel_quote).slice(0, 120);
    expect(answer.text).not.toContain(quote);
    expect(answer.text).not.toMatch(/signing_public_key|intel_quote|nvidia|tcb_info/);
    expect(answer.text).not.toContain(f.nonce);
  });

  it('has no GET: verification consumes a report, it does not serve one', async () => {
    const routes = await import('@/app/api/verify/route');
    expect('GET' in routes).toBe(false);
  });
});

describe('the real handler behind the client fetch, so the composed gate is measured (T-01 x T-03)', () => {
  /**
   * The client re-binds a fixture to whatever nonce the session minted — the same liberty the live
   * service takes (SPIKE §3) — so a good report can be walked through the gate at all.
   */
  function boundClient(source: Record<string, unknown>): NearClient {
    return {
      mode: 'direct',
      baseUrl: 'https://cloud-api.near.ai/v1',
      post: async () => {
        throw new Error('an attestation fixture never answers a completion');
      },
      get: (path: string, init?: { query?: Record<string, string> }) => {
        const report = JSON.parse(JSON.stringify(source)) as { model_attestations: Record<string, unknown>[] };
        const nonce = init?.query?.nonce ?? '';
        report.model_attestations[0]!.request_nonce = nonce;
        const quote = new Uint8Array(Buffer.from(String(report.model_attestations[0]!.intel_quote), 'hex'));
        new Uint8Array(Buffer.from(nonce, 'hex')).forEach((byte, i) => {
          quote[600 + i] = byte;
        });
        report.model_attestations[0]!.intel_quote = [...quote].map((b) => b.toString(16).padStart(2, '0')).join('');
        const rawText = JSON.stringify(report);
        return Promise.resolve({ status: 200, path: 'attestation/report' as const, rawText, json: JSON.parse(rawText) });
      },
    } as unknown as NearClient;
  }

  const routeAsFetch: typeof fetch = (input, init) => {
    // The client asks a *relative* URL, which is the whole point in a browser; in Node a `Request`
    // needs an origin, so the string is resolved against one instead of being passed through raw.
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const body = typeof init?.body === 'string' ? init.body : null;
    return Promise.resolve(POST(new Request(url, { method: 'POST', body })));
  };

  for (const f of fixtures) {
    it(`${f.slug}: a good live report now reaches partial with the gaps still named, so a live run can proceed`, async () => {
      const outcome = await createTrustSession({ client: boundClient(f.raw), fetchImpl: routeAsFetch }).gate({ model: f.slug, signal: new AbortController().signal });
      expect(outcome.status, 'this is the change that lets a live run send anything').toBe('partial');
      const names = outcome.checks.map((c) => c.name);
      expect(new Set(names).size, 'the server answer must not double-book a check name').toBe(names.length);
      expect(names.filter((n) => n === 'server_verification')).toHaveLength(1);
      expect(outcome.checks.find((c) => c.name === 'server_verification')!.passed).toBe(true);
      expect(outcome.checks.filter((c) => !c.ran).map((c) => c.name).sort()).toEqual([
        'gpu_evidence_verdict',
        'platform_still_trusted',
        'quote_signed_by_hardware',
        'report_expiry',
      ]);
    });

    it(`${f.slug}: and the gate still halts when the report is not ours`, async () => {
      const client = boundClient(f.raw);
      // A service that echoes a stale nonce: the fetch half is real, the report is someone else's.
      const stale = {
        ...client,
        get: (p: string, init?: { query?: Record<string, string> }) => {
          void p;
          void init;
          const rawText = JSON.stringify(f.raw);
          return Promise.resolve({ status: 200, path: 'attestation/report' as const, rawText, json: JSON.parse(rawText) });
        },
      } as unknown as NearClient;
      const outcome = await createTrustSession({ client: stale, fetchImpl: routeAsFetch }).gate({ model: f.slug, signal: new AbortController().signal });
      expect(outcome.status, 'a replayed report must stop the run, route answering or not').toBe('failed');
      expect(outcome.checks.find((c) => c.name === 'server_verification')!.passed).toBe(false);
    });

    it(`${f.slug}: a report with no quote halts for the quote, not by accident`, async () => {
      // The halt this line protects used to arrive through the route's 501. With the route answering,
      // a report with no hardware evidence would otherwise reach `partial` and send a document to a
      // machine nobody has shown is not in debug mode (AGENTS.md §4 rules 4 and 6).
      const source = JSON.parse(JSON.stringify(f.raw)) as { model_attestations: Record<string, unknown>[] };
      source.model_attestations[0]!.intel_quote = '';
      const outcome = await createTrustSession({ client: boundClient(source), fetchImpl: routeAsFetch }).gate({ model: f.slug, signal: new AbortController().signal });
      expect(outcome.status).toBe('failed');
      expect(outcome.checks.find((c) => c.name === 'quote_is_tdx')!.ran).toBe(false);
      expect(outcome.checks.find((c) => c.name === 'server_verification')!.passed, 'the verifier agreed with the four it could read').toBe(true);
    });
  }

  it('a verifier that lists only passing checks and states no verdict still cannot say verified', async () => {
    const optimistic = (async () =>
      new Response(JSON.stringify({ checks: [{ name: 'server_verification', ran: true, passed: true }] }), { status: 200 })) as unknown as typeof fetch;
    const outcome = await createTrustSession({ client: boundClient(fixtures[0]!.raw), fetchImpl: optimistic }).gate({ model: 'x', signal: new AbortController().signal });
    expect(outcome.status, 'an unstated verdict is not an inference the client gets to make').toBe('partial');
  });

  it('a verifier that answers 501 is still read as failure, not silence', async () => {
    const notBuilt = (async () => new Response(JSON.stringify({ error: 'not_implemented' }), { status: 501 })) as unknown as typeof fetch;
    const outcome = await createTrustSession({ client: boundClient(fixtures[0]!.raw), fetchImpl: notBuilt }).gate({ model: 'x', signal: new AbortController().signal });
    expect(outcome.status).toBe('failed');
  });
});
