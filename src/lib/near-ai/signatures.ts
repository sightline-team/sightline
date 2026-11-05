import { z } from 'zod';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { appError } from '@/lib/errors';
import { RunHalt } from '@/lib/near-ai/verification';
import type { SignatureOutcome, SignatureVerifier } from '@/lib/near-ai/verification';
import type { NearClient } from '@/lib/near-ai/client';
import type { SigningAlgo } from '@/lib/near-ai/attestation';
import type { CheckResult } from '@/types';

/**
 * Response-signature verification (item **T-02**), per ADR-19 and `docs/SPIKE_RESULTS.md` §5.
 *
 * A completion body carries no signature. Checking one is a second request, and what it signs is
 * a *rebuild* of the exact wire bytes, so this file exists to be the only place that knows how
 * those bytes are hashed:
 *
 *   `provider_tee` → `{model_id}:{request_hash}:{response_hash}`
 *   `gateway`      → `{request_hash}:{response_hash}`
 *
 * with each hash SHA-256 of the bytes as they crossed the wire — including the two trailing
 * newlines of a streamed body, which are part of what was hashed and would silently change the
 * digest if anything trimmed them.
 *
 * The other reason this is separate from the client: **who signed** is not a boolean. A
 * `provider_tee` signature is the model-serving enclave attesting to those bytes; a `gateway`
 * signature is the cloud API gateway's own TEE, which is a different assurance about a different
 * machine. Both are handled here and reported distinctly (ARCH §10 check 2), because collapsing
 * them would let a screen say "the enclave signed this answer" when an enclave the user never
 * chose to trust may have signed nothing of the kind.
 *
 * What is *not* documented is the encoding of the `signature` field itself, so an unrecognised
 * encoding fails closed rather than being guessed at. Nothing in this file promotes a plausible
 * reading to a pass (AGENTS.md §6).
 *
 * Measured consequence (2026-11-03, `docs/SPIKE_RESULTS.md` §5): a **gateway**-kind signature is
 * verified by `gateway_attestation.signing_address`, not by the model key — the two are different
 * bytes, and the same record verifies against one and fails against the other. This module verifies
 * against the key **the gate bound**, which is `model_attestations[0]`'s, so a `gateway` record can
 * only ever come back `verified: false` here. That is deliberate while the app posts non-streamed
 * (ADR-22): a non-streamed answer from an attested model is `provider_tee`, and if the fallback
 * providers that only ever sign at the gateway are ever allowed through, the gate must bind their key
 * too and say which machine it chose — not quietly accept the weaker signature under this name.
 */

export type SignatureKind = 'provider_tee' | 'gateway';

/** `signature_kind` is optional upstream: signatures stored before the kind was recorded omit it. */
export type SignatureOrigin = SignatureKind | 'unstated';

export const signatureRecordSchema = z.object({
  text: z.string().min(1),
  signature: z.string().min(1),
  signing_address: z.string().min(1),
  signing_algo: z.enum(['ecdsa', 'ed25519']),
  signature_kind: z.enum(['provider_tee', 'gateway']).optional(),
});

export type SignatureRecord = z.infer<typeof signatureRecordSchema>;

export interface SignatureCheck {
  verified: boolean;
  /** Whose signature this is, once determined. Never inferred from a single successful path. */
  origin: SignatureOrigin;
  algo: SigningAlgo;
  detail: string;
}

const textEncoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Accepts `abc123` or `0xabc123`; anything else is not hex and decodes to nothing. */
export function decodeHex(value: string): Uint8Array | undefined {
  const body = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (body.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(body)) return undefined;
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** SHA-256 of a string as UTF-8 bytes, lowercase hex. */
export function sha256Hex(text: string): string {
  return toHex(sha256(textEncoder.encode(text)));
}

/** The two texts the service may have signed, in the documented order. */
function candidateSignedTexts(input: { modelId: string; requestBytes: string; responseBytes: string }): { origin: SignatureOrigin; text: string }[] {
  const requestHash = sha256Hex(input.requestBytes);
  const responseHash = sha256Hex(input.responseBytes);
  return [
    { origin: 'provider_tee', text: `${input.modelId}:${requestHash}:${responseHash}` },
    { origin: 'gateway', text: `${requestHash}:${responseHash}` },
  ];
}

/**
 * Ed25519: a detached signature over the bytes of the text, checked against the attested 32-byte
 * public key. No prefix, no hashing step of our own.
 */
function verifyEd25519(signature: Uint8Array, text: string, attestedKey: string): boolean {
  const publicKey = decodeHex(attestedKey);
  if (publicKey === undefined || publicKey.length !== 32) return false;
  if (signature.length !== 64) return false;
  try {
    return ed25519.verify(signature, textEncoder.encode(text), publicKey);
  } catch {
    return false;
  }
}

/**
 * ECDSA: EIP-191 personal-sign. keccak256 of the `\x19Ethereum Signed Message:\n<len>` framing
 * plus the text, recovered against a 65-byte `r‖s‖v` signature, and the last 20 bytes of the
 * uncompressed public key are compared to the attested address case-insensitively — the address
 * is a hex string with no checksum promise behind it.
 */
function verifyEcdsaPersonalSign(signature: Uint8Array, text: string, attestedAddress: string): boolean {
  if (signature.length !== 65) return false;
  const body = decodeHex(attestedAddress);
  if (body === undefined || body.length !== 20) return false;
  try {
    const bytes = textEncoder.encode(text);
    const framing = textEncoder.encode(`\x19Ethereum Signed Message:\n${bytes.length}`);
    const digest = keccak_256(concat(framing, bytes));
    const trailing = signature[64]!;
    const recovery = trailing >= 27 ? trailing - 27 : trailing;
    if (recovery > 3) return false;
    // `fromBytes` takes the 64-byte r‖s form; the recovery id is the 65th byte, which Ethereum
    // writes as 27/28 and the reference verifier accepts both.
    const point = secp256k1.Signature.fromBytes(signature.slice(0, 64)).addRecoveryBit(recovery).recoverPublicKey(digest);
    const uncompressed = point.toBytes(false);
    const derived = keccak_256(uncompressed.slice(1)).slice(12);
    return toHex(derived).toLowerCase() === toHex(body).toLowerCase();
  } catch {
    return false;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Rebuild what was signed from the exact bytes and check it against the key this session
 * attested. `record.text` is fetched and then **re-derived**: the served string is treated as
 * data, and a signature is only accepted over text this function produced from the bytes we
 * actually sent and received. That is the whole point of the check, so a `text` that disagreed
 * with our own bytes would be a failed check, not a second opinion.
 *
 * When `signature_kind` is stated, only that form is tried. When it is absent, both are, and the
 * form that verifies is reported — because which machine signed is a fact the receipt states and
 * the app does not get to choose.
 */
export function checkSignature(
  record: SignatureRecord,
  input: { requestBytes: string; responseBytes: string; modelId: string; attestedKeyOrAddress: string },
): SignatureCheck {
  const signature = decodeHex(record.signature);
  const fail = (detail: string): SignatureCheck => ({ verified: false, origin: record.signature_kind ?? 'unstated', algo: record.signing_algo, detail });
  if (signature === undefined) return fail('the signature is not hex');

  const stated = record.signature_kind;
  const candidates = candidateSignedTexts(input).filter((c) => stated === undefined || c.origin === stated);
  const verify = record.signing_algo === 'ed25519' ? verifyEd25519 : verifyEcdsaPersonalSign;

  for (const candidate of candidates) {
    if (verify(signature, candidate.text, input.attestedKeyOrAddress)) {
      return {
        verified: true,
        origin: candidate.origin,
        algo: record.signing_algo,
        detail:
          candidate.origin === 'provider_tee'
            ? 'signed by the enclave serving the model, over the exact bytes of this request and response'
            : 'signed by the API gateway enclave, not by the enclave serving the model',
      };
    }
  }
  const rebuilt = candidateSignedTexts(input).map((c) => c.origin).join(' or ');
  return fail(`no signature over the bytes we sent and received rebuilds to verify (${rebuilt})`);
}

/** The service's own `text` field must agree with what we rebuilt, or something is off the wire. */
function servedTextMatches(record: SignatureRecord, input: { modelId: string; requestBytes: string; responseBytes: string }): boolean {
  return candidateSignedTexts(input).some((c) => c.text === record.text);
}

export interface FetchSignatureInput {
  model?: string;
  algo: SigningAlgo;
  signal?: AbortSignal;
}

/** `GET /v1/signature/{chat_id}`. The client already retries the transient 404 this endpoint is known for. */
export async function fetchSignature(client: NearClient, chatId: string, input: FetchSignatureInput): Promise<SignatureRecord> {
  const query: Record<string, string> = { signing_algo: input.algo };
  if (input.model !== undefined) query.model = input.model;
  const response = await client.get('signature/{chat_id}', { chatId, query, signal: input.signal });
  const parsed = signatureRecordSchema.safeParse(response.json);
  if (!parsed.success) {
    throw new RunHalt(appError('invalid_model_output'));
  }
  return parsed.data;
}

/**
 * The collaborator the pipeline and Q&A ask for. It is built around a key *provider* rather than a
 * key argument, because the key belongs to the enclave that was attested, not to the individual
 * call: a verifier constructed before the gate ran has nothing to check against and says so.
 *
 * The provider is given the **model**, because a session can attest more than one machine.
 * **ADR-24** plans a run over two of them (`STEP_PLANS.transcribe` and `STEP_PLANS.analyse`), and
 * **T-08**'s recorded reports showed those two models answer with two different signing keys
 * (`attestation-fixtures.test.ts` › "the two models are two enclaves"). A provider that ignored the
 * model would hand the reading step's answer to the page enclave's key, and a signature that does
 * not match is a *failed check* — so the drift is not subtle, it stops the run.
 *
 * That is deliberate. `SignatureVerifier`'s arguments carry no key, so the only way to hand over
 * an attested key is at construction, and the only honest reading of "no attested key yet" is a
 * failed check (AGENTS.md §4 rule 6) — not a pass by absence, and not an exception that would let
 * a caller forget the step and get silence.
 */
export function createSignatureVerifier(deps: {
  client: NearClient;
  /** The key material attested for **this** model, or `undefined` when no gate call covered it. */
  attested: (model: string) => { algo: SigningAlgo; keyOrAddress: string } | undefined;
}): SignatureVerifier {
  return async ({ chatId, model, sentBody, rawText, signal }): Promise<SignatureOutcome> => {
    const ran: CheckResult[] = [{ name: 'response_signature', ran: true, passed: false }];
    const key = deps.attested(model);
    if (key === undefined) {
      return { algo: 'ecdsa', verified: false, checks: [{ ...ran[0]!, detail: 'no attestation has run for this model in this session, so there is no key to verify against' }] };
    }
    if (sentBody === undefined) {
      return { algo: key.algo, verified: false, checks: [{ ...ran[0]!, detail: 'the exact request bytes are missing, so request_hash cannot be rebuilt' }] };
    }
    const record = await fetchSignature(deps.client, chatId, { model, algo: key.algo, signal });
    const check = checkSignature(record, { requestBytes: sentBody, responseBytes: rawText, modelId: model, attestedKeyOrAddress: key.keyOrAddress });
    const textAgrees = servedTextMatches(record, { modelId: model, requestBytes: sentBody, responseBytes: rawText });
    return {
      algo: key.algo,
      // A signature that verifies over bytes we rebuilt, and a `text` that says the same thing.
      // Either alone is not enough: the second is what proves we are looking at the same exchange.
      verified: check.verified && textAgrees,
      checks: [
        {
          name: 'response_signature',
          ran: true,
          passed: check.verified && textAgrees,
          detail: textAgrees ? check.detail : 'the signature verified but the served text does not match the bytes we handled',
        },
        // Which enclave signed, as its own named check, so the receipt can show the difference
        // between "the model's enclave" and "the gateway" instead of flattening it into one tick.
        { name: 'signed_by_model_enclave', ran: true, passed: check.origin === 'provider_tee', detail: check.detail },
      ],
    };
  };
}
