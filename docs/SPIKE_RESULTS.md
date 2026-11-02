# Sightline — SPIKE RESULTS

Day-1 answers. Every line is either read in an official primary source, measured against the live
API, or marked as not yet known. **Nothing here is inferred from how an API would usually work.**

Marker vocabulary (AGENTS.md §6): **[Verified]** = read in official docs or source code, with the
source named. **[Measured]** = run against the live API and the output saved. **[Unverified]** = still
unknown; do not build on it.

## Status of this file

Written 2026-11-02 from **documentation and source-code reading only**. We have **no NEAR AI Cloud API
key yet** (blocker B-05), so no item in this file is **[Measured]**. Items marked "needs a key" below
cannot be closed by reading further. Product code is being built in fixtures mode in the meantime, and
every finding here is recorded with its source so a later live run can confirm or overturn it.

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

## 1. Base URL and authentication — [Verified]

Base `https://cloud-api.near.ai/v1`. `POST /v1/chat/completions` response properties: `choices`,
`created`, `id`, `model`, `object`, `usage`. **There is no signature in the completion body and no
signature header** — signatures are fetched separately (§5). Source: openapi.json.

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

This **invalidates the F-04 design as written** ("catalog fetch, TEE + modality filter"): the filter
needs a per-model metadata call, not just the list. Recorded in ADR-18; F-04's wording updated.

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

## 6. CORS — permissive in the server source, decisive in the SDK doc

`nearai/cloud-api`, `crates/api/src/lib.rs:1075-1097` **[Verified in source]**, verbatim comment:
"Browser API clients supply their own tokens. Keep public API CORS open for third-party clients, while
admin browser access remains limited to configured origins." `build_cors_layer`: for any path not
starting with `/v1/admin` the origin predicate `return true`, `allow_methods(Any)`,
`allow_headers(mirror_request())`, `expose_headers(Any)`. `CORS_ALLOWED_ORIGINS` is parsed into exact
matches and wildcard suffixes for admin only. **Docs.near.ai does not describe any CORS policy**
[Verified by absence] — the behaviour lives in the server source.

So Mode A (direct, bring-your-own key) is **not** blocked by CORS as far as source reading goes, and
T-13 is **not** cut — but S-06's live browser test still has to happen (needs a key).

Independently, `nearai/inference-sdk` `js/README.md` states the browser limitation we already assumed
in ARCH §10: "Browser Fetch does not expose the TLS peer certificate, so the browser client cannot
perform the attested TLS identity check provided by the Node entry point. Standard HTTPS certificate
validation still applies." **[Verified]** — this confirms rule 2 of AGENTS.md §4 against the vendor's
own documentation.

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

1. Whether E2EE from a **browser** actually works end to end with a live enclave. The protocol is
   documented; no browser path is. **Sets the privacy claim.** (S-01)
2. Which TEE models are live and callable today, their latency and price per page, and how badly the
   vision model misreads **numbers on bad photos**. (S-02, S-03, S-09)
3. A live browser CORS preflight against `cloud-api.near.ai`, despite the permissive source. (S-06)
4. Whether the vision model we choose has a direct-completions slug. (S-07)
5. Host request-size and execution-time limits for a 5-page upload on the plan we deploy to. (S-08)
6. The `$10` credit claim, and whether `spendLimit` is reachable on the account type we will have.
7. Intel TDX collateral fetch mechanics, delegated to `dcap-qvl-node` by the verifier.

Every one of 1–6 needs an API key. **Blocker B-05 is now the only hard external blocker on the trust
half of this project**; the paste-text demo, the claims ladder, grounding, the UI and the accessibility
work do not need it and are being built now.
