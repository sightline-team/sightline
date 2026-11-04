#!/usr/bin/env tsx
/**
 * The Day-1 spike runner — item **S-02**, carrying **S-05**, **S-07** and **S-09** inside it.
 *
 * The reading half of the spike is in `docs/SPIKE_RESULTS.md`; this script is the measuring half.
 * It runs against the live service with the key in `.env` (`npm run spike` passes it with
 * `--env-file-if-exists`) and prints what a `[Measured]` row needs: statuses, timings, byte counts,
 * token counts and check verdicts.
 *
 * Two rules it is built around:
 *
 * 1. **Nothing document-derived is printed** (AGENTS.md §4 rule 7). Bodies appear as lengths,
 *    hashes appear as booleans and counts, and the completion's text is never echoed. So run this on
 *    the throwaway probe prompt below, not on a real letter — it is not a document reader.
 * 2. **It measures through the production code**, not around it: `createNearClient` in direct mode,
 *    `attestationReportSchema`, `bindReport`, `modelCatalogRowSchema`, `isAllowed`. A number that
 *    came from a private fetch double in this file would say nothing about the path users take.
 *
 * Stages: `catalog` (S-02, S-07), `attestation` (T-01 against a real report), `complete`
 * (S-05, S-09 — one probe completion and its signature), `image` (S-09 per page — a synthetic page run
 * through C-01's real `prepareImage` in Chromium, then billed), `document` (S-09 per **document** — the
 * structure step priced over transcripts of the length the photo path produces). `--stage=attestation`
 * implies the gate it needs. Default is the first three; `image` and `document` are explicit because the
 * first needs a browser and the second spends real money twice; `all` runs every stage.
 */
import { z } from 'zod';
import { chromium, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';
import { attestationReportSchema, bindReport, newNonce } from '@/lib/near-ai/attestation';
import { createNearClient, NearError, type CallPurpose, type NearClient } from '@/lib/near-ai/client';
import { completionEnvelopeSchema, contentOf, refusalOf, truncated } from '@/lib/near-ai/envelope';
import { REPAIR_NOTE, type CompletionResult } from '@/lib/near-ai/completion';
import { DEFAULT_MAX_EDGE, MAX_PAGE_BYTES, targetSize } from '@/lib/image/prepare';
import { TRANSCRIBE_SYSTEM_PROMPT, TRANSCRIBE_USER_PROMPT } from '@/features/capture/prompts';
import { transcribeSchema, type TranscribeOutput } from '@/features/capture/schemas';
import { TRANSCRIBE_MAX_TOKENS } from '@/features/capture/transcribe';
import { assembleDocument, type PageOutcome } from '@/features/capture/assemble';
import { checkPageLabels } from '@/features/capture/page-labels';
import { unreadablePageMarker } from '@/lib/transcript/holes';
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema } from '@/features/analysis/schemas';
import { groundFacts, quoteFound } from '@/features/analysis/grounding';
import { QA_SYSTEM_PROMPT, qaUserPrompt } from '@/features/qa/prompts';
import { qaSchema } from '@/features/qa/schemas';
import { appError } from '@/lib/errors';
import { isAllowed, isNearUpstreamHost, modelCatalogRowSchema, STEP_PLANS, toModelMetadata, type ModelCatalogRow, type StepPlan } from '@/lib/near-ai/models';
import { checkSignature, fetchSignature, signatureRecordSchema, type SignatureRecord } from '@/lib/near-ai/signatures';
import type { CheckResult } from '@/types';

const DIRECT_BASE_URL = 'https://cloud-api.near.ai/v1';
const SRC = path.join(__dirname, '..', 'src');

/** No document text here: this prompt exists to make one cheap, checkable round trip. */
const PROBE_PROMPT = 'Reply with exactly: OK';

/**
 * Deliberately not small. Measured: with `max_tokens: 8` a reasoning model spends all 8 tokens on
 * reasoning and returns `content: ""` with `finish_reason: "length"` — an empty "answer" that is
 * not truncated by accident but by the limit. The spike needs to exercise a real reply.
 */
const PROBE_MAX_TOKENS = 640;

const API_KEY = process.env.NEAR_AI_API_KEY ?? '';

/** The default run: everything that needs only a key. */
const STAGES: Stage[] = ['catalog', 'attestation', 'complete'];
/**
 * `image` is not in the default run because it drives Chromium as well as the network: the page is
 * drawn and prepared by the real `lib/image/prepare.ts` (C-01), which needs a browser. `document` is
 * not in it because it sends a whole synthetic document twice — the most expensive exchanges in this
 * script, and the ones that only need re-measuring when a price or a prompt changes. Ask for either
 * with `--stage=image`, `--stage=pages`, `--stage=document`, or `--stage=all`.
 */
const EXPLICIT_STAGES: Stage[] = ['image', 'pages', 'document', 'qa'];
type Stage = 'catalog' | 'attestation' | 'complete' | 'image' | 'pages' | 'document' | 'qa';

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.slice(name.length + 3);
}

function selectedStages(): Stage[] {
  const requested = arg('stage');
  if (requested === undefined) return STAGES;
  if (requested === 'all') return [...STAGES, ...EXPLICIT_STAGES];
  const known = [...STAGES, ...EXPLICIT_STAGES];
  const picked = requested.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const unknown = picked.filter((s) => !known.includes(s as Stage));
  if (unknown.length > 0) {
    console.error(`Unknown stage(s): ${unknown.join(', ')}. Known: ${known.join(', ')}, all.`);
    process.exit(2);
  }
  return picked as Stage[];
}

function client(): NearClient {
  return createNearClient({
    mode: 'direct',
    baseUrl: DIRECT_BASE_URL,
    // A provider, not a literal, because that is the shape Mode A needs per call (ADR-17) — the
    // spike exercises the same one. The value itself is never printed.
    headers: () => ({ authorization: `Bearer ${API_KEY}` }),
  });
}

function report(name: string, checks: CheckResult[]): void {
  for (const c of checks) {
    console.log(`  [${c.passed ? 'PASS' : c.ran ? 'FAIL' : 'not run'}] ${c.name}${c.detail === undefined ? '' : ` — ${c.detail}`}`);
  }
  console.log(`  ${name}: ${checks.filter((c) => c.ran && c.passed).length}/${checks.filter((c) => c.ran).length} ran-and-passed`);
}

function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const at = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - at };
}

// --------------------------------------------------------------------------- catalog (S-02, S-07)

/** `GET /v1/model/list` is not in the client's four-path allowlist, so it is fetched here. */
async function stageCatalog(): Promise<void> {
  console.log('== catalog — GET /v1/model/list (S-02, S-07)');
  const { value: res, ms } = await timed(() =>
    fetch(`${DIRECT_BASE_URL}/model/list`, { headers: { accept: 'application/json', authorization: `Bearer ${API_KEY}` } }),
  );
  console.log(`  HTTP ${res.status} in ${ms} ms`);
  if (!res.ok) {
    console.error('  catalog call failed');
    process.exitCode = 1;
    return;
  }
  const envelope = z.object({ models: z.array(z.unknown()).min(1), total: z.number().optional() }).parse(await res.json());
  console.log(`  entries: ${envelope.models.length}${envelope.total === undefined ? '' : ` (total ${envelope.total})`}`);

  const rows: ModelCatalogRow[] = [];
  const rawOf = new Map<string, unknown>();
  let rejects = 0;
  for (const raw of envelope.models) {
    const parsed = modelCatalogRowSchema.safeParse(raw);
    if (parsed.success) {
      rows.push(parsed.data);
      rawOf.set(parsed.data.modelId, raw);
    } else rejects += 1;
  }
  console.log(`  modelCatalogRowSchema accepted ${rows.length}, rejected ${rejects}`);

  const tally = new Map<string, number>();
  for (const r of rows) {
    const m = toModelMetadata(r);
    const key = `${m.providerType || '(unset)'} / attestationSupported=${m.attestationSupported}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  console.log('  by provider type:');
  for (const [key, count] of [...tally.entries()].sort()) console.log(`    ${count.toString().padStart(2)}  ${key}`);

  // The decision is made by the same `isAllowed` the app will use. The config list is set to every
  // id the catalog carries so what shows below is the safety filter, not the deployment's choice.
  const everyId = rows.map((r) => toModelMetadata(r).id);
  const image = rows.filter((r) => toModelMetadata(r).inputModalities.includes('image'));
  const attested = rows.filter((r) => toModelMetadata(r).attestationSupported);
  console.log(`  image-input entries: ${image.length} · attestationSupported entries: ${attested.length}`);
  console.log('  TEE + image, as `isAllowed` decides them:');
  const cost = (v?: { amount?: number; scale?: number }): string => (v?.amount === undefined ? 'price?' : `${v.amount}nano-USD/tok${v.scale === undefined ? '' : `@${v.scale}`}`);
  for (const r of rows.filter((x) => toModelMetadata(x).attestationSupported && toModelMetadata(x).inputModalities.includes('image'))) {
    const m = toModelMetadata(r);
    const d = isAllowed(m, everyId);
    const via = m.providerBaseUrl === '' ? '' : ` → ${safeHost(m.providerBaseUrl)}`;
    console.log(`    ${d.allowed ? 'ALLOW' : 'refuse'}  ${m.id}  [${d.reason}]  ${m.providerType}${via}`);
    console.log(`          ctx ${m.contextLength}  max_out ${m.maxOutputLength}  in ${cost(r.inputCostPerToken)}  out ${cost(r.outputCostPerToken)}  per-image ${cost(r.costPerImage)}`);
  }

  // S-07 asks whether a direct-completions host exists. `providerConfig` is the only place one could
  // be named, and it names two very different things: a NEAR enclave host we may send documents to,
  // and a third-party API we may not (rule 3). Walk every URL in it and split them.
  console.log('  providerConfig upstream hosts (S-07) — NEAR-side is a route, anything else is a forward:');
  const direct: string[] = [];
  const forwarded = new Map<string, number>();
  for (const r of rows) {
    for (const url of urlsIn(providerConfigOf(rawOf.get(r.modelId)))) {
      if (isNearUpstreamHost(url)) direct.push(`${r.modelId} → ${safeHost(url)}${toModelMetadata(r).attestationSupported ? '' : ' (not attested)'}`);
      else forwarded.set(safeHost(url), (forwarded.get(safeHost(url)) ?? 0) + 1);
    }
  }
  console.log(direct.length === 0 ? '    none' : direct.map((d) => `    ${d}`).join('\n'));
  console.log(`    forwarded to: ${forwarded.size === 0 ? 'nothing' : [...forwarded.entries()].sort().map(([h, n]) => `${h}×${n}`).join(', ')}`);
  const attestedForwards = rows.filter((r) => {
    const m = toModelMetadata(r);
    return m.attestationSupported && m.providerBaseUrl !== '' && !isNearUpstreamHost(m.providerBaseUrl);
  });
  console.log(
    `    attestationSupported AND forwarded off-NEAR (the rule-3 trap): ${attestedForwards.length === 0 ? 'none' : attestedForwards.map((r) => toModelMetadata(r).id).join(', ')}`,
  );
  if (rejects > 0) process.exitCode = 1;
}

/** The catalog JSON as received, because `modelCatalogRowSchema` deliberately drops fields we do not act on. */
function providerConfigOf(raw: unknown): unknown {
  return (raw as { metadata?: Record<string, unknown> } | undefined)?.metadata?.providerConfig;
}

function urlsIn(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) found.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) urlsIn(v, found);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) urlsIn(v, found);
  }
  return found;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable)';
  }
}

/** Lengths and shapes only — a key or an address is never printed in full. */
function fieldInventory(label: string, obj: Record<string, unknown>): void {
  console.log(`  field inventory of ${label}:`);
  for (const [k, v] of Object.entries(obj)) {
    const shape = Array.isArray(v) ? `array(${v.length})` : typeof v === 'string' ? `${k.includes('address') ? 'address' : 'hex'}(${v.length})` : v === null ? 'null' : typeof v;
    console.log(`    ${k}: ${shape}`);
  }
}

/** The two attested keys one report carries, and which signature kind each one is the key for. */
interface Attested {
  /** The gate's own verdict, so a completion stage never runs against an unbound report. */
  ok: boolean;
  /** `model_attestations[0]` — the enclave serving the model. Proves who ran the model. */
  keyOrAddress?: string;
  /** `gateway_attestation` — the cloud-api gateway TEE. Proves who proxied the bytes. */
  gatewayKeyOrAddress?: string;
}

// ------------------------------------------------------------------------ attestation (T-01 live)

async function stageAttestation(near: NearClient, model: string): Promise<Attested> {
  console.log(`== attestation — GET /v1/attestation/report?model=${model} (first real report)`);
  const nonce = newNonce();
  const { value: response, ms } = await timed(() =>
    near.get('attestation/report', { query: { model, nonce, signing_algo: 'ed25519' } }),
  );
  console.log(`  HTTP ${response.status} in ${ms} ms · ${bytes(response.rawText)} bytes of report`);

  const parsed = attestationReportSchema.safeParse(response.json);
  if (!parsed.success) {
    console.log('  FAIL  attestationReportSchema rejected the live report:');
    for (const issue of parsed.error.issues.slice(0, 8)) console.log(`    ${issue.path.join('.')}: ${issue.message}`);
    return { ok: false };
  }
  console.log('  the schema the app parses with accepted it');

  const bound = bindReport({ report: parsed.data, nonce, signingAlgo: 'ed25519' });
  report('bindReport', bound.checks);

  const model0 = (response.json as { model_attestations?: Record<string, unknown>[] }).model_attestations?.[0] ?? {};
  fieldInventory('model_attestations[0]', model0);
  const gateway = (response.json as { gateway_attestation?: Record<string, unknown> }).gateway_attestation ?? {};
  fieldInventory('gateway_attestation', gateway);
  console.log(`  model_attestations: ${(response.json as { model_attestations?: unknown[] }).model_attestations?.length ?? 0}`);
  console.log(`  nonce echoed by the service: ${model0.request_nonce === nonce}`);

  // A `gateway`-kind signature is not signed by the model enclave's key, so the spike needs the other
  // key too. Which field carries it is not in the machine contract, so both spellings are read and
  // whichever is a usable Ed25519 key (or ECDSA address) is the one reported.
  const gatewayAlgo = typeof gateway.signing_algo === 'string' ? gateway.signing_algo : 'ed25519';
  const gatewayCandidates = [gateway.signing_public_key, gateway.signing_address].filter((v): v is string => typeof v === 'string');
  const gatewayKey = gatewayCandidates.find((v) => (gatewayAlgo === 'ed25519' ? v.length === 64 : v.length === 40));
  console.log(
    `  gateway signing_algo ${gatewayAlgo} · attested key from ${gatewayKey === undefined ? 'neither field (no shape match)' : gatewayKey === gateway.signing_public_key ? 'signing_public_key' : 'signing_address'} · report_data present on gateway: ${gateway.report_data !== undefined}`,
  );

  return {
    ok: bound.status !== 'failed' && bound.checks.every((c) => c.ran && c.passed),
    ...(bound.signingKey !== undefined ? { keyOrAddress: bound.signingKey.keyOrAddress } : {}),
    ...(gatewayKey !== undefined ? { gatewayKeyOrAddress: gatewayKey } : {}),
  };
}

// ------------------------------------------------------------------- complete + signature (S-05/S-09)

const usageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  /** Measured 2026-11-03: an image is billed as input tokens, and `costPerImage` is 0 for every model. */
  prompt_tokens_details: z.object({ image_tokens: z.number().optional(), cached_tokens: z.number().optional() }).nullable().optional(),
  completion_tokens_details: z.object({ reasoning_tokens: z.number().optional() }).nullable().optional(),
});

type Usage = z.infer<typeof usageSchema>;

/** The per-token prices, read from the endpoint the app's F-04 filter uses rather than retyped here. */
type Price = { status: 'priced'; perIn: number; perOut: number } | { status: 'no_price' } | { status: 'unparsed' };

async function priceOf(near: NearClient, model: string): Promise<Price> {
  const priced = modelCatalogRowSchema.safeParse((await near.get('model/{model_name}', { modelName: model })).json);
  if (!priced.success) return { status: 'unparsed' };
  const perIn = priced.data.inputCostPerToken?.amount;
  const perOut = priced.data.outputCostPerToken?.amount;
  if (perIn === undefined || perOut === undefined) return { status: 'no_price' };
  return { status: 'priced', perIn, perOut };
}

function costLine(label: string, usage: Usage, price: { perIn: number; perOut: number }): string {
  const nano = (usage.prompt_tokens ?? 0) * price.perIn + (usage.completion_tokens ?? 0) * price.perOut;
  return `  cost of ${label}: ${nano} nano-USD = $${(nano / 1e9).toFixed(8)} at ${price.perIn}/${price.perOut} nano per in/out token`;
}

/** What an exchange cost, or 0 when the catalog gave no price to compute from. */
function nanoOf(usage: Usage, price: Price): number {
  return price.status === 'priced' ? (usage.prompt_tokens ?? 0) * price.perIn + (usage.completion_tokens ?? 0) * price.perOut : 0;
}

async function stageComplete(near: NearClient, model: string, attested: Attested): Promise<void> {
  console.log(`== complete — POST /v1/chat/completions then GET /v1/signature/{id}`);
  if (attested.keyOrAddress === undefined) {
    console.log('  SKIPPED: the attestation stage produced no attested key, and verifying against');
    console.log('  nothing is the pass-by-absence this project refuses (AGENTS.md §4 rule 6).');
    process.exitCode = 1;
    return;
  }

  const stream = process.argv.slice(2).includes('--stream');
  if (stream) return stageStream(near, model, attested);

  const body = { model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: PROBE_MAX_TOKENS, stream: false };
  const { value: response, ms } = await timed(() => near.post('chat/completions', body, { purpose: 'analyse' }));
  console.log(`  HTTP ${response.status} in ${ms} ms · sent ${bytes(response.sentBody ?? '')} bytes, received ${bytes(response.rawText)} bytes`);

  const envelope = completionEnvelopeSchema.extend({ usage: usageSchema.optional(), created: z.number().optional() }).safeParse(response.json);
  if (!envelope.success) {
    console.log('  FAIL  completionEnvelopeSchema rejected the live envelope — the gap is the measurement:');
    for (const issue of envelope.error.issues.slice(0, 8)) console.log(`    ${issue.path.join('.')}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  const e = envelope.data;
  const usage = e.usage ?? {};
  console.log(`  id present: ${e.id.length > 0} · model echoed: ${e.model ?? '(absent)'} · created: ${e.created ?? '(absent)'}`);
  console.log(`  finish_reason: ${e.choices[0]?.finish_reason ?? '(absent)'} · refusal: ${e.choices[0]?.message.refusal ?? '(absent)'}`);
  console.log(`  content length: ${contentOf(e).length} chars (content itself is never printed; a null answer reads as 0, which is the shape P-13 measured)`);
  console.log(
    `  usage: prompt ${usage.prompt_tokens ?? '(absent)'} · completion ${usage.completion_tokens ?? '(absent)'} · total ${usage.total_tokens ?? '(absent)'}` +
      ` · reasoning ${usage.completion_tokens_details?.reasoning_tokens ?? '(absent)'} · image ${usage.prompt_tokens_details?.image_tokens ?? '(absent)'}`,
  );

  // S-09: the price comes from `GET /v1/model/{model_name}`, which also proves that endpoint returns
  // the same row shape the bulk list does — the assumption ADR-18 rests on.
  const price = await priceOf(near, model);
  if (price.status === 'priced') console.log(costLine('this exchange (S-09)', usage, price));
  else console.log(`  cost: ${price.status === 'no_price' ? 'the catalog row carried no per-token price, so none is claimed' : 'GET /v1/model/{model_name} did not parse as a catalog row — a finding, not a skip'}`);

  const servedModel = e.model ?? model;
  const { value: record, ms: sigMs } = await timed(() => fetchSignature(near, e.id, { model: servedModel, algo: 'ed25519' }));
  console.log(`  signature fetched in ${sigMs} ms · signing_algo ${record.signing_algo} · signature_kind ${record.signature_kind ?? '(absent)'}`);
  console.log(`  signed text: ${record.text.split(':').length} colon-separated field(s), ${record.text.length} chars`);

  // Which model id the service puts in the signed text is not documented, so both are tried and the
  // one that verifies is reported rather than assumed.
  for (const candidate of new Set([servedModel, model])) {
    checkAgainstAttestedKeys(record, { requestBytes: response.sentBody ?? '', responseBytes: response.rawText, modelId: candidate }, attested);
  }
}

/**
 * A signature is only proof of the machine whose key verified it: `provider_tee` needs the key in
 * `model_attestations[0]`, `gateway` needs the one in `gateway_attestation`. Which field carries the
 * latter is not in the machine contract, so both attested keys the report gave us are tried and the
 * verdict is reported per key — the app does not get to pick the flattering one.
 */
function checkAgainstAttestedKeys(
  record: SignatureRecord,
  input: { requestBytes: string; responseBytes: string; modelId: string },
  attested: Attested,
): void {
  for (const [who, key] of [
    ['model_attestations[0]', attested.keyOrAddress],
    ['gateway_attestation', attested.gatewayKeyOrAddress],
  ] as const) {
    if (key === undefined) {
      console.log(`  against ${who}: no usable attested key in this report`);
      continue;
    }
    const check = checkSignature(record, { ...input, attestedKeyOrAddress: key });
    console.log(`  against ${who} (model id "${input.modelId}"): verified=${check.verified} origin=${check.origin} — ${check.detail}`);
  }
}

/**
 * `--stream` — what a streamed completion actually is, and who signs it.
 *
 * Measured 2026-11-03, and both answers are unwelcome for streaming. The bytes: a `text/event-stream`
 * body ending in exactly two newlines, and `checkSignature` **does** verify it — as a `gateway`
 * signature over SHA-256 of the whole SSE text, against `gateway_attestation.signing_address`. The
 * model enclave does not sign a stream, so a streamed answer can only ever be receipted as "signed by
 * the API gateway enclave" (AGENTS.md §4 rule 5 forbids calling that "verified by the model").
 *
 * The transport is the second problem. `NearClient` parses every 200 body as JSON (F-03), so the *same*
 * request that works with `stream: false` throws `invalid_model_output` through the production path.
 * Both facts are printed rather than worked around, because **F-05's done-when asks for "streaming"**
 * and the answer that has to reach that item is: a relay may forward an SSE body, but Sightline's
 * receipt for it is weaker, and this client cannot read it. ADR-22 closes the decision.
 */
async function stageStream(near: NearClient, model: string, attested: Attested): Promise<void> {
  const payload = { model, messages: [{ role: 'user', content: PROBE_PROMPT }], max_tokens: PROBE_MAX_TOKENS, stream: true };
  const body = JSON.stringify(payload);

  const at = Date.now();
  const res = await fetch(`${DIRECT_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
    body,
  });
  const rawText = await res.text();
  const ending = rawText.endsWith('\n\n') && !rawText.endsWith('\n\n\n');
  console.log(`  stream=true → HTTP ${res.status} in ${Date.now() - at} ms · content-type ${res.headers.get('content-type')} · ${bytes(rawText)} bytes`);
  console.log(`  ends with exactly two newlines: ${ending} · data: lines ${rawText.split('\n').filter((l) => l.startsWith('data:')).length} · [DONE] present: ${rawText.includes('data: [DONE]')}`);

  try {
    const through = await near.post('chat/completions', payload, { purpose: 'analyse' });
    console.log(`  NearClient on the same request: accepted, ${bytes(through.rawText)} bytes`);
  } catch (error) {
    console.log(`  NearClient on the same request: ${error instanceof NearError ? `${error.name} code ${error.error.code} at HTTP ${error.status ?? '?'}` : 'a non-NearError escaped'}`);
  }

  const chatId = /"id":"([^"]+)"/.exec(rawText)?.[1];
  if (chatId === undefined) {
    console.log('  no completion id in the stream, so nothing to fetch a signature for');
    process.exitCode = 1;
    return;
  }
  const sigRes = await fetch(`${DIRECT_BASE_URL}/signature/${encodeURIComponent(chatId)}?signing_algo=ed25519&model=${encodeURIComponent(model)}`, {
    headers: { authorization: `Bearer ${API_KEY}`, accept: 'application/json' },
  });
  const record = signatureRecordSchema.safeParse(await sigRes.json().catch(() => undefined));
  if (!sigRes.ok || !record.success) {
    console.log(`  GET /v1/signature/{id} → HTTP ${sigRes.status}, no usable record (the documented transient is a 404; the client retries it once)`);
    process.exitCode = 1;
    return;
  }
  console.log(`  signature for the streamed exchange: kind ${record.data.signature_kind ?? '(absent)'} · ${record.data.text.split(':').length} field(s) over ${bytes(rawText)} SSE bytes`);
  checkAgainstAttestedKeys(record.data, { requestBytes: body, responseBytes: rawText, modelId: model }, attested);
}

// ------------------------------------------------------------- image (S-09 per page, C-03's request shape)

/**
 * A photographed page at the resolution a phone gives when the page fills the frame: 3024×4032 is a
 * 4:3 sensor, portrait. This is the input C-02 gets from a camera, and it is synthetic — a canvas this
 * file draws, not anybody's letter (AGENTS.md §5, "never do" real documents and photos).
 */
const PAGE_INPUT = { width: 3024, height: 4032 };

/**
 * The probe asks for a line count, not a transcription. S-09's per-page figure is the **input** half of
 * the cost (`prompt_tokens`, of which `image_tokens` is the page) and that half does not depend on the
 * instruction; the output half — a full transcription plus its reasoning — belongs to S-03's golden set
 * and is deliberately not claimed here.
 *
 * **Amended 2026-11-04:** a third probe below (`--stage=image`, the "C-03's own request" line) now sends
 * the app's real transcription body, so the output half is measured for the request the product makes
 * and not only for this probe. The line-count probe stays, because the two geometries it compares are
 * what makes C-01's saving a number, and a comparison needs the instruction to be the same both times.
 */
const PAGE_PROMPT = 'This is a photograph of one page of printed text. Reply with the number of separate lines of text you can see, as digits only.';
const PAGE_MAX_TOKENS = 256;

/** `prepare.ts` bundled for the page — the same method `tests/e2e/image-prepare.spec.ts` uses for C-01's proof. */
const PREPARE_BUNDLE = buildSync({
  entryPoints: [path.join(SRC, 'lib', 'image', 'prepare.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'SightlinePrepare',
  platform: 'browser',
  target: 'esnext',
  alias: { '@': SRC },
}).outputFiles[0]!.text;

interface PageSample {
  sourceB64: string;
  sourceBytes: number;
  preparedB64: string;
  /** The app's own `toDataUrl` output for the prepared page — the exact string C-03 puts in a body. */
  preparedDataUrl: string;
  preparedBytes: number;
  preparedWidth: number;
  preparedHeight: number;
  prepareMs: number;
}

interface ProbeResult {
  usage: Usage;
  chatId: string;
  servedModel: string;
  requestBytes: string;
  responseBytes: string;
  bodyBytes: number;
  /** Whether the app's own envelope schema would have accepted this reply — C-03 depends on the answer. */
  envelopeOk: boolean;
  /** Set only by the C-03 probe: the `transcribeSchema` verdict, as a count summary. */
  transcribeContract?: string;
}

/** Draws the page, then prepares it with C-01's real module inside the browser. */
async function drawPage(page: Page, label?: { pageNumber: number; totalPages: number }): Promise<PageSample> {
  return page.evaluate(async ({ w, h, label }) => {
    const toB64 = async (blob: Blob): Promise<string> => {
      const view = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < view.length; i += 0x8000) bin += String.fromCharCode(...Array.from(view.subarray(i, i + 0x8000)));
      return btoa(bin);
    };

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.011); // a slightly crooked page, because that is what a hand-held shot looks like
    ctx.fillStyle = '#f6f4ef';
    ctx.fillRect(-w * 0.47, -h * 0.485, w * 0.94, h * 0.97);
    // Real glyphs, not bars. A first run drew grey rectangles as "text", which is enough to count
    // lines and to price a page, but not enough to ask a vision model for a transcript: C-03's probe
    // needs the reply to be a *reading of something*, or `transcribeSchema` would be judged on a page
    // with no words in it. Everything here is synthetic — an invented reference, invented line items
    // (AGENTS.md §5: never a real document).
    ctx.fillStyle = '#1d1d1d';
    ctx.textBaseline = 'top';
    const left = -w * 0.47 + w * 0.09;
    const lineH = h * 0.011;
    let y = -h * 0.485 + h * 0.06;
    ctx.font = `${Math.round(lineH * 1.9)}px sans-serif`;
    ctx.fillText('SYNTHETIC INVOICE - NOT A REAL DOCUMENT', left, y);
    y += lineH * 3.2;
    ctx.font = `${Math.round(lineH * 1.5)}px sans-serif`;
    // Each page carries its own printed label and its own line numbers, because C-11's whole question is
    // whether an offset still points at the page it came from. Five identical pages would let a shifted
    // offset look correct: the string would be found in the joined transcript either way.
    const tag = label === undefined ? '' : `   PAGE ${label.pageNumber} OF ${label.totalPages}`;
    ctx.fillText(`Northgate Example Trust   Reference NC-0000-SYN${tag}`, left, y);
    y += lineH * 2.4;
    const first = label === undefined ? 1 : (label.pageNumber - 1) * 28 + 1;
    for (let i = 0; i < 28; i++) {
      const n = first + i;
      ctx.fillText(`Line ${n.toString().padStart(3, '0')}  example service ${(n % 4) + 1}  GBP ${String(100 + ((n * 7) % 900))}.${String((n * 13) % 100).padStart(2, '0')}`, left, y);
      y += lineH * 2.15;
    }
    ctx.restore();
    const source = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.93 });

    const api = (window as unknown as {
      SightlinePrepare: {
        prepareImage: (b: Blob, o?: object) => Promise<{ blob: Blob; width: number; height: number }>;
        toDataUrl: (b: Blob) => Promise<string>;
      };
    }).SightlinePrepare;
    const at = performance.now();
    const prepared = await api.prepareImage(source);
    return {
      sourceB64: await toB64(source),
      sourceBytes: source.size,
      preparedB64: await toB64(prepared.blob),
      // The app's own helper, in the app's own browser, on the app's own prepared page — so the URL in
      // the probe's body is the string `transcribePage` would send, chunking and all.
      preparedDataUrl: await api.toDataUrl(prepared.blob),
      preparedBytes: prepared.blob.size,
      preparedWidth: prepared.width,
      preparedHeight: prepared.height,
      prepareMs: Math.round(performance.now() - at),
    };
  }, { w: PAGE_INPUT.width, h: PAGE_INPUT.height, label });
}

/**
 * One page-sized request through the production client. Nothing of the reply is printed but its
 * length and field shapes (AGENTS.md §4 rule 7). The caller builds the body, so the two probes below
 * differ only in what they ask — and the C-03 one asks with the app's own bytes.
 */
async function probePage(
  near: NearClient,
  model: string,
  price: Price,
  label: string,
  jpegBytes: number,
  body: Record<string, unknown>,
  opts: { purpose: CallPurpose; checkTranscribeContract?: boolean } = { purpose: 'analyse' },
): Promise<ProbeResult | undefined> {
  let request;
  try {
    request = await timed(() => near.post('chat/completions', body, { purpose: opts.purpose }));
  } catch (error) {
    console.log(`  ${label}: rejected — ${error instanceof NearError ? `${error.name} code ${error.error.code} at HTTP ${error.status ?? '?'}` : 'a non-NearError escaped'}`);
    process.exitCode = 1;
    return undefined;
  }
  const response = request.value;
  console.log(`  ${label}: HTTP ${response.status} in ${request.ms} ms · JPEG ${jpegBytes} bytes · request body ${bytes(response.sentBody ?? '')} bytes (base64 adds a third) · reply ${bytes(response.rawText)} bytes`);

  const rawJson = response.json as {
    id?: unknown;
    model?: unknown;
    usage?: unknown;
    choices?: { message?: Record<string, unknown>; finish_reason?: unknown }[];
  };

  // Usage is read off the raw JSON, not through `completionEnvelopeSchema`, because the schema can be
  // the thing that fails (see the envelope verdict below) and the token count is what S-09 came for.
  const usageParse = usageSchema.safeParse(rawJson.usage ?? {});
  const usage = usageParse.success ? usageParse.data : {};
  console.log(
    `    usage: prompt ${usage.prompt_tokens ?? '(absent)'} of which image ${usage.prompt_tokens_details?.image_tokens ?? '(absent)'} · completion ${usage.completion_tokens ?? '(absent)'} of which reasoning ${usage.completion_tokens_details?.reasoning_tokens ?? '(absent)'}`,
  );
  if (price.status === 'priced') {
    console.log(costLine(label, usage, price));
    const inputOnly = (usage.prompt_tokens ?? 0) * price.perIn;
    console.log(`    the input half, which is what a page costs whatever the answer is: ${inputOnly} nano-USD = $${(inputOnly / 1e9).toFixed(8)} per page`);
  }

  // Shape, never values: which fields the message carries and how big each is (AGENTS.md §4 rule 7).
  const message = rawJson.choices?.[0]?.message ?? {};
  console.log(`    message fields: ${Object.entries(message).map(([k, v]) => `${k}=${v === null ? 'null' : typeof v === 'string' ? `string(${v.length})` : typeof v}`).join(', ') || '(none)'}`);
  console.log(`    finish_reason: ${String(rawJson.choices?.[0]?.finish_reason ?? '(absent)')}`);

  const envelope = completionEnvelopeSchema.extend({ usage: usageSchema.optional(), created: z.number().optional() }).safeParse(response.json);
  if (!envelope.success) {
    console.log('    FAIL  completionEnvelopeSchema — the schema `readCompletion` parses with — rejected this image envelope:');
    for (const issue of envelope.error.issues.slice(0, 6)) console.log(`      ${issue.path.join('.')}: ${issue.message}`);
    console.log('      In the app this is `invalid_model_output`: the answer is discarded and nothing is shown. C-03 has to answer it.');
    process.exitCode = 1;
    return {
      usage,
      chatId: typeof rawJson.id === 'string' ? rawJson.id : '',
      servedModel: typeof rawJson.model === 'string' ? rawJson.model : model,
      requestBytes: response.sentBody ?? '',
      responseBytes: response.rawText,
      bodyBytes: bytes(response.sentBody ?? ''),
      envelopeOk: false,
    };
  }
  const e = envelope.data;
  console.log(`    envelope accepted · content ${contentOf(e).length} chars (never printed) · truncated: ${e.choices[0]?.finish_reason === 'length' ? 'yes — `readCompletion` would send this to the transcript-only screen' : 'no'}`);

  // C-03's real question is not "did a model answer" but "did it answer in the shape
  // `transcribeSchema` validates", because a reply that does not is one repair retry away from
  // transcript-only for the whole page. Field names and counts only — the transcript itself is
  // document-derived and never printed (AGENTS.md §4 rule 7).
  let transcribeContract: string | undefined;
  if (opts.checkTranscribeContract) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(contentOf(e));
    } catch {
      parsed = undefined;
    }
    const contract = transcribeSchema.safeParse(parsed);
    if (contract.success) {
      transcribeContract = `transcribeSchema ACCEPTED · text ${contract.data.text.length} chars · uncertain ${contract.data.uncertain.length} span(s) · captureIssues ${contract.data.captureIssues.length === 0 ? '(none)' : contract.data.captureIssues.join(',')} · pageLabel ${contract.data.pageLabel === undefined ? 'absent' : 'present'}`;
    } else {
      transcribeContract = `transcribeSchema REJECTED — ${contract.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}. In the app that is one repair retry and then the transcript-only screen.`;
      process.exitCode = 1;
    }
    console.log(`    ${transcribeContract}`);
  }
  return {
    usage,
    chatId: e.id,
    servedModel: e.model ?? model,
    requestBytes: response.sentBody ?? '',
    responseBytes: response.rawText,
    bodyBytes: bytes(response.sentBody ?? ''),
    envelopeOk: true,
    transcribeContract,
  };
}

async function stageImage(near: NearClient, model: string, attested: Attested): Promise<void> {
  console.log(`== image — a synthetic page through C-01's prepareImage in Chromium, then POST /v1/chat/completions`);
  let sample: PageSample;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: PREPARE_BUNDLE });
    // `tsx` keeps function names by wrapping them in `__name`; Playwright sends the function's source
    // text to the page, where that helper does not exist. The shim is what `drawPage` needs to run, not
    // part of what is measured.
    await page.evaluate('globalThis.__name = (f) => f');
    sample = await drawPage(page);
  } finally {
    await browser.close();
  }

  const geometry = targetSize(PAGE_INPUT.width, PAGE_INPUT.height, DEFAULT_MAX_EDGE);
  console.log(`  drawn ${PAGE_INPUT.width}×${PAGE_INPUT.height} → JPEG ${sample.sourceBytes} bytes (${(sample.sourceBytes / 1048576).toFixed(2)} MiB)`);
  console.log(`  prepareImage in ${sample.prepareMs} ms → ${sample.preparedWidth}×${sample.preparedHeight}, ${sample.preparedBytes} bytes (${(sample.preparedBytes / 1024).toFixed(0)} KiB) · C-01's budget MAX_PAGE_BYTES = ${MAX_PAGE_BYTES} → ${sample.preparedBytes <= MAX_PAGE_BYTES ? 'inside' : 'OVER'}`);
  console.log(`  targetSize(${PAGE_INPUT.width}, ${PAGE_INPUT.height}, DEFAULT_MAX_EDGE ${DEFAULT_MAX_EDGE}) = ${geometry.width}×${geometry.height} — what the module's own helper says the output should be`);

  const price = await priceOf(near, model);
  if (price.status === 'priced') console.log(`  priced from GET /v1/model/{model_name}: ${price.perIn}/${price.perOut} nano-USD per in/out token`);
  else console.log(`  price: ${price.status === 'no_price' ? 'the catalog row carried no per-token price, so no figure is claimed' : 'GET /v1/model/{model_name} did not parse as a catalog row'}`);

  const lineCountBody = (b64: string): Record<string, unknown> => ({
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PAGE_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      },
    ],
    max_tokens: PAGE_MAX_TOKENS,
    stream: false,
  });

  const prepared = await probePage(near, model, price, 'prepared page (what Sightline sends)', sample.preparedBytes, lineCountBody(sample.preparedB64));
  const raw = await probePage(near, model, price, 'unprepared page (what the phone gave)', sample.sourceBytes, lineCountBody(sample.sourceB64));

  /**
   * C-03's own request, with the app's own pieces: the system prompt it sends, the one-line user text
   * that names no page index (so `pageLabel` can only come off the paper), the `image_url` part built by
   * the production client's body shape, and `max_tokens: TRANSCRIBE_MAX_TOKENS`. It deliberately sends
   * **no `stream` key**, because `readCompletion` sends none (ADR-22) — if the service answered this one
   * as a stream, `NearClient` would fail to parse it, and that is a fact worth knowing before the photo
   * path ships rather than after.
   */
  const transcription = await probePage(
    near,
    model,
    price,
    "C-03's transcription request (the body `readCompletion` builds)",
    sample.preparedBytes,
    {
      model,
      messages: [
        { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: TRANSCRIBE_USER_PROMPT },
            { type: 'image_url', image_url: { url: sample.preparedDataUrl } },
          ],
        },
      ],
      max_tokens: TRANSCRIBE_MAX_TOKENS,
    },
    { purpose: 'transcribe', checkTranscribeContract: true },
  );

  // The receipt to check is the one for the app's own bytes, when that exchange happened.
  const signed = transcription ?? prepared;
  if (signed !== undefined) {
    console.log(`  five pages at the prepared size ≈ ${signed.bodyBytes * 5} bytes of request body — F-05's cap is MAX_BODY_BYTES in lib/server/allowlist.ts, and the relay sees this number, not the JPEG's`);
    if (attested.keyOrAddress === undefined) {
      console.log('  signature: SKIPPED, no attested key from the attestation stage (rule 6 — no pass by absence)');
    } else {
      const { value: record, ms: sigMs } = await timed(() => fetchSignature(near, signed.chatId, { model: signed.servedModel, algo: 'ed25519' }));
      console.log(`  signature for the ${transcription === undefined ? 'prepared' : 'transcription'} exchange in ${sigMs} ms · kind ${record.signature_kind ?? '(absent)'} · signing_algo ${record.signing_algo}`);
      // Which model id the signed text names is still undocumented, so both spellings are tried, as in
      // the text stage. A `Set` because for this model they are the same string and a doubled line in a
      // measurement output reads like two checks that disagreed.
      for (const candidate of new Set([signed.servedModel, model])) {
        checkAgainstAttestedKeys(record, { requestBytes: signed.requestBytes, responseBytes: signed.responseBytes, modelId: candidate }, attested);
      }
    }
  }

  if (prepared !== undefined && raw !== undefined && price.status === 'priced') {
    const p = prepared.usage.prompt_tokens ?? 0;
    const r = raw.usage.prompt_tokens ?? 0;
    console.log(`  what C-01 saves on the input half: ${r === 0 ? 'the unprepared page returned no prompt count' : `${(100 * (1 - p / r)).toFixed(1)}% fewer prompt tokens`}, and ${raw.bodyBytes - prepared.bodyBytes} fewer bytes of body per page`);
  }
}

// ------------------------------------------------------------------------------- pages (C-11's assembly)

/**
 * Five prepared pages become one transcript, and the offsets are checked against the pages they came
 * from (item **C-11**, **ADR-27**).
 *
 * This is the only stage in this file that runs *our* logic on live replies rather than measuring the
 * service: `assembleDocument` is imported from `features/capture/`, so the join, the offset arithmetic
 * and the hole marker are the ones the app will ship. The request shape is C-03's, unchanged, once per
 * page — the thing being measured is what happens after five of them come back.
 *
 * Two assemblies are printed from the same exchanges. The first is the document a person would get if
 * every page answered. The second re-asks one page with `max_tokens: 256`, the budget §1 measured as
 * small enough to truncate a reasoning model, so ADR-27's hole path is exercised against a **real**
 * truncation rather than only a unit-test fixture. Nothing is invented to be a failure: a page is made
 * to fail by asking it with a budget known to be too small, which is the same thing the service does to
 * a dense page on its own.
 */
const PAGE_SET = 5;

/** C-03's body for one prepared page, as `readCompletion` builds it (ADR-22: no `stream` key). */
function transcribeBodyFor(model: string, preparedDataUrl: string, maxTokens: number): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: TRANSCRIBE_USER_PROMPT },
          { type: 'image_url', image_url: { url: preparedDataUrl } },
        ],
      },
    ],
    max_tokens: maxTokens,
  };
}

/**
 * What one page's exchange produced: the app's own outcome, plus the lengths needed to check the
 * assembly without ever printing what was read (AGENTS.md §4 rule 7).
 */
interface PageExchange {
  outcome: CompletionResult<TranscribeOutput>;
  usage: Usage;
  chatId: string;
  servedModel: string;
  requestBytes: string;
  responseBytes: string;
  ms: number;
}

async function transcribeOnePage(
  near: NearClient,
  model: string,
  price: Price,
  label: string,
  dataUrl: string,
  maxTokens: number,
): Promise<PageExchange | undefined> {
  const body = transcribeBodyFor(model, dataUrl, maxTokens);
  const request = await timed(() => near.post('chat/completions', body, { purpose: 'transcribe' })).catch((error: unknown) => {
    console.log(`  ${label}: rejected — ${error instanceof NearError ? `${error.name} code ${error.error.code} at HTTP ${error.status ?? '?'}` : 'a non-NearError escaped'}`);
    process.exitCode = 1;
    return undefined;
  });
  if (request === undefined) return undefined;
  const { value: response, ms } = request;
  console.log(`  ${label}: HTTP ${response.status} in ${ms} ms · reply ${bytes(response.rawText)} bytes · body ${String(maxTokens)} token budget`);

  const envelope = completionEnvelopeSchema.safeParse(response.json);
  if (!envelope.success) {
    console.log(`  ${label}: completionEnvelopeSchema rejected it — the app would call this \`invalid_model_output\``);
    process.exitCode = 1;
    return undefined;
  }
  const e = envelope.data;
  const usageParse = usageSchema.safeParse((response.json as { usage?: unknown }).usage ?? {});
  const usage = usageParse.success ? usageParse.data : {};
  const servedModel = typeof e.model === 'string' ? e.model : model;
  const base = {
    chatId: e.id,
    servedModel,
    requestBytes: response.sentBody ?? '',
    responseBytes: response.rawText,
    usage,
    ms,
  };

  if (price.status === 'priced') console.log(`    ${costLine(label, usage, price)}`);

  if (refusalOf(e) !== undefined) {
    console.log(`    refusal · counted as a page that yielded nothing`);
    return { ...base, outcome: { kind: 'refused', error: appError('model_refused') } };
  }
  if (truncated(e)) {
    const content = contentOf(e);
    console.log(`    TRUNCATED at ${String(maxTokens)} tokens — content ${content.length} chars (never printed). ADR-27: this page becomes a hole in the reading, not a shorter page.`);
    return { ...base, outcome: { kind: 'truncated', error: appError('output_truncated') } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contentOf(e));
  } catch {
    parsed = undefined;
  }
  const contract = transcribeSchema.safeParse(parsed);
  if (!contract.success) {
    console.log(`    transcribeSchema REJECTED — ${contract.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')} · the app's own repair retry would run here`);
    process.exitCode = 1;
    return { ...base, outcome: { kind: 'unreadable', error: appError('invalid_model_output') } };
  }
  console.log(`    transcribeSchema ACCEPTED · text ${contract.data.text.length} chars · uncertain ${contract.data.uncertain.length} · captureIssues ${contract.data.captureIssues.length === 0 ? '(none)' : contract.data.captureIssues.join(',')} · pageLabel ${contract.data.pageLabel === undefined ? 'absent' : 'present'}`);
  return { ...base, outcome: { kind: 'ok', value: contract.data, model: servedModel } };
}

/** Reports one assembly's shape and whether every page's region and spans point back at that page. */
function reportAssembly(label: string, pages: PageExchange[]): void {
  // A refusal is not assembly's to decide (§13 halts on it), so it leaves the list before the join.
  const answered = pages.filter((p) => p.outcome.kind !== 'refused');
  if (answered.length !== pages.length) {
    console.log(`    ${pages.length - answered.length} page(s) refused outright: §13 halts a run on a refusal, so they are not assembled`);
  }
  const outcomes = answered.map((p) => p.outcome) as PageOutcome[];
  // What each page's region should *be*: the text it reported, or the marker ADR-27 puts where a page
  // that reported nothing would have been. Held here to compare, never printed (rule 7).
  const expected = outcomes.map((o, page) => (o.kind === 'ok' ? o.value.text : unreadablePageMarker(page)));
  const { transcript, usable, unplaceableSpans } = assembleDocument(outcomes);

  console.log(`  ${label}: ${outcomes.length} page(s) · joined text ${transcript.text.length} chars · offsets [${transcript.pageOffsets.join(', ')}] · uncertain ${transcript.uncertain.length} span(s) · captureIssues ${transcript.captureIssues.length} · labels ${transcript.pageNumbersSeen?.length ?? 0} · missing ${transcript.missingPages?.map((m) => `${m.page + 1}:${m.code}`).join(' ') || '(none)'} · usable ${usable} · unplaceable spans ${unplaceableSpans}`);

  // The offsets are the claim, so they are checked rather than assumed: cutting the joined string at each
  // page's offset, for that page's own length, has to give back exactly that page's text. A short region
  // means the joiner was not counted; an overlapping one means it was counted twice.
  const regions = transcript.pageOffsets.map((offset, i) => transcript.text.slice(offset, offset + (expected[i] ?? '').length));
  const regionsOk = regions.length === expected.length && regions.every((region, i) => region === expected[i]);
  console.log(`    each page's region, cut at its offset, is that page's own text: ${regionsOk ? 'yes' : 'NO'}`);

  // A span may not reach outside the page it came from — the failure C-11 exists to prevent.
  const spansInPage = transcript.uncertain.every((span) =>
    transcript.pageOffsets.some((offset, i) => {
      const length = (expected[i] ?? '').length;
      return span.start >= offset && span.end <= offset + length;
    }),
  );
  console.log(`    every uncertain span lies inside the page it came from: ${transcript.uncertain.length === 0 ? 'no span to check' : spansInPage ? 'yes' : 'NO'}`);

  // **C-05**'s check runs on the real assembly, but only its *counts* are printed: which page a document
  // numbers itself is document content (AGENTS.md §4 rule 7), so the findings' numbers stay unsaid here.
  const labels = checkPageLabels(transcript);
  console.log(`    page-label check (C-05): ${labels.findings.length} finding(s) [${labels.findings.map((f) => f.kind).join(' ') || 'none'}] · ${labels.parsed} of ${labels.parsed + labels.unparsed} reported label(s) read as a page number · compared against ${labels.pageCount} photograph(s)`);
  if (!regionsOk || (transcript.uncertain.length > 0 && !spansInPage)) process.exitCode = 1;
}

async function stagePages(near: NearClient, model: string, attested: Attested): Promise<void> {
  console.log(`== pages — ${PAGE_SET} synthetic pages, C-03's request each, joined by the real assembleDocument (C-11, ADR-27)`);

  const samples: PageSample[] = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: PREPARE_BUNDLE });
    await page.evaluate('globalThis.__name = (f) => f');
    for (let n = 1; n <= PAGE_SET; n += 1) samples.push(await drawPage(page, { pageNumber: n, totalPages: PAGE_SET }));
  } finally {
    await browser.close();
  }
  console.log(`  ${samples.length} pages drawn at ${PAGE_INPUT.width}×${PAGE_INPUT.height} and prepared by C-01's real module: ${samples.map((s) => `${s.preparedBytes} bytes at ${s.preparedWidth}×${s.preparedHeight}`).join(', ')}`);

  const price = await priceOf(near, model);
  if (price.status === 'priced') console.log(`  priced from GET /v1/model/{model_name}: ${price.perIn}/${price.perOut} nano-USD per in/out token`);

  const pages: PageExchange[] = [];
  for (const [i, sample] of samples.entries()) {
    const exchange = await transcribeOnePage(near, model, price, `page ${i + 1}`, sample.preparedDataUrl, TRANSCRIBE_MAX_TOKENS);
    if (exchange === undefined) continue;
    pages.push(exchange);
  }

  // Each page's signature is checked, because a five-page document is five receipts and rule 4 says each
  // response is verified — an assembly built from unverified halves is not a verified document.
  let verified = 0;
  for (const p of pages) {
    if (attested.keyOrAddress === undefined) continue;
    const { value: record } = await timed(() => fetchSignature(near, p.chatId, { model: p.servedModel, algo: 'ed25519' }));
    const check = checkSignature(record, { requestBytes: p.requestBytes, responseBytes: p.responseBytes, modelId: p.servedModel, attestedKeyOrAddress: attested.keyOrAddress });
    if (check.verified && check.origin === 'provider_tee') verified += 1;
  }
  if (attested.keyOrAddress !== undefined) {
    console.log(`  signatures: ${verified} of ${pages.length} pages verified as provider_tee against model_attestations[0] (ADR-19)`);
  } else {
    console.log('  signatures: SKIPPED, no attested key from the attestation stage (rule 6 — no pass by absence)');
    process.exitCode = 1;
  }

  reportAssembly('assembled (all pages at the app budget)', pages);

  // ADR-27's hole path, on a truncation the service actually produced rather than one asserted in a test.
  const dense = await transcribeOnePage(near, model, price, 'page 1 re-asked at 256 tokens', samples[0]!.preparedDataUrl, 256);
  if (dense !== undefined && dense.outcome.kind !== 'ok') {
    // It goes back in **position 0**, because the marker names the page by its place in the document: the
    // truncation happened to page 1's photograph, so "[page 1 could not be read]" is the true sentence.
    reportAssembly('assembled with page 1 truncated', [dense, ...pages.slice(1)]);
  } else if (dense !== undefined) {
    console.log(`  the 256-token re-ask did NOT truncate, so ADR-27's hole path has no live instance from this run (the unit tests still hold it)`);
  }

  const totalNano = pages.reduce((sum, p) => sum + nanoOf(p.usage, price), 0);
  const totalMs = pages.reduce((sum, p) => sum + p.ms, 0);
  if (price.status === 'priced') {
    console.log(`  ${pages.length} pages of transcription ≈ ${totalNano} nano-USD = $${(totalNano / 1e9).toFixed(8)} and ${totalMs} ms of model time, in series`);
    console.log(`  the joined transcript is what the structure step is then billed over: its length is in the assembly line above, and the price of that step is in §4's structure table`);
  }
}

// ------------------------------------------------------------------------------------ document (S-09)

/**
 * The per-page figure from §4, carried in rather than re-billed so one `--stage=document` run can
 * state a whole document's cost. It is a *recorded measurement*, not a price read from the catalog:
 * the catalog gives the rate, this gives what a page used. **C-11's `--stage=pages` run replaced the
 * figures** — it is the mean of five photographed pages on the raster `drawPage` now prints ($0.00081280
 * and 28.32 s a page, 2026-11-04), where the previous pair was one page measured on the raster before
 * line items were numbered per page. One page's price is not a document's: the five spread from
 * 607,800 to 914,300 nano.
 */
const MEASURED_PAGE_NANO_USD = 812_800;
const MEASURED_PAGE_MS = 28_320;

/**
 * The page `--stage=image` draws, as text: the same synthetic invoice, so the structure step is
 * priced over a transcript of the length the photo path actually hands it. `pages` × 28 line items
 * numbered continuously, which makes a five-page document read as one long bill rather than the
 * same bill five times. Synthetic throughout — AGENTS.md §5 forbids a real document here, and this
 * one is nobody's letter.
 */
function syntheticTranscript(pages: number): string {
  const items: string[] = [];
  for (let i = 1; i <= 28 * pages; i += 1) {
    items.push(`Line ${i.toString().padStart(3, '0')}  example service ${(i % 4) + 1}  GBP 0${(i % 9) + 1}.${(i % 100).toString().padStart(2, '0')}`);
  }
  return [
    'SYNTHETIC INVOICE - NOT A REAL DOCUMENT',
    'Northgate Example Trust   Reference NC-0000-SYN',
    '',
    ...items,
    '',
    'Total due: GBP 840.00',
    'Please pay the total by 14 March 2026.',
    'If anything here is wrong, call 0800 000 0000 and quote reference NC-0000-SYN.',
  ].join('\n');
}

/**
 * Which `kind` words a rejected reply actually used. A one-word category label from a closed list is
 * shape, not content (AGENTS.md §4 rule 7), and this document is synthetic — and without it the
 * finding is "the model said something we did not accept", which is not a fact anybody can act on.
 */
function kindsUsed(parsed: unknown): string {
  if (typeof parsed !== 'object' || parsed === null) return '(the reply was not an object at all)';
  const parts: string[] = [];
  for (const key of ['facts', 'warnings'] as const) {
    const items = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(items)) continue;
    const kinds = [...new Set(items.map((item) =>
      typeof item === 'object' && item !== null ? String((item as Record<string, unknown>).kind) : '(not an object)',
    ))];
    parts.push(`${key}[].kind = ${kinds.join(' | ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '(no facts or warnings arrays in the reply)';
}

/**
 * S-09's last number, and ADR-24's check: **the structure step priced over a document, on the model
 * the plan assigns it, with the budget the app sends.** Every figure before the 2026-11-04 run came
 * from `PROBE_PROMPT` or a one-line page count, which says nothing about what the app's second
 * request costs on the transcript the first request produced.
 *
 * The body is exactly what `readCompletion` builds for `purpose: 'analyse'` — `STRUCTURE_SYSTEM_PROMPT`
 * plus `structureUserPrompt(transcript)`, `max_tokens: STEP_PLANS.analyse.maxTokens` (**ADR-24**: the
 * text path used to send no budget at all, which caps nothing) and **no `stream`** (ADR-22). If any of
 * those were wrong for a document-length request, this is where it shows.
 *
 * When a reply cannot be read the stage makes **the app's own single repair retry** — the same system
 * prompt, the user text with `REPAIR_NOTE` joined, the same budget — because that is what the person
 * gets, and because the note now names a ``` fence (§4 found two of them) nobody had ever retried.
 * A truncation or a refusal is not retried, per the same rule (`completion.ts`'s "what the retry is
 * not used for"). Both attempts are priced and their signatures checked; the exit code follows the
 * *second* one, so a model whose answers the app cannot read still fails the stage.
 *
 * The reply is put through `analysisSchema` and `groundFacts`, which is the app's own check rather
 * than a new one: how many of the facts the model returned quote the transcript back. That is
 * **consistency with our transcript, not correctness against the page** (AGENTS.md §4 rule 8) — a
 * misread number that is quoted faithfully still grounds, so the line this prints is a lead for S-03,
 * not S-03's result.
 */
async function stageDocument(near: NearClient, model: string, attested: Attested): Promise<void> {
  console.log('== document — S-09: the structure step priced over transcripts of the length the app sends');
  if (attested.keyOrAddress === undefined) {
    console.log('  SKIPPED: no attested key from the attestation stage, so the receipt half of this');
    console.log('  exchange could not be checked. Rule 6 — no pass by absence.');
    process.exitCode = 1;
    return;
  }

  const price = await priceOf(near, model);
  if (price.status === 'priced') console.log(`  priced from GET /v1/model/{model_name}: ${price.perIn}/${price.perOut} nano-USD per in/out token`);
  else console.log(`  price: ${price.status === 'no_price' ? 'the catalog row carried no per-token price, so no figure is claimed' : 'GET /v1/model/{model_name} did not parse as a catalog row'}`);

  const runs = [
    { label: 'one page', transcript: syntheticTranscript(1) },
    { label: 'five pages', transcript: syntheticTranscript(5) },
  ];
  let fivePage: { nano: number; ms: number } | undefined;

  /**
   * One send of the app's analyse body, and the app's verdict on the answer: read, or which of the
   * four ways it was not. Returns the cost so the caller can add up what a person actually pays when
   * the retry is spent.
   */
  async function exchange(userText: string, transcript: string, which: 'ask' | 'repair') {
    const body = {
      model,
      messages: [
        { role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      max_tokens: STEP_PLANS.analyse.maxTokens,
    };
    console.log(`    ${which}: body ${bytes(JSON.stringify(body))} bytes · max_tokens ${STEP_PLANS.analyse.maxTokens}`);

    let response;
    try {
      response = await timed(() => near.post('chat/completions', body, { purpose: 'analyse' }));
    } catch (error) {
      console.log(`      rejected — ${error instanceof NearError ? `${error.name} code ${error.error.code} at HTTP ${error.status ?? '?'}` : 'a non-NearError escaped'}`);
      return { read: false, outcome: 'transport' as const, nano: 0, ms: 0 };
    }

    const rawJson = response.value.json as { id?: unknown; model?: unknown; usage?: unknown; choices?: { message?: Record<string, unknown>; finish_reason?: unknown }[] };
    const usageParse = usageSchema.safeParse(rawJson.usage ?? {});
    const usage = usageParse.success ? usageParse.data : {};
    console.log(`      HTTP ${response.value.status} in ${response.ms} ms · body ${bytes(response.value.sentBody ?? '')} bytes · reply ${bytes(response.value.rawText)} bytes`);
    const completionTokens = usage.completion_tokens ?? 0;
    console.log(`      usage: prompt ${usage.prompt_tokens ?? '(absent)'} · completion ${usage.completion_tokens ?? '(absent)'} of which reasoning ${usage.completion_tokens_details?.reasoning_tokens ?? '(absent)'} · budget used ${(100 * completionTokens / STEP_PLANS.analyse.maxTokens).toFixed(1)}% of ${STEP_PLANS.analyse.maxTokens}`);
    if (price.status === 'priced') console.log(`      ${costLine(`the ${which} exchange`, usage, price)}`);
    const nano = price.status === 'priced' ? (usage.prompt_tokens ?? 0) * price.perIn + (usage.completion_tokens ?? 0) * price.perOut : 0;

    const envelope = completionEnvelopeSchema.extend({ usage: usageSchema.optional() }).safeParse(response.value.json);
    if (!envelope.success) {
      console.log(`      FAIL  completionEnvelopeSchema rejected it — in the app this is \`invalid_model_output\`: ${envelope.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}`);
      return { read: false, outcome: 'envelope' as const, nano, ms: response.ms };
    }
    const text = contentOf(envelope.data);
    const finishReason = rawJson.choices?.[0]?.finish_reason ?? '(absent)';
    console.log(`      finish_reason: ${String(finishReason)} · content ${text.length} chars (never printed)`);

    // The two checks the app makes before it reads anything, using the app's own predicates and in its
    // order: a refusal and a truncation both stop the run rather than buy a repair (`completion.ts`),
    // and a truncation on a *text* request is now reachable because this request carries a budget.
    if (refusalOf(envelope.data) !== undefined) {
      console.log('      the message carries a refusal — the app halts with `model_refused` and does not repair');
      return { read: false, outcome: 'refused' as const, nano, ms: response.ms };
    }
    if (truncated(envelope.data)) {
      console.log(`      finish_reason: length at a ${completionTokens}-token completion — the budget is the finding here, not the model: the app reports \`output_truncated\` and spends no repair`);
      return { read: false, outcome: 'truncated' as const, nano, ms: response.ms };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const contract = analysisSchema.safeParse(parsed);
    if (!contract.success) {
      console.log(`      analysisSchema REJECTED — ${contract.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}`);
      console.log(`      the "kind" values it used instead: ${kindsUsed(parsed)}`);
      if (parsed === undefined) {
        // *Why* it is not JSON, in shape only: one character and one boolean. The app parses with a
        // plain `JSON.parse(contentOf(...))`, so a code fence or a lead-in sentence is a failure here
        // exactly as it is there — and "not JSON" without the reason is not an actionable finding.
        const head = text.trimStart().slice(0, 1);
        console.log(`      why: ${text.length === 0 ? 'the message content was empty' : `content begins with "${head}" and ${text.includes('```') ? 'carries a ``` fence' : 'carries no fence'} — the app's plain JSON.parse is what rejected it`}`);
      }
      return { read: false, outcome: 'unreadable' as const, nano, ms: response.ms };
    }
    const out = contract.data;
    const facts = groundFacts(transcript, out.facts);
    const actions = groundFacts(transcript, out.actions);
    console.log(`      analysisSchema ACCEPTED · docType ${out.docType} (this document is a bill, so ${out.docType === 'bill' ? 'match' : 'MISS'}) · summary ${out.summary.length} chars · facts ${facts.filter((f) => f.quoteFound).length}/${facts.length} quote the transcript back · actions ${actions.filter((a) => a.quoteFound).length}/${actions.length} · warnings ${out.warnings.length}`);
    console.log('      grounding here means "consistent with our transcript", never "correct against the page" (rule 8). Counting misreads is S-03, against an expected-facts file.');

    const servedModel = envelope.data.model ?? model;
    const { value: record, ms: sigMs } = await timed(() => fetchSignature(near, envelope.data.id, { model: servedModel, algo: 'ed25519' }));
    console.log(`      signature in ${sigMs} ms · kind ${record.signature_kind ?? '(absent)'} · signing_algo ${record.signing_algo}`);
    for (const candidate of new Set([servedModel, model])) {
      checkAgainstAttestedKeys(record, { requestBytes: response.value.sentBody ?? '', responseBytes: response.value.rawText, modelId: candidate }, attested);
    }
    return { read: true, outcome: 'read' as const, nano, ms: response.ms };
  }

  for (const run of runs) {
    console.log(`  ${run.label} (${run.transcript.length} chars of transcript):`);
    const first = await exchange(structureUserPrompt(run.transcript), run.transcript, 'ask');
    let final = first;

    // Exactly one repair, and only for the failure the app repairs — the same two conditions
    // `readCompletion` runs on, so this stage measures the person's experience rather than a guess.
    if (first.outcome === 'unreadable') {
      console.log('    the app spends its one repair retry here, so the stage sends it:');
      final = await exchange(`${structureUserPrompt(run.transcript)}\n\n${REPAIR_NOTE}`, run.transcript, 'repair');
    }

    // Sticky on purpose: the stage's exit code answers "was every reply readable", not "did the last
    // one work". A run that exits 0 while an answer was thrown away would be reporting a lie (the
    // 2026-11-04 ADR-24 run exits 1 with one accepted five-page answer for exactly this reason).
    if (!final.read) process.exitCode = 1;
    if (first.outcome === 'unreadable' && final.read) {
      console.log(`    the repair retry is what made this answer readable · both attempts cost ${first.nano + final.nano} nano-USD · ${(first.ms + final.ms) / 1000} s`);
    }
    if (run.label === 'five pages') {
      // Every request this run made is counted, not the one that succeeded. A fenced ask is a completed
      // HTTP 200 completion, so the service bills it and the person waits for it; counting only the
      // accepted attempt made glm's five-page document look 13% cheaper than it was (C-11's §4 rows,
      // corrected here: ask $0.00101832 + repair $0.00464344).
      const billed = final === first ? first : { nano: first.nano + final.nano, ms: first.ms + final.ms };
      fivePage = { nano: billed.nano, ms: billed.ms };
    }
  }

  if (price.status === 'priced' && fivePage !== undefined) {
    const transcriptionNano = MEASURED_PAGE_NANO_USD * 5;
    const totalNano = transcriptionNano + fivePage.nano;
    const totalMs = MEASURED_PAGE_MS * 5 + fivePage.ms;
    console.log(`  a five-page document, put together as ADR-24 runs it: 5 × ${MEASURED_PAGE_NANO_USD} nano of transcription on ${STEP_PLANS.transcribe.model} (§4, C-11's measured mean per page, carried not re-billed) + ${fivePage.nano} of this structure step on ${model} = ${totalNano} nano-USD = $${(totalNano / 1e9).toFixed(6)}`);
    console.log('  (every request counted, including one the app had to repair — the service billed it and the person waited for it.)');
    console.log(`  and ${Math.round(totalMs / 1000)} s of model time — ${Math.round((MEASURED_PAGE_MS * 5) / 1000)} s of it transcription. That is what §12's progress cadence and any per-page timeout have to be sized for, not the 1.83 s a one-line probe took.`);
  } else {
    console.log('  per document not stated: this run has no price, or the five-page exchange did not answer. A number carried from an earlier run would be a written figure, not a measured one.');
  }
}

/**
 * S-14: **the Q&A step's shape, put to the live service for the first time.** `ask.ts` has shipped since
 * P-06 asking a question of a transcript, and `STEP_PLANS.qa` was inherited from the step it *resembles*
 * rather than measured (§4's own entry for the ADR-24 run says so). The risk is not hypothetical: the
 * structure step asked this same service for JSON and got a ``` fence or plain prose in six of six
 * replies on the page model.
 *
 * The body is exactly what `readCompletion` builds for `purpose: 'qa'` — `QA_SYSTEM_PROMPT` plus
 * `qaUserPrompt(transcript, question)`, `max_tokens: STEP_PLANS.qa.maxTokens`, **no `stream`** (ADR-22).
 * The transcript is `--stage=document`'s five-page bill, so the question is asked against text the photo
 * path really hands over.
 *
 * Three questions, chosen to cover the branches `groundAnswer` in `ask.ts` can take: two the document
 * answers and whose quote should ground, and one it does not answer at all — which is the branch where
 * `sourceQuote` is absent, the exact field **ADR-25** was written for.
 *
 * The verdict printed is the app's own, in the app's order: envelope, refusal, truncation, `qaSchema`, then
 * `quoteFound` against the same transcript. Answer text is never printed (AGENTS.md §4 rule 7) — only its
 * length and the booleans, which is enough to say whether a person would have been given an answer.
 */
async function stageQa(near: NearClient, model: string, attested: Attested): Promise<void> {
  console.log(`== qa — S-14: the Q&A step's shape over a real transcript, on ${model}`);
  if (attested.keyOrAddress === undefined) {
    console.log('  SKIPPED: no attested key from the attestation stage, so the receipt half of this');
    console.log('  exchange could not be checked. Rule 6 — no pass by absence.');
    process.exitCode = 1;
    return;
  }

  const price = await priceOf(near, model);
  if (price.status === 'priced') console.log(`  priced from GET /v1/model/{model_name}: ${price.perIn}/${price.perOut} nano-USD per in/out token`);
  else console.log(`  price: ${price.status === 'no_price' ? 'the catalog row carried no per-token price, so no figure is claimed' : 'GET /v1/model/{model_name} did not parse as a catalog row'}`);

  const transcript = syntheticTranscript(5);
  console.log(`  transcript: ${transcript.length} chars — the same five-page bill --stage=document structures`);

  const runs = [
    { label: 'answerable (amount and date)', question: 'How much do I have to pay, and by when?' },
    { label: 'answerable (a contact number)', question: 'What number should I call if something here is wrong?' },
    { label: 'not in the document', question: 'Is there a late-payment fee if I miss the deadline?' },
  ];

  async function exchange(label: string, userText: string, which: 'ask' | 'repair') {
    const body = {
      model,
      messages: [
        { role: 'system', content: QA_SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
      max_tokens: STEP_PLANS.qa.maxTokens,
    };
    console.log(`    ${which}: body ${bytes(JSON.stringify(body))} bytes · max_tokens ${STEP_PLANS.qa.maxTokens}`);

    let response;
    try {
      response = await timed(() => near.post('chat/completions', body, { purpose: 'qa' }));
    } catch (error) {
      console.log(`      rejected — ${error instanceof NearError ? `${error.name} code ${error.error.code} at HTTP ${error.status ?? '?'}` : 'a non-NearError escaped'}`);
      return { read: false, outcome: 'transport' as const, nano: 0, ms: 0 };
    }

    const rawJson = response.value.json as { id?: unknown; model?: unknown; usage?: unknown; choices?: { message?: Record<string, unknown>; finish_reason?: unknown }[] };
    const usageParse = usageSchema.safeParse(rawJson.usage ?? {});
    const usage = usageParse.success ? usageParse.data : {};
    console.log(`      HTTP ${response.value.status} in ${response.ms} ms · body ${bytes(response.value.sentBody ?? '')} bytes · reply ${bytes(response.value.rawText)} bytes`);
    const completionTokens = usage.completion_tokens ?? 0;
    console.log(`      usage: prompt ${usage.prompt_tokens ?? '(absent)'} · completion ${completionTokens || '(absent)'} of which reasoning ${usage.completion_tokens_details?.reasoning_tokens ?? '(absent)'} · budget used ${(100 * completionTokens / STEP_PLANS.qa.maxTokens).toFixed(1)}% of ${STEP_PLANS.qa.maxTokens}`);
    if (price.status === 'priced') console.log(`      ${costLine(`the ${which} exchange`, usage, price)}`);
    const nano = price.status === 'priced' ? (usage.prompt_tokens ?? 0) * price.perIn + (usage.completion_tokens ?? 0) * price.perOut : 0;

    const envelope = completionEnvelopeSchema.extend({ usage: usageSchema.optional() }).safeParse(response.value.json);
    if (!envelope.success) {
      console.log(`      FAIL  completionEnvelopeSchema rejected it — in the app this is \`invalid_model_output\`: ${envelope.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}`);
      return { read: false, outcome: 'envelope' as const, nano, ms: response.ms };
    }
    const text = contentOf(envelope.data);
    const finishReason = rawJson.choices?.[0]?.finish_reason ?? '(absent)';
    console.log(`      finish_reason: ${String(finishReason)} · content ${text.length} chars (never printed)`);

    // The app's order, so a stage that says "readable" means the same thing `readCompletion` does.
    if (refusalOf(envelope.data) !== undefined) {
      console.log('      the message carries a refusal — the app halts with `model_refused` and does not repair');
      return { read: false, outcome: 'refused' as const, nano, ms: response.ms };
    }
    if (truncated(envelope.data)) {
      console.log(`      finish_reason: length at a ${completionTokens}-token completion — the app reports \`output_truncated\` and spends no repair`);
      return { read: false, outcome: 'truncated' as const, nano, ms: response.ms };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    const contract = qaSchema.safeParse(parsed);
    if (!contract.success) {
      console.log(`      qaSchema REJECTED — ${contract.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ')}`);
      if (parsed === undefined) {
        const head = text.trimStart().slice(0, 1);
        console.log(`      why: ${text.length === 0 ? 'the message content was empty' : `content begins with "${head}" and ${text.includes('```') ? 'carries a ``` fence' : 'carries no fence'} — the app's plain JSON.parse is what rejected it`}`);
      }
      return { read: false, outcome: 'unreadable' as const, nano, ms: response.ms };
    }

    // Which of `groundAnswer`'s three branches a person would have been shown. This is the app's own
    // `quoteFound`, run against the transcript the question was asked with.
    const out = contract.data;
    const quote = out.sourceQuote;
    const branch = out.notInDocument
      ? 'the document does not answer this'
      : quote === undefined
        ? 'answered, NO sourceQuote → quoteFound false, panel flags it'
        : quoteFound(transcript, quote)
          ? 'answered, quote grounds against the transcript'
          : 'answered, quote NOT in the transcript → flagged';
    console.log(`      qaSchema ACCEPTED · answer ${out.answer.length} chars · notInDocument ${out.notInDocument} · sourceQuote ${quote === undefined ? 'absent' : `${quote.length} chars`} · ${branch}`);
    if (out.notInDocument && label.startsWith('answerable')) {
      // A true flag on a question this document answers is a finding about the step, not about the
      // document — so say which of the two the branch is, without printing the answer.
      console.log('      NOTE: this synthetic bill does state an amount, a date and a phone number, so `notInDocument: true` here means the step declined a question the transcript answers.');
    }

    const servedModel = envelope.data.model ?? model;
    const { value: record, ms: sigMs } = await timed(() => fetchSignature(near, envelope.data.id, { model: servedModel, algo: 'ed25519' }));
    console.log(`      signature in ${sigMs} ms · kind ${record.signature_kind ?? '(absent)'} · signing_algo ${record.signing_algo}`);
    for (const candidate of new Set([servedModel, model])) {
      checkAgainstAttestedKeys(record, { requestBytes: response.value.sentBody ?? '', responseBytes: response.value.rawText, modelId: candidate }, attested);
    }
    return { read: true, outcome: 'read' as const, nano, ms: response.ms };
  }

  let readable = 0;
  let totalNano = 0;
  let totalMs = 0;
  for (const run of runs) {
    console.log(`  ${run.label}: "${run.question}"`);
    const first = await exchange(run.label, qaUserPrompt(transcript, run.question), 'ask');
    let final = first;
    totalNano += first.nano;
    totalMs += first.ms;

    // Exactly one repair, only for the failure `readCompletion` repairs — the same terms `ask.ts` runs on.
    if (first.outcome === 'unreadable') {
      console.log('    the app spends its one repair retry here, so the stage sends it:');
      final = await exchange(run.label, `${qaUserPrompt(transcript, run.question)}\n\n${REPAIR_NOTE}`, 'repair');
      totalNano += final.nano;
      totalMs += final.ms;
    }
    if (final.read) readable += 1;
    // Sticky on purpose, as in --stage=document: an answer the app throws away is a failure to report.
    if (!final.read) process.exitCode = 1;
    if (first.outcome === 'unreadable' && final.read) {
      console.log(`    the repair retry is what made this answer readable · both attempts cost ${first.nano + final.nano} nano-USD · ${(first.ms + final.ms) / 1000} s`);
    }
  }

  console.log(`  the Q&A step on ${model}: ${readable} of ${runs.length} questions answered in a shape the app can read${price.status === 'priced' ? ` · ${totalNano} nano-USD = $${(totalNano / 1e9).toFixed(6)} across ${Math.round(totalMs / 1000)} s` : ''}`);
  console.log('  what a question costs is not what a document costs: a person can ask several, so this figure is the one the Ask panel\'s budget and any rate limit are sized against.');
}

// ------------------------------------------------------------------------------------ runner

/**
 * Every stage that makes a completion: which **ADR-24** plan row answers it, and which function runs it.
 *
 * A table rather than an `if`/`else` chain because the chain mis-measured a run on 2026-11-04: a stage
 * added to `Stage` falls through the last `else` and silently runs *another* step's code against another
 * model's attestation report, and the output still reads like the stage that was asked for. `--stage=qa`
 * did exactly that before this existed, and printed a structure-step run under a Q&A heading.
 * TypeScript will not let a key go missing here, and no stage can reach the wrong function.
 *
 * `complete` rides the page model because it is the probe prompt, not a document step; `catalog` and
 * `attestation` make no completion, so they are not keys.
 */
const COMPLETION_STAGES: Record<Exclude<Stage, 'catalog' | 'attestation'>, {
  plan: StepPlan;
  run: (near: NearClient, model: string, attested: Attested) => Promise<void>;
}> = {
  complete: { plan: STEP_PLANS.transcribe, run: stageComplete },
  image: { plan: STEP_PLANS.transcribe, run: stageImage },
  pages: { plan: STEP_PLANS.transcribe, run: stagePages },
  document: { plan: STEP_PLANS.analyse, run: stageDocument },
  qa: { plan: STEP_PLANS.qa, run: stageQa },
};

async function main(): Promise<void> {
  if (API_KEY === '') {
    console.error('No NEAR_AI_API_KEY. `npm run spike` loads it from .env (item S-00, blocker B-05).');
    console.error('It must not be passed on the command line, and it is never printed.');
    process.exit(3);
  }
  const near = client();
  const forced = arg('model');
  const stages = selectedStages();
  console.log(`sightline spike · mode direct · ${DIRECT_BASE_URL} · stages ${stages.join(', ')} · ${forced === undefined ? 'one model per step, from ADR-24\'s plan' : `every stage forced to ${forced}`}`);

  // **ADR-24**: each stage asks with the model its own step is measured to answer, because §4 found the
  // page model replying to the structure step in a readable shape 0 of 6 times — and §4's S-14 run found
  // it answering the *Q&A* step 3 of 3, which is why the rows are per step and not one choice per run.
  // `--model=` still overrides it, and it should: the point of forcing is to re-run the other half of
  // that comparison, which is exactly how both halves of S-14's table were measured.
  let attested: Attested = { ok: false };
  let attestedFor = '';
  for (const stage of stages) {
    if (stage === 'catalog') {
      await stageCatalog();
      continue;
    }
    // `attestation` has no row of its own — it asks for the report the next stage will check against, so
    // it rides the page model's row unless `--model=` says otherwise.
    const entry = stage === 'attestation' ? undefined : COMPLETION_STAGES[stage];
    const model = forced ?? (entry?.plan ?? STEP_PLANS.transcribe).model;
    // The report has to belong to the model that answers. A completion checked against another model's
    // attested key fails for the wrong reason, and rule 6 will not count that as a measurement.
    if (attested.keyOrAddress === undefined || attestedFor !== model) {
      attested = await stageAttestation(near, model);
      attestedFor = model;
    }
    if (entry === undefined) continue;
    await entry.run(near, model, attested);
  }
  console.log(`done · exit ${process.exitCode ?? 0}`);
}

main().catch((error: unknown) => {
  if (error instanceof NearError) {
    // NearError carries path and status only — by design, so this is a safe place to print it.
    console.error(`spike failed on ${error.path}${error.status === undefined ? '' : ` (HTTP ${error.status})`}`);
  } else {
    console.error('spike failed:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
