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
(§3), a response signature verified against an attested key (§5), a live CORS preflight (§6) and the
**browser round trip that preflight stood in for** (§6, second measured block), first
latency and cost numbers (§4, §1 of the measurement notes), and — on 2026-11-05 — the **inside of the
TDX quote**, which opened with arithmetic and `@noble/hashes` alone (§3's third measured block). What it
did **not** settle, and the reading should not be mistaken for it: E2EE from a browser (a dependency
decision, T-10/B-06), Intel's **signature** over those quote bytes and the collateral that says whether
a platform is still trusted (T-03, and `dcap-qvl-node` is not installed), and accuracy on bad
photographs (S-03 needs the golden set run against a live model).

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
- `Phala-Network/dcap-qvl`, `src/quote.rs` (the `TDReport10` layout that `@phala/dcap-qvl-node` — the
  package NEAR's verifier calls — decodes; read 2026-11-05 to index a quote without adding the
  dependency)
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
| `usage` details | `prompt_tokens_details.image_tokens` appears on an image request (64 tokens for a 1×1 PNG on `Qwen/Qwen3.8-27B`, 16 on `z-ai/glm-5.3-flash`; **2,494** for a C-01-prepared 1200×1600 page of the chosen model — §4), `cached_tokens: 0`. **An input image is billed as prompt tokens**; `costPerImage` is 0 for every text-output model and nonzero only for image-*generating* ones. The envelope schema does not carry `usage` at all — the cost line in the spike reads it off the raw JSON (follow-up for S-09 and the README's cost figure). |
| `message.content` on a truncated answer | **[Measured 2026-11-04] `null`, not `""`.** A page request with a 256-token budget came back `content: null`, `reasoning_content: <string>`, `finish_reason: "length"` — the budget went entirely to reasoning, which this service returns in a field the documented message shape does not name. `completionEnvelopeSchema` required `content: z.string()` and rejected it. **Closed the same day by P-13**: `content` is nullable, `contentOf` folds `null` to the empty string so "no answer" stays one rule in the caller, and the *key* stays required (nullable is not optional) — the identical live reply now parses and is read as a truncation, which is `npm run spike -- --stage=image` exiting 0 where it had exited 1. |
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

## 3. Attestation report — [Verified] shapes, [Measured 2026-11-03/05] model inner fields

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
  · `nvidia_payload`(**98,222 hex = 49,111 bytes** — *misread; corrected 2026-11-05: 98,222 characters of* **JSON**, not hex, so its byte count is 98,222 and not half of it. The line above counted characters and then assumed hex because every neighbour on that list was hex.) · `event_log`(**array of 30–32 objects**, 5 keys
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

### [Measured] 2026-11-05 — T-08: two reports recorded to disk, and what a report does not say

`npm run fixtures:record -- --attestation --confirm`, one run at **2026-11-05 00:27:08 UTC**, both
calls free (report retrieval is non-billable, §5). Both now live in `fixtures/attestation/`, one per
model this app actually asks of the service — because the app attests **per model** (`fetchReport`
sends `model` in the query), so a fixture for one deployment cannot stand in for the other:

| File | Live bytes | Stored bytes | ms | `bindReport` |
|---|---|---|---|---|
| `good-z-ai-glm-5.3-flash.json` | 318,885 | 90,457 | 1,845 | 4/4 → `verified` |
| `good-Qwen-Qwen3.8-27B.json` | 269,710 | 87,977 | 419 | 4/4 → `verified` |

`_meta.reportSha256` covers the **live** response (`a17b31b0…`, `4a4ad03a…`); the file on disk is
smaller because five paths were dropped before writing, each declared in `_meta.redacted` with its
own byte count and sha256. Those are the things this run settled:

- **Report size is not a stable quantity.** The same model returned 162,856 bytes on an earlier call
  and 318,885 here; §3's 2026-11-03 figure was 265,925. The event log grows, so nothing may treat a
  byte count as a fixture identity — `C-13`'s ADR-31 hash-matched *responses* are stable because the
  service signs them, a report is not.
- **The two models are two enclaves.** Different `signing_public_key` (`5a0210f2…` / `89154a43…`),
  different `info.tcb_info.rtmr3` (`b6efde77…` / `b0dfe156…`), different `event_log` length (32 / 30
  entries) — while `gateway_attestation` is byte-identical between them. So "the deployment" is a
  per-model fact, exactly as **ADR-24** decided for the request side.
- **The redaction loses no verifiability, and that is measurable.** `SHA-256(app_compose) ===
  info.compose_hash` for all four compose bodies in both files (model `a0e3c6f4…`, gateway
  `c579aade…` — the gateway one identical across both reports). The dropped bodies were NEAR's own
  `docker compose` file (18,212 B / 37,799 B, 448 lines with `${VAR}` token names, `INSTANCE_LABEL=gpu03`,
  `cvm3.near.ai`), the compose-manager launch log (87,029 B / 39,904 B), the per-GPU evidence
  (`nvidia_payload`, 98,222 B) and `gateway_attestation.vpc` (121 B — `cloud-api-prod-*.dstack.internal`).
  The first two are NEAR's infrastructure, not the app's inputs; the third is the only place the GPU
  facts live, which T-03 cannot read without **B-12** anyway; the fourth is an internal hostname.
  `info.compose_hash` survives, so a future verifier can still check that a compose file hashes to
  what the report claims — it just cannot check *which* file. That limit is stated here rather than
  discovered later.
- **`nvidia_payload` is a JSON string, not hex** (correcting the line above): 98,222 characters,
  `{"nonce":…,"evidence_list":[…],"arch":"HOPPER"}`, 8 per-GPU entries each carrying a base64 PEM
  chain, and every entry echoing the nonce we sent.
- **The nonce is echoed four times, not once**: `model_attestations[0].request_nonce`,
  `gateway_attestation.request_nonce`, `compose_manager_attestation.nonce` (with `nonce_source:
  "client"` and its own 64-byte `report_data`), and inside `nvidia_payload` at the top level and per
  device. `bindReport` compares the first only — which is correct for binding, but a future
  "the nonce is bound everywhere" claim would be true of the service and false of this code.
- **`device_id` is a placeholder in all four places** (model and gateway, `info` and `info.tcb_info`),
  holding exactly `SHA-256("")` (`e3b0c442…b855`). A check written as "does the report name a device?"
  passes on a report carrying no device identity. This is what T-01's NRAS todo is actually waiting
  for, and it is a *content* gap, not only the dependency gap.
- **`info.app_cert` is a demo certificate.** 10,756-character PEM; Node's `X509Certificate` reads
  subject `CN=demo-cert`, issuer `O=Dstack; CN=Dstack App CA`, valid 1975 → **2036**. So "the app
  certificate is within its validity window" is a check that passes today on a certificate naming
  nothing. Recorded in `_meta.appCerts` so no receipt can imply otherwise.
- **There is no plaintext expiry anywhere.** The scan (`timeFields`, capped at 80 lines, both files
  fill it) found time-shaped keys only in the compose action log — 226 and 82 actions, newest
  2026-11-04T04:14Z and 2026-11-04T19:33Z, i.e. ~5–20 h *before* the fetch — plus the nonces and
  `tcb_info` objects. No `issuedAt`, no `exp`. So **T-08's `expired` case is not a fixture**: it is
  the good report, unchanged, and the finding is that the browser half cannot tell. The real windows
  are inside `intel_quote` and `nvidia_payload`, which is **B-12**'s to open.
- **`info` survives the production schema as exactly `['tcb_info']`**, and after our own redaction
  `tcb_info` parses down to `{}` — the quote, the measurements and the compose hash are all *outside*
  what `bindReport` is handed. Pinned by a test, so widening the schema is a decision.

**What is still not decided by any of this, and is now the sharpest line in the repo:** `/api/verify`
is T-03's 501, `createTrustSession` ANDs the local binding with it, so **every case in
`fixtures/attestation/` — including `good` — ends the gate at `failed`.** The tests assert that too,
against a service that echoes the session nonce correctly: four local passes, one loud failure,
nothing sent. `verified` from `bindReport` means "these bytes are well-shaped and bound to our
nonce", never "an enclave was verified" (**ADR-22**'s distinction, now with a live report behind it).

### [Measured] 2026-11-05 — the quote opens with no new dependency, and NRAS answers on the first ask

The claim this run tested was B-12's premise: that T-03's checks are unreachable without
`dcap-qvl-node`. They are not — **eight of them are byte reading and SHA-384**, and `@noble/hashes` is
already in `package.json`. `npm run spike -- --stage=attestation` now runs
`checkQuote` (`src/lib/near-ai/quote.ts`) through the production schema on whatever the service returns:

| Call | HTTP | ms | Live bytes | Quote | `event_log` | `bindReport` | `checkQuote` |
|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | 200 | 1,697 | 308,101 | 10,012 hex chars = **5,006 B** | 35 entries | 4/4 | **8/8** |
| `Qwen/Qwen3.8-27B` | 200 | 2,379 | 162,852 | 5,006 B | 30 entries | 4/4 | **8/8** |

- **The layout is `TDReport10`, and it is not a guess.** Transcribed from
  `Phala-Network/dcap-qvl/src/quote.rs` — the struct `nearai-cloud-verifier` obtains from
  `@phala/dcap-qvl-node`, so the same one NEAR's verifier reads: a **48-byte header and then the
  584-byte report, with no `body_size` prefix** (that prefix belongs to version 5; reading it here put
  every field four bytes out). Quote-absolute offsets, all six quotes (four in the recorded fixtures,
  two live today) agreeing at every one: `tee_tcb_svn` 48, `mr_seam` 64, `mr_signer_seam` 112,
  `seam_attributes` 160, `td_attributes` 168, `xfam` 176, `mr_td` 184, `mr_config_id` 232, `mr_owner`
  280, `mr_owner_config` 328, `rt_mr0..3` 376 / 424 / 472 / 520, `report_data` 568. Header says
  version 4, `attestation_key_type` 2, `tee_type` 0x81.
- **What the bytes say, per quote:** `td_attributes` is `0000001000000000` — SEPT_VE_DISABLE, **debug
  bit clear**, no Intel-reserved MBZ bit set. `report_data[0..32]` equals `signing_public_key` for a
  model attestation (and equals `signing_address` for the gateway, which publishes no
  `signing_public_key`), `report_data[32..64]` equals the raw request nonce we minted. `mr_config_id`
  is `0x01 ‖ compose_hash(32 B) ‖ 15 zero bytes` — so the compose-binding check **survives our own
  redaction**, because `info.compose_hash` is kept even though `app_compose` was dropped. `mr_td` and
  `rt_mr0..3` equal `info.tcb_info.mrtd/rtmr0..3`, which is the self-check that makes a wrong layout
  impossible to miss.
- **`event_log` replays registers 0, 1 and 2, and not 3.** `acc = SHA-384(acc ‖ digest)` in log order
  from 48 zero bytes reproduces `rt_mr0..2` exactly on every quote measured (13 / 5 / 2 events for the
  recorded glm log; 35 and 30 events live). **RTMR3 does not reproduce**: dstack logs its boot events
  with the meaning in `event_payload` and an *empty* `digest`, so there is nothing to extend, and
  eighteen uniform framings of `event`/`event_payload` (hashed, concatenated, length-prefixed, padded)
  all failed on both recorded files. That contradicts the documented procedure (§3 above, step
  "replay IMR-3 entries … match `rt_mr3`"), so it is recorded as a **measured correction**: the check
  ships named `event_log_replays_rtmr0_to_2` and its receipt line says register 3 was not reproduced.
  Nothing may claim an RTMR3 replay until somebody finds the framing dstack actually used.
- **The service does write our nonce into the quote, not only into the JSON.** `quote_binds_our_nonce`
  passes on both live reports with the fresh nonce the script minted seconds earlier. So the
  cooperative-service model in T-08's tests (`livingClient`, which used to rewrite only
  `request_nonce`) was *less* cooperative than the real service: a service that echoes the field has to
  re-run the attestation to do it, and a report that echoes the field while the quote still carries the
  old number is a lie this build can now see.
- **NRAS answers, free, with no dependency.** `npm run spike -- --stage=gpu` posts
  `JSON.parse(nvidia_payload)` to `https://nras.attestation.nvidia.com/v3/attest/gpu` with
  `content-type`/`accept: application/json` and no auth header. Live: **HTTP 200 in 1,608 ms, 17,220
  bytes**, response shaped `[["JWT", "…"], …]` exactly as §3's doc reading said, and the
  `x-nvidia-overall-att-result` claim in `body[0][1]`'s payload is **`true`** with `x-nvidia-ver`
  `2.0`. One correction to the doc reading: that JWT carries **no `x-nvidia-eat-nonce` claim**, so the
  nonce comparison has to be made against `nvidia_payload.nonce` (top level, `{nonce, evidence_list,
  arch}` — 98,222 chars, matching ours on both live reports), not against a nonce claim in the answer.
  Nothing from the payload or the answer is printed or stored; a GPU's serial and measurements live in
  there.
- **What `dcap-qvl-node` is therefore still buying, and nothing else:** Intel's signature over the
  quote (its code path is `js_get_collateral("https://api.trustedservices.intel.com/tdx/certification/v4",
  quote)` then `js_verify(quote, collateral, now)`), and TCB/collateral freshness — i.e. checks 1 and 2
  of `QUOTE_CHECKS_THAT_CANNOT_RUN`. The GPU verdict and the debug-bit abort are **not** in that set;
  they need no dependency, and the debug bit is now gated in the browser regardless.
- **Cost of all of this: two free report calls and one POST to NVIDIA.** The production schema had to
  widen — `info.tcb_info`'s measurements and `info.compose_hash` used to be *stripped* by
  `modelAttestationSchema`, so `checkQuote` had nothing to compare the quote against (8 failing tests
  were the finding). The widening is pinned by name in `attestation-fixtures.test.ts`, and the fields
  that stayed stripped are listed there too: `app_cert`, `instance_id`, `app_id`, `mr_aggregated`,
  `key_provider_info`, `vm_config`. **The bullet above saying `info` survives as `['tcb_info']` and
  `tcb_info` parses to `{}` is superseded by that line** — it was true until this commit.

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

### [Measured] 2026-11-04 — S-09's per-page figure, and the first image exchange signed

`npm run spike -- --stage=image` (a fourth stage in `scripts/spike.ts`). One **synthetic** A4 page is
drawn in Chromium at 3024×4032 — the resolution a phone gives when the page fills the frame — prepared
by **the real `lib/image/prepare.ts`** (C-01, bundled and run in the page exactly as
`tests/e2e/image-prepare.spec.ts` runs it), then posted as an `image_url` part through `NearClient`. The
probe asks for a line count rather than a transcription, because the number S-09 needs is the **input**
half and that half does not depend on the instruction.

| | JPEG bytes | request body | geometry | `prompt_tokens` | of which `image_tokens` | input half | whole exchange |
|---|---|---|---|---|---|---|---|
| prepared by C-01 (what Sightline sends) | 108,795 | 145,382 | 1200×1600 | **2,536** | **2,494** | **$0.00020288 / page** | $0.00033088 |
| as the phone gave it | 380,169 | 507,214 | 3024×4032 | **7,973** | **7,931** | $0.00063784 / page | $0.00076584 |

at the catalog's own 80/500 nano-USD per in/out token, read from `GET /v1/model/{model_name}`.

- **C-01 pays for itself in tokens, not only in bytes:** 68.2% fewer prompt tokens and 361,832 fewer
  bytes of body per page. Tokens do not track pixels — 6.3× the pixels cost 3.2× the image tokens,
  because the vision encoder tiles the image rather than reading it pixel by pixel. The prepared page
  still costs 2,494 tokens, so a five-page document is ~12.7 K input tokens before any of its text.
- **The 5-page body is ~0.69 MiB** (726,910 bytes at the prepared size). F-05's cap is `MAX_BODY_BYTES`
  = 8 MiB, so **size is not the binding constraint on the five-page case** — which narrows S-08's open
  question to execution *time*, where §4's held-open connections already point.
- **A page takes seconds, not the 1.83 s of the 1×1 probe:** 4.7 s prepared, 6.0 s unprepared, both on a
  256-token budget that was fully consumed. C-02's per-10-second announcements (T-13) and any timeout
  should be sized for single-digit seconds *per page*.
- **The first `provider_tee` signature over an image exchange:** `kind provider_tee`, `verified=true`
  against `model_attestations[0]` over the exact bytes sent and received. ADR-19's hash-over-wire-bytes
  holds for a body carrying a 145 KB data URL, not only for the short text probe.
- **`content` can be `null`, and our schema says it cannot be.** Both replies came back as
  `message: {role, content: null, reasoning_content: <string>}` with `finish_reason: "length"` — the
  model spent the entire budget on reasoning, which this service returns in a field our schema does not
  name, and left the answer empty. `completionEnvelopeSchema` requires `content: z.string()`, so **the
  app would have thrown `invalid_model_output` at a truncated page** and reported a transport failure
  for what is actually "no answer arrived". Filed as **P-13**, and **P-13 closed it the same day**: the
  schema now reads `content` as nullable — the key stays required, because nullable is not optional, and
  a message with no `content` at all is still a transport failure — `contentOf` folds `null` to the empty
  string so "no answer" remains one rule in the caller, and the existing `finish_reason: length` branch
  (P-08) is what a person reaches. Re-running this stage after the change exits **0** and prints
  `envelope accepted · content 0 chars · truncated: yes` for both pages, with the same token counts and
  the same verified `provider_tee` signature. What was *not* done to get there: no check was relaxed to
  make a test pass (AGENTS.md §5) — the schema was corrected to what the wire carries.
- Still open, and this stage cannot close it: the **output half** of the per-page figure — a real
  transcription's completion tokens with its reasoning — comes from S-03's golden-set run. What is
  measured now is the input half, plus the same finding as the text exchange above with a page in front
  of it: reasoning, not the answer, dominates the budget.
  *(Closed the same day by **C-03** — see the block below: the stage now sends the app's own
  transcription request, and its output half is measured. What remains with the golden set is whether
  the transcription is* correct*, which no token count answers.)*

### [Measured] 2026-11-04 — C-03's own request answers, and the answer passes the schema

The same stage, run again (`npm run spike -- --stage=image`, exit **0**) after `features/capture/transcribe.ts`
existed, so the third request in the output is **the body `readCompletion` builds**: `TRANSCRIBE_SYSTEM_PROMPT`
as the system message, `Transcribe this page.` plus an `image_url` part as the user message,
`max_tokens: 8192`, and **no `stream` key** because ADR-22 says the app does not stream. The page itself
changed too: the first run drew grey bars as "text", which is fine for pricing a page and useless for
asking a model to transcribe one, so it now draws legible synthetic lines (an invented trust name, an
invented `NC-0000-SYN` reference, 28 `Line nn … GBP 00n.00` items) at a **0.011 rad tilt**. Still
synthetic, still nobody's letter.

| request | JPEG | body | reply | `prompt_tokens` | `image_tokens` | completion (of which reasoning) | cost | time |
|---|---|---|---|---|---|---|---|---|
| line count, prepared | 203,434 | 271,570 | 1,032 | 2,536 | 2,494 | 224 (222) | $0.00031488 | 5.01 s |
| line count, unprepared | 866,763 | 1,156,006 | 1,179 | 7,973 | 7,931 | **256 (257) — truncated, `content: null`** | $0.00076584 | 5.96 s |
| **C-03's transcription request** | 203,434 | 272,736 | 5,559 | **2,810** | **2,494** | **1,492 (1,008)** | **$0.00097080** | **25.77 s** |

- **The photo path's request shape is now measured, not inferred.** HTTP 200, `finish_reason: stop`, and
  `transcribeSchema` **ACCEPTED**: `text 1,181 chars · uncertain 0 span(s) · captureIssues rotated ·
  pageLabel absent`. Every field in §9's contract is reachable on a real reply, not merely tolerated —
  and the two empty ones are empty *correctly*: the drawn page has no illegible span and no printed page
  label. The `image_url` multipart form, the `data:` URL from `toDataUrl`, and a request with no `stream`
  field all behave.
- **`captureIssues` fired on a tilt of 0.63°, which is C-04's problem, not C-03's.** The model reported
  `rotated` for a page that is upright and slightly crooked — the exact thing a hand-held phone shot
  always is (PRD §10 risk 6). So the enum vocabulary works, and a retake loop that treats `rotated` as
  "take it again" would nag on nearly every photograph. C-04 must decide what a reported tilt *costs*
  the person; the answer is not in this file.
- **The output half, which the block above left open:** a real page costs **1,492 completion tokens,
  1,008 of them reasoning**, so two thirds of the answer's cost is the model thinking before it answers.
  At the catalog's 80/500 nano-USD that is **$0.00097 per page**, and a five-page document is ~$0.0049 —
  against ADR-23's 8,192-token ceiling, this page used 18% of it.
- **A page transcription takes 25.8 s, five times the line-count probe.** Whatever §12's progress
  announcements and any per-page timeout are set to, they are sized for ~26 s per page and ~2 minutes
  for a five-page document on this model, not for the 1.83 s the 1×1 probe showed. This is the strongest
  argument in the repo for announcing progress rather than showing a spinner.
- **Image tokens are geometry, not content:** two prepared pages at 1200×1600 — one of grey bars at
  108,795 bytes, one of glyphs at 203,434 — both billed **2,494**. So C-01's byte ladder buys nothing on
  the token line; only the long edge does. The byte budget still matters for the relay cap and for
  upload time, and that is what it was always for.
- **P-13's condition reproduced**, not invented: the unprepared 256-token probe again spent the whole
  budget on reasoning and returned `content: null` with `finish_reason: "length"`, and the schema — after
  P-13 — reads it as a truncation instead of a broken service. On a 256-token budget roughly every other
  page lands there; on 8,192 this page did not come close.
- **The first app-shaped image exchange that verifies:** `kind provider_tee`, `verified=true` against
  `model_attestations[0]` over the exact 272,736 bytes sent and 5,559 received; the gateway key does not
  verify it, which is the distinction ADR-22 keeps. Mode B's relay is still the untested half (**B-12**,
  and the fact that no live mode has ever sent a document from the app).

### [Measured] 2026-11-04 — the structure step answers, and it is the step the app cannot read

`npm run spike -- --stage=document` is the second half of **S-09**: everything priced so far was a
probe prompt or a page, and a document's reading costs **two** kinds of call — one transcription per
page and **one structure step over the assembled transcript**. The stage sends the body
`readCompletion` builds for `purpose: 'analyse'` (`STRUCTURE_SYSTEM_PROMPT` +
`structureUserPrompt(transcript)`, no `max_tokens`, no `stream`), over the synthetic invoice
`--stage=image` draws, at one page (1,321 chars) and five pages (5,689 chars), against **both**
allowlisted models. **Ten exchanges in the table: two on the chosen model before the prompt fix, eight
after it (four per model).** The stage exits 1 while a model's replies are unusable and 0 when they are
read — a stage that reported success on the first six of these would be reporting a lie. This is the
first time this repo's second request has ever been put to the live service.

| model | prompt | exchange | time | prompt tok | completion (reasoning) | cost | `analysisSchema` |
|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | before the prompt fix | 1 page | 130.3 s | 752 | 7,571 (5,495) | $0.00384566 | **REJECTED** — `facts[].kind` |
| `z-ai/glm-5.3-flash` | before the prompt fix | 5 pages | 122.2 s | 2,503 | 6,330 (5,418) | $0.00336524 | **REJECTED** — `facts[].kind` |
| `z-ai/glm-5.3-flash` | after | 1 page | 56.9 s | 803 | 3,636 (1,558) | $0.00188224 | **REJECTED** — not JSON |
| `z-ai/glm-5.3-flash` | after | 5 pages | 28.1 s | 2,554 | 1,591 (944) | $0.00099982 | **REJECTED** — not JSON |
| `z-ai/glm-5.3-flash` | after | 1 page | 27.0 s | 803 | 1,264 (606) | $0.00069624 | **REJECTED** — ``` fence |
| `z-ai/glm-5.3-flash` | after | 5 pages | 42.8 s | 2,554 | 2,158 (1,527) | $0.00128332 | **REJECTED** — ``` fence |
| `Qwen/Qwen3.8-27B` | after | 1 page | 44.7 s | 961 | 2,666 (2,136) | $0.00363754 | **ACCEPTED** · facts 4/4 grounded |
| `Qwen/Qwen3.8-27B` | after | 5 pages | 71.0 s | 3,089 | 4,052 (3,423) | $0.00559376 | **ACCEPTED** · facts 5/5 grounded |
| `Qwen/Qwen3.8-27B` | after | 1 page | 52.7 s | 961 | 3,412 (2,805) | $0.00464464 | **ACCEPTED** · facts 5/5 grounded |
| `Qwen/Qwen3.8-27B` | after | 5 pages | 65.1 s | 3,089 | 4,480 (3,787) | $0.00617156 | **ACCEPTED** · facts 6/6 grounded |

- **The defect this found is in our prompt, not in the service: `STRUCTURE_SYSTEM_PROMPT` asked for
  `"facts": [{"kind": string, …}]` while `factKindSchema` accepts eight fixed values.** Both
  pre-fix replies came back as well-formed JSON whose `kind` words were none of the eight, so in
  live mode the app would have spent its repair retry (**P-08**) and then shown the transcript-only
  screen (**P-11**) for a document the model had read correctly — the same class of bug C-03 fixed
  the same morning on the transcription side, and the same fix: spell the enum in the template.
  `tests/unit/pipeline.test.ts` now holds the two vocabularies against each other, and dropping any
  value from either side fails exactly that test.
- **`z-ai/glm-5.3-flash` does not answer this request in a form the app can read.** Four post-fix
  exchanges: two returned content that is not JSON at all, two returned valid JSON inside a
  ``` fence (measured by the first character and the presence of the fence, never by printing the
  reply — rule 7). The fence is a formatting habit, not a wrong answer, but the app parses with a
  plain `JSON.parse`, so a habit is a failure. **Six of six structure-step exchanges on this model
  were unusable.** Its page transcriptions are fine (§4) — a model that follows one contract need
  not follow another.
- **`Qwen/Qwen3.8-27B` answered four of four in the exact shape, and every fact it returned quotes
  the transcript back** (4/4, 5/5, 5/5, 6/6, plus 2/2 actions each time) with `docType: bill` matching
  what the synthetic document is. **Grounding here means "consistent with our transcript", never
  "correct against the page"** (AGENTS.md §4 rule 8): counting misreads is **S-03**, against an
  expected-facts file. What this row does establish is that the format contract is reachable, and by
  which model.
- **Every one of the ten carries `signature_kind: provider_tee`,** verified against
  `model_attestations[0]`, over the exact bytes sent and received, and none verifies against the
  gateway key — ADR-22's distinction holds for the text path as it does for the image path. The stage
  fetches and checks the signature for every exchange that returns an envelope, whatever the schema
  verdict (`scripts/spike.ts:934-939`), so a reply the app cannot read is still a reply the enclave
  signed. `GET /v1/signature/{chat_id}` took 264–362 ms.
- **The per-document figure S-09 asked for, with both halves now measured.** A five-page photo
  document is 5 × 970,800 nano of transcription + one structure step, and the only model that answers
  the structure step readably costs 5,593,760–6,171,560 nano, so **≈$0.0107 per five-page document**
  (**≈$0.0021 per page**) and **≈197 s of model time** — 129 s of transcription, ~68 s of structuring.
  A pasted document of the same length is the structure step alone: **$0.0059 and ~68 s**. The chosen
  vision model is cheaper ($0.0011 for the same step) and unusable, which is the trade, stated.
- **`max_tokens` on a text request is a live cost exposure, not a tuning knob.** Qwen's largest
  structure completion here was 4,480 tokens against that model's documented 65,536 ceiling — and the
  text path sends no budget at all, so the service default caps nothing. ADR-23's argument (a
  reasoning model must be given room for the thinking *and* the answer, and the ceiling is what makes
  a cost predictable) applies to this step identically. **No decision is recorded yet:** which model
  answers which step, and what budget the text requests carry, is **ADR-24** and it is open — the
  §10 entry for this run lists it as the follow-up, and `docs/ARCHITECTURE.md` §17 does not carry the
  record until it is made.
- **Still not measured:** the Q&A step's shape on a real transcript (`ask.ts`, same class of risk),
  Mode B's relay for any of it (**B-12**), and whether any of this holds on a document that is not a
  bill (S-03's set is where that gets counted).

### [Measured] 2026-11-04 — ADR-24's plan put to the service, and the answers it throws away are ours to fix

The block above ended with two things undecided. Both are decided now, and the run that decided them
is this one: `npm run spike -- --stage=document` with **`max_tokens` on the text body** (so §13's
truncation case is reachable and priced on this path) and **the app's one repair retry made for real**
(the stage now re-sends exactly what `readCompletion` would send on an unreadable reply — the fenced
`REPAIR_NOTE` appended to the *user* text, system prompt byte-identical). Seven exchanges, one model per
plan row: three on `Qwen/Qwen3.8-27B` (`STEP_PLANS.analyse.model`, the default this stage now runs) and
four on `z-ai/glm-5.3-flash` (`--model=` forced, to ask whether the retry rescues the model §4 measured
at 0 of 6). Both runs exit 1, which is the stage's rule: **any** unreadable reply makes it non-zero, so
the exit code below is not a claim that nothing was read — the Qwen run's five-page answer was accepted
whole and it still exits 1, because two of its three replies were thrown away.

| model | request | exchange | time | prompt tok | completion (reasoning) | % of 8,192 | cost | `analysisSchema` |
|---|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | ask | 1 page | 18.9 s | 803 | 1,210 (619) | 14.8% | $0.00066924 | **REJECTED** — ``` fence |
| `z-ai/glm-5.3-flash` | repair | 1 page | 68.5 s | 842 | 4,325 (2,376) | 52.8% | $0.00222986 | **REJECTED** — `actions[1].deadline` |
| `z-ai/glm-5.3-flash` | ask | 5 pages | 26.7 s | 2,554 | 1,915 (1,182) | 23.4% | $0.00116182 | **REJECTED** — ``` fence |
| `z-ai/glm-5.3-flash` | repair | 5 pages | 18.0 s | 2,593 | 1,316 (812) | 16.1% | $0.00086544 | **REJECTED** — `actions[1].deadline` |
| `Qwen/Qwen3.8-27B` | ask | 1 page | 129.5 s | 961 | **8,047 (5,469)** | **98.2%** | $0.01090189 | **REJECTED** — `actions[1].deadline` |
| `Qwen/Qwen3.8-27B` | repair | 1 page | 128.2 s | 1,001 | 6,320 (3,846) | 77.1% | $0.00857204 | **REJECTED** — `actions[1].deadline` |
| `Qwen/Qwen3.8-27B` | ask | 5 pages | 106.9 s | 3,089 | 4,628 (3,941) | 56.5% | $0.00637136 | **ACCEPTED** · facts 5/5, actions 2/2, warnings 2 |

- **Six of the seven replies were rejected for one field, and the field is ours, not the models'.**
  Every attempt that reached a JSON object — four of four on glm's repairs, three of three on Qwen's
  asks and repairs that parsed — said `"deadline": null` for an action with no deadline, and
  `analysisSchema` had `deadline: z.string().optional()`, which accepts a missing key and rejects
  `null`. The prompt says "Omit fields that are absent"; six replies that obeyed it in the models'
  usual way were each worth a repair retry and then the transcript-only screen (**P-08** → **P-11**),
  for a document both models had read correctly. **Fixed in this commit**: `null` on an optional
  string now reads as absent in `analysisSchema` (`sender`, `actions[].deadline`), `qaSchema`
  (`sourceQuote`) and `transcribeSchema` (`pageLabel`) — the three other `string?` fields this service
  is asked to fill, so the habit does not have to be measured three more times to be handled once. A
  `null` is the only extra value accepted: `42` and `""` are still rejected, and nothing about
  grounding, `quoteFound` or the confidence ban changes. Held by `tests/unit/schemas.test.ts` (5 cases)
  and by a pipeline test that runs the whole step on the measured reply shape.
- **The fence-aware repair note works, and that was the open question about ADR-24's fence decision.**
  glm fenced both first requests and produced a real object on both retries — so leaving a fence to the
  retry rather than stripping it is not a theory any more: it cost 18–68 s and $0.0009–$0.0022, and it
  got the JSON. Qwen fenced nothing in seven attempts across both days (glm: 4 of 10).
- **The number ADR-24 first wrote for the text budget was too small, and this run is why it changed.**
  It argued for 8,192 from "the largest structure completion so far was 4,480" — a one-sample inference.
  Qwen then answered a **one-page** transcript with **8,047 completion tokens, 5,469 of them reasoning,
  98.2% of that budget**, finishing on `stop` rather than `length` by the width of 145 tokens. A cap
  that a routine reply reaches is a trap: the next one arrives as `output_truncated` and the person
  loses a reading they were given. The text steps (`analyse`, `qa`) now send **16,384** — twice the
  largest text-step answer observed on either planned model, inside both ceilings (Qwen 65,536 output,
  glm 1,048,576), and a worst case of **$0.0221184** of output at 1,350 nano-USD a token. The page
  budget stays ADR-23's 8,192; its one measured completion used 18% of it. **No truncation occurred in
  any of these seven exchanges**, at either budget.
- **What the plan costs, end to end, with a real accepted answer.** A five-page photo document is 5 ×
  970,800 nano of transcription on the page model + one structure step: **$0.011225 and ≈236 s** as
  ADR-24 runs it (Qwen answers step 2), against **$0.005719 and ≈147 s** if glm answers it *and* the
  retry is spent. That supersedes the "$0.0107 / ≈197 s" line above as the current figure; the honest
  form is a range, **≈$0.006–$0.011 per five-page document and 147–236 s**, because the second step's
  price is now a model choice rather than a constant. For a blind user the 89 s difference matters more
  than the 55 cents will, which is the argument for revisiting the choice with a bigger sample — and
  **S-14** is that revisit, with the Q&A step measured in the same run.
- **Signatures hold on all seven,** `provider_tee` verified against `model_attestations[0]` over the
  exact bytes, none verifying against the gateway key (ADR-19, ADR-22). The accepted answer's signature
  fetch took 324 ms. The attestation report was re-fetched per model — the Qwen run binds to Qwen's
  attested key, not to the page model's (`scripts/spike.ts`, `stageModel`).
- **Still not measured:** the Q&A step's shape and its budget on a real transcript (**S-14**), whether
  16,384 is enough for a *dense* five-page transcript on Qwen (the sample here spent 56.5% of it), Mode
  B's relay for any of it (**B-12**), and any of this on a document that is not a bill (**S-03**).

### [Measured] 2026-11-04 — S-14: the Q&A step answers on *both* models, and the structure step's reason for choosing one does not carry over

**Twelve exchanges, four runs, `npm run spike` direct mode, all synthetic.** S-14's Done-when asks for
three things and this delivers all three: (a) the **Q&A** step put to the service on each planned model
over a real transcript, (b) the **structure** step re-measured on both models at the corrected 16,384
budget, (c) `STEP_PLANS.qa` confirmed or changed. `scripts/spike.ts` gains `stageQa`, which sends the body
`readCompletion` builds for `purpose: 'qa'` (`QA_SYSTEM_PROMPT` + `qaUserPrompt(transcript, question)`,
`max_tokens: 16384`, no `stream`) over the same five-page bill `--stage=document` structures (5,689 chars),
asks three questions — two the document answers, one it does not — and judges the reply with the app's own
`qaSchema` and `quoteFound`.

**The Q&A step.** Every row is an `ask`; no model needed a repair, because nothing was unreadable.

| model | question | time | prompt tok | completion (reasoning) | budget used | cost | `qaSchema` |
|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | amount and date | 3.43 s | 2,361 | 185 (127) | 1.1% | $0.00028138 | **ACCEPTED** · answer 44 ch · quote 60 ch grounds |
| `z-ai/glm-5.3-flash` | contact number | 1.88 s | 2,360 | 136 (65) | 0.8% | $0.00025680 | **ACCEPTED** · answer 84 ch · quote 78 ch grounds |
| `z-ai/glm-5.3-flash` | *not* in the document | 2.42 s | 2,361 | 138 (86) | 0.8% | $0.00025788 | **ACCEPTED** · answer 103 ch · `notInDocument: true` · quote 38 ch |
| `Qwen/Qwen3.8-27B` | amount and date | 15.57 s | 2,888 | 313 (244) | 1.9% | $0.00053807 | **ACCEPTED** · answer 44 ch · quote 60 ch grounds |
| `Qwen/Qwen3.8-27B` | contact number | 2.83 s | 2,887 | 168 (102) | 1.0% | $0.00034228 | **ACCEPTED** · answer 13 ch · quote 78 ch grounds |
| `Qwen/Qwen3.8-27B` | *not* in the document | 14.63 s | 2,888 | 178 (133) | 1.1% | $0.00035582 | **ACCEPTED** · answer 105 ch · `notInDocument: true` · quote **absent** |

**The structure step, both models, at the budget the app now sends.** Every row is an `ask` except the two
glm rows marked repair.

| model | page | attempt | time | prompt tok | completion (reasoning) | budget used | cost | `analysisSchema` |
|---|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | 1 page | ask | 81.4 s | 803 | 5,779 (3,837) | 35.3% | $0.00295374 | **REJECTED** — ``` fence, first char `` ` `` |
| `z-ai/glm-5.3-flash` | 1 page | repair | 28.3 s | 842 | 2,403 (840) | 14.7% | $0.00126886 | **ACCEPTED** · facts 32/32 grounded |
| `z-ai/glm-5.3-flash` | 5 pages | ask | 23.7 s | 2,554 | 1,628 (967) | 9.9% | $0.00101832 | **REJECTED** — ``` fence |
| `z-ai/glm-5.3-flash` | 5 pages | repair | 136.8 s | 2,593 | **8,872** (8,193) | 54.2% | $0.00464344 | **ACCEPTED** · facts 7/7 grounded |
| `Qwen/Qwen3.8-27B` | 1 page | ask | **226.6 s** | 961 | 8,037 (5,397) | 49.1% | $0.01088839 | **ACCEPTED** first try · facts 33/33 |
| `Qwen/Qwen3.8-27B` | 5 pages | ask | 118.6 s | 3,089 | 3,199 (2,591) | 19.5% | $0.00444221 | **ACCEPTED** first try · facts 5/5 |

- **The Q&A step is readable on both models, so the reason ADR-24 gave for putting it on Qwen is gone.**
  ADR-24 chose Qwen for `qa` *by inference* — "Qwen is the only model that has answered a strict-JSON
  over-the-transcript request here" — and §4 has now sent the Q&A request itself: **3 of 3 on glm, 3 of 3
  on Qwen, zero code fences, zero repairs.** The fence habit that decided the structure row is therefore a
  property of **the nested structure contract**, not of the model; a flat three-key contract does not
  trigger it. What still separates the two here is the two numbers ADR-24 could not see: **$0.000258 –
  $0.000281 a question and 8 s for three on glm**, against **$0.000342 – $0.000538 and 33 s on Qwen**,
  including one **15.6 s** answer. A person asks several questions in a session and waits on each one with
  nothing else on screen, so that tail is the number that matters for a step the batch steps can absorb.
  **`STEP_PLANS.qa.model` moves to `z-ai/glm-5.3-flash` (ADR-26)**, held by
  `tests/unit/model-allowlist.test.ts`. `planModelIds()` is unchanged — the structure step still needs
  Qwen, so a deployment still has to allowlist both ids.
- **ADR-25's fix is confirmed against the live service, which is the first time a fix here has been.** The
  block above this one is titled "the answers it throws away are ours to fix" because **six of six** replies
  that reached a JSON object died on `"deadline": null`. In this run **both** of glm's repairs and all four
  of Qwen's asks were **accepted**, and the accepted answers grounded fully (32/32, 7/7, 33/33, 5/5). The
  defect was ours, the fix was ours, and the re-measurement says it worked.
- **The 16,384 budget correction is now justified by a number that would have failed under the old one.**
  glm's five-page repair spent **8,872 completion tokens — 680 more than ADR-24's first proposed 8,192**.
  Under that cap the request would have ended `finish_reason: length`, `readCompletion` would have reported
  `output_truncated` and spent no repair, and the person would have been shown the transcript-only screen
  for a document the model had read correctly. Qwen's one-page ask independently reached **8,037 (98.1% of
  8,192)**, matching the 98.2% the previous run found. No truncation occurred in any of the twelve
  exchanges at 16,384; the largest was 54.2% of it.
- **`analyse` stays on Qwen, but for a corrected reason.** The previous block's trade was "**$0.005719 and
  ≈147 s** with glm answering step 2" against Qwen's $0.011225 — glm looked like half the price. That
  figure assumed one exchange; measured properly with the retry the app actually spends, a five-page
  document costs **$0.009296 / ≈247 s** on Qwen and **$0.009497 / ≈266 s** on glm (5 × 970,800 nano of
  transcription + the structure step, repair included). **The two models are now within 2% of each other on
  money and 7% on time**, so the price argument for glm is dead and what is left is that **Qwen got it right
  first time in 2 of 2 and glm needed its one rescue in 2 of 2** — a step that depends on the repair retry
  to work at all is a step with one bullet left. Qwen keeps the row.
  **(Corrected by C-11's measured pages, same day: that pair of totals counted only the attempt the
  answer arrived on, and `5 × 970,800` was one page extrapolated. The service bills a fenced ask — it is a
  completed HTTP 200 — so the glm column is ask $0.00101832 **plus** repair $0.00464344. On §4's own rows,
  with C-11's five measured pages as the transcription half, the same two plans are $0.00850621 / 260.2 s on
  Qwen against **$0.00972576 / 302.1 s** on glm: 14% dearer and 16% slower, not 2% and 7%. The price
  argument did not die — it reversed, and it now points at Qwen, which is the row already chosen.
  `scripts/spike.ts` counts every request a run makes for that reason, and its carried per-page figure is
  now C-11's mean (812,800 nano / 28,320 ms) rather than one page's 970,800 / 25,770.)**
- **The number of facts a document yields is not stable, and nothing in the app would notice.** One page
  (1,321 chars) produced **32** facts on glm and **33** on Qwen; five pages (5,689 chars — the same bill
  continued) produced **7** and **5**. Both models return **more facts for a shorter document**, by 4–5×,
  and every one of them quotes the transcript back, so `quoteFound` passes them all and no guard fires.
  A plausible reading is the models enumerating line items when the transcript is short and summarising
  when it is long. What the results screen does with a 33-fact list is an accessibility and copy question
  (**P-16**), and whether the *content* of those facts is right is **S-03** — this run measures shape and
  consistency with our transcript, never correctness against the page (AGENTS.md §4 rule 8).
- **Both models take the "not in this document" branch, in two different shapes that land the same screen.**
  On the question the bill does not answer, Qwen omitted `sourceQuote` and glm wrote a 38-character one
  alongside `notInDocument: true`. `groundAnswer` returns before it reads a quote on that branch
  (`features/qa/ask.ts:106`), so the person gets the same "the document does not answer this" either way —
  the shape differs and the outcome does not. Recorded because it is the second time this service has
  answered an optional-string field as though absent and present were interchangeable (**ADR-25**).
- **Signatures: 12 of 12.** Every exchange carries `signature_kind: provider_tee`, `signing_algo ed25519`,
  verified against `model_attestations[0]` over the exact bytes sent and received, and **none** verified
  against the gateway key (ADR-19, ADR-22). The attestation report was re-fetched per model (3.6–6.5 s for
  a 303,590-byte report), so each answer is checked against the key of the enclave that answered it.
  Signature fetches took 241–1,073 ms.
- **What a question costs, which is the figure the Ask panel and any rate limit are sized against.**
  **$0.000258–$0.000281** on the model the plan now uses, 1.88–3.43 s each. Ten follow-up questions on one
  document are **≈$0.0027** — the reading path's ≈$0.0085 (C-11's measured total, above) still dominates the bill, but on the *waiting*
  path a question is 15× quicker than a structure step, and that is the latency a person experiences as
  the app being responsive.
- **How the first of these runs came to be a structure-step run, stated because the evidence trail should
  say so.** The run launched as `--stage=qa` on 2026-11-04 at 09:08 UTC printed `== document —` and ran
  `stageDocument`: `main()`'s dispatch ended in a bare `else`, so a stage added to `Stage` fell through into
  the previous stage's function while still binding the report to the wrong model. The log was kept and is
  the **glm half of the structure table above** — it is a genuine measurement of what it ran, just not of
  what it was asked for. The fall-through is closed: `COMPLETION_STAGES` in `scripts/spike.ts` is a
  `Record` from stage to `{plan, run}`, so a missing key is a type error and no stage can reach another
  stage's code. The Q&A rows above are from the re-runs after that fix.
- **Still not measured:** whether any of these answers is **correct** against the page (**S-03**, needs the
  expected-facts file), `notInDocument` truthfulness (a model can be wrong to say "not here"), the Q&A step
  on a transcript from a *photograph* rather than a synthetic bill, Mode B's relay for any of it (**B-12**),
  and 16,384 against a genuinely dense five-page photo transcript — the synthetic bill here spent 54.2% of
  it at worst.

### [Measured] 2026-11-04 — C-11: five photographs become one transcript, and the offsets hold

`npm run spike -- --stage=pages` · exit **0** · `z-ai/glm-5.3-flash` at **8,192** (`STEP_PLANS.transcribe`) ·
the page is drawn in Chromium at 3024×4032, prepared by the real `lib/image/prepare.ts` (C-01), sent as
C-03's body **once per page**, and the five replies are handed to the app's own `assembleDocument`
(`features/capture/assemble.ts`) — this is the first stage in this file whose subject is *our* logic rather
than the service. Nothing document-derived is printed; lengths, offsets, counts and booleans only.

Five pages, 211,296–212,798 bytes prepared at 1200×1600 each:

| page | HTTP | model time | cost | `transcribeSchema` | its own text | reported |
|---|---|---|---|---|---|---|
| 1 | 200 | 31,562 ms | 847,300 nano = $0.00084730 | **accepted** | 1,163 chars | page label |
| 2 | 200 | 18,929 ms | 607,800 nano = $0.00060780 | **accepted** | 1,167 chars | page label |
| 3 | 200 | 30,164 ms | 914,300 nano = $0.00091430 | **accepted** | 1,223 chars | `rotated`, page label |
| 4 | 200 | 30,497 ms | 904,300 nano = $0.00090430 | **accepted** | 1,223 chars | page label |
| 5 | 200 | 30,448 ms | 790,300 nano = $0.00079030 | **accepted** | 1,223 chars | page label |

**5 of 5 accepted, 0 repairs needed, 5 of 5 signatures `provider_tee`** against `model_attestations[0]`, and
`0 uncertain spans` on every page.

- **The assembly, and the proof is the cut rather than the arithmetic.** Joined text **6,007 chars**,
  `pageOffsets [0, 1165, 2334, 3559, 4784]`, one capture issue (`rotated`, page 3), five page labels, `usable
  true`, `unplaceable spans 0`. The stage then cut the joined string at every offset for every page's own
  length and compared the pieces to the text each page reported: **"each page's region … is that page's own
  text: yes."** That is the property C-11 exists for — a joiner not counted gives a short region, a joiner
  counted twice gives an overlapping one, and both would still print a plausible total length.
- **The hole path on a truncation the service produced, not one asserted in a test.** Page 1 was re-asked
  with `max_tokens: 256` — the budget §1 already measured as too small for a reasoning model — and answered
  HTTP 200 in 9,321 ms with `finish_reason: length` and **0 characters of content** (P-13's shape again,
  $0.00035280). Assembled with ADR-27 that page becomes a marker in place: joined text **4,870 chars**,
  offsets **[0, 28, 1197, 2422, 3647]** (`28` = `[page 1 could not be read]` + the joiner), `missing
  1:output_truncated`, `labels 4` (page 1's own label left with its text), `usable true`, and the region cut
  still exact for all five. The document is readable with the hole in it, and the hole is where it belongs.
- **Per-page figures now have five samples, and they are cheaper and slower than the one-page number was.**
  **$0.00081280 and 28.3 s per page on average**, against §4's single measured page at $0.00097080 / 25.77 s.
  Five pages in series are **$0.00406400 and 141,600 ms** of model time, which replaces C-08's "≈2 minutes
  and ≈$0.0049" estimate with a measurement. **Provenance, stated because the raster changed in this same
  commit:** `drawPage` now prints `PAGE n OF N` and numbers its line items per page (five identical pages
  would let a shifted offset pass unnoticed — the string would be found in the joined text either way), so
  these five pages are not byte-identical to the one page §4 priced earlier. The spread here is 607,800 –
  914,300 nano, so a single page's price was never going to be the document's.
- **The whole-document figure moves, and this run is why.** Substituting the measured pages for §4's
  per-page extrapolation: five photographs **$0.00406400 / 141.6 s** plus the structure step as the plan runs
  it (**Qwen, five pages: $0.00444221 / 118.6 s**) is **$0.00850621 and ≈260 s** — against the
  **$0.009296 / ≈247 s** the S-14 block above computed from 5 × 970,800 nano. That earlier row is kept as
  what it was (an arithmetic extrapolation from one page) and is **superseded as the current figure**. If
  `analyse` were on the page model instead, the same document is **$0.00972576 and ≈302 s**, because the ask
  and its repair are both billed (23.7 s + 136.8 s) — which is the correction the S-14 block above carries:
  its "$0.009497, within 2%" glm column counted the accepted repair only, and a fenced ask is a completed
  request the service bills. Qwen's column needed no repair, so its figure was already the full one. A
  follow-up question is unchanged at **$0.000258–$0.000281**, so ten of them still add ≈$0.0027.

- **Every page label came off the paper, and nothing was reordered.** All five pages printed a label and all
  five were reported (`labels 5`), which is the first live material **C-05** can compare against capture
  position. The user message still names no page and no count, so the label cannot be our own sentence echoed
  back (C-03's reason, unchanged).
- **`rotated` on 1 of 5 pages**, for a page tilted 0.63°, makes it 2 of 6 measured pages and keeps **C-04**'s
  warning live: a retake loop that fires on `rotated` nags on most hand-held photographs.
- **What ADR-27 decided against.** Dropping a failed page quietly (the summary would describe four
  photographs as if they were five, and the missing page is where the unusual clause tends to be), halting the
  run on one failure (throwing away four pages and ≈113 s of the person's wait because one ≈28 s call went
  wrong), and keeping a truncated reply's partial text (there isn't one: `content` was **0 characters** here,
  which is the point P-13 already documented).
- **Still not measured, and one of these is a real gap in this run's own proof:** no page reported an
  `uncertain` span, so **the remapping and clamping path has still never processed a live span** — the 18
  unit tests in `tests/unit/assemble.test.ts` are the only thing holding it, and S-03's deliberately bad
  photos are the run that should produce some. The joined 6,007-character transcript was **not** sent to the
  structure step in this run, so §4's structure table still prices a typed-in bill rather than a photographed
  one (that is C-08's end-to-end half). Accuracy against the page is untouched (**S-03**). And
  `assembleDocument` has **no Mode F caller yet** — fixture mode has no photographed document to assemble
  until **C-02** builds the upload screen. *(Amended the same day, 2026-11-04 21:50 UTC: **C-02**'s screen
  is built and mounted on `/` (`tests/e2e/capture.spec.ts`, 19 tests, Chromium, no key), so the app now
  reaches `readPages` from a browser and `assembleDocument` has a caller in code. This sentence's own point
  stands: fixture mode still has nothing to assemble, because `transcribePage` refuses an image body
  (`no_fixture_for_input`) until **S-11** records page replies keyed by the prepared JPEG's hash — which is
  what the last of those 19 tests asserts, and no test in this repo claims a photographed document was read
  end to end.)* *(Closed 2026-11-05, item **C-13**, run recorded 2026-11-04 23:22 UTC — see the S-11 section
  below. Both halves of that sentence are now false, deliberately: the key is the file **as chosen** rather
  than the prepared JPEG's hash (**ADR-31**, for a reason measured in that section), and a photographed
  document **is** read end to end in Demo mode, proved by 6 browser tests in
  `tests/e2e/photo-fixtures.spec.ts`.)*

### `--stage=pages`, second run — the page-label check on live labels (**C-05**, measured 2026-11-04 19:30 UTC)

The same stage, re-run to put **C-05**'s label check against labels the service actually read. Five pages,
five requests, all accepted, **5 of 5 signatures `provider_tee`**, no repair:

| Page | HTTP | Time | Cost | Schema | Text | Reported |
|---|---|---|---|---|---|---|
| 1 | 200 | 16,386 ms | 806,300 nano = $0.00080630 | **accepted** | 1,165 chars | page label |
| 2 | 200 | 18,042 ms | 830,800 nano = $0.00083080 | **accepted** | 1,167 chars | page label |
| 3 | 200 | 18,726 ms | 837,800 nano = $0.00083780 | **accepted** | 1,167 chars | `rotated`, page label |
| 4 | 200 | 39,852 ms | 1,265,800 nano = $0.00126580 | **accepted** | 1,221 chars | page label |
| 5 | 200 | 23,679 ms | 922,800 nano = $0.00092280 | **accepted** | 1,223 chars | `rotated`, page label |

- **Five photographs of a five-page bill, all five margins labelled: `0 finding(s)`, and that is the
  result the check had to earn.** `5 of 5 reported label(s) read as a page number · compared against 5
  photograph(s)`. The previous run's numbers were proved by the cut; these are proved by the check saying
  nothing, which is the harder half — a gap-and-duplicate test that fires on a correctly photographed
  document is worse than no test, because the person retakes pages that were fine.
- **The hole case, live again:** page 1 re-asked at 256 tokens returned HTTP 200 with `finish_reason:
  length` and **0 characters** for the third time (5,397 ms, $0.00035280), and assembled it is
  `labels 4 · missing 1:output_truncated · usable true` with offsets `[0, 28, 1197, 2366, 3589]` and the
  region cut still exact. **C-05**'s check on that transcript: `0 finding(s) · 4 of 4 … compared against
  5 photograph(s)`. This is the case the item was written for — four labels against four answering pages
  would read "Page 1 of 5 is missing" and tell the person to go looking for a page they photographed and
  the service could not read. The count it compares against is `pageOffsets.length`, which ADR-27 keeps
  honest by giving a failed page a region of its own.
- **What is *not* measured here, stated because it is the half with the risk:** no live assembly produced a
  non-zero finding, so every positive case — duplicate, internal gap, a number too big for the set, two
  different counts — is held by the **23 unit tests** in `tests/unit/page-labels.test.ts` and by four
  mutations of the module (dropping the gap-range guard fails 3 of them; making a duplicate go undetected fails
  3; letting a bare four-digit number parse fails 1; letting a date through fails 1). A real mislabelled set of photographs is **S-03**'s run.
- **The per-page figures now have ten samples, and they move the mean.** These five pages cost
  **$0.00466350 in 116,685 ms**, so the two runs together average **$0.00087275 and 25,829 ms a page**
  (spread 607,800 – 1,265,800 nano). This run's five photographs plus the structure step as the plan runs it
  is **≈$0.00911 and ≈235 s** — using C-11's measured Qwen step ($0.00444221 / 118.6 s), which was priced over
  a transcript 56 characters longer than this one, so the money half of that sum is a carried figure rather
  than a second measurement. Against C-11's **$0.00850621 / ≈260 s** the honest form of the headline is a
  **range across two measured runs, ≈$0.0085–$0.0091 and ≈235–260 s**, not one number.
  `rotated` came off **2 of these 5 pages**, which makes it **4 of 11** measured pages: **C-04**'s nagging
  problem is now the majority case, not a risk.

### [Measured] 2026-11-04 23:22 UTC — **S-11**: the photographed document recorded, and Demo mode finishes it (**C-13**)

`npm run fixtures:record -- --confirm`. Not a spike stage: the recorder is a caller of the production
path (`createNearClient` → `readCompletion`'s own request builder → `fetchSignature` + `checkSignature`),
and it stores a reply only if that path accepted it. One attestation per answering model, a fresh nonce
per attestation, `bindReport` passing before any document byte was sent, and `die()` on any signature that
did not verify — a reply nobody attested is not a fixture. Six calls, all HTTP 200, all `finish_reason:
"stop"`, all `provider_tee` ed25519 **verified**, requested model == served model on every one.
**269,448 ms of model time in total.**

| Call | Model | ms | Request bytes | What came back |
|---|---|---|---|---|
| page 1 | `z-ai/glm-5.3-flash` | 16,420 | 283,328 | 1,167 chars, no `captureIssues`, label `PAGE 1 OF 3` |
| page 2 | `z-ai/glm-5.3-flash` | 27,612 | 284,884 | 1,163 chars, `rotated`, label `PAGE 2 OF 3` |
| page 3 | `z-ai/glm-5.3-flash` | 19,934 | 285,272 | 1,223 chars, `rotated`, label `PAGE 3 OF 3` |
| `analyse` on the joined transcript | `Qwen/Qwen3.8-27B` | 200,402 | 4,929 | **86 facts, all grounded · 0 actions · 1 warning** |
| `qa` "What reference number is on these pages?" | `z-ai/glm-5.3-flash` | 2,962 | 4,129 | answered, with a 61-char `sourceQuote` |
| `qa` "Is there a payment deadline?" | `z-ai/glm-5.3-flash` | 2,118 | 4,134 | `notInDocument: true`, **no** quote |

- **The pages are three 1200×1600 JPEGs prepared by the app's own `prepareImage`** from 3024×4032 sources
  (211,378 / 212,546 / 212,836 bytes out of 897,438 / 903,809 / 906,587) — the same call a browser makes,
  run in Node through the spike's canvas shim, so the bytes in the request are the bytes C-01 produces.
  **They join to a 3,557-character transcript with 0 unplaceable spans**, offsets `[0, 1169, 2334]`, and all
  three print a label: `PAGE 1 OF 3` … `PAGE 3 OF 3`. **C-05** over that join, re-run from the recorded
  files: `{"findings":[],"parsed":3,"unparsed":0,"pageCount":3}` — the second correctly photographed set
  that says nothing, and now the same silence is reachable in Demo mode rather than only in a spike log.
- **`rotated` is now the majority over 14 measured pages, not 11.** These three page images are drawn with
  `ctx.rotate(-0.011)` — **0.63°**, the same deliberate crookedness the spike's single-page raster had —
  and two of the three came back `rotated` for a page whose text is perfectly legible. That makes it
  **6 of 14** live pages. **C-04**'s retake loop cannot fire on this signal; the finding is now
  load-bearing, not a caution.
- **86 facts for a three-page invoice, every one of them grounding.** That is **P-16** measured again and
  worse than the number that opened it (32–33 for one page, 5–7 for five pages of a bill): the model
  reads a line-item table as one fact per line, `sourceQuote` and all. Grounding cannot see it — the
  quotes are real — so a screen reader gets an 86-item wall with no guard anywhere between the schema
  (`facts` is `.max()`-free) and the results view. Still unhandled, and now it has a photographed sample.
- **Zero actions on an invoice with a payment reference in it.** `actions: []` is schema-valid and the
  results section renders its "nothing found" line, so nothing broke — but a bill is exactly the document
  where an action belongs, and one sample says the prompt's action half is **S-03**'s to test rather than
  this run's to assume.
- **No cost figure exists for this run, and the reason is ours, not the service's.** `completionEnvelopeSchema`
  does not name `usage` (§1: "the envelope schema does not carry `usage` at all"), so `readCompletion`
  never sees the block the raw body contains and the recorder stored `"usage": {}` — *nothing to record*,
  not *nothing billed*. The signatures are unaffected: `checkSignature` was handed `response.rawText`, the
  untouched bytes. Follow-up in §"What is still unknown": a recording that wants its own price has to read
  usage off the raw JSON the way `scripts/spike.ts` does, and until then no fixture's `_provenance` may be
  quoted as a cost.
- **What the recording does *not* contain, and why S-11 stays `[~]`:** no `uncertain` span came off any of
  the three pages (all three were clean synthetic renders), so **the live `uncertain` path — and with it
  C-11's remapping and clamping — has still never processed a real span**; no page was truncated; no reply
  was a refusal; and **no attestation report was stored** (the recorder keeps the *verdict*, not the
  report), so **T-08**'s good/tampered/expired fixtures are still owed. Report retrieval is documented as
  **"free and non-billable"** (§5's quote from NEAR's own docs) and it is not a completion, which makes
  that half the cheapest remaining item here — one free call for the good report, and the tampered and
  expired ones derived from it.


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

### [Measured] 2026-11-05 — the navigation itself, in Chromium

`npm run test:e2e:live` (`tests/e2e/browser-cors.spec.ts`) bundles the **production modules** — not a
hand-rolled `fetch` — into the page and runs them there: `createNearClient` in Mode A, `fetchReport`,
`bindReport`, `checkQuote`, `createSignatureVerifier`. A page at `http://localhost:3100`, authenticated
with a bearer key, completed the round trip and read its own answer back.

| Call | Status | Bytes | Time | `access-control-allow-origin` |
|---|---|---|---|---|
| `GET /v1/attestation/report` | 200 | 318,256 | 1,803 ms | echoes the page origin |
| `POST /v1/chat/completions` | 200 | 710 | 1,634 ms | echoes the page origin |
| `GET /v1/signature/33782e…` | 200 | 444 | 583 ms | echoes the page origin |

Fourteen checks ran in the browser and **all fourteen passed**: the four of `bindReport`, the eight of
`checkQuote` (T-16), and the two of the signature verifier. The completion came back 9 characters with
`finish_reason: stop`, and it verified `signed by the enclave serving the model, over the exact bytes of
this request and response`. That is the assertion the 2026-11-03 table could only predict.

**Six things only a navigation could tell us.**

1. The base URL must **include `/v1`**. Asked as `https://cloud-api.near.ai` + `attestation/report`, the
   service answers **404**; the `/v1` is part of the base, which is how `scripts/spike.ts` builds it.
2. **The preflight is not observable from the test.** Playwright surfaced **0** `OPTIONS` events while the
   three real calls went through. What a browser run proves is that the responses were **readable by the
   page**, which is the thing that actually mattered; "a preflight was seen" was dropped rather than
   asserted, because it could not be measured.
3. **A mocked response is not CORS evidence.** The planned negative control — `page.route` the service and
   `route.fulfill` it with the `access-control-allow-origin` header stripped — returned **"answered 200"**:
   Chromium does not run its CORS check against a Playwright-fulfilled response. The control was deleted
   and the reason written into the file, rather than left in as a check that could never fail.
4. **Our own production CSP refuses the test harness.** On `next start`, `page.evaluate` throws
   `EvalError: Evaluating a string as JavaScript violates … script-src 'self' 'unsafe-inline'` — we do not
   ship `'unsafe-eval'`, and the app is better for it. So the round trip runs against `next dev` (which
   serves no CSP header at all, `next.config.ts` gating it on `NODE_ENV`), and the CSP question moved to a
   separate **key-free, eval-free** probe: an inline `<script>` — which `'unsafe-inline'` admits — that
   writes its answer into a `<pre>` the test then reads from the DOM.
5. `GET https://cloud-api.near.ai/v1/models` from a production page returned **200 with no credential**.
   The model catalog is public; the prediction in the paragraph above that an unauthenticated call would
   answer 401 was wrong, and is corrected here rather than left in the doc.
6. **Matching a host inside a CSP violation message is a trap.** Chromium's refusal text quotes the
   *entire* directive, and our directive *names* `https://cloud-api.near.ai` — so the refusal of
   `example.com` matched a search for the NEAR host. Only the URL after `Connecting to '<url>'` is the
   host that was blocked; the test now extracts that and nothing else.

The CSP probe's own result, on the production build: `connect-src 'self' https://cloud-api.near.ai
https://*.completions.near.ai` admitted the NEAR host (**reached 200**) and refused `https://example.com/`
with the violation named in the browser console. So the policy that ships does not lock Mode A out of its
own endpoint, and it is not open.

What this closes: **the browser half of S-06, and unknown item 4 below.** `T-13` (the relay-vs-browser
cut) stays un-cut on measured ground rather than on a header dump. What it does **not** close: AGENTS.md
rule 2 stays exactly where it was — this round trip puts a bearer key in a browser header and gets no
E2EE, so the strongest privacy claim is still unreachable from a page (**B-07**/T-10), and the gate still
answers `501` server-side. A live key was used inside the browser for this run; `trace` is switched off in
that file precisely because a retained trace records the `authorization` header, and the run directory was
checked for the credential afterwards.

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

Closed by the two free report calls on 2026-11-05 (§3's second measured block) — and it closed a
*file*, not an unknown: two live attestation reports are now in the repo with their nonce echo
proved, and what that run established is that the two facts a verifier most wants are **not in a
report at all**. Expiry lives inside `intel_quote` and `nvidia_payload`, and every `device_id` field
holds `SHA-256("")`. So neither becomes item 9; both stay where they already are, under 7.

Still open, with what each one now waits on:

1. Whether E2EE from a **browser** actually works end to end with a live enclave. The protocol is
   documented, the report carries `ohttp_attestation` and `ohttp_key_config`, and no browser path is
   described anywhere. **This still sets the strongest privacy claim we are allowed to make.** Needs a
   dependency decision (T-10) and a real browser, not a key alone. (S-01)
2. How badly the chosen vision model misreads **numbers on bad photographs**. A key and a model are not
   the missing thing here; the golden set run against the live service is. (S-03)
3. **Price per page**, as opposed to price per probe exchange. **Closed for the pages `npm run spike`
   sends** — input `$0.00020288` per C-01-prepared page and output `$0.00097080` (§4), ten measured pages
   averaging **$0.00087275 / 25.8 s**. What is still not produced is a price for the *fixture recording*
   run (see 8), and a spread across document lengths, which is S-03's. (S-09 **closed** 2026-11-04)
4. ~~The **browser** half of CORS~~ — **closed 2026-11-05** by §6's second measured block: a page in
   Chromium completed the authenticated round trip and the signature verified against the attested key.
   The preflight headers turned out to be a fair prediction; what only a navigation could add was the
   `/v1` 404, the un-observable preflight, the un-fakeable CORS control, and our own `script-src` refusing
   `page.evaluate`. (S-06, T-13 **closed**)
5. Host execution-time limits for a 5-page upload on the plan we deploy to. **Size is measured and is
   not the problem** — 726,910 bytes of body against F-05's 8 MiB cap (§4). A 45-second hang from a live
   model is the hint that a *time* cap exists and is not the one our timeout assumes. (S-08)
6. Whether `spendLimit` is reachable on the account type we ended up with, and how much of the `$10`
   grant is left. The credits arrived and were spent on measurements; the cap itself has not been set,
   because setting it is an action on a shared account rather than a read. (S-10)
7. Intel TDX **collateral** fetch mechanics and the revocation answer, delegated to `dcap-qvl-node` by
   the verifier. This line used to cover "the whole heavy-check half"; it no longer does — the quote's
   *bytes* were opened on 2026-11-05 with the two hashes already in `package.json`, eight checks now run
   in the browser and pass on both live reports, and NRAS answers a GPU payload with a plain POST. What
   stays unknown is whether Intel's signature over those bytes verifies, whether this platform has been
   revoked, and whether an NRAS `true` is stable across calls. Until those ship, the four named gaps
   hold live mode's gate at `failed` and rule 6 refuses to send. (T-03, **B-12**)
8. **What the 2026-11-04 23:22 UTC recording run cost.** Its six calls were billed; the recorder cannot
   say how much, because `completionEnvelopeSchema` does not name `usage` and `readCompletion` therefore
   never passes the block to anything that could store it (§4's S-11 block). Either the recording reads
   usage off the raw JSON the way `scripts/spike.ts` does, or the figure comes from the organisation's
   balance endpoint. Until one of those happens, **no `_provenance` block in `fixtures/` may be quoted as
   a cost**, and the only prices this repo publishes are §4's. (S-11, S-10)
