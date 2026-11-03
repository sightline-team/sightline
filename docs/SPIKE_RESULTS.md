# Sightline — SPIKE RESULTS

Day-1 answers. Every line is either read in an official primary source, measured against the live
API, or marked as not yet known. **Nothing here is inferred from how an API would usually work.**

Marker vocabulary (AGENTS.md §6): **[Verified]** = read in official docs or source code, with the
source named. **[Measured]** = run against the live API and the output saved. **[Unverified]** = still
unknown; do not build on it.

## Status of this file

Written 2026-11-02 from **documentation and source-code reading only**. Measured against the live API
on **2026-11-03**, the day the key arrived (item S-00, blocker B-05) — `npm run spike` now reproduces
every **[Measured]** row in here, stage by stage, through the same client, schemas and allowlist code
the app uses.

What the key settled: the model catalog and its TEE flags (§4), the shape of a real attestation report
(§3), a response signature verified against an attested key (§5), a live CORS preflight (§6), first
latency and cost numbers (§4, §1 of the measurement notes). What it did **not** settle, and the
reading should not be mistaken for it: E2EE from a browser (a dependency decision, T-10/B-06), the
heavy verifier checks inside `/api/verify` (T-03, and `dcap-qvl-node` is not installed), and accuracy
on bad photographs (S-03 needs the golden set run against a live model).

Four findings **contradicted the reading**, and each is marked where it lands: `attestationSupported:
true` does not imply a NEAR-side upstream; a model can be `isReady: true` and never answer; a streamed
response is signed by the *gateway* rather than by the model enclave — its hash **is** rebuildable from
the exact SSE bytes, so the loss is the strength of the claim, not the check (§5); and `NearClient`
refuses an SSE body outright.

Primary sources read:
- `https://docs.near.ai/api-reference/openapi.json` (the machine-readable API contract, ~542 KB)
- `https://docs.near.ai/cloud/guides/e2ee-chat-completions.md`
- `https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md`
- `https://docs.near.ai/cloud/verification/reference/quote-nonce-signer.md`
- `https://github.com/near/agent-skills/tree/main/skills/near-ai-cloud` (the skill our ARCHITECTURE §2 already cited)
- `https://github.com/nearai/cloud-api` (server source, Rust)
- `https://github.com/nearai/inference-sdk` (official TS/JS SDK)
- `https://github.com/nearai/nearai-cloud-verifier` (reference verifier, Python **and** TypeScript)
- `https://github.com/near-examples/nearai-cloud-verification-example` (minimal Node example)
- `https://near.ai/models` (catalog page, embedded model objects)

---

## 1. Base URL and authentication — [Verified] and [Measured]

Base `https://cloud-api.near.ai/v1`. `POST /v1/chat/completions` response properties: `choices`,
`created`, `id`, `model`, `object`, `usage`. **There is no signature in the completion body and no
signature header** — signatures are fetched separately (§5). Source: openapi.json.

**[Measured] 2026-11-03**, same endpoint, same key:

| Fact | What the live service did |
|---|---|
| Authentication | `Authorization: Bearer <key>` on `GET /v1/models` → **200**, 64 entries, 2.3–3.4 s. The key is accepted from this machine with no restriction observed. |
| Envelope | `id`, `model` (echoes the requested id verbatim, case and namespace included), `created` (unix seconds), `choices[0].{message,finish_reason}`, `usage`. `completionEnvelopeSchema` (`src/lib/near-ai/envelope.ts`) accepted it unchanged — the two optional fields it was written around are real: `finish_reason` came back `"stop"`, and `refusal` was absent rather than null. |
| `id` shape | NEAR-hosted models: 32 lowercase hex, no prefix (`678f8acfeab24d9c8795879729b4d3d4`). A proxied model: `chatcmpl-EgFWMLXriLHBMXEILTJe3rBPXaFGC`. The signature lookup keys on this value, so a Mode A session that mixed providers would be fetching two different id shapes. |
| **Reasoning eats the token budget** | With `max_tokens: 8` three models returned **HTTP 200, `finish_reason: "length"`, `content: ""`** and `usage.completion_tokens_details.reasoning_tokens: 8`. The answer was not truncated by accident — the entire budget went to reasoning, so a low `max_tokens` produces an *empty reply that parses fine*. `PROBE_MAX_TOKENS = 640` in `scripts/spike.ts` yields `finish_reason: "stop"` with real content (38 completion tokens, 36 of them reasoning, for "Reply with exactly: OK"). **This is P-08's business**: `truncated()` is true and `contentOf()` is `""` at the same time, and a per-page token cap has to leave room for thinking. |
| `usage` details | `prompt_tokens_details.image_tokens` appears on an image request (64 tokens for a 1×1 PNG on `Qwen/Qwen3.8-27B`, 16 on `z-ai/glm-5.3-flash`), `cached_tokens: 0`. **An input image is billed as prompt tokens**; `costPerImage` is 0 for every text-output model and nonzero only for image-*generating* ones. The envelope schema does not carry `usage` at all — the cost line in the spike reads it off the raw JSON (follow-up for S-09 and the README's cost figure). |
| Errors | `502` `{"error":{"message":"The model is currently unavailable. Please try again later.","type":"bad_gateway"}}` (a `chutes` model that the catalog says is ready); `400 … "type":"invalid_request_error","param":"model"` with `Upstream request failed with status 404` (an attested model that is not deployed). `src/lib/near-ai/client.ts` maps 404/5xx on a completion to `model_unavailable` and a 400 to `unknown` — the 400 case is *about* the model, so that mapping is the one place the conservative default costs a clearer message. Recorded, not changed. |
| 404 on a signature | `GET /v1/signature/<unknown>?signing_algo=ed25519` → **404** `Signature not found: <id>:ed25519` (`type: not_found_error`). **The message is not the "Chat id not found or expired" §5 quoted from the docs** — so anything that ever matched on that text would be wrong. The client's retry-on-GET-404 is keyed on the status, which is the right choice and is what the measured response supports. |

## 2. E2EE to the enclave — exists in the docs, and it changes our claim

**[Verified] documented.** `docs.near.ai/cloud/guides/e2ee-chat-completions.md`: "encrypting your
messages with the model's public key before they leave your machine".

Protocol (v2), quoted field for field:

| Part | Value |
|---|---|
| Key exchange | Curve25519 / X25519 ECDH |
| KDF | HKDF-SHA256, info `"ed25519_encryption"` |
| Cipher | XChaCha20-Poly1305 |
| Keys | **Ed25519 on both sides**, converted to/from X25519 for ECDH |
| Public key form | 32 bytes, 64 hex characters |
| Wire format | `[ephemeral_pubkey (32 B)][nonce (24 B)][ciphertext + tag]`, hex-encoded |
| Model public key source | `attestation["model_attestations"][0]["signing_public_key"]` |
| Request headers | `X-Signing-Algo: ed25519`, `X-Client-Pub-Key` (64 hex), `X-Encryption-Version: 2`, `X-Model-Pub-Key` (required through the gateway; not needed on direct completions), optional `X-Encrypt-All-Fields: true` |
| Response side | decrypts `choices[0].message.content`, `reasoning_content`, `reasoning`, `audio.data`; per chunk when streaming |
| Endpoints that accept encrypted input | `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/images/generations`. **`/v1/responses` does not.** |
| Legacy scheme | SECP256K1 ECDH + HKDF + AES-256-GCM, 128-hex keys, info `"ecdsa_encryption"`, `[eph 65 B][nonce 12 B][ct]` |

**[Unverified] from a browser.** The documented examples are Python and Node (they use Node `crypto`
`randomBytes`). No browser/WebCrypto path is documented anywhere we read. This matters because it is
the whole of our privacy claim (ARCH §10, PRD §8):

- XChaCha20-Poly1305 is **not** a WebCrypto algorithm → needs a pure-JS implementation.
- `@noble/ciphers` provides `xchacha20poly1305`, `@noble/curves` provides Ed25519 → X25519 conversion,
  `@noble/hashes` provides HKDF-SHA256. That is a browser-complete stack with no WASM.
- So the claim is implementable client-side, but **it will not be printed as "verified" until a live
  call proves the enclave decrypts our payload** (needs a key).

Consequence for the design, decided in ADR-16: the relay (Mode B) can be built so that **it carries
ciphertext only**, which removes "our server sees the document in transit" from the threat model.
Until E2EE works in a browser, the relay is still in the trust path and the weaker sentence is shown.

Related, **[Verified]** but different: **OHTTP** (`ohttp_attestation` in the report; SDK flags
`ohttp: true`) encrypts the exchange to the attested **Gateway**, requires `/ohttp` at the same origin,
is incompatible with `signingAlgo: 'ecdsa'`, and the SDK states plainly that "Authorization and custom
headers sent on the outer request, along with the client's network address, are **not** hidden by
OHTTP". OHTTP is not a substitute for E2EE-to-the-model for our purpose.

## 3. Attestation report — [Verified] shapes, [Unverified] model inner fields

| Endpoint | Auth | Parameters |
|---|---|---|
| `GET /v1/attestation/report` | **api_key** | `model`, `signing_algo`, `nonce`, `signing_address`, `include_tls_fingerprint`, `provider`. No `model` ⇒ gateway attestation. |
| `GET /v1/attestation/ita-token` | none | `model`, `nonce`, `signing_algo`, `signing_address`, `include_tls_fingerprint`, `policy_ids`, `policy_must_match`, `token_signing_alg` |
| `GET /v1/signature/{chat_id}` | **api_key** | path `chat_id`, `model`, `signing_algo` |

`gateway_attestation` is `DstackCpuQuote`: required `signing_address`, `signing_algo`, `intel_quote`,
`event_log`, `report_data`, `request_nonce`, `info`; optional `tls_cert_fingerprint`,
`vpc{vpc_hostname, vpc_server_app_id}`. The response also carries `ohttp_attestation{signing_algo,
signing_key, key_config, signature}`, `ohttp_key_config` and `tls_certificate`.

`model_attestations` is typed in openapi.json as an array of arbitrary objects — **the inner field
names are NOT in the machine contract** [Unverified by openapi]. They come from
`docs.near.ai/cloud/verification/cloud-api/model-attestations.md` **[Verified by that page]**:
`intel_quote` ("Intel TDX evidence"), `event_log` ("Replay it and match the result to the quote's
RTMR3"), `request_nonce` ("Echoed request nonce. Require it to match the client nonce"),
`report_data` ("**Not currently returned in model reports**"), `signing_address`, `signing_algo`,
`signing_public_key` ("Model public key used by the E2EE flow"), `nvidia_payload` ("NVIDIA GPU
evidence, when present"), `info.tcb_info.app_compose`.

**Nonce** [Verified], quoted: "Generate 32 random bytes in the client and encode them as 64 hexadecimal
characters." Supplied as the `nonce` query parameter; bound as "The final 32 bytes are the client
nonce" inside `report_data`; checked in `nvidia_payload` by
`(.nonce | ascii_downcase) == ($nonce | ascii_downcase)` against the NRAS `eat_nonce`. NRAS:
`https://nras.attestation.nvidia.com/v3/attest/gpu`, response form `[["JWT", "…"], {"GPU-0": "…"}]`.
Key encoding: ECDSA ⇒ "An Ethereum-style address derived from the signing key"; Ed25519 ⇒
"Ed25519 public-key bytes encoded as hexadecimal"; "Decode `signing_address` from hex after removing
any `0x` prefix."

The documented 7-step binding procedure (quote-nonce-signer.md) is what `/api/verify` will implement:
DCAP-QVL collateral + TDB check and **abort if `td_attributes[0]` indicates debug mode**; parse
`signing_address` (20 B ECDSA / 32 B Ed25519); `bound_identity = SHA-256(identity + TLS fingerprint)`;
assert `bound_identity || nonce(64 hex) == report_data`; compare `request_nonce`; hash `app_compose`,
prefix `0x01`, pad 15 zero bytes, check `mr_config_id`; replay IMR-3 entries through SHA-384 extend and
match `rt_mr3`.

**No keyless attestation path exists** [Verified by absence]: both the report and the signature
endpoints require an API key. In Mode B the key stays on our server, which is fine; **in Mode A the
user's own key must be in the browser** — that is the design consequence recorded in ADR-17, and it is
also why Mode A can never be the default for our users.

### [Measured] 2026-11-03 — the first real report, and the field names are now facts

`GET /v1/attestation/report?model=z-ai/glm-5.3-flash&nonce=<64 fresh hex>&signing_algo=ed25519` →
**200, 265,925 bytes in 5.1 s** (a second call for a different model answered in 0.46 s, so the first
number is the cold path and matters for the progress-announcement budget, not the steady state).
Omitting `model` → **200, 76,208 bytes, `gateway_attestation` only and no `model_attestations`** —
confirming §3's warning that a gateway report says nothing about the enclave serving the model.

Two things the reading had as **[Unverified by openapi]** are now settled:

- `attestationReportSchema` and `modelAttestationSchema` **accepted the live report unchanged**. The
  decision to make every field optional and strip unknowns rather than guess the inner contract is
  what let this happen on the first try; nothing in the schema needed editing.
- The inner field names are exactly the ones `model-attestations.md` listed. `model_attestations[0]`,
  measured, in order: `model_name`(str 30) · `signing_address`(64 hex) · `signing_algo`("ed25519") ·
  `signing_public_key`(64 hex) · `request_nonce`(64 hex) · `intel_quote`(**10,012 hex = 5,006 bytes**)
  · `nvidia_payload`(**98,222 hex = 49,111 bytes**) · `event_log`(**array of 30–32 objects**, 5 keys
  each) · `info`(11 keys) · `ohttp_attestation`(4 keys) · `compose_manager_attestation`(8 keys) ·
  `ohttp_key_config`(90 hex).
- `report_data` is **absent from the model attestation and present on `gateway_attestation`** (128 hex
  = 64 bytes), exactly as the docs put it ("not currently returned in model reports"). So binding a
  *model* report is `request_nonce`, and `bindReport` checks the right field.
- One asymmetry worth knowing before anyone writes a check that assumes it: `event_log` is an **array
  of objects** on `model_attestations[0]` and a **4,927-character string** on `gateway_attestation`.
  Both are typed `z.unknown()` today, which is the only reason the parse holds.
- The gateway's attested key is carried in **`gateway_attestation.signing_address`** (64 hex, measured),
  and `gateway_attestation` has **no `signing_public_key`** — so for `signing_algo: ed25519` the field
  named "address" holds a 32-byte Ed25519 public key, not an Ethereum address. Anything that verifies a
  gateway signature must read the field named in §3's key-encoding rule ("Ed25519 ⇒ public-key bytes
  encoded as hexadecimal") rather than assume the model attestation's two-field shape. Measured against
  a live `gateway`-kind signature, which verified with exactly this key: §5.

**`bindReport` passed 4/4 against this report** — `attestation_report`, `nonce_fresh`,
`signing_address_shape`, `signing_public_key_shape`. The service echoed the exact 64-hex nonce we
minted for the session. This is the first time `status: 'verified'` has been *reachable* from the
client side rather than asserted about a hypothetical.

The ceiling, stated precisely because it is the remaining half of B-05: `createTrustSession` ANDs the
local binding with `verifyWithServer`, and `/api/verify` is T-03's 501 stub, which the gate reads as
`server_verification: ran, passed: false` → the whole gate reports **`failed`**. So a live mode that
runs today would refuse to send, correctly and for a reason we chose (AGENTS.md §4 rule 6). Unblocking
it means **building T-03's heavy checks** — and `dcap-qvl-node`, the library the reference verifier uses
for the TDX quote, is not a dependency of this repo (`package.json` has `@noble/curves` and
`@noble/hashes` only), which is a human decision (AGENTS.md §5) rather than a task. Relaxing the gate
to call a 501 "not run" instead of "failed" would make live mode work *and* weaken the claim; that
trade is not ours to make silently.

## 4. Model catalog — the flags we need are NOT on `/v1/models`

`GET /v1/models` returns `ModelInfo`: `id`, `created`, `owned_by`, `name`, `description`,
`hugging_face_id`, `openrouter`, `pricing`, `quantization`, `context_length`, `max_output_length`,
`is_ready`, `deprecation_date`, `datacenters`, `supported_features`,
`supported_sampling_parameters`, `architecture`, `input_modalities`, `output_modalities`,
`inputModalities`, `outputModalities`, `top_provider`.

**`attestationSupported`, `providerType` and `verifiable` do not appear on `/v1/models`** [Verified by
absence in openapi]. They are on `GET /v1/model/{model_name}` (and on the catalog page):
`metadata{attestationSupported, providerType, verifiable, architecture{inputModalities,
outputModalities}, inferenceUrl, openrouterSlug, providerConfig{backend, base_url, model_name},
contextLength, datacenters, …}`, plus `inputCostPerToken`, `outputCostPerToken`, `costPerImage`,
`cacheReadCostPerToken`. `GET /v1/model/list` exists too.

This was recorded as **invalidating the F-04 design as written** ("catalog fetch, TEE + modality
filter") because the list endpoint did not carry the flags. **Partly overturned by measurement,
2026-11-03:** `GET /v1/model/list` *does* carry them — for all 64 entries, in one call, wrapped in
`{models, limit: 100, offset: 0, total: 64}`. So the filter is not list-only but it is also not
64 per-model calls; see the amendment in ADR-18 and the note in F-04's ledger line.

Observed on `https://near.ai/models` (64 entries, 2026-11-02): 47 are `providerType: external` with
`attestationSupported: false`; 12 are `vllm` with `true`; 4 are `chutes` with `true`; 1 is `tinfoil`
with `true`. TEE-hosted entries whose `inputModalities` include `"image"`:
`Qwen/Qwen3-VL-30B-A3B-Instruct`, `Qwen/Qwen3.8-27B`, `Qwen/Qwen3.8-27B-abliterated`,
`moonshotai/kimi-k2.6`, `moonshotai/kimi-k3`, `z-ai/glm-5.3-flash`. **[Verified] as listed on the
catalog page; [Unverified] as live and callable** — that needs a key (S-02).

Real object quoted from the catalog page (shows the field names exactly, including a text→image model,
which is why `output_modalities` must not be confused with input capability):

```json
{"modelId":"…","metadata":{"verifiable":true,"ownedBy":"nearai","providerType":"vllm",
 "attestationSupported":true,"architecture":{"inputModalities":["text"],
 "outputModalities":["image"]}}}
```

Costs are `{amount, scale, currency}` with `scale: 9` = nano-USD.

### [Measured] 2026-11-03 — S-02: the live catalog, and which model Sightline will use

`npm run spike -- --stage=catalog` → **HTTP 200 in 2.3–3.4 s, 64 entries, 79 KB**. Every row parsed
through `modelCatalogRowSchema` (`src/lib/near-ai/models.ts`) — 64 accepted, 0 rejected — and the
counts the catalog page showed on 2026-11-02 were right: **47 `external`/`attestationSupported:
false`, 12 `vllm`/`true`, 4 `chutes`/`true`, 1 `tinfoil`/`true`. 17 attested of 64.**

41 of the 64 accept `image` on input. Only **6 of those 41 are attested** — and after the allowlist
below, **4**. This is AGENTS.md §4 rule 3 as a number: two thirds of the image-capable catalog is a
forward to somebody else's API.

| Model | providerType | `attestationSupported` | `isReady` | ctx / max_out | in / out nano-USD | `isAllowed` | What the live endpoint actually did |
|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | vllm | true | true | 1,048,576 / 1,048,576 | 80 / 500 | **ALLOW** | **200 in 0.63 s** (text), **1.83 s** (1×1 image). `finish_reason: stop`, real content. Signature `provider_tee`, **verified**. |
| `Qwen/Qwen3.8-27B` | vllm | true | true | 262,144 / 65,536 | 40 / 1,350 | **ALLOW** | **200 in 3.2–6.3 s** (text), **10.0 s** (image). Signature `provider_tee`, **verified**. |
| `Qwen/Qwen3-VL-30B-A3B-Instruct` | vllm | true | true | **16,384** / 8,192 | 150 / 550 | **ALLOW** | **No answer.** Connection held open, aborted at 45 s and again at 150 s, on text *and* on image. `isReady: true` throughout. |
| `moonshotai/kimi-k3` | chutes | true | true | 1,048,576 / 65,535 | 3,300 / 16,500 | **ALLOW** | **HTTP 502** `The model is currently unavailable. Please try again later.` in 4.1–5.3 s. |
| `moonshotai/kimi-k2.6` | chutes | **true** | true | 262,144 / 8,192 | 810 / 3,850 | **refuse — `proxied_upstream`** | Not called: refused on purpose. See the trap below. |
| `deepseek-ai/DeepSeek-V4.1-Flash-1017` (+`-abliterated`) | vllm | true | **absent** | 1,048,576 / — | 300 / 1,200 | refuse — `not_ready` | Not called. |
| `Qwen/Qwen3.8-27B-abliterated` | vllm | true | **absent** | 262,144 / 65,536 | 40 / 1,350 | refuse — `not_ready` | Not called. Datacenters `US` **and `IN`**. |

**The finding that changed the filter.** `moonshotai/kimi-k2.6` carries `attestationSupported: true`
*and* `providerConfig{backend: "openai_compatible", base_url: "https://openrouter.ai/api/v1"}`. It is
the only one of the 17 attested entries that is forwarded to a third-party API — but a filter that
read the flag, as F-04 was written to do, would have **offered an OpenRouter-proxied model to a blind
user under a private-AI claim**. So `isAllowed` checks the host the request actually leaves for
(`isNearUpstreamHost`), independently of the flag. `providerType: "chutes"` is not itself the
discriminator: `kimi-k3` is also `chutes` and carries no `base_url`.

**Chosen vision model (S-02's "done when"): `z-ai/glm-5.3-flash`. Fallback: `Qwen/Qwen3.8-27B`.**
Both are TEE-hosted with no forward, both answer an image request in seconds, and both returned a
`provider_tee` signature that verified against the attested key from the same session. Chosen on
*eligibility, liveness, latency and cost* — **not on accuracy**: the golden set has not been run
against a live model (S-03, C-10), and `Qwen/Qwen3-VL-30B-A3B-Instruct`, the model
`docs/ARCHITECTURE.md` §3 named, does not answer at all and has a 16 K context besides, which is too
small for the 5-page case whatever its accuracy. That correction is recorded in ARCH §3 and ADR-18.

**S-07 — direct completions hosts.** Exactly **one** exists in the whole catalog, and it belongs to
the chosen model: `providerConfig.long_context.inference_url =
https://glm-5-3-flash-long.completions.near.ai` with `max_context_tokens: 1,048,576` against
`base_max_context_tokens: 100,000`. For `Qwen/Qwen3.8-27B` and for the VL model: **none** (their
`providerConfig` is absent or empty). Two consequences kept in view: that host is a *new origin* for
CSP `connect-src` (AGENTS.md §7) if Mode A ever uses it, and it is the one place where "direct" and
"through `cloud-api`" could give different bytes — so the signature hashes must be taken from whichever
path actually carried the request. Nothing in the app calls it yet; nothing was assumed about it.

Across the 64 entries, the forwarded hosts are: `api.openai.com`×20, `api.anthropic.com`×13,
`openrouter.ai`×8, `generativelanguage.googleapis.com`×6, `private.sage.levanto.ai`×1.

**Not on the list, and worth knowing before someone reuses it:** `openai/whisper-large-v3` is
`vllm` + attested with `inputModalities: ["audio"]` (a TEE path for C-04's audio, if that ever comes
back), `black-forest-labs/FLUX.2-klein-4B` is attested `text→image`, and `openai/privacy-filter` is
attested `text→text` at 10 nano-USD/token — a NEAR-hosted PII filter that answers `400 … Upstream
request failed with status 404` today, i.e. flagged and not deployed.

### [Measured] 2026-11-03 — S-09, one exchange

`z-ai/glm-5.3-flash`, the probe prompt, 640-token budget: **prompt 17, completion 38 (36 of them
reasoning), total 55 tokens → 20,360 nano-USD = $0.0000204**. `Qwen/Qwen3.8-27B` on the same prompt:
prompt 57, completion 30 → 42,170 nano-USD = $0.0000422. One image was +16 to +64 prompt tokens on a
1×1 PNG; a real page will be orders of magnitude more, so **the per-page figure this section needs is
still open** (S-09 stays `[~]` until the golden set runs, S-03). What is now measured rather than
guessed is the order of magnitude and the fact that reasoning tokens, not the answer, dominate the
budget.

## 5. Response signatures — [Verified], and they are not what our docs assumed

`GET /v1/signature/{chat_id}` returns required `text`, `signature`, `signing_address`, `signing_algo`
and optional `signature_kind`.

- `signature_kind` = `"provider_tee"` (model-serving TEE) or `"gateway"` (cloud-api gateway TEE, used
  when the gateway rewrites the stream bytes, and for attested fallback providers without per-response
  signatures); omitted for signatures stored before the kind was recorded.
- `text` = `"{model_id}:{request_hash}:{response_hash}"` for `provider_tee`,
  `"{request_hash}:{response_hash}"` for `gateway`.
- `request_hash` = "SHA-256 of the exact JSON request body sent over the wire";
  `response_hash` = "SHA-256 of the exact response payload string received". **Streaming caveat,
  verbatim: "a streaming response ends with two new lines — include them, or the hash changes."**
- Verification: ECDSA uses EIP-191 personal-sign (`ethers.verifyMessage(text, signature)`), compared
  case-insensitively to the attested `signing_address`; Ed25519 is a detached verify with no prefix.
- Operational: the signature "is cached on the node that served your completion, so a lookup can
  transiently return `Chat id not found or expired` — **retry**"; raw bytes "are retained separately
  for 60 minutes"; report retrieval is "free and non-billable".

**This is a change from ARCH §10 as written.** Our design said "verify the response signature against
the attested key" as if the signature came with the response. It does not: it is a second request
keyed by completion `id`, and the thing signed is a hash pair, not the document. That is still proof
that the enclave saw those exact bytes, but the check has to be implemented as fetch → rebuild both
hashes → verify. Recorded in ADR-19.

### [Measured] 2026-11-03 — a real response verified, and what a stream costs us

`POST /v1/chat/completions` (`z-ai/glm-5.3-flash`, `stream: false`) → **200, 808 bytes in 4.2 s**, then
`GET /v1/signature/{id}?model=…&signing_algo=ed25519` → **200 in 357 ms**. One exchange, no streaming:

| Measured | Value |
|---|---|
| `signature_kind` | `provider_tee` |
| `signing_algo` | `ed25519` |
| `signing_address` length | 64 hex (a 32-byte key, not an address) |
| `text` | 3 colon-separated fields, 148 chars — `{model_id}:{request_hash}:{response_hash}` |
| Model id inside the signed text | **the one the response echoes in `model`**, which here equals the one we sent |
| `checkSignature` over the exact 126 sent bytes + exact 808 response bytes | **`verified: true`, `origin: provider_tee`** |

That is the first time rule 4 of AGENTS.md §4 ("verify each response's signature") has been satisfied by
a live exchange rather than by a fixture, and it was satisfied by the production path — `fetchSignature`
and `checkSignature`, no ad-hoc crypto. The 404 body for a lookup that has not landed yet is
`{"error":{"message":"Signature not found: <chat_id>:ed25519",…,"type":"not_found_error"}}`, which shows
the cache key is `chat_id:algo` and confirms the retry the docs ask for.

**Streaming — the finding that reverses this file's earlier reading.** A `stream: true` request returns
`text/event-stream` (measured: 5,364 bytes, 26 `data:` frames, `[DONE]` present, ending with **exactly
two newlines**). Its signature is **`signature_kind: "gateway"`** with a 2-field text. Rebuilding the
hashes from the bytes we hold:

- `request_hash` = SHA-256 of the exact JSON body we sent — **matches**.
- `response_hash` = SHA-256 of the **entire raw SSE text, trailing two newlines included** — **matches**.
  Eight other rebuilds were tried and all mismatched: the body with trailing whitespace stripped, the
  body minus the final `[DONE]` frame, the `data:` payloads concatenated (no separator, `\n`, and
  `\n\n`-terminated), the last chunk alone, the last chunk plus `\n\n`, and the chunks joined by the
  frame separator. So the "include the two newlines or the hash changes" warning is literally true and
  sufficient — *if* you hash the whole stream as one string.
- Verifying that signature against `model_attestations[0].signing_public_key` → **false**. Against
  `gateway_attestation.signing_address` → **true**.

So a stream is **not** unverifiable; it is verifiable **by a weaker party**. The model enclave signs the
non-streamed response and the gateway signs the streamed one. That is a claims decision, not a
plumbing one: Sightline's receipt distinguishes "signed by the enclave serving the model" from "signed
by the API gateway enclave, not by the enclave serving the model" — the two sentences
`checkSignature` already returns — and rule 5 says the app may not upgrade the second into the first.
Hence **the app posts non-streamed** (ADR-22), which also sidesteps the separate mechanical fact that
`NearClient` parses every 200 body as JSON and so throws `invalid_model_output` on an SSE body at HTTP
200: streaming would need a second transport *and* would buy a weaker receipt for it.

## 6. CORS — permissive in the server source, decisive in the SDK doc

`nearai/cloud-api`, `crates/api/src/lib.rs:1075-1097` **[Verified in source]**, verbatim comment:
"Browser API clients supply their own tokens. Keep public API CORS open for third-party clients, while
admin browser access remains limited to configured origins." `build_cors_layer`: for any path not
starting with `/v1/admin` the origin predicate `return true`, `allow_methods(Any)`,
`allow_headers(mirror_request())`, `expose_headers(Any)`. `CORS_ALLOWED_ORIGINS` is parsed into exact
matches and wildcard suffixes for admin only. **Docs.near.ai does not describe any CORS policy**
[Verified by absence] — the behaviour lives in the server source.

So Mode A (direct, bring-your-own key) is **not** blocked by CORS as far as source reading goes, and
T-13 is **not** cut. The live preflight is measured below, and it agrees with the source.

Independently, `nearai/inference-sdk` `js/README.md` states the browser limitation we already assumed
in ARCH §10: "Browser Fetch does not expose the TLS peer certificate, so the browser client cannot
perform the attested TLS identity check provided by the Node entry point. Standard HTTPS certificate
validation still applies." **[Verified]** — this confirms rule 2 of AGENTS.md §4 against the vendor's
own documentation.

### [Measured] 2026-11-03 — the preflight the real service answers

`OPTIONS https://cloud-api.near.ai/v1/chat/completions` with
`Origin: http://localhost:3000`, `Access-Control-Request-Method: POST`,
`Access-Control-Request-Headers: authorization,content-type` → **200** with:

| Header | Value |
|---|---|
| `access-control-allow-origin` | `http://localhost:3000` (the request origin, echoed) |
| `access-control-allow-methods` | `*` |
| `access-control-allow-headers` | `authorization,content-type` |

and `GET /v1/models` with the same `Origin` → **200** with `access-control-allow-origin:
http://localhost:3000` and `access-control-expose-headers: *`. This is what the source reading predicted
for any path not starting with `/v1/admin`, and the admin restriction is not in our way.

What this does **and does not** close. It closes the server half of S-06: a browser at `localhost:3000`
sending an authenticated cross-origin `POST` will pass the preflight, so **Mode A is not blocked by CORS
and T-13 stays un-cut**. It does not close the browser half — these are responses read from a Node
`fetch` that was *told* to set an `Origin`, not a navigation a browser performed. A real `fetch()` from a
page can still be refused by something that never appears in a header dump (a credential rule, a
`connect-src` of our own making, an extension). The assertion that remains owed is "a page in Chromium
completed the round trip and the signature verified", which is the S-01/T-13 browser test and cannot be
derived from this table. Recorded as a follow-up rather than as a closed item, and §1 of this file says
the same thing in one clause.

## 7. Reference verifier — TypeScript exists, so the heavy checks can ship

`github.com/nearai/nearai-cloud-verifier` **[Verified]**: **MIT** ("Copyright (c) 2025 nearai-cloud"),
Python **and a native `ts/` directory** (pnpm; deps `ethers`, `tsx`, and **`dcap-qvl-node` for
verifying TDX quotes**). Checks listed in its README, verbatim: "GPU TEE Verification — NVIDIA
H100/H200 attestation via NRAS", "Intel TDX Quote Validation", "ECDSA Signature Verification",
"Sigstore Provenance", "Domain Verification — Gateway TLS attestation vs live certificate (default)",
"Multi-Server Support", plus compose-manifest → `mr_config` matching and "TDX report data: Validates
that report data includes the nonce in request". Its E2EE verifier tests
"Ed25519 + HKDF-SHA256 + XChaCha20-Poly1305, protocol version 2". Specific Intel collateral mechanics
are **not** documented in the README — they are delegated to `dcap-qvl` [Verified by absence].

`github.com/near-examples/nearai-cloud-verification-example` **[Verified]**: MIT, Node 22+, plain JS.
Reads `model_attestations[].signing_address`, `gateway_attestation.signing_address`, `nvidia_payload`,
`signature_kind`, `text`, `eat_nonce`; asserts `summary.overallResult === true && summary.nonceMatch === true`.
Says of itself: "This demo intentionally stops short of a full verifier."

Licence boundary **[Verified]**: `nearai/cloud-api` itself is **PolyForm Strict 1.0.0** — we may read it
(we did, for CORS) but must not vendor or copy it. The verifier and the SDK are MIT and may be adapted
with attribution (R-05).

## 8. Billing, credits and the cap (S-10)

- `GET /v1/organizations/{org_id}/usage/balance` → `OrganizationBalanceResponse` with `credit_limits`
  (`CreditLimitBreakdownResponse`), `spend_limit`, `spend_limit_display`.
- `PATCH /v1/workspaces/{workspace_id}/api-keys/{key_id}/spend-limit`, body field `spendLimit`
  (nano-USD; `null` removes it). **So a demo key can be capped** [Verified].
- `docs/credit-allocation.md` in `nearai/cloud-api`: charges are split "in exact integer nano-USD,
  across the organization's active credit limits", priority `grant → staking_farm → transfer → payment
  → postpay`; "Received credits are system-owned and cannot be created by general limit updates".
- Key purchase/credits in the dashboard: "Go to the 'Credits' section and purchase credits" [Verified].
- **The "$10 by joining NEAR Builders" figure is from HACKATHON.md Q-000 only.** It is NOT documented
  in docs.near.ai, cloud-api or agent-skills [Verified by absence]. Treat the amount as an event
  promise, not an API guarantee. A `grant` credit type exists.
- Direct host pattern `[Verified]`: `https://{slug}.completions.near.ai/v1`, e.g.
  `GET https://qwen35-122b.completions.near.ai/v1/signature/{chat_id}?signing_algo=ecdsa`; the gateway
  equivalent is `GET https://cloud-api.near.ai/v1/signature/{chat_id}?model={model_id}&signing_algo=ecdsa`.
  Whether our chosen vision model has a slug is **S-07 and needs a key**.

## 9. Official SDK — considered and deliberately not used for the trust path

`nearai/inference-sdk` is MIT, TypeScript, has a browser entry, `InferenceClient({apiKey, e2ee: true,
ohttp: true})`, `client.verifyResponse(completion.id)` returning `verified.signatureKind`, and a
preflight that "verifies Gateway evidence and checks the requested model's attestation support".

**Decision (ADR-20): do not put it in the trust path.** Sightline's product is the receipt that says
which checks ran. If the checks run inside a dependency we do not read, the receipt describes the SDK's
behaviour rather than ours. We implement the crypto with `@noble/*` (auditable, no WASM, already chosen
in ARCH §3) and keep the SDK as a **cross-checking tool** in `scripts/` — a second opinion we can run
against our own verifier output. The reference verifier's `ts/` directory is the port source for the
heavy checks (§10 of ARCH).

---

## What is still unknown (and cannot be closed by reading)

Closed by the key on 2026-11-03, so removed from this list: the live TEE-and-image catalog, which model
is callable and which is not (§4), the first attestation report and its field names (§3), one verified
response signature (§5), the direct-completions host question (S-07: the attested models we can use are
served from **one** host, `cloud-api.near.ai`, so the CSP needs no per-model wildcard) and the server
half of the CORS question (§6).

Still open, with what each one now waits on:

1. Whether E2EE from a **browser** actually works end to end with a live enclave. The protocol is
   documented, the report carries `ohttp_attestation` and `ohttp_key_config`, and no browser path is
   described anywhere. **This still sets the strongest privacy claim we are allowed to make.** Needs a
   dependency decision (T-10) and a real browser, not a key alone. (S-01)
2. How badly the chosen vision model misreads **numbers on bad photographs**. A key and a model are not
   the missing thing here; the golden set run against the live service is. (S-03)
3. **Price per page**, as opposed to price per probe exchange. Measured: `$0.0000399` for a 126-byte
   prompt. A real five-page document is a different token count, and the number a budget needs has not
   been produced. (S-09, `[~]` not `[x]`)
4. The **browser** half of CORS: a Chromium round trip with the signature verified. The preflight
   headers say yes; a header dump is not a navigation. (S-06, T-13)
5. Host request-size and execution-time limits for a 5-page upload on the plan we deploy to. A 45-second
   hang from a live model (§4) is a hint that an execution cap exists and is not the one our timeout
   assumes. (S-08)
6. Whether `spendLimit` is reachable on the account type we ended up with, and how much of the `$10`
   grant is left. The credits arrived and were spent on measurements; the cap itself has not been set,
   because setting it is an action on a shared account rather than a read. (S-10)
7. Intel TDX collateral fetch mechanics, delegated to `dcap-qvl-node` by the verifier — and the whole
   heavy-check half of `/api/verify`. The quote is in hand (5,006 bytes, measured), so this is now
   blocked on a **dependency approval** (AGENTS.md §5) rather than on data. Until it ships, live mode's
   gate reports `failed` and refuses to send. (T-03)
