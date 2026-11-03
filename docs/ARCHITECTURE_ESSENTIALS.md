# Sightline — Architecture Essentials (v0.4)

Outline only. Detail: `ARCHITECTURE.md`. Scope and hard-questions review: `PRD.md` §12. Spike findings with sources: `SPIKE_RESULTS.md`.
**[V]** verified in official docs / the OpenAPI contract / vendor source · **[M]** measured against the live API (nothing is **[M]** yet — no key, blocker B-05) · **[U]** unverified, check in the spike.

## What it is
- Web app. Blind/low-vision user photographs (or pastes text of) a sensitive document → private AI explains it and answers questions → app shows exactly what was verified.
- Value = private **explain-and-answer**, not "read text from a photo" (phones already do that on-device).
- Track: Privacy & Private AI. Deadline 14 Nov 2026, 23:59 UTC.

## Stack
- TypeScript strict · Next.js App Router · native HTML + plain CSS · one `useReducer` + context · zod · `@noble/curves` + `@noble/hashes` · Vitest + Playwright + axe
- `@noble/ciphers` is the E2EE cipher (XChaCha20-Poly1305, T-10) and is **not installed** — it needs a human to approve the dependency first (AGENTS.md §5). Nothing imports it.
- Scaffold contract (F-14): an unfinished function throws `NotBuilt` naming its ROADMAP item instead of returning a plausible fake; route handlers answer 501 and forward nothing; placeholder pages say which item builds them.
- AI: NEAR AI Cloud, OpenAI-compatible, `https://cloud-api.near.ai/v1` **[V]**
- No database, no accounts, no server-side document storage
- **Not using:** React Aria, Zustand, local blur/brightness checks, voice pipeline, reorder UI, offline shell

## Rules that must not be broken
1. **Claims are computed, not written.** UI statement comes from `TrustRecord.claim` (`e2ee_enclave` | `attested_model_signed_responses` | `partial` | `fixtures`).
2. **Browser cannot prove upload ends in the enclave** (cannot read/pin TLS). Only E2EE to the attested key closes this. No E2EE → use the weaker statement.
3. **TEE-hosted models only.** Proxied models have no TEE guarantee **[V]**.
4. **Fresh nonce per session** (32 random bytes, 64 hex). Check attestation before sending; fetch and verify the response signature after every call — it is a separate keyed request, not a header (ADR-19).
5. **`partial` is never shown as "verified".** List checks with `ran` + `passed`.
6. **Server stores/logs no content.** Relay is stateless, fixed host, exact-path allowlist, size cap.
7. **`quoteFound` is code-computed.** It proves consistency with the transcript, **not** correctness against the page. Never describe it as page-verified.
8. **No model self-reported confidence.**
9. **Fail closed** on verification failure (v1 decision; revisit with users).
10. **Runs with zero credentials** via fixture mode.
11. **Every contribution updates `ROADMAP.md` in the same commit** (status + evidence, log entry, dashboard, current focus, blockers). Enforced by `npm run roadmap:check` (hook + CI). Agents: see `AGENTS.md` §2.

## Modes
- **B. Relay (build first):** browser → our stateless relay → NEAR. Relay is in the trust path unless E2EE works from a browser; then it carries ciphertext only (ADR-16). Needs shared-store rate limit or a capped key (`spendLimit` **[V]**).
- **A. Direct, BYO key:** browser → NEAR. Strongest privacy; for developers/judges only. CORS **[V]** open for non-admin paths in server source; live preflight **[U]**. The user's key must be in the browser — the attestation and signature endpoints require a key, so there is no keyless Mode A (ADR-17).
- **F. Fixtures:** replayed responses; banner "Demo data, no real privacy guarantee". For reviewer agents and tests. Today's fixtures are **authored synthetic**, not recorded **[U]**.
- One client, `baseUrl` + header provider → one code path.

## Pipeline
1. Input: native camera (`<input capture>`) 1–5 pages **or** pasted text.
2. Browser: `createImageBitmap` resize → fix orientation → JPEG (strips EXIF/GPS).
3. Attestation fetch + checks (nonce) → `/api/verify` for heavy checks (no document sent there).
4. **Step 1 transcribe** (vision, one request per page): verbatim, tables row by row, `[illegible]`, `captureIssues[]`, page labels.
5. If `captureIssues` → announce, offer retake (before spending analysis time).
6. **Step 2 structure** (text-only): summary, facts, actions, warnings → zod-validated.
7. Code sets `quoteFound` per fact/action/answer.
8. **Q&A:** transcript-only; `notInDocument` allowed; text input (OS dictation disclosed).
9. Trust receipt from `TrustRecord`.
10. **Paste-text path** skips 2–5. It is also the fallback if no TEE vision model works.
11. **P1 (only if spike shows numeric misreads):** verification pass per numeric fact.

## Verification scope (decided — ARCH §10, ADR-19)
- **Go:** nonce binding (`request_nonce`, GPU token `eat_nonce`), response signature, GPU-evidence verdict via NRAS.
- **Go, sequenced last:** Intel TDX quote via the reference verifier's TypeScript `ts/` + `dcap-qvl-node` **[V]** — a port, not a rewrite. If it does not ship, the receipt says "hardware quote not independently verified in this build".
- Signature checking is a **second request**: `completion id → GET /v1/signature/{chat_id} → rebuild `{model_id}:{request_hash}:{response_hash}` → verify`. Streaming responses end in two newlines that belong in the hash; lookups can transiently say "not found" → retry; raw bytes live 60 minutes.
- `@nearai/inference-sdk` stays out of the trust path; it is a cross-check tool in `scripts/` (ADR-20).
- Heavy checks on `/api/verify` mean users trust our verdict for those → disclose.
- The TEE allowlist needs a **per-model** metadata call; `/v1/models` does not carry `attestationSupported` / `providerType` / `verifiable` (ADR-18).

## Data (summary)
- `Session { mode, input, pages, transcript, analysis, qa, trust, status }`
- `Transcript { text, uncertain[], captureIssues[], pageOffsets }`
- `KeyFact { kind, label, value, sourceQuote, quoteFound, numbersRechecked? }`
- `TrustRecord { model, endpoint, e2ee, attestation{checks[], status}, signature, claim }`
- Everything in memory. Key in `sessionStorage`. Settings (rate, high-contrast) in `localStorage` as
  one validated blob at `sightline.settings`, written only by `lib/settings.ts`; the read-aloud rate
  is re-read on every press (P-09) and the Settings page's control is what writes it (A-15). The run
  **mode** is not a stored setting: it comes from the environment, fails closed, and selects the
  privacy sentence — so Settings shows it and does not offer it (ADR-21).
- **Forget** (P-10) clears the tab's own memory: session state, the typed-but-unsent text, running
  requests, object URLs, and `sessionStorage` under the `sightline.` prefix — which is the rule that
  makes a future key or setting forgettable, so store under it or say so in the README. What it
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
5. Serverless body/time limits → downscale, one page per request, stream, Day 3 load test
6. Capture quality is the real bottleneck → model `captureIssues`, eyes-closed test photos
7. In-memory rate limit useless on serverless → shared store or prepaid key
8. Fail-closed locks users out → flagged product decision

## Edge cases that must be handled (P0)
Cut-off / rotated / glared pages · tables and forms · handwriting · not a document · model refusal · truncated output · invalid JSON · injection text · English only · attestation changes mid-session · long waits · large images · relay abuse

## Day 1 spike (ordered by impact)
Read-only answers are in `SPIKE_RESULTS.md`; items 3, 5(live), 7, 8, 9 and 11 need a key (B-05).
1. E2EE available? — **[V]** protocol v2 documented; browser path **[U]** 2. TEE + image models — **[V]** flags are per-model; live/latency/price **[U]** 3. Accuracy on 10 docs **incl. bad photos** **[U-key]** 4. Reference verifier: which checks, TS port **[V]** 5. Signature check: shape **[V]**, live **[U-key]** 6. CORS: source **[V]** open, preflight **[U-key]** 7. Direct slug **[U-key]** 8. Host limits with 5-page upload **[U-key]** 9. Cost/doc **[U-key]** 10. Key capping: `spendLimit` **[V]** 11. Record fixtures **[U-key]**
- No usable vision → paste-text core · No browser E2EE → weaker claim · CORS fails → no Mode A

## Decisions already made
Computed claims · TEE-only · two-step pipeline · native camera · relay first · fixtures · paste-text P0 · model capture issues · no voice pipeline · no payments in v1 (ADR-9) · relay designed to carry ciphertext only once browser E2EE is proven (ADR-16) · Mode A key lives in the browser (ADR-17) · per-model metadata for the allowlist (ADR-18) · signature check = fetch + rebuild hashes + verify (ADR-19) · SDK out of the trust path (ADR-20)
