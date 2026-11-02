import { notBuilt } from '@/lib/not_built';

/**
 * End-to-end encryption to the attested key (item **T-10**, decision **ADR-16**).
 *
 * This is the only mechanism that lets Sightline say the strong thing: without it
 * a browser can verify *which* enclave exists but cannot prove *its own upload*
 * reached that enclave (AGENTS.md §4 rule 2, and NEAR's own SDK says the same —
 * `SPIKE_RESULTS.md` §6).
 *
 * Protocol v2, recorded from `SPIKE_RESULTS.md` §2 so nobody has to re-read the docs:
 * - keys: Ed25519 on both sides, converted to/from X25519 for ECDH;
 * - KDF: HKDF-SHA256 with `info = "ed25519_encryption"`;
 * - cipher: XChaCha20-Poly1305;
 * - wire: `[ephemeral pubkey 32B][nonce 24B][ciphertext + tag]`, hex-encoded;
 * - model key: `attestation.model_attestations[0].signing_public_key` (64 hex);
 * - headers: `X-Signing-Algo: ed25519`, `X-Client-Pub-Key`, `X-Model-Pub-Key`
 *   (required through the gateway), `X-Encryption-Version: 2`;
 * - response side decrypts `choices[0].message.content`, per chunk when streaming;
 * - `/v1/responses` does **not** accept encrypted input, so it is not used.
 *
 * Blocked on two things, both open deliberately: `@noble/ciphers` must be approved
 * as a dependency (XChaCha20-Poly1305 is not a WebCrypto algorithm), and a live
 * enclave must actually decrypt a browser payload before `TrustRecord.e2ee` may be
 * set to `true`. Until then this module is never called and the claims ladder
 * shows the weaker sentence.
 */
export interface EncryptedEnvelope {
  /** Hex of `[ephemeral pubkey][nonce][ciphertext+tag]`. */
  body: string;
  clientPublicKey: string;
  encryptionVersion: 2;
}

export function encryptRequest(_jsonBody: string, _modelPublicKeyHex: string): EncryptedEnvelope {
  return notBuilt('T-10', 'E2EE request encryption') as never;
}

export function decryptResponseContent(_envelopeHex: string, _clientPrivateKey: Uint8Array, _modelPublicKeyHex: string): string {
  return notBuilt('T-10', 'E2EE response decryption') as never;
}

/** True only when a live call proved the enclave decrypted our payload. Nothing may set this optimistically. */
export const E2EE_PROVEN_IN_BROWSER = false;
