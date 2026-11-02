import { notBuilt } from '@/lib/not_built';
import type { CheckResult } from '@/types';

/**
 * Attestation: ask the service what it is running, bind the answer to us, and
 * hand the report to `/api/verify` (item **T-01**).
 *
 * Resolved by reading (`docs/SPIKE_RESULTS.md` §3) rather than guessed:
 * - `GET /v1/attestation/report`, query `model`, `signing_algo`, `nonce`,
 *   `signing_address`, `include_tls_fingerprint`, `provider`. **Requires an API
 *   key**, so in Mode A the browser calls it with the user's own key (ADR-17).
 * - The nonce is 32 random bytes hex-encoded to 64 characters. Fresh per session
 *   (AGENTS.md §4 rule 4).
 * - `report_data` is documented as "not currently returned in model reports", so
 *   model-level binding is checked through `request_nonce` and the GPU token's
 *   `eat_nonce`, not `report_data`.
 */
export const NONCE_BYTES = 32;

export type SigningAlgo = 'ecdsa' | 'ed25519';

export interface AttestationReport {
  gateway_attestation: Record<string, unknown>;
  model_attestations: Record<string, unknown>[];
  ohttp_attestation?: Record<string, unknown>;
  tls_certificate?: string;
}

export interface AttestationCheck {
  nonce: string;
  fetchedAt: number;
  checks: CheckResult[];
  status: 'verified' | 'partial' | 'failed';
  /** The public key the E2EE flow encrypts to, when present (`model_attestations[0].signing_public_key`). */
  signingPublicKey?: string;
}

/** 32 random bytes as 64 lowercase hex characters. */
export function newNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fetchReport(_input: { model: string; nonce: string; signingAlgo: SigningAlgo }): Promise<AttestationReport> {
  return notBuilt('T-01', 'Attestation report fetching') as never;
}

/** Heavy checks run server-side; the report is the only thing that leaves the device here (no document). */
export function verifyWithServer(_report: AttestationReport, _nonce: string): Promise<AttestationCheck> {
  return notBuilt('T-01', 'Server-side attestation verification') as never;
}
