import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attestationReportSchema, bindReport, createTrustSession, newNonce } from '@/lib/near-ai/attestation';
import type { AttestationReport } from '@/lib/near-ai/attestation';
import { QUOTE_CHECKS_THAT_CANNOT_RUN, checkQuote, readQuote, replayEventLog } from '@/lib/near-ai/quote';
import type { NearClient } from '@/lib/near-ai/client';
import type { CheckResult } from '@/types';

/**
 * **T-03's dependency-free half**: everything this build can decide about an Intel TDX quote with the
 * two libraries it already has (`@noble/hashes` for SHA-384, no new dependency — AGENTS.md §5).
 *
 * The subject is the 5,006-byte `intel_quote` inside each recorded report in `fixtures/attestation/`,
 * which is hardware evidence rather than a JSON description of hardware evidence. The layout is
 * `TDReport10` from `Phala-Network/dcap-qvl/src/quote.rs` — the same struct NEAR's own
 * `nearai-cloud-verifier` reads through `@phala/dcap-qvl-node` — and every field position in it is
 * asserted against all four quotes this repo holds (model + gateway, in two files each), which is what
 * makes a wrong offset fail here instead of silently reading noise.
 *
 * What this file refuses to imply, in three places:
 * - **The quote's own signature is not checked.** Not one test here verifies that Intel signed these
 *   bytes; the checks prove the quote agrees with the report beside it and binds our nonce and our key.
 *   `QUOTE_CHECKS_THAT_CANNOT_RUN` is the list of what stays unproven, and a test below pins it.
 * - **A perfect quote still cannot open the gate.** Twelve passing checks are not the whole set, so a
 *   composed session ends `failed` when the verifier says nothing and `partial` when it agrees — never
 *   `verified` (§4 rules 5 and 6). The gate cases below inject the verifier rather than trusting the
 *   real route's answer, which is `verify_route.test.ts`'s job since **T-03** built it.
 * - **Replay covers three registers, not four.** RTMR3's boot events are logged with an empty digest
 *   and no framing we could reproduce gets the value the quote carries, so the check's name and its
 *   detail both say which registers replayed.
 */

const DIRECTORY = path.join(__dirname, '..', '..', 'fixtures', 'attestation');
const FILES = ['good-z-ai-glm-5.3-flash.json', 'good-Qwen-Qwen3.8-27B.json'] as const;

interface Fixture {
  slug: string;
  nonce: string;
  raw: Record<string, unknown>;
  report: AttestationReport;
  model: Record<string, unknown>;
  gateway: Record<string, unknown>;
}

function load(file: string): Fixture {
  const doc = JSON.parse(readFileSync(path.join(DIRECTORY, file), 'utf8')) as {
    _meta: { sentNonce: string };
    report: Record<string, unknown>;
  };
  const parsed = attestationReportSchema.safeParse(doc.report);
  if (!parsed.success) throw new Error(`${file}: the app's own schema rejected its recorded report`);
  const attestations = doc.report.model_attestations as Record<string, unknown>[];
  return {
    slug: file.replace(/^good-/, '').replace(/\.json$/, ''),
    nonce: doc._meta.sentNonce,
    raw: doc.report,
    report: parsed.data,
    model: attestations[0]!,
    gateway: (doc.report.gateway_attestation ?? {}) as Record<string, unknown>,
  };
}

const fixtures = FILES.map(load);

/** Edit the quote bytes, re-encode, and hand back a report whose quote says something else. */
function withQuote(from: Fixture, change: (bytes: Uint8Array) => void, whose: 'model' | 'gateway' = 'model'): AttestationReport {
  const copy = JSON.parse(JSON.stringify(from.raw)) as Record<string, unknown>;
  const attestation = (whose === 'model' ? (copy.model_attestations as Record<string, unknown>[])[0] : copy.gateway_attestation) as Record<string, unknown>;
  const bytes = new Uint8Array(Buffer.from(String(attestation.intel_quote), 'hex'));
  change(bytes);
  attestation.intel_quote = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const parsed = attestationReportSchema.safeParse(copy);
  if (!parsed.success) throw new Error('edited bytes the schema rejects');
  return parsed.data;
}

const QUOTE_START = 48;
const at = (offset: number): number => QUOTE_START + offset;
const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const check = (checks: CheckResult[], name: string): CheckResult | undefined => checks.find((c) => c.name === name);
const passed = (checks: CheckResult[], name: string): boolean => check(checks, name)?.passed === true && check(checks, name)?.ran === true;

const quoteChecks = (f: Fixture, report = f.report, whose: 'model' | 'gateway' = 'model') => {
  const attestation = (whose === 'model' ? report.model_attestations?.[0] : report.gateway_attestation) as Record<string, unknown> | undefined;
  const expectedKey = whose === 'model' ? bindReport({ report, nonce: f.nonce, signingAlgo: 'ed25519' }).signingKey?.keyOrAddress : String(f.gateway.signing_address);
  return checkQuote({ attestation, nonce: f.nonce, label: whose, expectedKey });
};

const RAN_CHECKS = ['quote_is_tdx', 'td_not_debug', 'td_attributes_allowed', 'quote_binds_our_nonce', 'quote_binds_attested_key', 'quote_binds_compose_hash', 'quote_matches_report_measurements', 'event_log_replays_rtmr0_to_2'];

// ------------------------------------------------------------------ the layout is the one NEAR's verifier reads

describe('the quote is indexed at the offsets NEAR’s own verifier uses (T-03)', () => {
  it('all four recorded quotes are version-4 TDX quotes carrying the full 584-byte report', () => {
    for (const f of fixtures) {
      for (const [whose, attestation] of [['model', f.model], ['gateway', f.gateway]] as const) {
        const read = readQuote(attestation.intel_quote as string);
        expect(read.ok, `${f.slug} ${whose}`).toBe(true);
        if (!read.ok) continue;
        expect(read.quote.version).toBe(4);
        expect(read.quote.attestationKeyKind).toBe(2);
        expect(read.quote.report.reportData.length).toBe(64);
      }
    }
  });

  it('every measurement the report publishes beside the quote is found at the same offset in the quote', () => {
    // This is the layout's own proof: `mr_td`, `rt_mr0..3` and `mr_config_id` are located by offset and
    // then compared to what the JSON says. An offset wrong by four bytes matches nothing.
    for (const f of fixtures) {
      for (const [whose, attestation] of [['model', f.model], ['gateway', f.gateway]] as const) {
        const read = readQuote(attestation.intel_quote as string);
        if (!read.ok) throw new Error(`${f.slug} ${whose}: unreadable quote`);
        const tcb = (attestation.info as { tcb_info: Record<string, string> }).tcb_info;
        expect(hex(read.quote.report.mrTd), `${f.slug} ${whose}: mr_td`).toBe(tcb.mrtd!.toLowerCase());
        for (const [i, rtmr] of [read.quote.report.rtMr0, read.quote.report.rtMr1, read.quote.report.rtMr2, read.quote.report.rtMr3].entries()) {
          expect(hex(rtmr), `${f.slug} ${whose}: rt_mr${i}`).toBe(tcb[`rtmr${i}`]!.toLowerCase());
        }
        expect(hex(read.quote.report.mrConfigId).startsWith(`01${tcb.compose_hash!.toLowerCase()}`), `${f.slug} ${whose}: mr_config_id = 0x01 ‖ SHA-256(app_compose)`).toBe(true);
      }
    }
  });

  it('report_data holds the session key in its first 32 bytes and the nonce we minted in its last 32', () => {
    for (const f of fixtures) {
      const read = readQuote(f.model.intel_quote as string);
      if (!read.ok) throw new Error('unreadable');
      const { reportData } = read.quote.report;
      expect(hex(reportData.subarray(32, 64)), `${f.slug}: the nonce the quote binds`).toBe(f.nonce.toLowerCase());
      expect(hex(reportData.subarray(0, 32)), `${f.slug}: the key the quote binds`).toBe(String(f.model.signing_public_key).toLowerCase());
      // Measured: for an Ed25519 model attestation the address and the public key are the same 32 bytes.
      expect(String(f.model.signing_address).toLowerCase(), `${f.slug}: address and key differ`).toBe(String(f.model.signing_public_key).toLowerCase());
    }
  });

  it('the gateway quote binds its own address, which is why the caller passes the key in', () => {
    for (const f of fixtures) {
      const read = readQuote(f.gateway.intel_quote as string);
      if (!read.ok) throw new Error('unreadable');
      expect(hex(read.quote.report.reportData.subarray(0, 32))).toBe(String(f.gateway.signing_address).toLowerCase());
      expect(hex(read.quote.report.reportData.subarray(32, 64))).toBe(f.nonce.toLowerCase());
    }
  });

  it('td_attributes says SEPT_VE_DISABLE and nothing else: not debug, and no forbidden bits', () => {
    for (const f of fixtures) {
      const read = readQuote(f.model.intel_quote as string);
      if (!read.ok) throw new Error('unreadable');
      expect(hex(read.quote.report.tdAttributes), f.slug).toBe('0000001000000000');
      expect(read.quote.report.tdAttributes[0]! & 0x01).toBe(0);
    }
  });
});

// ------------------------------------------------------------------------ every check, on real bytes

describe('checkQuote decides eight things on its own, with no new dependency (T-03)', () => {
  it('a recorded report passes all eight, for both models this app attests to', () => {
    for (const f of fixtures) {
      const checks = quoteChecks(f);
      expect(checks.map((c) => c.name)).toEqual(RAN_CHECKS);
      for (const name of RAN_CHECKS) expect(passed(checks, name), `${f.slug}: ${name} — ${check(checks, name)?.detail ?? 'passed'}`).toBe(true);
    }
  });

  it('the boot log replays registers 0, 1 and 2 and the check says register 3 is not in it', () => {
    for (const f of fixtures) {
      const read = readQuote(f.model.intel_quote as string);
      if (!read.ok) throw new Error('unreadable');
      const replay = replayEventLog(f.model.event_log, { rtMr0: read.quote.report.rtMr0, rtMr1: read.quote.report.rtMr1, rtMr2: read.quote.report.rtMr2 });
      expect(replay.replayed, `${f.slug}: which registers replay`).toEqual([0, 1, 2]);
      expect(replay.mismatched).toEqual([]);
      const detail = check(quoteChecks(f), 'event_log_replays_rtmr0_to_2')!.detail!;
      expect(detail, 'the receipt must never read as though all four registers replayed').toContain('Register 3 is not included');
    }
  });

  it('a gateway attestation whose event log is a string reports the replay as not run, not as a failure', () => {
    for (const f of fixtures) {
      expect(typeof f.gateway.event_log, `${f.slug}: measured as a string`);
      const checks = quoteChecks(f, f.report, 'gateway');
      const replay = check(checks, 'event_log_replays_rtmr0_to_2')!;
      expect(replay.ran).toBe(false);
      expect(replay.passed).toBe(false);
      expect(replay.detail).toContain('not a list of measurements');
    }
  });
});

// ------------------------------------------------------------------------ one byte at a time

describe('each check fails for its own reason, and only for it (T-03)', () => {
  const cases: { name: string; label: string; change: (bytes: Uint8Array) => void; expectFailed: string; expectPassed: string[] }[] = [
    {
      name: 'nonce',
      label: 'a quote bound to somebody else’s request',
      change: (b) => { b[at(552)] = b[at(552)]! ^ 0x01; },
      expectFailed: 'quote_binds_our_nonce',
      expectPassed: ['quote_is_tdx', 'quote_binds_attested_key', 'quote_binds_compose_hash', 'quote_matches_report_measurements'],
    },
    {
      name: 'key',
      label: 'a quote naming a different signing key',
      change: (b) => { b[at(520)] = b[at(520)]! ^ 0x01; },
      expectFailed: 'quote_binds_attested_key',
      expectPassed: ['quote_binds_our_nonce', 'quote_matches_report_measurements', 'event_log_replays_rtmr0_to_2'],
    },
    {
      name: 'debug',
      label: 'a quote saying the enclave is debuggable',
      change: (b) => { b[at(120)] = b[at(120)]! | 0x01; },
      expectFailed: 'td_not_debug',
      expectPassed: ['quote_is_tdx', 'quote_binds_our_nonce', 'td_attributes_allowed'],
    },
    {
      name: 'forbidden attribute',
      label: 'a quote setting a bit Intel forbids',
      change: (b) => { b[at(120)] = b[at(120)]! | 0x02; },
      expectFailed: 'td_attributes_allowed',
      expectPassed: ['td_not_debug', 'quote_binds_our_nonce'],
    },
    {
      name: 'compose hash',
      label: 'a quote measuring a different software stack',
      change: (b) => { b[at(185)] = b[at(185)]! ^ 0x01; },
      expectFailed: 'quote_binds_compose_hash',
      expectPassed: ['quote_binds_our_nonce', 'quote_matches_report_measurements'],
    },
    {
      name: 'measurement',
      label: 'a quote disagreeing with the report about the machine',
      change: (b) => { b[at(328)] = b[at(328)]! ^ 0x01; },
      expectFailed: 'quote_matches_report_measurements',
      expectPassed: ['quote_binds_our_nonce', 'quote_binds_compose_hash', 'quote_is_tdx'],
    },
  ];

  for (const scenario of cases) {
    it(scenario.label, () => {
      for (const f of fixtures) {
        const tampered = withQuote(f, scenario.change);
        const checks = quoteChecks(f, tampered);
        const failed = check(checks, scenario.expectFailed)!;
        expect(failed.ran, `${f.slug}: ${scenario.name} — a check that could not run is not a check that failed`).toBe(true);
        expect(failed.passed, `${f.slug}: ${scenario.name}`).toBe(false);
        expect(failed.detail, `${f.slug}: ${scenario.name} has to explain itself on the receipt`).toBeTruthy();
        for (const name of scenario.expectPassed) expect(passed(checks, name), `${f.slug}: ${name} should still pass when only ${scenario.name} changed`).toBe(true);
      }
    });
  }

  it('the replay breaks when a logged measurement is changed, which arithmetic alone would not catch', () => {
    for (const f of fixtures) {
      const log = JSON.parse(JSON.stringify(f.model.event_log)) as { imr: number; digest: string }[];
      const first = log.find((event) => event.imr === 2 && event.digest.length === 96)!;
      first.digest = flip(first.digest);
      const attestation = { ...f.model, event_log: log };
      const checks = checkQuote({ attestation, nonce: f.nonce, label: 'model', expectedKey: String(f.model.signing_public_key) });
      // Register 2 has two events; changing one leaves the recomputed value short of what the quote says.
      expect(passed(checks, 'event_log_replays_rtmr0_to_2'), f.slug).toBe(false);
      expect(check(checks, 'event_log_replays_rtmr0_to_2')!.detail).toContain('does not reproduce register 2');
      expect(passed(checks, 'quote_matches_report_measurements'), `${f.slug}: the quote still agrees with the JSON — these are two different questions`).toBe(true);
    }
  });
});

function flip(hexString: string): string {
  const last = hexString.at(-1);
  return `${hexString.slice(0, -1)}${last === 'f' ? 'e' : 'f'}`;
}

// ------------------------------------------------------------------------ what cannot be read at all

describe('a report with no readable quote says so instead of passing quietly (T-03)', () => {
  const unreadable: [string, string | undefined, string][] = [
    ['absent', undefined, 'no hardware quote'],
    ['empty', '', 'no hardware quote'],
    ['not hex', 'zz', 'not hex'],
    ['a version-3 (SGX) quote', `0300${'00'.repeat(44)}${'00'.repeat(236)}`, 'quote version 3'],
    ['a quote truncated mid-report', `0400020081000000${'00'.repeat(100)}`, 'bytes of report'],
  ];

  for (const [label, value, expected] of unreadable) {
    it(label, () => {
      for (const f of fixtures) {
        const checks = checkQuote({ attestation: { ...f.model, intel_quote: value }, nonce: f.nonce, label: 'the model enclave', expectedKey: String(f.model.signing_public_key) });
        expect(checks.length).toBe(RAN_CHECKS.length);
        expect(checks.every((c) => c.ran === false && c.passed === false), `${f.slug}: ${label}`).toBe(true);
        expect(checks[0]!.detail, 'the first line a reader hears has to name the problem').toContain(expected);
        expect(checks.slice(1).every((c) => c.detail === 'no quote to read')).toBe(true);
      }
    });
  }

  it('the four checks this build cannot run are named, so the receipt states the gap rather than implying it', () => {
    expect(QUOTE_CHECKS_THAT_CANNOT_RUN.map((c) => c.name)).toEqual([
      'quote_signed_by_hardware',
      'platform_still_trusted',
      'gpu_evidence_verdict',
      'report_expiry',
    ]);
    for (const entry of QUOTE_CHECKS_THAT_CANNOT_RUN) {
      expect(entry.ran, entry.name).toBe(false);
      expect(entry.passed, entry.name).toBe(false);
      expect(entry.detail!.length, `${entry.name}: a silent gap is how a receipt overclaims`).toBeGreaterThan(30);
      // Plain language, because the receipt is read aloud (AGENTS §8): jargon belongs in the details view.
      expect(entry.detail, `${entry.name}: jargon in the spoken line`).not.toMatch(/\b(TDX|NRAS|PCK|TDCALL|MBZ)\b/);
    }
  });
});

// ------------------------------------------------------------------------ the gate, unchanged in the direction that matters

describe('the gate around a real quote: what it can say, and what it still cannot (§4 rules 4, 5, 6)', () => {
  /**
   * The recording, re-bound to whatever nonce the session minted — the report field *and* the 32 bytes
   * of `report_data` inside the quote, so a quote check can never fail on a fixture artifact rather
   * than on a property of the report. That re-binding is the one liberty this block takes, and it is
   * the liberty the service itself already takes (SPIKE §3: the nonce echoes wherever it is asked for).
   */
  function livingClient(source: Record<string, unknown>, change?: (bytes: Uint8Array) => void): NearClient {
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
        const bytes = new Uint8Array(Buffer.from(String(report.model_attestations[0]!.intel_quote), 'hex'));
        new Uint8Array(Buffer.from(nonce, 'hex')).forEach((byte, i) => {
          bytes[at(552) + i] = byte;
        });
        change?.(bytes);
        report.model_attestations[0]!.intel_quote = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        const rawText = JSON.stringify(report);
        return Promise.resolve({ status: 200, path: 'attestation/report' as const, rawText, json: JSON.parse(rawText) });
      },
    } as unknown as NearClient;
  }

  /** A verifier that agrees — the counterfactual `/api/verify` becomes once **B-12** is answered. */
  const agreeableVerifier = (checks: { name: string; ran: boolean; passed: boolean }[]) =>
    (async () => new Response(JSON.stringify({ status: checks.every((c) => c.ran && c.passed) ? 'verified' : 'partial', checks }), { status: 200 })) as unknown as typeof fetch;

  const gateOf = (f: Fixture, client: NearClient, fetchImpl: typeof fetch) =>
    createTrustSession({ client, fetchImpl, signingAlgo: 'ed25519' }).gate({ model: f.slug, signal: new AbortController().signal });

  const heavy = QUOTE_CHECKS_THAT_CANNOT_RUN.map((c) => ({ name: c.name, ran: true, passed: true }));

  it('a verifier that answers 501 ends the session failed, so twelve passing checks alone open nothing', async () => {
    for (const f of fixtures) {
      const outcome = await gateOf(f, livingClient(f.raw), (async () => new Response(JSON.stringify({ error: 'not_implemented' }), { status: 501 })) as unknown as typeof fetch);
      for (const name of RAN_CHECKS) expect(check(outcome.checks, name)!.ran, `${f.slug}: ${name} ran against the real quote`).toBe(true);
      expect(passed(outcome.checks, 'td_not_debug'), f.slug).toBe(true);
      expect(passed(outcome.checks, 'quote_binds_our_nonce'), `${f.slug}: the quote is bound to the nonce this session minted`).toBe(true);
      expect(outcome.status, f.slug).toBe('failed');
      expect(check(outcome.checks, 'server_verification')!.passed).toBe(false);
    }
  });

  it('even a verifier that agrees cannot call this verified while the hardware signature went unchecked (rule 5)', async () => {
    for (const f of fixtures) {
      const outcome = await gateOf(f, livingClient(f.raw), agreeableVerifier([{ name: 'compose_manager_actions', ran: true, passed: true }]));
      for (const name of RAN_CHECKS) expect(passed(outcome.checks, name), `${f.slug}: ${name}`).toBe(true);
      expect(outcome.status, `${f.slug}: every browser check passes, and the word is still not "verified"`).toBe('partial');
      for (const gap of QUOTE_CHECKS_THAT_CANNOT_RUN) expect(check(outcome.checks, gap.name)!.ran, `${f.slug}: ${gap.name}`).toBe(false);
    }
  });

  it('when the heavy checks do run, their placeholder retires by name and `verified` becomes reachable', async () => {
    for (const f of fixtures) {
      const outcome = await gateOf(f, livingClient(f.raw), agreeableVerifier(heavy));
      expect(outcome.status, f.slug).toBe('verified');
      const listed = outcome.checks.filter((c) => c.name === 'quote_signed_by_hardware');
      expect(listed.length, `${f.slug}: a placeholder and a verdict for one check is two lines about one thing`).toBe(1);
      expect(listed[0]!.ran).toBe(true);
    }
  });

  it('a quote saying the enclave is debuggable halts the run even when every other voice agrees', async () => {
    for (const f of fixtures) {
      const outcome = await gateOf(f, livingClient(f.raw, (bytes) => { bytes[at(120)] = bytes[at(120)]! | 0x01; }), agreeableVerifier(heavy));
      expect(passed(outcome.checks, 'td_not_debug'), f.slug).toBe(false);
      expect(outcome.status, 'a debuggable enclave is one its operator can read; nothing document-derived may be sent').toBe('failed');
    }
  });
});
