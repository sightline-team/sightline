# Sightline — Architecture Essentials (v0.4)

Outline only. Detail: `ARCHITECTURE.md`. Scope and hard-questions review: `PRD.md` §12. Spike findings with sources: `SPIKE_RESULTS.md`.
**[V]** verified in official docs / the OpenAPI contract / vendor source · **[M]** measured against the live API (first **[M]** rows: 2026-11-03, after blocker B-05 cleared — see `SPIKE_RESULTS.md` §3–§6) · **[U]** unverified, check in the spike.

## What it is
- Web app. Blind/low-vision user photographs (or pastes text of) a sensitive document → private AI explains it and answers questions → app shows exactly what was verified.
- Value = private **explain-and-answer**, not "read text from a photo" (phones already do that on-device).
- Track: Privacy & Private AI. Deadline 14 Nov 2026, 23:59 UTC.

## Stack
- TypeScript strict · Next.js App Router · native HTML + plain CSS · one `useReducer` + context · zod · `@noble/curves` + `@noble/hashes` · Vitest + Playwright + axe
- `@noble/ciphers` is the E2EE cipher (XChaCha20-Poly1305, T-10) and is **not installed** — it needs a human to approve the dependency first (AGENTS.md §5). Nothing imports it.
- Scaffold contract (F-14): an unfinished function throws `NotBuilt` naming its ROADMAP item instead of returning a plausible fake; route handlers answer 501 and forward nothing; placeholder pages say which item builds them.
- AI: NEAR AI Cloud, OpenAI-compatible, `https://cloud-api.near.ai/v1` **[V]**
- **A model per step, from one table** (`lib/near-ai/models.ts`, `STEP_PLANS`, **ADR-24** as amended by **ADR-26**): page = **`z-ai/glm-5.3-flash`** (fallback **`Qwen/Qwen3.8-27B`**) and Q&A = **`z-ai/glm-5.3-flash`**; structure = **`Qwen/Qwen3.8-27B`** at `16384`, because on *that* contract the page model needs the repair retry to be readable at all (0 of 2 first asks in S-14's run, both repairs accepted) while Qwen got 2 of 2 first time, and the repair glm needs is billed twice — a five-page document is **$0.0085 / ≈260 s** on Qwen against **$0.0097 / ≈302 s** on glm once the fenced ask is counted **[M]** (SPIKE §4; a "$0.009497, within 2%" reading here earlier omitted that ask). The Q&A row was Qwen by inference until S-14 measured it: **both** models answered 3 of 3 readably there, so it moved to the cheaper, faster model (**ADR-26**). The model the docs named (`Qwen/Qwen3-VL-30B-A3B-Instruct`) is flagged `attestationSupported: true` and `isReady: true` and never answers **[M]**. A deployment that allowlists only one of the two ids gets a working first step and a refusing second.
- No database, no accounts, no server-side document storage
- **Not using:** React Aria, Zustand, local blur/brightness checks, voice pipeline, reorder UI, offline shell

## Rules that must not be broken
1. **Claims are computed, not written.** UI statement comes from `TrustRecord.claim` (`e2ee_enclave` | `attested_model_signed_responses` | `partial` | `fixtures`).
2. **Browser cannot prove upload ends in the enclave** (cannot read/pin TLS). Only E2EE to the attested key closes this. No E2EE → use the weaker statement.
3. **TEE-hosted models only.** Proxied models have no TEE guarantee **[V]**.
4. **Fresh nonce per session** (32 random bytes, 64 hex). Check attestation before sending; fetch and verify the response signature after every call — it is a separate keyed request, not a header (ADR-19).
5. **`partial` is never shown as "verified".** List checks with `ran` + `passed`.
6. **Server stores/logs no content.** Relay is stateless, fixed host, exact-path allowlist, size cap.
7. **`quoteFound` is code-computed.** It proves consistency with the transcript, **not** correctness against the page. Never describe it as page-verified. The transcript it searches is `groundableText(transcript)`: Sightline's own `[page n could not be read]` marker (**ADR-27**) is masked to the same length before matching, so a quote that lands on a hole is not grounded (**P-17**).
8. **No model self-reported confidence.**
9. **Fail closed** on verification failure (v1 decision; revisit with users).
10. **Runs with zero credentials** via fixture mode.
11. **Every contribution updates `ROADMAP.md` in the same commit** (status + evidence, log entry, dashboard, current focus, blockers). Enforced by `npm run roadmap:check` (hook + CI). Agents: see `AGENTS.md` §2.

## Modes
- **B. Relay (build first):** browser → our stateless relay → NEAR. Relay is in the trust path unless E2EE works from a browser; then it carries ciphertext only (ADR-16). Needs shared-store rate limit or a capped key (`spendLimit` **[V]**).
- **A. Direct, BYO key:** browser → NEAR. Strongest privacy; for developers/judges only. CORS **[V]** open for non-admin paths in server source and **[M]** live 2026-11-03 (preflight from `localhost:3000` answered with the echoed origin, `allow-methods: *`); the **browser** half is still **[U]** — a header dump read from Node is not a navigation. The user's key must be in the browser — the attestation and signature endpoints require a key, so there is no keyless Mode A (ADR-17).
- **F. Fixtures:** replayed responses; banner "Demo data, no real privacy guarantee". For reviewer agents and tests. Today's fixtures are **authored synthetic**, not recorded **[U]**.
- One client, `baseUrl` + header provider → one code path.

## Pipeline
1. Input: native camera (`<input capture>`) 1–5 pages **or** pasted text up to **20,000 characters** (`MAX_PASTE_CHARS`, **C-12/ADR-29**) — a longer paste is refused for its length **before a request exists**, in words that offer the smaller piece instead of naming the number.
2. Browser (`lib/image/prepare.ts`, C-01): `createImageBitmap` → canvas → JPEG. The re-encode is the stripping: the decoder returns upright pixels and the encoder writes a fresh file, so EXIF, GPS and the orientation tag itself are gone by construction. Long edge 1600 px, ≤768 KiB per page.
3. Attestation fetch + checks (nonce) → `/api/verify` for heavy checks (no document sent there).
4. **Step 1 transcribe** (vision, one request per page — C-03, `features/capture/transcribe.ts`): verbatim, tables row by row, `[illegible]`, `captureIssues[]` from the ten-value enum the prompt also spells out, and a page label **only if it is printed on the page** (we never tell the model which page it is, or C-05's gap check would be reading its own echo). The page goes as an `image_url` part after the gate, `max_tokens: 8192` (ADR-23). **Measured [M]: two five-page runs — ten requests, ten accepted replies, 10 of 10 signatures `provider_tee`, no repair. Mean **$0.00087 and 25.8 s a page**; spread **$0.00061–$0.00127** and **16.4–39.9 s**; the two documents cost **141.6 s / $0.004064** and **116.7 s / $0.0046635** in series (SPIKE §4).**
4b. **Step 1b assemble** (no model — **C-11**, **ADR-27**, `features/capture/assemble.ts`): pages are joined with a fixed `"\n\n"`, `pageOffsets` records where each page starts, and every page's `uncertain` spans are shifted onto its own region and clamped there — a span that is not clamped marks the *next* page's readable words as unreadable. A page that yielded no text leaves `[page n could not be read]` in the reading at its own offset plus a `missingPages` entry; the run continues (four pages of five is a document with a hole, not a failed run) unless **no** page answered, which is `usable: false` and gets no structure step. The marker's wording lives in `lib/transcript/holes.ts`, and the same file masks it out of the grounding search (**P-17**) — a quote that lands on our own sentence fails `quoteFound` instead of passing on it. **Measured [M]**: the five pages above joined to 6,007 chars with offsets `[0, 1165, 2334, 3559, 4784]`, each region cut at its offset being that page's own text; with one page truncated at 256 tokens, 4,870 chars, `[0, 28, 1197, 2422, 3647]`, `missing 1:output_truncated`, still `usable`.
5. If `captureIssues` → announce (the *retake offer* is C-04's, and the run carries on: `rotated` came off **4 of 11** measured pages, SPIKE §4, so halting on a reported tilt would stop more runs than it saves). **Step 1c page-label check** (no model — **C-05**, **ADR-28**, `features/capture/page-labels.ts`): the numbers the *photographs* print are compared with each other and with `pageOffsets.length` — how many were taken, holes included — and report a printed number duplicated, an internal gap, a number that cannot belong to this many photographs, two different totals, or a total that differs from the set. No labels, a label that is not a number, or a missing *first* number are all silence, because most documents print nothing and absence proves nothing.
   **The caller of steps 4, 4b, 5 and 1c is `features/capture/read_pages.ts` inside `app/_flow/usePhotoRun.ts` (C-02).** All of step 5's notices — the hole (`missingPagesAnnouncement`), the label findings, C-11's `unplaceableSpans` count and the capture issues — are joined into **one** announcement, because the announcer holds one message at a time and two writes in the same React batch leave only the last in the live region. Four separate `announce()` calls would have silently dropped three of the four notices.
6. **Step 2 structure** (text-only): summary, facts, actions, warnings → zod-validated. Every closed vocabulary the schema checks is spelled out in the prompt, because measured replies do not supply one for free (**P-01**, SPIKE §4). **Answered by `Qwen/Qwen3.8-27B`, not by the page model, with `max_tokens: 16384` (ADR-24, `STEP_PLANS`)** — glm was 0-of-6 readable here before **ADR-25** and Qwen fenced 0-of-7, and the budget is ~1.8× the largest text answer the service has given us — S-14's glm five-page repair spent **8,872** tokens, 680 more than the 8,192 first proposed, which would have truncated an answer the model had finished (**SPIKE §4**). A `null` on a field the prompt marked optional reads as absent, because six replies out of six used it and the schema was throwing them away (**ADR-25**).
7. Code sets `quoteFound` per fact/action/answer — against `groundableText(transcript)`, which masks out any `[page n could not be read]` hole so a quote that lands on our own sentence is not reported as grounded (**P-17**, `lib/transcript/holes.ts`).
8. **Q&A:** transcript-only; `notInDocument` allowed; text input (OS dictation disclosed). Runs on **`z-ai/glm-5.3-flash`** at `max_tokens: 16384` — measured by **S-14** (SPIKE §4), which found both planned models answering this request readably (3 of 3 each, no fences, no repair) and moved the row off Qwen for cost and waiting time (**ADR-26**). Per question: **$0.000258–$0.000281**, 1.9–3.4 s.
9. Trust receipt from `TrustRecord`.
10. **Paste-text path** skips 2–5. It is also the fallback if no TEE vision model works. Its length guard (**C-12**) is the **first** thing the run callback does — before the mode check, before a controller and before a body exists — so a refused paste costs nothing and writes nothing.
11. **P1 (only if spike shows numeric misreads):** verification pass per numeric fact.

## Verification scope (decided — ARCH §10, ADR-19)
- **Go:** nonce binding (`request_nonce`, GPU token `eat_nonce`), response signature, GPU-evidence verdict via NRAS.
- **Go, sequenced last:** Intel TDX quote via the reference verifier's TypeScript `ts/` + `dcap-qvl-node` **[V]** — a port, not a rewrite. If it does not ship, the receipt says "hardware quote not independently verified in this build".
- Signature checking is a **second request**: `completion id → GET /v1/signature/{chat_id} → rebuild `{model_id}:{request_hash}:{response_hash}` → verify`. Lookups can transiently say "not found" → retry; raw bytes live 60 minutes. **[M]** 2026-11-03: this verified a live non-streamed exchange against `model_attestations[0].signing_public_key`.
- **The app does not stream (ADR-22)** **[M]**. A streamed body *does* hash correctly — SHA-256 of the whole SSE text, its two trailing newlines included — but its signature is `gateway` kind and verifies only against `gateway_attestation.signing_address`, never the model enclave's key. A stream therefore buys a weaker receipt, and `NearClient` cannot read one at all (it parses every 200 body as JSON).
- `@nearai/inference-sdk` stays out of the trust path; it is a cross-check tool in `scripts/` (ADR-20).
- Heavy checks on `/api/verify` mean users trust our verdict for those → disclose.
- The TEE allowlist reads catalog metadata; `/v1/models` does not carry `attestationSupported` / `providerType` / `verifiable` (ADR-18). **[M]** 2026-11-03: the **bulk** `GET /v1/model/list` carries them, so it is one call — and the flag alone is not enough, because a model flagged `attestationSupported: true` can forward to `openrouter.ai`. `isAllowed` refuses that as `proxied_upstream`, separately from the flag (AGENTS §4 rule 3).

## Data (summary)
- `Session { mode, input, pages, transcript, analysis, qa, trust, status }`
- `Transcript { text, uncertain[], captureIssues[], pageOffsets, pageNumbersSeen?, missingPages? }`
- `KeyFact { kind, label, value, sourceQuote, quoteFound, numbersRechecked? }`
- `TrustRecord { model, endpoint, e2ee, attestation{checks[], status}, signature, claim }`
- Everything in memory. Key in `sessionStorage`. Settings (rate, high-contrast) in `localStorage` as
  one validated blob at `sightline.settings`, written only by `lib/settings.ts`; the read-aloud rate
  is re-read on every press (P-09) and the Settings page's control is what writes it (A-15). The run
  **mode** is not a stored setting: it comes from the environment, fails closed, and selects the
  privacy sentence — so Settings shows it and does not offer it (ADR-21).
- **Forget** (P-10) clears the tab's own memory: session state, the typed-but-unsent text, running
  requests, object URLs, and `sessionStorage` under the `sightline.` prefix — which is the rule that
  makes a future key or setting forgettable, so store under it or say so in the README. A cancelled
  run's later writes are dropped at the composition root, not by the reducer (**P-12**). What it
  cannot reach (the device's copies, anything already sent) is stated in `README.md`, not on the button.

## Routes
- `POST /api/verify` — report in, named checks out, no user content
- `/api/relay/*` — Mode B only: fixed host, exact-path + model allowlist, size cap, shared-store rate limit, no body logging, streaming

## Accessibility
- WCAG 2.2 AA target; manual tests on the devices you actually have; list untested platforms
- One `aria-live` announcer; progress announced ~every 10 s; focus to new heading / error summary
- Result order: Summary → Key facts → Actions → Warnings → Full text → Ask → Trust receipt
- Read-aloud = one opt-in play/stop button (P-09), no auto-play, stops on Forget; reads only the
  summary and Sightline's own cautions, never the model's warnings; screen-reader users mostly won't use it
- Transcript-only screen (invalid JSON after the one repair retry, **P-11**): the sections a reading
  would fill are **absent**, not empty; the English-only line is said there (`appLimitationNotices()`);
  no read-aloud control, because there is no summary and the full text belongs to the person's own reader
- Settings (A-15) = four named speeds in a native radio group (a value that is heard should be a word,
  not "1.35") and one contrast checkbox, whole rows ≥ 44 px, state driven by the store so a refused
  write snaps back. Speed change: no extra announcement (the reader says the newly selected radio);
  theme change: announced, because a colour change is otherwise silent
- Plain language; jargon only in details (`<details>`)

## Safety
- Never guess unreadable text; medication/legal/money notice; no scam-detection claim
- Prompt injection: document = data; no tools; schema-validated output

## Known breakpoints (see PRD §12 for all)
1. Privacy claim > code (TLS/E2EE) → claims ladder
2. Grounding ≠ correctness → P1 verification pass, honest README
3. Nobody can run it (no key) → fixtures + deployed relay
4. Verifier port → **lowered risk**: reference verifier ships TypeScript + `dcap-qvl-node` **[V]**; still needs a real report to test against
5. Serverless body/time limits → downscale, one page per request, Day 3 load test (**not** streaming — ADR-22)
6. Capture quality is the real bottleneck → model `captureIssues`, eyes-closed test photos
7. In-memory rate limit useless on serverless → shared store or prepaid key
8. Fail-closed locks users out → flagged product decision

## Edge cases that must be handled (P0)
Cut-off / rotated / glared pages · tables and forms · handwriting · not a document · model refusal · truncated output · invalid JSON · injection text · English only · attestation changes mid-session · long waits · large images · relay abuse

## Day 1 spike (ordered by impact)
Read-only answers are in `SPIKE_RESULTS.md`. **The key arrived 2026-11-03 (B-05 cleared)**, so items 2, 5, 6, 7 and 9 are now **[M]**; 3, 8, 11 still need work with the key, and item 1 still needs a browser.
1. E2EE available? — **[V]** protocol v2 documented; browser path **[U]** 2. TEE + image models — **[M]**: flags on the bulk list, `attestationSupported` alone is not sufficient, chosen model `z-ai/glm-5.3-flash` (SPIKE §4) 3. Accuracy on 10 docs **incl. bad photos** **[U-key]** 4. Reference verifier: which checks, TS port **[V]** 5. Signature check — **[M]**: `provider_tee` verified on a live exchange; a stream is gateway-signed (SPIKE §5, ADR-22) 6. CORS — **[M]** server half (live preflight), browser half **[U]** 7. Direct slug — **[M]**: both usable models are served from `cloud-api.near.ai` alone, no per-model host 8. Host limits with 5-page upload **[U-key]** 9. Cost/doc — **[M]** per exchange, per page and per document (SPIKE §4: $0.00097 and 25.8 s for the first measured page, **$0.00081280 and 28.3 s per page averaged over five** (§4, C-11's run); the structure step over a five-page transcript **$0.0012–$0.0064 and 19–107 s** depending on which plan row answers it; so a five-page photo document is **≈$0.0085 and ≈260 s** as the plan runs it (**$0.004064 / 141.6 s** of measured pages + **$0.00444221 / 118.6 s** for the structure step on its plan row — the two halves are from different runs, and the photographed transcript has never been sent to step 2), **$0.00972576 and ≈302 s** if the page model answered step 2 (its fence costs a second billed ask: $0.00101832 + $0.00464344), and a pasted one **$0.0064 and ≈107 s** — **S-09 closed**, and the spread is the model choice, not noise) 10. Key capping: `spendLimit` **[V]** 11. Record fixtures **[U-key]**
- No usable vision → paste-text core · No browser E2EE → weaker claim · CORS fails → no Mode A **(did not fail)**

## Decisions already made
Computed claims · TEE-only (flag **and** provider host, ADR-18 as amended) · two-step pipeline · native camera · relay first · fixtures · paste-text P0 · model capture issues · no voice pipeline · no payments in v1 (ADR-9) · relay designed to carry ciphertext only once browser E2EE is proven (ADR-16) · Mode A key lives in the browser (ADR-17) · catalog metadata for the allowlist (ADR-18) · signature check = fetch + rebuild hashes + verify (ADR-19) · SDK out of the trust path (ADR-20) · settings holds rate + theme only (ADR-21) · **no streaming, because a stream is gateway-signed (ADR-22)** · a page request sends `max_tokens: 8192` because a reasoning model that spends its budget answers with `content: null` (ADR-23) · a model per step and a budget per step, from `STEP_PLANS`, with no cross-model retry (ADR-24) · a `null` on an optional string field means the field is absent (ADR-25) · the Q&A step runs on the page model, because both models answered it readably and only cost and waiting time separated them (ADR-26) · a page that yielded no text leaves a marked hole in the joined reading rather than being dropped or halting the run (ADR-27) · page numbers on the paper are compared with each other and with the number of photographs, never with capture position, and silence is a designed output (ADR-28) · a pasted document over `MAX_PASTE_CHARS` (20,000 characters) is refused in the app before a request exists, sized from the longest reading this project has measured rather than from the model's window (ADR-29)
