import { z } from 'zod';
import { notBuilt } from '@/lib/not_built';
import type { CallPurpose, NearClient } from '@/lib/near-ai/client';

/**
 * Model discovery and the TEE allowlist (item **F-04**), plus the per-step model and reply budget
 * (**ADR-24**, `STEP_PLANS` below) — both live here because both are answers to "which model, for
 * what", and the allowlist check is the one that decides whether an answer is allowed at all.
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
 * What each step of a run asks the service: **which model answers it, and how many tokens that
 * answer may spend** (**ADR-24**). One table rather than three call sites, because the two facts
 * belong together — a budget is only safe relative to the model spending it, and the measured
 * evidence for both columns is the same ten exchanges (`docs/SPIKE_RESULTS.md` §4).
 *
 * ### Why the steps do not share a model
 *
 * `z-ai/glm-5.3-flash` is the page model: it answered C-03's transcription request in **25.77 s** for
 * **$0.00097080**, and `transcribeSchema` accepted the reply (§4). The same model answered this
 * repo's *structure* request in a shape the app could read **0 of 6 times** — twice with a `kind`
 * outside `factKindSchema` (our prompt's fault, fixed on P-01), twice as content that is not JSON at
 * all, twice as valid JSON inside a ``` fence — while `Qwen/Qwen3.8-27B` answered **4 of 4** in the
 * exact shape with every fact quoting the transcript back. A model that follows one contract need
 * not follow another, so "the chosen model" is per-request and this table is where that is written
 * down instead of assumed.
 *
 * Re-measured after P-01, with the budget sent (§4, the ADR-24 run): glm was again **0 of 4** readable
 * — both first requests fenced, both repair retries real objects ruined by one `"deadline": null` —
 * while Qwen was **1 of 3**, its five-page answer accepted whole (`analysisSchema` pass, 5/5 facts
 * quoting the transcript, `provider_tee` signature verified) and its two one-page answers rejected for
 * that same null. Two things follow, and neither changes the model choice. The null was *our* bug, not
 * the models': `analysisSchema` rejected a `string?` answered as `null` on six attempts out of six
 * that reached an object, and it is closed here (a `null` optional now reads as absent). And the
 * split holds on the evidence that set it: Qwen fenced **0 of 7** structure replies across both days,
 * glm **4 of 10**. An accepted Qwen step costs 5–16× what a glm step costs and 2–6× what it takes, so
 * the split is not free — **S-14** puts both models and the Q&A step through the same exchanges again
 * before this row is treated as settled.
 *
 * ### Why the budgets are 8,192 for the page and 16,384 for the text steps
 *
 * The same measured failure ADR-23 records for pages applies to text: a reasoning model that spends
 * its whole budget before answering returns **`content: null`** (§1, P-13), so a budget has to cover
 * the thinking *and* the answer — it is a correctness number, not a cost knob.
 *
 * The page budget is ADR-23's **8,192** and is unchanged: the one measured page completion was 1,492
 * tokens (1,008 of them reasoning) — 18% of it.
 *
 * The text steps needed measuring before a number could be written here, and the first number this
 * 2026-11-04**, §4) had `Qwen/Qwen3.8-27B` answer a *one-page* transcript with **8,047 completion
 * tokens, 5,469 of them reasoning — 98.2% of 8,192** — finishing on `stop`, one thought short of the cap.
 * A budget that a sample reaches by accident is a trap: at 8,192 the next such answer arrives as
 * `output_truncated` and the person is shown the transcript-only screen for a document the model had
 * read. S-14's re-run made that concrete rather than hypothetical: with the page model answering the
 * structure step, its five-page repair spent **8,872** completion tokens — **680 more than the cap ADR-24
 * first proposed** — so at 8,192 that answer would have been cut off and thrown away.
 *
 * **16,384** is ~1.8× the largest text-step answer now observed on either planned model (glm 8,872;
 * Qwen 8,047), inside both ceilings (Qwen 65,536 output; glm 1,048,576), and its cost is stated here so
 * nobody is surprised by a bill: output bills at 1,350 nano-USD per token on Qwen against 40 for input,
 * so a text step that *filled* 16,384 costs **$0.0221184**. The structure calls measured in §4 cost
 * $0.000669 – $0.010888 each and none was truncated.
 *
 * ### Q&A: measured, and it moved off Qwen
 *
 * This row used to be **inferred** — "Qwen is the only model that has answered a strict-JSON-over-the-
 * transcript request here", from the structure step. S-14 sent the Q&A request itself to both models
 * (§4, 2026-11-04) and the inference did not survive: **`z-ai/glm-5.3-flash` answered 3 of 3 and
 * `Qwen/Qwen3.8-27B` answered 3 of 3, with no code fence and no repair retry on either.** The fence habit
 * that put Qwen on the text steps is *contract-specific*, not a general property of the model — it appears
 * on the nested structure shape and not on this flat three-key one.
 *
 * With shape no longer separating them, the row is decided on what was measured: per question glm cost
 * **$0.000258–$0.000281** against Qwen's **$0.000342–$0.000538**, and the three questions took **8 s** on
 * glm against **33 s** on Qwen, including one **15.6 s** answer. A person asks several questions in a
 * session and waits for each one with nothing else on screen, so the tail latency is the number that
 * matters here in a way it does not for a batch step. `qa` therefore runs on the page model (**ADR-26**).
 * Its budget stays at 16,384: measured usage was **0.8–1.9%** of it, a ceiling costs nothing when it is
 * not reached, and lowering it would only add a truncation failure mode.
 *
 * What S-14 did *not* measure is whether either model's answer is **correct** — see **S-03**, and note
 * that a `notInDocument: true` reply is the model's own claim about the document, which this run could
 * only check for the shape, not for truth.
 *
 * It is *not* a fallback: glm stays the page model either way, and `z-ai/glm-5.3-flash` remains
 * `STEP_PLANS.transcribe`'s fallback (S-02) — nothing in this table re-decides S-13(b).
 * And there is **no automatic cross-model fallback**: `readCompletion` spends exactly one repair retry
 * on the *same* model (ADR-23, §13), because the alternative would re-ask a document on the model that
 * §4 measured as unable to read its shape — paying twice to reach the same transcript-only screen.
 */
export interface StepPlan {
  readonly model: string;
  readonly maxTokens: number;
}

export const STEP_PLANS = {
  transcribe: { model: 'z-ai/glm-5.3-flash', maxTokens: 8_192 },
  analyse: { model: 'Qwen/Qwen3.8-27B', maxTokens: 16_384 },
  qa: { model: 'z-ai/glm-5.3-flash', maxTokens: 16_384 },
} as const satisfies Record<CallPurpose, StepPlan>;

/**
 * Every model id a deployment must allowlist for a run to be *completable*: a step whose model is not
 * in `ALLOWED_MODELS` refuses inside `isAllowed` (rule 3), so the paste-text flow would work and the
 * photo flow would not, and nothing would say which. `tests/unit/model-allowlist.test.ts` holds these
 * ids against the live catalog rows, so a plan can never name a model rule 3 would refuse.
 */
export function planModelIds(): string[] {
  return [...new Set(Object.values(STEP_PLANS).map((plan) => plan.model))];
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

/**
 * Reading one model's metadata is **F-04**'s second transport half, and **F-05** answered the
 * question this comment used to leave open: the client that carries it is `createNearClient`, which
 * already lists `model/{model_name}` in `NEAR_PATHS`, pins the host, retries once, validates nothing
 * about the document and logs nothing. The relay is its caller (`lib/server/relay.ts`), because rule 3
 * has to be answered server-side before document bytes leave — and a row that will not parse is a
 * model whose TEE status is unknown, which is the `metadata_unavailable` refusal rather than a pass.
 *
 * `listCandidates()` above stays refused: it needs `/v1/model/list`, which is not in `NEAR_PATHS`, and
 * widening the endpoint set is a human decision.
 */
export async function readModelMetadata(modelId: string, client: NearClient): Promise<ModelMetadata> {
  const response = await client.get('model/{model_name}', { modelName: modelId });
  const parsed = modelCatalogRowSchema.safeParse(response.json);
  if (!parsed.success) {
    // The id is product configuration, not a person's letter, so naming it in an error is safe.
    throw new Error(`GET /v1/model/${modelId} did not parse as a catalog row`);
  }
  return toModelMetadata(parsed.data);
}
