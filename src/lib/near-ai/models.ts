import { z } from 'zod';
import { notBuilt } from '@/lib/not_built';

/**
 * Model discovery and the TEE allowlist (item **F-04**).
 *
 * Rewritten after `docs/SPIKE_RESULTS.md` §4 / ADR-18: the flags that decide
 * whether a model has a TEE guarantee are **not** on `GET /v1/models`. They live
 * on `GET /v1/model/{model_name}` and on `GET /v1/model/list`, so an allowlist built from
 * the list alone cannot tell a TEE model from a proxied third-party one — and AGENTS.md
 * §4 rule 3 says that distinction is the one thing we may not get wrong.
 *
 * Measured live on 2026-11-03 (`npm run spike -- --stage=catalog`), which changed one thing the
 * reading had wrong: **`attestationSupported: true` is not enough**. `moonshotai/kimi-k2.6` carries
 * that flag *and* `providerConfig.base_url = https://openrouter.ai/api/v1` with
 * `backend: openai_compatible` — a proxied third-party model that advertises a TEE. A filter that
 * read the flag alone would have offered an OpenRouter-forwarded model to a blind user under a
 * private-AI claim. So the host the request actually goes to is its own check below, and it is the
 * one that rule 3 is really about.
 *
 * Fail closed: a model whose metadata is missing, unreadable or `attestationSupported: false` is
 * never offered, never selected, and never sent document data.
 */

/** The one host family a document may be sent to. `*.completions.near.ai` and the API host both live here. */
const NEAR_UPSTREAM_SUFFIX = '.near.ai';

export interface ModelMetadata {
  id: string;
  attestationSupported: boolean;
  providerType: string;
  /** Whether the service says this model's responses are signature-verifiable. */
  verifiable: boolean;
  /** Absent on several live entries; `false` there is the fail-closed reading. */
  isReady: boolean;
  inputModalities: string[];
  outputModalities: string[];
  /** `providerConfig.backend`, e.g. `openai_compatible`, `anthropic`, `vllm`. Empty when absent. */
  providerBackend: string;
  /** `providerConfig.base_url` — where NEAR forwards the request. Empty when the model is served directly. */
  providerBaseUrl: string;
  contextLength: number;
  maxOutputLength: number;
}

export interface AllowlistDecision {
  allowed: boolean;
  reason:
    | 'tee_and_image'
    | 'not_attestation_supported'
    | 'not_verifiable'
    | 'proxied_upstream'
    | 'not_ready'
    | 'no_image_input'
    | 'metadata_unavailable'
    | 'not_in_config_allowlist';
}

/** One `{amount, scale, currency}` cost. `scale: 9` is nano-USD. */
export const costSchema = z.object({
  amount: z.number().optional(),
  scale: z.number().optional(),
  currency: z.string().optional(),
});

/**
 * `providerConfig` is forwarded configuration, not something Sightline acts on beyond `backend` and
 * `base_url`. The live endpoint also returns `api_key`, measured to be the literal mask `"***"`
 * rather than a secret — but a field that *could* carry one must not be carried forward by a schema
 * that does not need it, so only the two host fields survive (AGENTS.md §4 rule 7). Extra keys are
 * stripped rather than rejected, because the set of them differs per provider type.
 */
const providerConfigShape = z.object({ backend: z.string().default(''), base_url: z.string().default('') }).passthrough();

/**
 * A row of `GET /v1/model/list` and the `metadata` half of `GET /v1/model/{model_name}` — measured
 * 2026-11-03 to be the same shape from both endpoints, which is why one schema serves both.
 *
 * Every field is optional with a fail-closed default, because the live catalog proved the shape is
 * uneven: `isReady` and `datacenters` are present on some entries and absent on others
 * (`Qwen/Qwen3.8-27B-abliterated` and `deepseek-ai/DeepSeek-V4.1-Flash-1017` have no `isReady` at
 * all), and `providerConfig` appears only for models that are forwarded somewhere.
 */
export const modelCatalogRowSchema = z.object({
  modelId: z.string().min(1),
  inputCostPerToken: costSchema.optional(),
  outputCostPerToken: costSchema.optional(),
  costPerImage: costSchema.optional(),
  cacheReadCostPerToken: costSchema.optional(),
  metadata: z
    .object({
      attestationSupported: z.boolean().default(false),
      verifiable: z.boolean().default(false),
      isReady: z.boolean().default(false),
      providerType: z.string().default(''),
      architecture: z
        .object({
          inputModalities: z.array(z.string()).default([]),
          outputModalities: z.array(z.string()).default([]),
        })
        .default({ inputModalities: [], outputModalities: [] }),
      providerConfig: providerConfigShape.optional(),
      contextLength: z.number().default(0),
      maxOutputLength: z.number().default(0),
    })
    .default({
      attestationSupported: false,
      verifiable: false,
      isReady: false,
      providerType: '',
      architecture: { inputModalities: [], outputModalities: [] },
      contextLength: 0,
      maxOutputLength: 0,
    }),
});

export type ModelCatalogRow = z.infer<typeof modelCatalogRowSchema>;

export function toModelMetadata(row: ModelCatalogRow): ModelMetadata {
  const md = row.metadata;
  return {
    id: row.modelId,
    attestationSupported: md.attestationSupported,
    providerType: md.providerType,
    verifiable: md.verifiable,
    isReady: md.isReady,
    inputModalities: md.architecture.inputModalities,
    outputModalities: md.architecture.outputModalities,
    providerBackend: md.providerConfig?.backend ?? '',
    providerBaseUrl: md.providerConfig?.base_url ?? '',
    contextLength: md.contextLength,
    maxOutputLength: md.maxOutputLength,
  };
}

/**
 * Is the host in `base_url` one we are willing to put document bytes in front of?
 *
 * Exact suffix on a dot, so `near.ai` and `glm-5-3-flash-long.completions.near.ai` pass and neither
 * `openrouter.ai` nor a lookalike such as `not-near.ai` or `near.ai.evil.example` does. A base URL
 * that will not parse is not a NEAR host.
 */
export function isNearUpstreamHost(baseUrl: string): boolean {
  if (baseUrl.trim().length === 0) return true; // Absent means served directly: no forwarding to forbid.
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === NEAR_UPSTREAM_SUFFIX.slice(1) || host.endsWith(NEAR_UPSTREAM_SUFFIX);
}

/**
 * The decision AGENTS.md §4 rule 3 asks for, in one place so a mode switcher, the relay and the
 * model picker cannot each invent a slightly different answer.
 *
 * Order matters for what a reader is told, not for safety: every branch refuses. The config list is
 * matched **case-sensitively on the full id**, because the live catalog contains
 * `deepseek-ai/DeepSeek-V4.1-Flash-1017` (`vllm`, attested) and
 * `deepseek/deepseek-v4.1-flash-1017` (`openai_compatible`, not attested) — two entries whose ids
 * differ by namespace and case, where a normalized comparison would let the proxied one through.
 */
export function isAllowed(metadata: ModelMetadata | undefined, configAllowlist: string[]): AllowlistDecision {
  if (metadata === undefined) return refuse('metadata_unavailable');
  if (!configAllowlist.includes(metadata.id)) return refuse('not_in_config_allowlist');
  if (!metadata.attestationSupported) return refuse('not_attestation_supported');
  if (!metadata.verifiable) return refuse('not_verifiable');
  if (!isNearUpstreamHost(metadata.providerBaseUrl)) return refuse('proxied_upstream');
  if (!metadata.isReady) return refuse('not_ready');
  if (!metadata.inputModalities.includes('image')) return refuse('no_image_input');
  return { allowed: true, reason: 'tee_and_image' };
}

function refuse(reason: AllowlistDecision['reason']): AllowlistDecision {
  return { allowed: false, reason };
}

/**
 * Candidate listing is **F-04**'s transport half and stays refused: this file now holds the decision
 * and the parsing, but the route the list is fetched over is a relay question (**F-05**) — whether a
 * Mode A browser calls `/v1/model/list` directly or Mode B's relay is allowed to forward it is
 * recorded as a follow-up in `ROADMAP.md` §10, not guessed here.
 *
 * Two facts the spike measured on 2026-11-03, so the next person does not re-derive them:
 * `GET /v1/model/list` returns **every** row's flags in one call, wrapped in
 * `{models, limit, offset, total}` (so the allowlist is not one request per model), and that path is
 * **not** in `NEAR_PATHS` — building this transport means widening the client's endpoint set, which
 * is the relay's allowlist question and needs a human, not an agent deciding it in a utility file
 * (AGENTS.md §5).
 */
export function listCandidates(): Promise<string[]> {
  return notBuilt('F-04', 'Candidate listing (the transport that reaches /v1/model/list)') as never;
}

/** As `listCandidates`: reading one model's metadata needs to know which client will carry it. */
export function readModelMetadata(_modelId: string): Promise<ModelMetadata> {
  return notBuilt('F-04', 'Per-model metadata read (the transport that reaches /v1/model/{name})') as never;
}
