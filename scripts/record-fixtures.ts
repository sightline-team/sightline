#!/usr/bin/env tsx
/**
 * Records real NEAR AI responses into `fixtures/` — item **S-11**.
 *
 * Before this file ran, everything in the Mode F corpus was **authored synthetic**: a human wrote JSON
 * that looks like a plausible response and it has never been on the wire. That is still true of the three
 * pasted demo letters in `src/lib/fixtures/cases.ts`, and this script does not touch them. What it adds is
 * the part the authored corpus could never have: **what a vision model actually says about a photographed
 * page**, which is the one thing the photo path cannot be demoed without (**C-13**, and the reason
 * `npm run dev:fixtures` refused a photograph until now).
 *
 * ### What it does, in order
 *
 * 1. Draws three synthetic pages in Chromium and prepares them with the app's own `lib/image/prepare.ts`
 *    — the same harness `npm run spike` prices a page with (`scripts/page_sample.ts`), so the demo
 *    photograph and the measured photograph are one file, not two that happen to look alike.
 * 2. Posts **the app's own request** for each page: `completionRequestBody` with C-03's prompts and
 *    ADR-23's budget, through `createNearClient` in direct mode. Not a hand-built lookalike — that is why
 *    the body shape moved out of `completion.ts`'s private helper into an export.
 * 3. Saves the reply, joins the three pages with the app's own `assembleDocument`, and asks the structure
 *    step and two questions about *that* transcript, so the recorded reading is a reading of what the page
 *    replies actually say.
 * 4. Verifies each completion's signature against the attested key before storing it (rule 4: fresh nonce
 *    per attestation, verify each response), and stores the verdict — not the report.
 *
 * ### The rules it is built around
 *
 * - **Synthetic only** (AGENTS.md §5 "never do"). The pages are drawn by this repository's own harness.
 *   There is no path through this script that accepts a file from disk, and adding one would put a real
 *   person's letter into a public repository.
 * - **No body in the provenance.** Each sidecar holds the request's *length and SHA-256*, the served model
 *   id, the completion id, timings, token counts and the signature verdict — never the bytes sent (§4 rule
 *   7). The *reply* is stored, because a stored reply is the entire point of a fixture and it describes an
 *   invented invoice and no one's.
 * - **Money is asked for, never assumed.** Without `--confirm` this prints the plan and exits 0. It is the
 *   one script in the repo that spends, and §5 says a human approves spending.
 * - **It fails rather than invents.** A page whose reply `transcribeSchema` rejects, or whose signature
 *   does not verify, stops the run with a non-zero exit and writes nothing for that page. A "recorded"
 *   fixture that was really repaired by hand is the exact lie this item exists to prevent.
 *
 * ### Two runs, and only one of them spends
 *
 * - `--confirm` — the recorded replies above. Six completions, real money, ~6 minutes.
 * - `--attestation` — **report retrieval only**, and no completion at all. `GET /v1/attestation/report`
 *   is documented as free and non-billable (`docs/SPIKE_RESULTS.md` §5), so this is the cheap half of
 *   **S-11** and the whole of **T-08**'s input: it writes `fixtures/attestation/good-<model>.json` from a
 *   live report and asks nothing of the models. It still needs `--confirm`, because it still sends the
 *   key: "free" is a statement about money, not about permission.
 *
 * Usage: `npm run fixtures:record` (plan) · `npm run fixtures:record -- --confirm` (spend)
 * · `npm run fixtures:record -- --attestation --confirm` (reports only, no money).
 */
import { createHash, X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { drawPage, PAGE_INPUT, PREPARE_BUNDLE } from './page_sample';
import { attestationReportSchema, bindReport, newNonce } from '@/lib/near-ai/attestation';
import { createNearClient, NearError, type NearClient } from '@/lib/near-ai/client';
import { completionRequestBody, type CompletionResult } from '@/lib/near-ai/completion';
import { completionEnvelopeSchema, contentOf, type CompletionEnvelope } from '@/lib/near-ai/envelope';
import { checkSignature, fetchSignature, sha256Hex } from '@/lib/near-ai/signatures';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { TRANSCRIBE_SYSTEM_PROMPT, TRANSCRIBE_USER_PROMPT } from '@/features/capture/prompts';
import { transcribeSchema, type TranscribeOutput } from '@/features/capture/schemas';
import { assembleDocument } from '@/features/capture/assemble';
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema } from '@/features/analysis/schemas';
import { QA_SYSTEM_PROMPT, qaUserPrompt } from '@/features/qa/prompts';
import { qaSchema } from '@/features/qa/schemas';
import { pageFixtureKey } from '@/lib/fixtures/page_key';
import type { PageOutcome } from '@/features/capture/assemble';

const DIRECT_BASE_URL = 'https://cloud-api.near.ai/v1';
const ROOT = path.join(__dirname, '..');
const API_KEY = process.env.NEAR_AI_API_KEY ?? '';

/** Three pages, not five: enough for C-05's page-number check and C-11's offsets to be real in the demo. */
const PAGE_COUNT = 3;

/** The enclaves this app asks: the page model answers two steps, the reading model answers one. */
const ATTESTATION_MODELS = [...new Set(Object.values(STEP_PLANS).map((plan) => plan.model))];

/**
 * The four checks `bindReport` is supposed to decide, written **here** rather than read back from the
 * run. A fixture whose expectation is generated by the code under test proves nothing: the recorder's
 * job is to notice when the live report stops satisfying a list this file already commits to.
 */
const EXPECTED_PASSES = ['attestation_report', 'nonce_fresh', 'signing_address_shape', 'signing_public_key_shape'];

/** `z-ai/glm-5.3-flash` → `z-ai-glm-5.3-flash`: a model id has a slash, a filename may not. */
function modelSlug(model: string): string {
  return model.replace(/[^A-Za-z0-9.]+/g, '-');
}

/** The questions the demo offers for a photographed document. One answerable, one honestly not. */
const QUESTIONS = [
  'What reference number is on these pages?',
  'Is there a payment deadline in this document?',
] as const;

interface Provenance {
  recordedAt: string;
  recorder: 'scripts/record-fixtures.ts';
  item: 'S-11';
  endpoint: string;
  requestedModel: string;
  servedModel: string;
  completionId: string;
  /** No end-to-end encryption exists in this build, so no recorded reply may claim it (rule 2). */
  e2ee: false;
  requestBytes: number;
  requestSha256: string;
  usage: unknown;
  ms: number;
  signature: { verified: boolean; origin: string; algo: string; detail: string };
  synthetic: true;
  syntheticNote: string;
  [key: string]: unknown;
}

const recordedAt = new Date().toISOString();

function client(): NearClient {
  return createNearClient({
    mode: 'direct',
    baseUrl: DIRECT_BASE_URL,
    headers: () => ({ authorization: `Bearer ${API_KEY}` }),
  });
}

function die(message: string): never {
  console.error(`record-fixtures: ${message}`);
  process.exit(4);
}

/**
 * One attestation per model, and the key it yields is the only key a signature may be checked against
 * (rule 4). A report that does not bind is fatal: recording replies we cannot prove came from the enclave
 * would make "recorded" a weaker word than it already is.
 */
async function attest(near: NearClient, model: string): Promise<{ algo: 'ed25519'; keyOrAddress: string }> {
  const nonce = newNonce();
  const response = await near.get('attestation/report', { query: { model, nonce, signing_algo: 'ed25519' } });
  const parsed = attestationReportSchema.safeParse(response.json);
  if (!parsed.success) die(`the app's own schema rejected the attestation report for ${model} — nothing is recorded`);
  const bound = bindReport({ report: parsed.data, nonce, signingAlgo: 'ed25519' });
  const failed = bound.checks.filter((c) => !c.passed).map((c) => c.name);
  if (bound.status === 'failed' || bound.signingKey === undefined) {
    die(`bindReport did not pass for ${model} (${failed.join(', ') || 'no signing key in the report'}) — nothing is recorded`);
  }
  console.log(`  attested ${model}: ${bound.signingKey.keyOrAddress.slice(0, 12)}… · checks passed ${bound.checks.length}`);
  return { algo: 'ed25519', keyOrAddress: bound.signingKey.keyOrAddress };
}

/**
 * One attestation per model, held for the run. The page model and the reading model are different
 * enclaves (ADR-24), and a signature is only proof of the key attested **for the model that answered** —
 * so a Q&A reply must not be checked against the page model's key just because that one is already to
 * hand. A nonce is minted per attestation and never reused (rule 4).
 */
const attestations = new Map<string, Promise<{ algo: 'ed25519'; keyOrAddress: string }>>();

function attestedFor(near: NearClient, model: string): Promise<{ algo: 'ed25519'; keyOrAddress: string }> {
  const held = attestations.get(model);
  if (held !== undefined) return held;
  const fresh = attest(near, model);
  attestations.set(model, fresh);
  return fresh;
}

/** The signature verdict for one completion, through the production fetch-and-check pair. */
async function verdict(near: NearClient, attested: { algo: 'ed25519'; keyOrAddress: string }, model: string, envelope: CompletionEnvelope, sentBody: string, rawText: string) {
  const record = await fetchSignature(near, envelope.id, { model, algo: attested.algo });
  const check = checkSignature(record, { requestBytes: sentBody, responseBytes: rawText, modelId: model, attestedKeyOrAddress: attested.keyOrAddress });
  return { verified: check.verified, origin: String(check.origin), algo: String(check.algo), detail: check.detail };
}

/**
 * Keys that could carry a timestamp. Used to answer one question the repo has never been able to ask:
 * **what does an expired report even mean in these bytes?** `bindReport` has no time check, so if the
 * answer is "nothing in the report is a time", then expiry is T-03's job alone (quote/NRAS validity) and
 * the browser half must never be described as refusing a stale report. Printed, never assumed.
 */
const TIME_KEY = /(time|stamp|date|exp|iat|nbf|valid|tcb|after|before|nonce)/i;

function timeFields(value: unknown, at = '', out: string[] = [], depth = 0): string[] {
  if (depth > 6 || out.length >= 80) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => timeFields(item, `${at}[${index}]`, out, depth + 1));
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (TIME_KEY.test(key)) {
        const shown = typeof child === 'string' ? (child.length > 48 ? `${child.slice(0, 24)}…(${child.length} chars)` : `"${child}"`) : child === null ? 'null' : typeof child;
        out.push(`${at}.${key} = ${shown}`);
      }
      timeFields(child, `${at}.${key}`, out, depth + 1);
    }
  }
  return out;
}

/**
 * The two things a verification check would reach for and find already decided by the bytes, measured
 * once per report so no test has to guess: **where an expiry lives**, and **whether the device identity
 * is a real identity**. Node's `X509Certificate` reads the PEM the service returns — this is a script,
 * so it may use a Node API the browser half cannot, which is exactly why the *finding* is written down
 * here and the *check* stays T-03's.
 */
function certFacts(pem: unknown): { present: boolean; subject?: string; issuer?: string; validFrom?: string; validTo?: string } {
  if (typeof pem !== 'string' || !pem.includes('BEGIN CERTIFICATE')) return { present: false };
  const cert = new X509Certificate(pem);
  return { present: true, subject: cert.subject.replaceAll('\n', '; '), issuer: cert.issuer.replaceAll('\n', '; '), validFrom: cert.validFrom, validTo: cert.validTo };
}

/** `e3b0c442…b855` — SHA-256 of zero bytes: the value a field holds when nothing was put in it. */
const EMPTY_SHA256 = createHash('sha256').update(new Uint8Array(0)).digest('hex');

function deviceIdentity(attestation: Record<string, unknown> | undefined): { info: boolean; tcb: boolean } {
  const info = attestation?.['info'] as Record<string, unknown> | undefined;
  const tcb = info?.['tcb_info'] as Record<string, unknown> | undefined;
  return { info: info?.['device_id'] === EMPTY_SHA256, tcb: tcb?.['device_id'] === EMPTY_SHA256 };
}

/**
 * What the stored fixture leaves out, and why. This is a **redaction**, not a reformatting, and it is
 * written down because "recorded" has to keep meaning something: `_meta.reportSha256` is the digest of
 * the full bytes the service returned, and each dropped value keeps its own digest and size in
 * `_meta.redacted`, so the subset in this file stays attributable to that run.
 *
 * Two reasons, both measured on the bytes (2026-11-05, this script's first `--attestation` run):
 *
 * - **It is not ours to publish.** `info.tcb_info.app_compose` is NEAR's own compose file (448 lines:
 *   service names, internal instance labels, the *names* of their monitoring and registry tokens);
 *   `compose_manager_attestation` is their container launch log (226 actions on one instance);
 *   `gateway_attestation.vpc.vpc_hostname` is an internal DNS name of their production gateway;
 *   `nvidia_payload` is eight per-device NVIDIA reports, each with a certificate chain. None of it is
 *   document-derived, and all of it describes somebody else's infrastructure.
 * - **None of it can decide a check offline anyway.** `intel_quote` and `nvidia_payload` are bound to
 *   the nonce of the request and to a validity window (`docs/SPIKE_RESULTS.md` §3, §5), so a stored
 *   copy is stale the moment a test runs it: T-03's heavy checks have to fetch fresh evidence from the
 *   live service, which is exactly the dependency **B-12** is. Keeping the bytes would buy a 380 KB
 *   fixture and no extra proof.
 */
const REDACTION_REASONS = {
  compose: 'the service\'s own compose file — a third party\'s infrastructure configuration; what a verifier needs from it is its hash, recorded in redacted[].sha256',
  launchLog: 'the container launch log of their compose manager — machine history, not ours, and no check in this repo reads it',
  gpu: 'per-device NVIDIA evidence (certificate chain + report), bound to the nonce of this fetch: stale by design, and it identifies hardware we do not own',
  internalHost: 'an internal DNS name of their production gateway',
} as const;

interface Redacted {
  path: string;
  bytes: number;
  sha256: string;
  reason: string;
}

function redactReport(raw: Record<string, unknown>): { report: Record<string, unknown>; redacted: Redacted[] } {
  const report = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const redacted: Redacted[] = [];
  const drop = (holder: Record<string, unknown> | undefined, key: string, at: string, reason: string): void => {
    const value = holder?.[key];
    if (value === undefined) return;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    redacted.push({ path: at, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), reason });
    delete holder![key];
  };
  ((report.model_attestations ?? []) as Record<string, unknown>[]).forEach((attestation, index) => {
    const base = `model_attestations[${index}]`;
    drop((attestation.info as Record<string, unknown> | undefined)?.tcb_info as Record<string, unknown> | undefined, 'app_compose', `${base}.info.tcb_info.app_compose`, REDACTION_REASONS.compose);
    drop(attestation, 'nvidia_payload', `${base}.nvidia_payload`, REDACTION_REASONS.gpu);
    drop(attestation, 'compose_manager_attestation', `${base}.compose_manager_attestation`, REDACTION_REASONS.launchLog);
  });
  const gateway = report.gateway_attestation as Record<string, unknown> | undefined;
  drop((gateway?.info as Record<string, unknown> | undefined)?.tcb_info as Record<string, unknown> | undefined, 'app_compose', 'gateway_attestation.info.tcb_info.app_compose', REDACTION_REASONS.compose);
  drop(gateway, 'vpc', 'gateway_attestation.vpc', REDACTION_REASONS.internalHost);
  return { report, redacted };
}

/**
 * The **good** attestation fixture (**T-08**, the second half of **S-11**): one free `GET
 * /v1/attestation/report` per model this app asks, stored as the bytes the service returned **minus**
 * the redactions above.
 *
 * `report` is the **raw** JSON (`JSON.parse(rawText)`), not `bindReport`'s input —
 * `attestationReportSchema` strips keys it does not name, so storing what it kept would hide the fields
 * T-03 needs. `tests/verification/` asserts both halves: that the live shape still parses, and exactly
 * which keys the schema drops.
 *
 * Fail-closed, like every other write here: a report that does not echo the nonce this script minted is
 * not a `good` fixture, and nothing is written for that model.
 */
async function recordReports(near: NearClient): Promise<void> {
  console.log(`== attestation reports — ${ATTESTATION_MODELS.length} models, no completion sent (report retrieval is free and non-billable, SPIKE §5)`);
  for (const model of ATTESTATION_MODELS) {
    const nonce = newNonce();
    const at = Date.now();
    const response = await near.get('attestation/report', { query: { model, nonce, signing_algo: 'ed25519' } });
    const ms = Date.now() - at;
    const parsed = attestationReportSchema.safeParse(response.json);
    if (!parsed.success) die(`the app's own schema rejected the live report for ${model} — nothing is written`);
    const bound = bindReport({ report: parsed.data, nonce, signingAlgo: 'ed25519' });
    const failed = bound.checks.filter((c) => !c.passed).map((c) => `${c.name}${c.detail === undefined ? '' : ` (${c.detail})`}`);
    if (bound.signingKey === undefined || failed.length > 0) {
      die(`the live report for ${model} did not bind: ${failed.join(' · ') || 'no signing key'} — a report that is not bound to us is not a "good" fixture`);
    }
    const raw = JSON.parse(response.rawText) as Record<string, unknown>;
    const model0 = (raw.model_attestations as Record<string, unknown>[] | undefined)?.[0] ?? {};
    const kept = parsed.data as Record<string, unknown>;
    const keptModel = (kept.model_attestations as Record<string, unknown>[] | undefined)?.[0] ?? {};
    const strip = (keys: string[], value: Record<string, unknown> | undefined) => keys.filter((k) => !(k in (value ?? {})));
    console.log(`  ${model}: HTTP ${response.status} · ${Buffer.byteLength(response.rawText)} bytes in ${ms} ms · ${bound.checks.length} checks passed · status ${bound.status}`);
    console.log(`    schema drops at top level: ${strip(Object.keys(raw), kept).join(', ') || 'nothing'}`);
    console.log(`    schema drops on model_attestations[0]: ${strip(Object.keys(model0), keptModel).join(', ') || 'nothing'}`);
    console.log(`    info keeps ${Object.keys((keptModel.info as Record<string, unknown> | undefined) ?? {}).length} of ${Object.keys((model0.info as Record<string, unknown> | undefined) ?? {}).length} keys`);
    const times = timeFields(raw);
    console.log(`    time-bearing keys in the live bytes: ${times.length === 0 ? 'NONE' : ''}`);
    for (const line of times.slice(0, 24)) console.log(`      ${line}`);
    if (times.length > 24) console.log(`      … ${times.length - 24} more (see --verbose)`);
    const gateway = (raw.gateway_attestation ?? {}) as Record<string, unknown>;
    const modelInfo = (model0.info ?? {}) as Record<string, unknown>;
    const gatewayInfo = (gateway.info ?? {}) as Record<string, unknown>;
    const compose = (model0.compose_manager_attestation ?? {}) as Record<string, unknown>;
    const actions = Array.isArray(compose.actions) ? compose.actions as Record<string, unknown>[] : [];
    const newest = actions.map((a) => String(a.timestamp ?? '')).sort().at(-1) ?? '(no action log)';
    const certs = { model: certFacts(modelInfo.app_cert), gateway: certFacts(gatewayInfo.app_cert) };
    const device = { model: deviceIdentity(model0), gateway: deviceIdentity(gateway) };
    /**
     * The GPU evidence is a JSON string, not hex (measured 2026-11-05 — `docs/SPIKE_RESULTS.md` §3's
     * 2026-11-03 line called it hex, which it is not). Its redaction is why the shape of it is recorded
     * here instead: one entry per device, each bound to the nonce we minted.
     */
    const gpu = (() => {
      if (typeof model0.nvidia_payload !== 'string' || !model0.nvidia_payload.startsWith('{')) return undefined;
      const parsed = JSON.parse(model0.nvidia_payload) as { nonce?: string; arch?: string; evidence_list?: { nonce?: string; certificate?: string }[] };
      const list = parsed.evidence_list ?? [];
      return {
        topLevelNonce: parsed.nonce === nonce,
        evidenceCount: list.length,
        everyEvidenceEchoesNonce: list.length > 0 && list.every((evidence) => evidence.nonce === nonce),
        everyEvidenceHasChain: list.every((evidence) => typeof evidence.certificate === 'string' && evidence.certificate.startsWith('LS0t')),
        arch: parsed.arch,
      };
    })();
    const echoes = {
      model_request_nonce: (model0.request_nonce ?? '') === nonce,
      gateway_request_nonce: (gateway.request_nonce ?? '') === nonce,
      compose_nonce: (compose.nonce ?? '') === nonce,
      compose_nonce_source: compose.nonce_source,
      compose_report_data_bytes: typeof compose.report_data === 'string' ? compose.report_data.length / 2 : 0,
      gpu: gpu,
    };
    console.log(`    nonces echoed: ${Object.entries(echoes).filter(([, v]) => v === true).map(([k]) => k).join(', ') || 'none'} · compose_manager report_data ${echoes.compose_report_data_bytes} B (model attestation itself has none)`);
    console.log(`    nvidia_payload is ${gpu === undefined ? 'not the JSON shape this script expected' : `JSON, not hex: ${gpu.evidenceCount} × ${gpu.arch}, every device echoing our nonce: ${gpu.everyEvidenceEchoesNonce}, every chain a PEM: ${gpu.everyEvidenceHasChain}`}`);
    console.log(`    device_id is SHA-256 of empty bytes: model ${device.model.info && device.model.tcb} · gateway ${device.gateway.info && device.gateway.tcb} (a placeholder, not a GPU identity)`);
    console.log(`    app_cert: model valid ${certs.model.validFrom ?? '-'} → ${certs.model.validTo ?? '-'} subject ${certs.model.subject ?? '-'} · issuer ${certs.model.issuer ?? '-'}`);
    console.log(`    newest compose-manager action timestamp: ${newest}`);
    const { report: stored, redacted } = redactReport(raw);
    console.log(`    redacted before writing: ${redacted.map((r) => `${r.path.split('.').at(-1)} ${r.bytes} B`).join(', ')}`);
    await writeJson(path.join(ROOT, 'fixtures', 'attestation', `good-${modelSlug(model)}.json`), {
      _meta: {
        case: 'good',
        provenance: 'recorded',
        /** Truth in the word "recorded": this is the live report minus the paths below, each kept by digest. */
        redactionNote: 'a documented subset, not every byte: redacted[] names what was dropped and why. reportSha256 is the digest of the full live response.',
        redacted: redacted.map(({ path, bytes, sha256, reason }) => ({ path, bytes, sha256, reason })),
        item: 'T-08',
        recorder: 'scripts/record-fixtures.ts',
        recordedAt,
        endpoint: `${DIRECT_BASE_URL}/attestation/report`,
        query: { model, nonce, signing_algo: 'ed25519' },
        signingAlgo: 'ed25519',
        model,
        httpStatus: response.status,
        ms,
        reportBytes: Buffer.byteLength(response.rawText),
        reportSha256: sha256Hex(response.rawText),
        /** The nonce this script minted, stored apart from the report so the echo is a check and not a tautology. */
        sentNonce: nonce,
        shouldPass: EXPECTED_PASSES,
        shouldFail: [],
        observedStatus: bound.status,
        /** Keys the schema does not name, measured on the live bytes before redaction — T-03's blind spots, pinned by a test. */
        schemaDrops: { measuredOn: 'live bytes, pre-redaction', topLevel: strip(Object.keys(raw), kept), modelAttestation: strip(Object.keys(model0), keptModel) },
        /** Only the non-action-log lines: the log itself is redacted, so its timestamps are kept as a count and a newest. */
        timeFields: times.filter((line) => !line.includes('.compose_manager_attestation.actions[')),
        timeFieldCount: times.length,
        /** Where an expiry would live, measured: the report's only plaintext times are the action log below. */
        appCerts: certs,
        /** True means the field holds `SHA-256("")` — no device identity, on either half of the report. */
        deviceIdIsPlaceholder: device,
        nonceEchoes: echoes,
        newestComposeAction: newest,
        composeActionCount: actions.length,
        purpose: 'A real model report, bound to a nonce this script minted: the case every other attestation fixture is a mutation of.',
        notes: 'No document, transcript, image or key is in these bytes. An attestation report describes the machine, not the request. Tampered and expired cases are NOT stored as copies — see fixtures/attestation/README.md.',
      },
      report: stored,
    });
  }
}

async function call(near: NearClient, body: Record<string, unknown>, purpose: 'transcribe' | 'analyse' | 'qa'): Promise<{ envelope: CompletionEnvelope; rawText: string; sentBody: string; ms: number }> {
  const at = Date.now();
  const response = await near.post('chat/completions', body, { purpose });
  const ms = Date.now() - at;
  const envelope = completionEnvelopeSchema.safeParse(response.json);
  if (!envelope.success) die(`the service answered ${purpose} with a body the app's envelope schema rejects — nothing is recorded`);
  if (response.sentBody === undefined) die(`no sent bytes were captured for the ${purpose} call`);
  return { envelope: envelope.data, rawText: response.rawText, sentBody: response.sentBody, ms };
}

function provenanceBase(purpose: string, model: string, made: { envelope: CompletionEnvelope; sentBody: string; ms: number }): Provenance {
  const usage = (made.envelope as unknown as { usage?: unknown }).usage ?? {};
  return {
    recordedAt,
    recorder: 'scripts/record-fixtures.ts',
    item: 'S-11',
    purpose,
    endpoint: `${DIRECT_BASE_URL}/chat/completions`,
    requestedModel: model,
    servedModel: made.envelope.model ?? model,
    completionId: made.envelope.id,
    e2ee: false,
    requestBytes: Buffer.byteLength(made.sentBody),
    requestSha256: sha256Hex(made.sentBody),
    usage,
    ms: made.ms,
    signature: { verified: false, origin: 'not_checked', algo: 'ed25519', detail: 'overwritten below' },
    synthetic: true,
    syntheticNote: 'Drawn by scripts/page_sample.ts. This fixture describes an invented invoice and no real person, provider, account or debt.',
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${path.relative(ROOT, file)}`);
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--confirm');
  const attestationOnly = process.argv.includes('--attestation');
  if (!confirmed) {
    console.log(
      attestationOnly
        ? [
            'record-fixtures --attestation: this sends one GET /v1/attestation/report per model this app asks,',
            `(${ATTESTATION_MODELS.join(', ')}) using the key in .env. Report retrieval is documented as free and`,
            'non-billable, so this spends nothing and completes nothing — it writes fixtures/attestation/good-<model>.json.',
            'Nothing is sent and nothing is written. Re-run with --confirm.',
          ].join('\n')
        : [
            'record-fixtures: this script sends requests to the live service and spends from the key in .env.',
            `Planned spend: ${PAGE_COUNT} page reads (${STEP_PLANS.transcribe.model}) + 1 structure step (${STEP_PLANS.analyse.model}) + ${QUESTIONS.length} questions,`,
            'priced from docs/SPIKE_RESULTS.md §4 at about $0.00087 a page and $0.0044 for the reading — roughly $0.007, and about six minutes of waiting.',
            'Nothing is sent and nothing is written. Re-run with --confirm to spend.',
            'For the free half only (attestation reports, no completion), add --attestation.',
          ].join('\n'),
    );
    return;
  }
  if (API_KEY === '') die('NEAR_AI_API_KEY is not set — S-11 needs a key (blocker B-05) and will not author a reply in its place');

  const near = client();
  if (attestationOnly) {
    await recordReports(near);
    console.log('recorded. tests/verification/attestation-fixtures.test.ts reads these; tampered and expired cases are derived there, not stored here.');
    return;
  }
  console.log(`== recording ${PAGE_COUNT} photographed pages, their reading and ${QUESTIONS.length} questions (${recordedAt})`);

  const browser = await chromium.launch();
  const tab = await browser.newPage();
  await tab.addScriptTag({ content: PREPARE_BUNDLE });

  const outcomes: PageOutcome[] = [];
  const keys: string[] = [];

  for (let page = 1; page <= PAGE_COUNT; page++) {
    const sample = await drawPage(tab, { pageNumber: page, totalPages: PAGE_COUNT });
    // The shipped file is the prepared JPEG, so the bytes C-01 produced are the bytes a visitor chooses,
    // and ADR-31's key is a hash of something this repository controls rather than of a browser's output.
    const jpeg = Buffer.from(sample.preparedB64, 'base64');
    const imagePath = path.join(ROOT, 'public', 'sample-docs', 'photographs', `page-${page}.jpg`);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, jpeg);
    // Hashed from the file **read back off disk**, not from the buffer that was just written: this digest
    // is the only thing Mode F matches a person's chosen photograph against, so it has to be the digest of
    // the artifact they will actually choose. The first recording run wrote three zero-byte JPEGs and
    // reported three identical keys; that is what this line is there to make impossible.
    const onDisk = await readFile(imagePath);
    if (onDisk.length !== jpeg.length) die(`page ${page}: the written file is ${onDisk.length} bytes, not ${jpeg.length} — nothing is recorded`);
    const fixtureKey = await pageFixtureKey(new Blob([new Uint8Array(onDisk)]));
    keys.push(fixtureKey);
    const body = completionRequestBody({
      model: STEP_PLANS.transcribe.model,
      system: TRANSCRIBE_SYSTEM_PROMPT,
      user: TRANSCRIBE_USER_PROMPT,
      imageUrl: sample.preparedDataUrl,
      maxTokens: STEP_PLANS.transcribe.maxTokens,
    });
    const made = await call(near, body, 'transcribe');
    const signature = await verdict(near, await attestedFor(near, STEP_PLANS.transcribe.model), STEP_PLANS.transcribe.model, made.envelope, made.sentBody, made.rawText);
    if (!signature.verified) die(`page ${page}'s signature did not verify (${signature.detail}) — a reply nobody attested is not a fixture`);

    const parsed = transcribeSchema.safeParse(JSON.parse(contentOf(made.envelope)) as unknown);
    if (!parsed.success) die(`page ${page}'s reply failed the app's own transcribeSchema — nothing is recorded for it`);
    outcomes.push({ kind: 'ok', value: parsed.data, model: made.envelope.model ?? STEP_PLANS.transcribe.model });
    console.log(`  page ${page}: ${sample.preparedWidth}×${sample.preparedHeight}, ${sample.preparedBytes} bytes in ${made.ms} ms · text ${parsed.data.text.length} chars · ${signature.origin} verified · key ${fixtureKey.slice(0, 12)}…`);
    await writeJson(path.join(ROOT, 'fixtures', 'responses', 'pages', `page-${page}.json`), {
      _provenance: { ...provenanceBase('transcribe', STEP_PLANS.transcribe.model, made), signature, fixtureKey, imageFile: `public/sample-docs/photographs/page-${page}.jpg`, prepared: { bytes: sample.preparedBytes, width: sample.preparedWidth, height: sample.preparedHeight, sourceBytes: sample.sourceBytes, sourceWidth: PAGE_INPUT.width, sourceHeight: PAGE_INPUT.height } },
      envelope: made.envelope,
    });
  }
  // Three pages that hash alike would make Mode F answer page 2 with page 1's transcript — the same class
  // of silent wrongness as an empty digest, and cheaper to check here than to find in a demo.
  if (new Set(keys).size !== keys.length) die(`the ${keys.length} pages did not produce ${keys.length} distinct keys — nothing is recorded`);
  await browser.close();

  // The transcript the structure step is asked about is the one the app joins, not one typed in here:
  // `cases.ts` matches a *document* by its words, so if these two disagreed the demo would answer for a
  // document nobody sent. `tests/unit/recorded-fixtures.test.ts` re-derives it and fails if they drift.
  const assembled = assembleDocument(outcomes);
  if (!assembled.usable) die('the recorded pages joined to an unusable document');
  console.log(`  joined transcript: ${assembled.transcript.text.length} chars across ${outcomes.length} pages · unplaceable spans ${assembled.unplaceableSpans}`);

  const documentBody = completionRequestBody({
    model: STEP_PLANS.analyse.model,
    system: STRUCTURE_SYSTEM_PROMPT,
    user: structureUserPrompt(assembled.transcript.text),
    maxTokens: STEP_PLANS.analyse.maxTokens,
  });
  const documentMade = await call(near, documentBody, 'analyse');
  const documentSignature = await verdict(near, await attestedFor(near, STEP_PLANS.analyse.model), STEP_PLANS.analyse.model, documentMade.envelope, documentMade.sentBody, documentMade.rawText);
  if (!documentSignature.verified) die(`the structure step's signature did not verify (${documentSignature.detail})`);
  const analysis = analysisSchema.safeParse(JSON.parse(contentOf(documentMade.envelope)) as unknown);
  if (!analysis.success) die(`the structure step's reply failed the app's own analysisSchema — ${analysis.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}`);
  console.log(`  structure step: ${documentMade.ms} ms · ${analysis.data.facts.length} facts, ${analysis.data.actions.length} actions, ${analysis.data.warnings.length} warnings`);
  await writeJson(path.join(ROOT, 'fixtures', 'responses', 'document.json'), {
    _provenance: { ...provenanceBase('analyse', STEP_PLANS.analyse.model, documentMade), signature: documentSignature, transcriptChars: assembled.transcript.text.length, transcriptSha256: sha256Hex(assembled.transcript.text) },
    transcript: assembled.transcript.text,
    envelope: documentMade.envelope,
  });

  for (const [index, question] of QUESTIONS.entries()) {
    const qaBody = completionRequestBody({
      model: STEP_PLANS.qa.model,
      system: QA_SYSTEM_PROMPT,
      user: qaUserPrompt(assembled.transcript.text, question),
      maxTokens: STEP_PLANS.qa.maxTokens,
    });
    const qaMade = await call(near, qaBody, 'qa');
    const qaSignature = await verdict(near, await attestedFor(near, STEP_PLANS.qa.model), STEP_PLANS.qa.model, qaMade.envelope, qaMade.sentBody, qaMade.rawText);
    if (!qaSignature.verified) die(`question ${index + 1}'s signature did not verify (${qaSignature.detail})`);
    const answer = qaSchema.safeParse(JSON.parse(contentOf(qaMade.envelope)) as unknown);
    if (!answer.success) die(`question ${index + 1}'s reply failed the app's own qaSchema`);
    console.log(`  question ${index + 1}: ${qaMade.ms} ms · answer ${answer.data.answer.length} chars · notInDocument ${answer.data.notInDocument} · quote ${answer.data.sourceQuote === undefined ? 'absent' : 'present'}`);
    await writeJson(path.join(ROOT, 'fixtures', 'responses', 'qa', `question-${index + 1}.json`), {
      _provenance: { ...provenanceBase('qa', STEP_PLANS.qa.model, qaMade), signature: qaSignature, question, transcriptSha256: sha256Hex(assembled.transcript.text) },
      envelope: qaMade.envelope,
    });
  }

  console.log('recorded. The Mode F corpus reads these files through src/lib/fixtures/recorded.ts; run npm test and npm run test:e2e before trusting them.');
}

main().catch((cause: unknown) => {
  if (cause instanceof NearError) die(`${cause.name} on ${cause.path}${cause.status === undefined ? '' : ` HTTP ${cause.status}`} — code ${cause.error.code} (nothing printed from the request)`);
  die(`unexpected failure: ${cause instanceof Error ? cause.message : String(cause)}`);
});
