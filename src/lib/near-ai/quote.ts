import { sha384 } from '@noble/hashes/sha2.js';
import { decodeHex } from '@/lib/near-ai/signatures';
import type { ModelAttestation } from '@/lib/near-ai/attestation';
import type { CheckResult } from '@/types';

/**
 * The Intel TDX quote inside an attestation report — what this build can decide about it with the
 * dependencies it already has (item **T-03**'s dependency-free half, AGENTS.md §4 rule 6).
 *
 * Why these checks live here rather than behind `/api/verify`: ARCH §10 says that if a check can run
 * in the browser, prefer that, because a browser that decides a check trusts only its own arithmetic,
 * while a check run on our server is a verdict the user takes on faith. Eight of the quote's checks
 * are byte reading and SHA-384. Two are not ours to run here at all, and they are listed as
 * `ran: false` so the receipt names the gap instead of leaving it implied.
 *
 * **The field layout is not guessed and not derived from our own fixtures.** It is `TDReport10` from
 * `Phala-Network/dcap-qvl/src/quote.rs` — the struct that `nearai/nearai-cloud-verifier`'s
 * `ts/model_verifier.ts` obtains by calling `@phala/dcap-qvl-node`, i.e. the same layout NEAR's own
 * verifier reads, transcribed here because we only need to *index* the report, not to verify the
 * signature over it. A version-4 TDX quote is a 48-byte header and then the 584-byte report, with no
 * length prefix in front of it (that prefix belongs to version 5), and six quotes agree with that at
 * every offset — the four in `fixtures/attestation/` and two live reports read on 2026-11-05 by
 * `npm run spike -- --stage=attestation` — with zero drift (`docs/SPIKE_RESULTS.md` §3). The parse is
 * also self-checking: a layout off by four bytes cannot produce a quote whose measurement registers
 * match the ones the report publishes next to them, and `quote_matches_report_measurements` is exactly
 * that comparison.
 *
 * What all of this still does **not** establish, and what no check in this file can: that the quote
 * was written by genuine Intel hardware. Verifying the signature over these bytes needs Intel's
 * certificate service and its freshness data, which is the `dcap-qvl-node` decision recorded as
 * **B-12**. Every detail below is written so that a person reading the receipt aloud hears
 * "consistent inside the report", never "the hardware was verified".
 */

export const QUOTE_HEADER_BYTES = 48;
export const TD_REPORT_BYTES = 584;

/** Intel `sgx_quote4_t` for TDX: version 4 with `tee_type` 0x00000081. */
const QUOTE_VERSION_TDX = 4;
const TEE_TYPE_TDX = 0x81;

/** Offsets inside the 584-byte report (`TDReport10`), and the width of each field. */
const REPORT_FIELDS = {
  teeTcbSvn: [0, 16],
  mrSeam: [16, 48],
  mrSignerSeam: [64, 48],
  seamAttributes: [112, 8],
  tdAttributes: [120, 8],
  xfam: [128, 8],
  mrTd: [136, 48],
  mrConfigId: [184, 48],
  mrOwner: [232, 48],
  mrOwnerConfig: [280, 48],
  rtMr0: [328, 48],
  rtMr1: [376, 48],
  rtMr2: [424, 48],
  rtMr3: [472, 48],
  reportData: [520, 64],
} as const satisfies Record<string, readonly [number, number]>;

const REPORT_BYTES = REPORT_FIELDS.reportData[0] + REPORT_FIELDS.reportData[1];

/**
 * `report_data` is the 64 bytes the TD itself asks the hardware to sign: the first 32 name who the
 * enclave talks to, the last 32 are the raw request nonce. NEAR's verifier reads the pair the same way
 * (`checkReportData`), with the first half either the signing key/address right-padded with zeros or,
 * when a TLS fingerprint was asked for, a SHA-256 over both. This app asks for no fingerprint, and the
 * recorded quotes carry the key itself (SPIKE §3).
 */
const REPORT_DATA_KEY_BYTES = 32;
const NONCE_BYTES_IN_REPORT_DATA = 32;

/** `mr_config_id` is `0x01` followed by the SHA-256 of the compose manifest, then zeros (SPIKE §3). */
const MR_CONFIG_PREFIX = 0x01;

/** TD attributes, little-endian: bit 0 of the first byte is TUD/DEBUG (Intel 348551, dcap-qvl `TUDFlags`). */
const DEBUG_BIT = 0x01;

/**
 * Bits Intel's TDX 1.5 ABI requires a verifier to reject as must-be-zero, transcribed from dcap-qvl's
 * `TD_ATTRIBUTES_RESERVED_MBZ_MASK`: 1..3, 7..15, 23..26, 32..61. A quote that sets one of these is
 * describing a TD state Intel says cannot exist, so treating it as a pass would be reading the
 * hardware's own words as a shrug.
 */
const TD_RESERVED_MBZ: readonly [number, number][] = [[1, 3], [7, 15], [23, 26], [32, 61]];

export interface TdReport {
  teeTcbSvn: Uint8Array;
  mrSeam: Uint8Array;
  mrSignerSeam: Uint8Array;
  seamAttributes: Uint8Array;
  tdAttributes: Uint8Array;
  xfam: Uint8Array;
  mrTd: Uint8Array;
  mrConfigId: Uint8Array;
  mrOwner: Uint8Array;
  mrOwnerConfig: Uint8Array;
  rtMr0: Uint8Array;
  rtMr1: Uint8Array;
  rtMr2: Uint8Array;
  rtMr3: Uint8Array;
  reportData: Uint8Array;
}

export interface TdxQuote {
  version: number;
  /** `attestation_key_type` in the header. Recorded, never gated on: see `quote_is_tdx`'s note. */
  attestationKeyKind: number;
  report: TdReport;
}

export type QuoteRead = { ok: true; quote: TdxQuote } | { ok: false; problem: string };

/**
 * Index a `intel_quote` hex string. Deliberately returns a reason instead of throwing: a report whose
 * quote cannot be read is a *finding* the receipt has to state, not a crash, and the caller decides
 * whether "no quote at all" is a `ran: false` or a failure.
 */
export function readQuote(hex: string | undefined): QuoteRead {
  if (hex === undefined || hex.length === 0) return { ok: false, problem: 'this attestation carries no hardware quote' };
  const bytes = decodeHex(hex);
  if (bytes === undefined) return { ok: false, problem: 'the hardware quote is not hex' };
  if (bytes.length < QUOTE_HEADER_BYTES) return { ok: false, problem: `the quote is ${bytes.length} bytes, shorter than a quote header` };
  const version = bytes[1]! * 256 + bytes[0]!;
  const attestationKeyKind = bytes[3]! * 256 + bytes[2]!;
  const teeType = bytes[7]! * 0x1000000 + bytes[6]! * 0x10000 + bytes[5]! * 0x100 + bytes[4]!;
  if (version !== QUOTE_VERSION_TDX) return { ok: false, problem: `quote version ${version}, expected ${QUOTE_VERSION_TDX} for a TDX quote` };
  if (teeType !== TEE_TYPE_TDX) return { ok: false, problem: `quote names TEE type 0x${teeType.toString(16)}, expected 0x81 (TDX)` };
  if (bytes.length < QUOTE_HEADER_BYTES + REPORT_BYTES) {
    return { ok: false, problem: `the quote holds ${bytes.length - QUOTE_HEADER_BYTES} bytes of report, expected ${REPORT_BYTES}` };
  }
  const slice = (field: readonly [number, number]): Uint8Array => {
    const start = QUOTE_HEADER_BYTES + field[0];
    return bytes.subarray(start, start + field[1]);
  };
  const report = Object.fromEntries(Object.entries(REPORT_FIELDS).map(([name, span]) => [name, slice(span)])) as unknown as TdReport;
  return { ok: true, quote: { version, attestationKeyKind, report } };
}

/** `info`, which is where a report keeps the measurements and the stack hash outside `tcb_info`. */
function infoOf(attestation: Record<string, unknown>): Record<string, unknown> {
  return (attestation.info as Record<string, unknown> | undefined) ?? {};
}

/** `tcb_info` is documented as a string *or* an object (NEAR's verifier types it as a union); read either. */
function tcbInfo(attestation: ModelAttestation | Record<string, unknown>): Record<string, unknown> {
  const raw = infoOf(attestation as Record<string, unknown>).tcb_info;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown> | undefined) ?? {};
}

function published(tcb: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = tcb[key];
    if (typeof value === 'string' && value.length > 0) return value.toLowerCase();
  }
  return undefined;
}

const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((byte, i) => byte === b[i]);

/** Hex → bytes for a published measurement, `undefined` when the report does not name it in that shape. */
function hexBytes(value: string | undefined): Uint8Array | undefined {
  return value === undefined ? undefined : decodeHex(value);
}

/**
 * RTMR0–2 replay from the report's own event log, and only RTMR0–2.
 *
 * The rule is the standard one — in log order, `acc = SHA-384(acc ‖ digest)` from 48 zero bytes — and
 * on both recorded reports it reproduces RTMR0, RTMR1 and RTMR2 exactly, 13/5/2 events respectively
 * (and on two live reports too, over 35 and 30 events — `npm run spike -- --stage=attestation`).
 * It does **not** reproduce RTMR3: dstack's boot events are logged with their meaning in
 * `event_payload` and an *empty* `digest`, so there is nothing to extend, and eighteen uniform
 * framings of `event`/`event_payload` (hashed, concatenated, length-prefixed, padded) all fail on both
 * files. So the honest output names three registers and says the fourth was not reproduced rather than
 * reporting a replay of all four or dropping the check for want of one.
 */
export function replayEventLog(eventLog: unknown, targets: { rtMr0: Uint8Array; rtMr1: Uint8Array; rtMr2: Uint8Array }): { replayed: number[]; mismatched: number[]; events: number } {
  if (!Array.isArray(eventLog)) return { replayed: [], mismatched: [], events: -1 };
  const acc: Record<number, Uint8Array> = {};
  for (const event of eventLog) {
    const record = event as { imr?: unknown; digest?: unknown };
    if (typeof record?.imr !== 'number' || typeof record.digest !== 'string') continue;
    const digest = decodeHex(record.digest);
    if (digest === undefined) continue;
    const from = acc[record.imr] ?? new Uint8Array(48);
    acc[record.imr] = sha384(concat(from, digest));
  }
  const targetsByImr = [[0, targets.rtMr0], [1, targets.rtMr1], [2, targets.rtMr2]] as const;
  const replayed: number[] = [];
  const mismatched: number[] = [];
  for (const [imr, target] of targetsByImr) {
    (equal(acc[imr] ?? new Uint8Array(48), target) ? replayed : mismatched).push(imr);
  }
  return { replayed, mismatched, events: eventLog.length };
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

function reservedBitsSet(attributes: Uint8Array): boolean {
  for (const [low, high] of TD_RESERVED_MBZ) {
    for (let bit = low; bit <= high; bit += 1) {
      if ((attributes[Math.floor(bit / 8)]! >> (bit % 8)) & 1) return true;
    }
  }
  return false;
}
export const QUOTE_CHECKS_THAT_CANNOT_RUN: CheckResult[] = [
  {
    name: 'quote_signed_by_hardware',
    ran: false,
    passed: false,
    detail: 'the signature Intel puts on the quote is not checked here — that needs Intel\'s certificate service, which this app does not have. Everything above is the quote agreeing with itself.',
  },
  {
    name: 'platform_still_trusted',
    ran: false,
    passed: false,
    detail: 'whether this machine\'s software has since been revoked by Intel is not checked here, for the same reason.',
  },
  {
    name: 'gpu_evidence_verdict',
    ran: false,
    passed: false,
    detail: 'the graphics-card evidence is read by NVIDIA\'s service, not by this page. Asking it belongs to the checking service at /api/verify.',
  },
  {
    name: 'report_expiry',
    ran: false,
    passed: false,
    detail: 'a report carries no expiry a page can read, so an old report would pass the checks above exactly like a fresh one. The real windows are inside the quote Intel signs, which is not checked here.',
  },
];

/**
 * Everything this build can decide about one attestation's quote, in the browser, from the bytes in
 * the report.
 *
 * `expectedKey` is the key the rest of the session trusts — `signing_public_key` when the attestation
 * carries one, otherwise the signing address padded out to 32 bytes, which is how NEAR's own verifier
 * reads the same field. The caller passes it in rather than this file choosing, because *which* of the
 * two a signature will be checked against is decided by the gate, and a check that quietly accepted
 * either would be a check that accepts less than it says.
 */
export function checkQuote(input: { attestation: ModelAttestation | Record<string, unknown> | undefined; nonce: string; label: string; expectedKey?: string }): CheckResult[] {
  const attestation = (input.attestation ?? {}) as Record<string, unknown>;
  const read = readQuote(attestation.intel_quote as string | undefined);
  const nonceBytes = hexBytes(input.nonce);
  const keyBytes = input.expectedKey === undefined ? undefined : padTo32(decodeHex(input.expectedKey));

  if (!read.ok) {
    const reason = `${read.problem}${input.label === '' ? '' : ` (${input.label})`}, so its measurements, its binding to us and its software stack are all unread`;
    return [
      { name: 'quote_is_tdx', ran: false, passed: false, detail: reason },
      ...['td_not_debug', 'td_attributes_allowed', 'quote_binds_our_nonce', 'quote_binds_attested_key', 'quote_binds_compose_hash', 'quote_matches_report_measurements', 'event_log_replays_rtmr0_to_2'].map((name) => ({
        name,
        ran: false,
        passed: false,
        detail: 'no quote to read',
      })),
    ];
  }

  const quote = read.quote;
  const report = quote.report;
  const tcb = tcbInfo(attestation);
  const checks: CheckResult[] = [];

  checks.push({
    name: 'quote_is_tdx',
    ran: true,
    passed: true,
    detail: `a version-${quote.version} TDX quote, signed by key kind ${quote.attestationKeyKind}`,
  });

  const debug = (report.tdAttributes[0]! & DEBUG_BIT) !== 0;
  checks.push({
    name: 'td_not_debug',
    ran: true,
    passed: !debug,
    detail: debug ? 'this quote says the machine is running in debug mode, where the operator of the server can read the enclave\'s memory' : undefined,
  });

  const mbz = reservedBitsSet(report.tdAttributes);
  checks.push({
    name: 'td_attributes_allowed',
    ran: true,
    passed: !mbz,
    detail: mbz ? 'the quote sets attributes Intel marks as forbidden, so its description of the machine is not one a verifier should accept' : undefined,
  });

  const embeddedNonce = report.reportData.subarray(REPORT_DATA_KEY_BYTES, REPORT_DATA_KEY_BYTES + NONCE_BYTES_IN_REPORT_DATA);
  const nonceOk = nonceBytes !== undefined && equal(embeddedNonce, nonceBytes);
  checks.push({
    name: 'quote_binds_our_nonce',
    ran: true,
    passed: nonceOk,
    detail: nonceOk ? undefined : 'the quote does not carry the number we minted for this session, so nothing binds these bytes to us rather than to somebody else\'s request',
  });

  const embeddedKey = report.reportData.subarray(0, REPORT_DATA_KEY_BYTES);
  const keyOk = keyBytes !== undefined && equal(embeddedKey, keyBytes);
  checks.push({
    name: 'quote_binds_attested_key',
    ran: keyBytes !== undefined,
    passed: keyOk,
    detail: keyBytes === undefined
      ? 'this session bound no key, so there is nothing to compare the quote against'
      : keyOk
        ? undefined
        : 'the quote names a different key than the one this session would encrypt to or check signatures against',
  });

  const composeHash = hexBytes(published(tcb, 'compose_hash') ?? published(infoOf(attestation), 'compose_hash'));
  const expectedConfig = composeHash === undefined ? undefined : concat(Uint8Array.of(MR_CONFIG_PREFIX), padRight(composeHash, 47));
  const configOk = expectedConfig !== undefined && equal(report.mrConfigId, expectedConfig);
  checks.push({
    name: 'quote_binds_compose_hash',
    ran: expectedConfig !== undefined,
    passed: configOk,
    detail: expectedConfig === undefined ? 'the report publishes no software-stack hash to compare the quote against' : configOk ? undefined : 'the quote measures a different software stack than the one the report says is running',
  });

  const measured: [string, Uint8Array, string | undefined][] = [
    ['the memory of the virtual machine', report.mrTd, published(tcb, 'mrtd')],
    ['register 0', report.rtMr0, published(tcb, 'rtmr0')],
    ['register 1', report.rtMr1, published(tcb, 'rtmr1')],
    ['register 2', report.rtMr2, published(tcb, 'rtmr2')],
    ['register 3', report.rtMr3, published(tcb, 'rtmr3')],
  ];
  const unreadable = measured.filter(([, , value]) => value === undefined || hexBytes(value) === undefined);
  const disagreed = measured.filter(([, bytes, value]) => value !== undefined && hexBytes(value) !== undefined && !equal(bytes, hexBytes(value)!));
  checks.push({
    name: 'quote_matches_report_measurements',
    ran: measured.length - unreadable.length > 0,
    passed: unreadable.length === 0 && disagreed.length === 0,
    detail: disagreed.length > 0
      ? `the quote and the report disagree about ${disagreed.map(([label]) => label).join(', ')}`
      : unreadable.length > 0
        ? `${unreadable.length} of the ${measured.length} measurements the report names are missing, so the quote cannot be compared with them`
        : undefined,
  });

  const replay = replayEventLog(attestation.event_log, { rtMr0: report.rtMr0, rtMr1: report.rtMr1, rtMr2: report.rtMr2 });
  checks.push({
    name: 'event_log_replays_rtmr0_to_2',
    ran: replay.events >= 0,
    passed: replay.events >= 0 && replay.mismatched.length === 0,
    detail: replay.events < 0
      ? 'this attestation\'s boot log is not a list of measurements, so it cannot be replayed'
      : replay.mismatched.length > 0
        ? `replaying the boot log does not reproduce register ${replay.mismatched.join(' or ')}`
        : `registers ${replay.replayed.join(', ')} replay from the ${replay.events} logged boot events. Register 3 is not included: its boot events are logged without a measurement to add, and no rule we could reproduce gets the value the quote carries.`,
  });

  return checks;
}

/** The reference verifier's rule: the signing address, right-padded with zeros to 32 bytes. */
function padTo32(bytes: Uint8Array | undefined): Uint8Array | undefined {
  if (bytes === undefined || bytes.length > REPORT_DATA_KEY_BYTES) return undefined;
  return padRight(bytes, REPORT_DATA_KEY_BYTES);
}

function padRight(bytes: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  out.set(bytes, 0);
  return out;
}

