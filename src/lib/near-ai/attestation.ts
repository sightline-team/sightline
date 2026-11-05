import { z } from 'zod';
import { appError } from '@/lib/errors';
import { createSignatureVerifier, decodeHex } from '@/lib/near-ai/signatures';
import { QUOTE_CHECKS_THAT_CANNOT_RUN, checkQuote } from '@/lib/near-ai/quote';
import { RunHalt } from '@/lib/near-ai/verification';
import type { GateOutcome, SignatureVerifier } from '@/lib/near-ai/verification';
import type { NearClient } from '@/lib/near-ai/client';
import type { AttestationStatus, CheckResult } from '@/types';

/**
 * Attestation: ask the service what it is running, bind the answer to us, and hand the report to
 * `/api/verify` (item **T-01**).
 *
 * Resolved by reading (`docs/SPIKE_RESULTS.md` §3) rather than guessed:
 * - `GET /v1/attestation/report`, query `model`, `signing_algo`, `nonce`, `signing_address`,
 *   `include_tls_fingerprint`, `provider`. **Requires an API key**, so in Mode A the browser calls
 *   it with the user's own key (ADR-17).
 * - The nonce is 32 random bytes hex-encoded to 64 characters, fresh per session (AGENTS.md §4
 *   rule 4) and minted by `newNonce()`, which takes no arguments so a request can never seed it.
 * - `report_data` is documented as "not currently returned in model reports", so a model report is
 *   bound through `request_nonce` and **not** through `report_data`.
 *
 * The honest ceiling, stated here because the code cannot exceed it: `docs/SPIKE_RESULTS.md` marks
 * every field inside `model_attestations[]` **[Unverified by openapi]** and nothing in it is
 * **[Measured]** — there is no key (B-05). So the schemas below accept *shape* and never fill in a
 * missing field, and a report that does not carry the nonce we sent is a **failed** binding, not a
 * partial one. `status: 'verified'` is reachable only from a live report that echoes our own
 * nonce. Fixture-mode reports say `not_run` (`fixtureGate`), and no path through this file can
 * produce the strong claim from an unmeasured shape (AGENTS.md §6).
 */
export const NONCE_BYTES = 32;

export type SigningAlgo = 'ecdsa' | 'ed25519';

/** `signing_address` is 20 bytes for an Ethereum-style ECDSA address, 32 for Ed25519 key bytes. */
const ADDRESS_BYTES: Record<SigningAlgo, number> = { ecdsa: 20, ed25519: 32 };

/**
 * Loose on purpose: unknown keys are stripped rather than rejected, and every documented field is
 * optional, because the inner names are `[Unverified by openapi]`. A strict schema here would
 * either reject a real report we have not seen yet or, worse, be relaxed later to make a test
 * pass. Absent fields are *reported as absent* by the checks instead.
 */
/**
 * The measurements a quote is checked *against*: the report's own published description of the machine
 * and of the software stack inside it. Stripping these is what the loose schema used to do, and then T-03's
 * quote checks had nothing to compare the bytes to — so the fields the checks read are named here
 * explicitly, all optional, still fail-closed (an absent one is reported as unreadable by `checkQuote`,
 * never as a pass). `tcb_info` is typed as `string | object` because NEAR's own reference verifier types it
 * that way (`ts/model_verifier.ts`'s `AttestationBaseInfo`), and the recorded reports are objects.
 */
const tcbInfoSchema = z.object({
  app_compose: z.string().optional(),
  mrtd: z.string().optional(),
  rtmr0: z.string().optional(),
  rtmr1: z.string().optional(),
  rtmr2: z.string().optional(),
  rtmr3: z.string().optional(),
  os_image_hash: z.string().optional(),
  compose_hash: z.string().optional(),
  device_id: z.string().optional(),
});

export const modelAttestationSchema = z.object({
  intel_quote: z.string().optional(),
  event_log: z.unknown().optional(),
  request_nonce: z.string().optional(),
  report_data: z.string().optional(),
  signing_address: z.string().optional(),
  signing_algo: z.enum(['ecdsa', 'ed25519']).optional(),
  signing_public_key: z.string().optional(),
  nvidia_payload: z.unknown().optional(),
  info: z
    .object({
      compose_hash: z.string().optional(),
      device_id: z.unknown().optional(),
      tcb_info: z.union([z.string(), tcbInfoSchema]).optional(),
    })
    .optional(),
});

export const attestationReportSchema = z.object({
  gateway_attestation: z
    .object({
      signing_address: z.string().optional(),
      signing_algo: z.enum(['ecdsa', 'ed25519']).optional(),
      request_nonce: z.string().optional(),
      report_data: z.string().optional(),
      intel_quote: z.string().optional(),
      event_log: z.unknown().optional(),
    })
    .optional(),
  model_attestations: z.array(modelAttestationSchema).optional(),
  ohttp_attestation: z.unknown().optional(),
  tls_certificate: z.string().optional(),
});

export type ModelAttestation = z.infer<typeof modelAttestationSchema>;
export type AttestationReport = z.infer<typeof attestationReportSchema>;

export interface AttestationCheck {
  nonce: string;
  fetchedAt: number;
  checks: CheckResult[];
  status: AttestationStatus;
  /** The public key the E2EE flow encrypts to, when present (`model_attestations[0].signing_public_key`). */
  signingPublicKey?: string;
}

/** What `/api/verify` answers: named checks, and no document content in or out (ARCH §8). */
export const verifyResponseSchema = z.object({
  status: z.enum(['verified', 'partial', 'failed']).optional(),
  checks: z.array(z.object({ name: z.string().min(1), ran: z.boolean(), passed: z.boolean(), detail: z.string().optional() })),
});

/** 32 random bytes as 64 lowercase hex characters. */
export function newNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * `GET /v1/attestation/report`. Only the model report path is asked for — omitting `model` gets a
 * *gateway* report, which says nothing about the enclave serving the model.
 */
export async function fetchReport(client: NearClient, input: { model: string; nonce: string; signingAlgo: SigningAlgo; signal?: AbortSignal }): Promise<AttestationReport> {
  const response = await client.get('attestation/report', {
    query: { model: input.model, nonce: input.nonce, signing_algo: input.signingAlgo },
    signal: input.signal,
  });
  const parsed = attestationReportSchema.safeParse(response.json);
  if (!parsed.success) throw new RunHalt(appError('verification_failed'));
  return parsed.data;
}

/**
 * `POST /api/verify` with the report and the nonce we sent. The heavy checks — Intel's signature over
 * the quote, the GPU verdict, a signed expiry — are still **B-12**'s, not this file's; what T-01 owns is
 * asking, and reading the answer as a verdict. Since T-03 landed the route does answer, with a second
 * opinion on the checks below (`lib/server/verify.ts`, ADR-33), and the four gaps stay gaps until it
 * answers one of them by name.
 *
 * Which is why a non-2xx is converted into a failed check rather than swallowed: "nobody said otherwise"
 * is exactly the silence AGENTS.md §4 rule 6 forbids. A caller that treats an unreachable verifier as
 * agreement has turned the security check into a comment.
 */
export async function verifyWithServer(
  report: AttestationReport,
  nonce: string,
  deps: { fetchImpl?: typeof fetch; signal?: AbortSignal; signingAlgo?: SigningAlgo } = {},
): Promise<AttestationCheck> {
  const doFetch = deps.fetchImpl ?? fetch;
  const checks: CheckResult[] = [];
  let status: AttestationStatus = 'partial';
  try {
    const response = await doFetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report, nonce, signing_algo: deps.signingAlgo ?? 'ed25519' }),
      signal: deps.signal,
    });
    const parsed = response.ok ? verifyResponseSchema.safeParse(await response.json().catch(() => undefined)) : undefined;
    if (parsed?.success) {
      checks.push(...parsed.data.checks);
      // A verifier that listed its checks but stated no verdict has not said the strong word, so the
      // fallback is `partial` and not an inference from "everything it sent me passed". The old
      // inference read a one-check answer as `verified`, and one check can never be the whole set.
      status = parsed.data.status ?? 'partial';
    } else {
      checks.push({ name: 'server_verification', ran: true, passed: false, detail: `the verifier answered ${response.status}, which is a failure, not an absence of one` });
      status = 'failed';
    }
  } catch {
    checks.push({ name: 'server_verification', ran: true, passed: false, detail: 'the verifier could not be reached' });
    status = 'failed';
  }
  return { nonce, fetchedAt: Date.now(), checks, status };
}

/**
 * The checks that can be decided from the report itself, in the browser, before anything
 * document-derived is sent.
 *
 * Each one fails **closed** on absence. A report with no `request_nonce` does not get the benefit
 * of the doubt: nothing bound it to us, so nothing says it was made for this session rather than
 * replayed from last week's.
 */
export function bindReport(input: { report: AttestationReport; nonce: string; signingAlgo: SigningAlgo }): { checks: CheckResult[]; status: AttestationStatus; signingKey?: GateOutcome['signingKey'] } {
  const model = input.report.model_attestations?.[0];
  const checks: CheckResult[] = [];

  checks.push({
    name: 'attestation_report',
    ran: true,
    passed: model !== undefined,
    detail: model === undefined ? 'no model attestation in the report' : undefined,
  });

  const echoed = model?.request_nonce;
  const bound = echoed !== undefined && echoed.toLowerCase() === input.nonce.toLowerCase();
  checks.push({
    name: 'nonce_fresh',
    ran: true,
    passed: bound,
    detail: bound ? undefined : echoed === undefined ? 'the report carries no request nonce, so nothing binds it to this session' : 'the report echoes a different nonce than the one we sent',
  });

  const address = model?.signing_address;
  const decoded = address === undefined ? undefined : decodeHex(address);
  const shapeOk = decoded !== undefined && decoded.length === ADDRESS_BYTES[input.signingAlgo];
  checks.push({
    name: 'signing_address_shape',
    ran: true,
    passed: shapeOk,
    detail: shapeOk ? undefined : `expected ${ADDRESS_BYTES[input.signingAlgo]} bytes of hex for ${input.signingAlgo}`,
  });

  const publicKey = model?.signing_public_key;
  const publicKeyOk = publicKey !== undefined && decodeHex(publicKey)?.length === 32;
  checks.push({
    name: 'signing_public_key_shape',
    ran: true,
    passed: publicKeyOk === true,
    detail: publicKeyOk ? undefined : 'no 32-byte Ed25519 key to encrypt to; the end-to-end claim stays off',
  });

  const signingKey: GateOutcome['signingKey'] = shapeOk
    ? { algo: input.signingAlgo, keyOrAddress: input.signingAlgo === 'ed25519' && publicKeyOk ? publicKey! : address! }
    : undefined;

  // `verified` requires every check to have run and passed. Three of these are shape and binding
  // checks we can decide here; the quote itself is T-03's verdict, folded in by the gate below,
  // so a build without the quote port can only ever report `partial`.
  const status: AttestationStatus = checks.every((c) => c.ran && c.passed) ? 'verified' : 'partial';
  return { checks, status, signingKey };
}

export interface TrustSession {
  gate: (args: { model: string; signal: AbortSignal }) => Promise<GateOutcome>;
  verifySignature: SignatureVerifier;
  /** What the session bound the report to. Kept for the receipt. */
  nonce(): string;
}

/**
 * The gate and the verifier as one object, because they share the fact that decides both: the
 * nonce minted for this session and the key the report bound to it. Build them separately and a
 * caller can wire a verifier to a gate that never ran — which verifies against nothing.
 *
 * One nonce, short-lived cache: `ttlMs` decides when the report is re-fetched, not when a new
 * nonce is minted (rule 4 asks for a fresh nonce per *session*, and re-answering the same nonce is
 * how a re-fetch stays comparable to the first answer).
 */
export function createTrustSession(deps: { client: NearClient; ttlMs?: number; fetchImpl?: typeof fetch; signingAlgo?: SigningAlgo }): TrustSession {
  const nonce = newNonce();
  const algo = deps.signingAlgo ?? 'ed25519';
  const ttl = deps.ttlMs ?? 60_000;
  let cached: { outcome: GateOutcome; at: number } | undefined;
  let current: GateOutcome | undefined;

  const run = async (model: string, signal: AbortSignal): Promise<GateOutcome> => {
    const report = await fetchReport(deps.client, { model, nonce, signingAlgo: algo, signal });
    const local = bindReport({ report, nonce, signingAlgo: algo });
    // T-03's dependency-free half, decided here rather than on our server: a browser that reads the
    // quote itself trusts its own arithmetic, a browser that asks `/api/verify` trusts our verdict.
    const quote = checkQuote({ attestation: report.model_attestations?.[0], nonce, label: 'the model enclave', expectedKey: local.signingKey?.keyOrAddress });
    const server = await verifyWithServer(report, nonce, { fetchImpl: deps.fetchImpl, signal, signingAlgo: algo });
    // Rule 5 in its structural form: a check that never ran has to stop the word `verified`, not merely
    // annotate it. The four gaps count against the status until `/api/verify` answers one of them — when
    // it does, its own entry replaces the placeholder by name and nothing here has to be re-argued.
    // T-03's route answers today, but it answers with the checks this page already ran (ADR-33), so all
    // four gaps still stand and `verified` is unreachable on purpose.
    const answered = new Set(server.checks.map((c) => c.name));
    const gaps = QUOTE_CHECKS_THAT_CANNOT_RUN.filter((c) => !answered.has(c.name));
    const checks = [...local.checks, ...quote, ...gaps, ...server.checks];
    // Required checks are the ones that must pass to send anything: a report that is not bound to
    // us, a verifier that said no, and a quote that says the enclave is in debug mode — in which
    // state the machine's operator can read its memory, so nothing here would be private.
    const required = ['nonce_fresh', 'server_verification', 'attestation_report', 'td_not_debug'];
    // Rule 4 with its teeth on: no readable quote means no readable debug bit, and a machine whose
    // debug bit is unknown is one whose operator may be able to read its memory, so nothing in it would
    // be private. A report like that stops the run instead of merely lowering the wording. Until T-03
    // landed this halt arrived by accident, because the route's 501 failed `server_verification`; now
    // it is stated where the fact is, and it survives the route answering.
    const noQuote = checks.some((c) => c.name === 'quote_is_tdx' && !c.ran);
    const requiredFailed = noQuote || checks.some((c) => c.ran && !c.passed && required.includes(c.name));
    const binding = [...local.checks, ...quote, ...gaps];
    const status: AttestationStatus = requiredFailed
      ? 'failed'
      : binding.every((c) => c.ran && c.passed) && server.status === 'verified'
        ? 'verified'
        : 'partial';
    const outcome: GateOutcome = { status, checks, nonce, signingAlgo: algo, fetchedAt: server.fetchedAt, signingKey: local.signingKey };
    cached = { outcome, at: Date.now() };
    current = outcome;
    return outcome;
  };

  const gate = async ({ model, signal }: { model: string; signal: AbortSignal }): Promise<GateOutcome> => {
    if (cached !== undefined && Date.now() - cached.at < ttl) return cached.outcome;
    return run(model, signal);
  };

  const verifySignature = createSignatureVerifier({
    client: deps.client,
    attested: () => current?.signingKey,
  });

  return { gate, verifySignature, nonce: () => nonce };
}
