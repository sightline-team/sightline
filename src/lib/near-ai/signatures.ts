import { notBuilt } from '@/lib/not_built';
import type { SigningAlgo } from '@/lib/near-ai/attestation';

/**
 * Response signatures (item **T-02**), shaped by ADR-19 after `SPIKE_RESULTS.md` §5.
 *
 * The completion body carries **no** signature. Checking one is a second request:
 * `GET /v1/signature/{chat_id}` returns `{ text, signature, signing_address,
 * signing_algo, signature_kind? }`, and the signed `text` is
 * `{model_id}:{request_hash}:{response_hash}` for `provider_tee` or
 * `{request_hash}:{response_hash}` for `gateway`, where each hash is SHA-256 of
 * the **exact wire bytes**. Consequences the implementation must respect:
 * - keep the exact request body string and response payload string (60-minute
 *   server-side retention means the check cannot be deferred);
 * - a streaming response ends with two newlines that belong in the hash;
 * - a lookup can transiently return "Chat id not found or expired" → retry;
 * - ECDSA verifies as EIP-191 personal-sign and the address is compared
 *   case-insensitively to the attested `signing_address`; Ed25519 is a detached
 *   verify against the attested public key.
 */
export type SignatureKind = 'provider_tee' | 'gateway';

export interface SignatureRecord {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: SigningAlgo;
  signature_kind?: SignatureKind;
}

export interface SignatureCheck {
  verified: boolean;
  kind: SignatureKind;
  algo: SigningAlgo;
}

export function fetchSignature(_chatId: string, _input: { model?: string; algo: SigningAlgo }): Promise<SignatureRecord> {
  return notBuilt('T-02', 'Signature fetching') as never;
}

/** Rebuilds the signed text from the exact bytes, then verifies against the attested key. */
export function checkSignature(
  _record: SignatureRecord,
  _input: { requestBytes: string; responseBytes: string; modelId: string; attestedKeyOrAddress: string },
): SignatureCheck {
  return notBuilt('T-02', 'Signature verification') as never;
}
