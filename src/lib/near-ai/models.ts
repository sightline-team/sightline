import { notBuilt } from '@/lib/not_built';

/**
 * Model discovery and the TEE allowlist (item **F-04**).
 *
 * Rewritten after `docs/SPIKE_RESULTS.md` §4 / ADR-18: the flags that decide
 * whether a model has a TEE guarantee are **not** on `GET /v1/models`. They live
 * on `GET /v1/model/{model_name}` in `metadata`, so an allowlist built from the
 * list alone cannot tell a TEE model from a proxied third-party one — and AGENTS.md
 * §4 rule 3 says that distinction is the one thing we may not get wrong.
 *
 * Fail closed: a model whose metadata is missing, unreadable or `attestationSupported:
 * false` is never offered, never selected, and never sent document data.
 */
export interface ModelMetadata {
  id: string;
  attestationSupported: boolean;
  providerType: string;
  verifiable: boolean;
  inputModalities: string[];
  outputModalities: string[];
}

export interface AllowlistDecision {
  allowed: boolean;
  reason: 'tee_and_image' | 'not_attestation_supported' | 'no_image_input' | 'metadata_unavailable' | 'not_in_config_allowlist';
}

export function listCandidates(): Promise<string[]> {
  return notBuilt('F-04', 'Model candidate listing') as never;
}

export function readModelMetadata(_modelId: string): Promise<ModelMetadata> {
  return notBuilt('F-04', 'Per-model metadata read') as never;
}

/** Intersects the deployment's `ALLOWED_MODELS` with what the catalogue proves is TEE-hosted. */
export function isAllowed(_metadata: ModelMetadata | undefined, _configAllowlist: string[]): AllowlistDecision {
  return notBuilt('F-04', 'The TEE allowlist decision') as never;
}
