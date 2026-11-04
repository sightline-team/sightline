import { describe, expect, it } from 'vitest';
import { isAllowed, isNearUpstreamHost, modelCatalogRowSchema, planModelIds, STEP_PLANS, toModelMetadata, type ModelMetadata } from '@/lib/near-ai/models';
import { REPAIR_NOTE } from '@/lib/near-ai/completion';

/**
 * The TEE allowlist (**F-04**), AGENTS.md §4 rule 3: *TEE-hosted models only, and the allowlist
 * fails closed.* A blind user is shown a private-AI claim on the strength of this decision, so the
 * tests below are about the refusals, not the accepts — an accept is only interesting once every
 * way a model can fail to be in an enclave has its own named reason.
 *
 * The payloads are **measured**, not imagined: every `it('the live …')` case is the JSON
 * `GET /v1/model/list` returned on 2026-11-03, copied from `npm run spike -- --stage=catalog`
 * output (`docs/SPIKE_RESULTS.md` §4). The reading half of this file assumed
 * `attestationSupported` was the discriminator; the live catalog proved it is not.
 */

function meta(over: Partial<ModelMetadata>): ModelMetadata {
  return {
    id: 'example/model',
    attestationSupported: true,
    providerType: 'vllm',
    verifiable: true,
    isReady: true,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    providerBackend: '',
    providerBaseUrl: '',
    contextLength: 128_000,
    maxOutputLength: 8_192,
    ...over,
  };
}

describe('the live catalog rows the spike fetched', () => {
  /** `anthropic/claude-fable-5`, as returned 2026-11-03 — the proxied majority (47 of 64 entries). */
  const external = {
    modelId: 'anthropic/claude-fable-5',
    inputCostPerToken: { amount: 10_000, scale: 9, currency: 'USD' },
    outputCostPerToken: { amount: 50_000, scale: 9, currency: 'USD' },
    costPerImage: { amount: 0, scale: 9, currency: 'USD' },
    cacheReadCostPerToken: { amount: 1_000, scale: 9, currency: 'USD' },
    metadata: {
      verifiable: false,
      contextLength: 1_000_000,
      modelDisplayName: 'Claude Fable 5',
      ownedBy: 'anthropic',
      aliases: ['claude-fable-5'],
      providerType: 'external',
      providerConfig: { api_key: '***', backend: 'anthropic', base_url: 'https://api.anthropic.com/v1', model_name: 'claude-fable-5' },
      attestationSupported: false,
      architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      maxOutputLength: 128_000,
      supportedSamplingParameters: ['max_tokens', 'stop'],
      supportedFeatures: ['tools', 'structured_outputs', 'reasoning'],
    },
  };

  /**
   * `moonshotai/kimi-k2.6` — the finding that broke the assumption. `attestationSupported: true`
   * **and** forwarded to OpenRouter. A flag-only filter would have offered it under a TEE claim.
   */
  const flaggedButProxied = {
    modelId: 'moonshotai/kimi-k2.6',
    inputCostPerToken: { amount: 810, scale: 9, currency: 'USD' },
    outputCostPerToken: { amount: 3_850, scale: 9, currency: 'USD' },
    costPerImage: { amount: 0, scale: 9, currency: 'USD' },
    metadata: {
      verifiable: true,
      contextLength: 262_144,
      providerType: 'chutes',
      providerConfig: { api_key: '***', backend: 'openai_compatible', base_url: 'https://openrouter.ai/api/v1', model_name: 'moonshotai/kimi-k2.6' },
      attestationSupported: true,
      architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      maxOutputLength: 8_192,
      isReady: true,
      datacenters: null,
    },
  };

  /** `Qwen/Qwen3.8-27B-abliterated` — the live entry with **no** `isReady` field at all. */
  const noReadyFlag = {
    modelId: 'Qwen/Qwen3.8-27B-abliterated',
    metadata: {
      verifiable: true,
      contextLength: 262_144,
      providerType: 'vllm',
      attestationSupported: true,
      architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      maxOutputLength: 65_536,
      datacenters: [{ country_code: 'US' }, { country_code: 'IN' }],
    },
  };

  /** `z-ai/glm-5.3-flash` — attested, and its `providerConfig` names a NEAR-side host, not a forward. */
  const nearSideHost = {
    modelId: 'z-ai/glm-5.3-flash',
    metadata: {
      verifiable: true,
      contextLength: 1_048_576,
      providerType: 'vllm',
      providerConfig: { long_context: { inference_url: 'https://glm-5-3-flash-long.completions.near.ai', max_context_tokens: 1_048_576, base_max_context_tokens: 100_000 } },
      attestationSupported: true,
      architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] },
      maxOutputLength: 1_048_576,
      isReady: true,
    },
  };

  it('parses each one, and maps the flags the decision needs', () => {
    for (const raw of [external, flaggedButProxied, noReadyFlag, nearSideHost]) {
      const parsed = modelCatalogRowSchema.safeParse(raw);
      expect(parsed.success, `${raw.modelId} rejected: ${JSON.stringify(parsed.error?.issues?.slice(0, 3))}`).toBe(true);
      if (!parsed.success) continue;
      const m = toModelMetadata(parsed.data);
      expect(m.id).toBe(raw.modelId);
      expect(m.inputModalities).toContain('image');
    }
    expect(toModelMetadata(modelCatalogRowSchema.parse(external)).attestationSupported).toBe(false);
    expect(toModelMetadata(modelCatalogRowSchema.parse(flaggedButProxied)).providerBaseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('strips providerConfig.api_key rather than carrying it forward', () => {
    // Measured: the live value is the mask "***", not a secret. The schema does not depend on that
    // staying true — a field that could hold a key is dropped because nothing in Sightline reads it
    // (AGENTS.md §4 rule 7 says nothing key-shaped may be carried into app state or a log).
    const m = toModelMetadata(modelCatalogRowSchema.parse(flaggedButProxied));
    expect(JSON.stringify(m)).not.toMatch(/api_key/i);
    expect(m.providerBackend).toBe('openai_compatible');
  });

  it('treats a missing isReady as not ready, never as ready-by-absence', () => {
    const m = toModelMetadata(modelCatalogRowSchema.parse(noReadyFlag));
    expect(m.isReady).toBe(false);
    expect(isAllowed(m, [m.id]).reason).toBe('not_ready');
  });

  it('accepts the attested model whose providerConfig names a *.near.ai host', () => {
    const m = toModelMetadata(modelCatalogRowSchema.parse(nearSideHost));
    expect(m.providerBaseUrl).toBe(''); // `long_context.inference_url` is not a `base_url` forward.
    expect(isAllowed(m, [m.id]).allowed).toBe(true);
  });

  it('refuses the list envelope, so a row schema is never handed the wrapper by mistake', () => {
    // `GET /v1/model/list` measured 2026-11-03 wraps its rows in `{models, limit, offset, total}`.
    // Passing that wrapper to the row schema is the kind of mistake that would silently produce a
    // catalog of one unnamed model, so the refusal is asserted rather than trusted.
    const envelope = { models: [external], limit: 100, offset: 0, total: 1 };
    expect(modelCatalogRowSchema.safeParse(envelope).success).toBe(false);
  });
});

describe('isAllowed — every refusal has a reason', () => {
  const id = 'tee/one';
  const list = [id];

  it('rejects a proxied third-party model (providerType external, attestationSupported false)', () => {
    const d = isAllowed(meta({ id, attestationSupported: false, providerType: 'external', providerBaseUrl: 'https://api.anthropic.com/v1' }), list);
    expect(d).toEqual({ allowed: false, reason: 'not_attestation_supported' });
  });

  it('rejects a model whose metadata is unknown — absence is not a pass', () => {
    expect(isAllowed(undefined, list)).toEqual({ allowed: false, reason: 'metadata_unavailable' });
  });

  it('rejects the flag-says-TEE-but-forwarded case, which is the one the reading missed', () => {
    const d = isAllowed(meta({ id, providerType: 'chutes', providerBaseUrl: 'https://openrouter.ai/api/v1' }), list);
    expect(d).toEqual({ allowed: false, reason: 'proxied_upstream' });
  });

  it('rejects a model that cannot be signature-verified, since rule 4 requires verifying each response', () => {
    expect(isAllowed(meta({ id, verifiable: false }), list).reason).toBe('not_verifiable');
  });

  it('rejects a model the deployment did not name, matched exactly and case-sensitively', () => {
    // Live catalog, 2026-11-03: `deepseek-ai/DeepSeek-V4.1-Flash-1017` is vllm+attested and
    // `deepseek/deepseek-v4.1-flash-1017` is a proxied non-attested entry. A normalized comparison
    // would let the second through the first name.
    const configured = ['deepseek-ai/DeepSeek-V4.1-Flash-1017'];
    expect(isAllowed(meta({ id: 'deepseek/deepseek-v4.1-flash-1017', attestationSupported: false, providerType: 'external' }), configured).reason).toBe('not_in_config_allowlist');
    expect(isAllowed(meta({ id: 'deepseek-ai/DEEPSEEK-V4.1-FLASH-1017' }), configured).reason).toBe('not_in_config_allowlist');
  });

  it('rejects a TEE model that cannot take images — this list guards the photo path', () => {
    expect(isAllowed(meta({ id, inputModalities: ['text'] }), list).reason).toBe('no_image_input');
  });

  it('accepts exactly the shape rule 3 describes: attested, verifiable, NEAR-side, ready, image-input', () => {
    expect(isAllowed(meta({ id }), list)).toEqual({ allowed: true, reason: 'tee_and_image' });
  });

  it('refuses when the config list is empty, whatever the catalog claims', () => {
    expect(isAllowed(meta({ id }), []).reason).toBe('not_in_config_allowlist');
  });
});

describe('isNearUpstreamHost — the host a document may be sent to', () => {
  it('accepts NEAR hosts, including a deep subdomain', () => {
    for (const url of ['https://glm-5-3-flash-long.completions.near.ai', 'https://cloud-api.near.ai/v1', 'https://near.ai']) {
      expect(isNearUpstreamHost(url), url).toBe(true);
    }
  });

  it('refuses third-party APIs and every lookalike that ends in the same letters', () => {
    for (const url of ['https://openrouter.ai/api/v1', 'https://api.openai.com/v1', 'https://not-near.ai', 'https://near.ai.evil.example', 'https://nnear.ai']) {
      expect(isNearUpstreamHost(url), url).toBe(false);
    }
  });

  it('refuses an unparseable URL instead of treating it as direct', () => {
    expect(isNearUpstreamHost('not a url')).toBe(false);
  });

  it('treats an absent base_url as served directly', () => {
    // The measured vllm and tinfoil entries carry no `providerConfig.base_url` at all: nothing is
    // being forwarded, so there is no external host to forbid.
    expect(isNearUpstreamHost('')).toBe(true);
  });
});

describe('the per-step plan — which model answers which call (ADR-24)', () => {
  /**
   * `docs/SPIKE_RESULTS.md` §4 (2026-11-04) is the whole reason this table exists: the model that
   * transcribes a page correctly answered this repo's structure request in a readable shape **0 of 6
   * times**, while the other allowlisted model answered **4 of 4**. These tests hold that finding in
   * place, so the plan cannot be "simplified" back to one model by someone who was not there.
   */

  /** §4's catalog figures for the two survivors — the ceilings a budget has to fit inside. */
  const measured = {
    'z-ai/glm-5.3-flash': { maxOutputLength: 1_048_576 },
    'Qwen/Qwen3.8-27B': { maxOutputLength: 65_536 },
  } as const;

  it('answers every call a document run makes, and nothing else', () => {
    // `CallPurpose` is the union `readCompletion` accepts, so a new step means a new row here or a
    // type error. The sorted-key assertion is the runtime half of that, for whoever reads a failure.
    expect(Object.keys(STEP_PLANS).sort()).toEqual(['analyse', 'qa', 'transcribe']);
  });

  it('does not give the structure step the model that transcribes the page', () => {
    expect(STEP_PLANS.transcribe.model).not.toBe(STEP_PLANS.analyse.model);
    expect(STEP_PLANS.transcribe.model).toBe('z-ai/glm-5.3-flash');
    expect(STEP_PLANS.analyse.model).toBe('Qwen/Qwen3.8-27B');
  });

  it('answers Q&A on the page model, because the step was measured there and not inferred (S-14, ADR-26)', () => {
    // This row used to be Qwen *by inference from the structure step* — "the only model that answers
    // strict JSON over a transcript". SPIKE §4's S-14 run sent the Q&A request itself and the inference
    // fell: **both** models answered 3 of 3 in a readable shape, no fence, no repair. So the fence
    // habit is a property of the nested structure contract, not of the model, and the row is decided on
    // the numbers that do still separate them — $0.000258–$0.000281 a question and 8 s for three on glm,
    // against $0.000342–$0.000538 and 33 s on Qwen (one single answer took 15.6 s).
    expect(STEP_PLANS.qa.model).toBe('z-ai/glm-5.3-flash');
    expect(STEP_PLANS.qa.model).toBe(STEP_PLANS.transcribe.model);
    // The set a deployment must allowlist is unchanged by this: the structure step still needs Qwen.
    expect(planModelIds().sort()).toEqual(['Qwen/Qwen3.8-27B', 'z-ai/glm-5.3-flash']);
  });

  it('names only models rule 3 accepts, each with the shape SPIKE §4 measured', () => {
    // glm from the live catalog row above; Qwen from §4's table (attested, verifiable, vllm, NEAR-side,
    // ready, image-capable) — built with this file's synthetic helper rather than as an invented
    // byte-for-byte catalog row, because §4 records the flags and not the raw JSON.
    const glm = toModelMetadata(modelCatalogRowSchema.parse({
      modelId: 'z-ai/glm-5.3-flash',
      metadata: { verifiable: true, contextLength: 1_048_576, providerType: 'vllm', attestationSupported: true, architecture: { inputModalities: ['text', 'image'], outputModalities: ['text'] }, maxOutputLength: 1_048_576, isReady: true },
    }));
    const qwen = meta({ id: 'Qwen/Qwen3.8-27B', contextLength: 262_144, maxOutputLength: 65_536 });
    expect(isAllowed(glm, planModelIds())).toEqual({ allowed: true, reason: 'tee_and_image' });
    expect(isAllowed(qwen, planModelIds())).toEqual({ allowed: true, reason: 'tee_and_image' });
  });

  it('cannot run a document on a deployment that names only one of them', () => {
    // `ALLOWED_MODELS` is operator-set, and `isAllowed` refuses anything outside it (rule 3). So a
    // deployment that lists only the page model gets a working photo step and a refused structure
    // step — which is why the docs name both ids and this test names the set.
    const oneOnly = ['z-ai/glm-5.3-flash'];
    expect(isAllowed(meta({ id: STEP_PLANS.analyse.model }), oneOnly).reason).toBe('not_in_config_allowlist');
    expect(planModelIds().sort()).toEqual(['Qwen/Qwen3.8-27B', 'z-ai/glm-5.3-flash']);
  });

  it('budgets every step inside what its own model can answer', () => {
    // A `max_tokens` above the model's ceiling is a request the service must reject, and §1's other
    // measured case is a budget below what a reasoning model needs: the number has to sit between.
    for (const [purpose, plan] of Object.entries(STEP_PLANS)) {
      const ceiling = measured[plan.model as keyof typeof measured].maxOutputLength;
      expect(plan.maxTokens, `${purpose}: ${plan.maxTokens} against ${plan.model}'s ${ceiling}`).toBeGreaterThan(0);
      expect(plan.maxTokens).toBeLessThanOrEqual(ceiling);
    }
  });

  it('asks for the repair in the shape that actually failed: not JSON, and fenced JSON', () => {
    // §4's post-fix glm replies: two were prose, two were valid JSON inside a ``` fence. The old note
    // said "no sentence before it or after it", which a fenced reply satisfies — so it did not describe
    // two of the four failures it was being sent to repair.
    expect(REPAIR_NOTE).toMatch(/code fence/i);
    expect(REPAIR_NOTE).toMatch(/no sentence before it or after it/);
  });
});
