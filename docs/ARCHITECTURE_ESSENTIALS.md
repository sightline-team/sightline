# Sightline — Architecture Essentials (v0.2)

Outline only. Detail: `ARCHITECTURE.md`. Scope and hard-questions review: `PRD.md` §12.
**[V]** verified in docs · **[U]** unverified, check in Day 1 spike.

## What it is
- Web app. Blind/low-vision user photographs (or pastes text of) a sensitive document → private AI explains it and answers questions → app shows exactly what was verified.
- Value = private **explain-and-answer**, not "read text from a photo" (phones already do that on-device).
- Track: Privacy & Private AI. Deadline 14 Nov 2026, 23:59 UTC.

## Stack
- TypeScript strict · Next.js App Router · native HTML + plain CSS · one `useReducer` + context · zod · `@noble/curves` · Vitest + Playwright + axe
- AI: NEAR AI Cloud, OpenAI-compatible, `https://cloud-api.near.ai/v1` **[V]**
- No database, no accounts, no server-side document storage
- **Not using:** React Aria, Zustand, local blur/brightness checks, voice pipeline, reorder UI, offline shell

## Rules that must not be broken
1. **Claims are computed, not written.** UI statement comes from `TrustRecord.claim` (`e2ee_enclave` | `attested_model_signed_responses` | `partial` | `fixtures`).
2. **Browser cannot prove upload ends in the enclave** (cannot read/pin TLS). Only E2EE to the attested key closes this. No E2EE → use the weaker statement.
3. **TEE-hosted models only.** Proxied models have no TEE guarantee **[V]**.
4. **Fresh nonce per session.** Check attestation before sending; verify response signature after every call.
5. **`partial` is never shown as "verified".** List checks with `ran` + `passed`.
6. **Server stores/logs no content.** Relay is stateless, fixed host, exact-path allowlist, size cap.
7. **`quoteFound` is code-computed.** It proves consistency with the transcript, **not** correctness against the page. Never describe it as page-verified.
8. **No model self-reported confidence.**
9. **Fail closed** on verification failure (v1 decision; revisit with users).
10. **Runs with zero credentials** via fixture mode.
11. **Every contribution updates `ROADMAP.md` in the same commit** (status + evidence, log entry, dashboard, current focus, blockers). Enforced by `npm run roadmap:check` (hook + CI). Agents: see `AGENTS.md` §2.

## Modes
- **B. Relay (build first):** browser → our stateless relay → NEAR. Relay is in the trust path unless E2EE. Needs shared-store rate limit or small prepaid key.
- **A. Direct, BYO key:** browser → NEAR. Strongest privacy; for developers/judges only. Needs CORS **[U]**.
- **F. Fixtures:** recorded responses; banner "Demo data, no real privacy guarantee". For reviewer agents and tests.
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

## Verification scope (decide in spike)
- Likely feasible: nonce binding, response signature, GPU-evidence verdict token
- Likely hardest: Intel TDX quote verification → may not ship; label "not independently verified"
- Heavy checks on `/api/verify` mean users trust our verdict for those → disclose

## Data (summary)
- `Session { mode, input, pages, transcript, analysis, qa, trust, status }`
- `Transcript { text, uncertain[], captureIssues[], pageOffsets }`
- `KeyFact { kind, label, value, sourceQuote, quoteFound, numbersRechecked? }`
- `TrustRecord { model, endpoint, e2ee, attestation{checks[], status}, signature, claim }`
- Everything in memory. Key in `sessionStorage`. Settings (rate, high-contrast, mode) in `localStorage`.

## Routes
- `POST /api/verify` — report in, named checks out, no user content
- `/api/relay/*` — Mode B only: fixed host, exact-path + model allowlist, size cap, shared-store rate limit, no body logging, streaming

## Accessibility
- WCAG 2.2 AA target; manual tests on the devices you actually have; list untested platforms
- One `aria-live` announcer; progress announced ~every 10 s; focus to new heading / error summary
- Result order: Summary → Key facts → Actions → Warnings → Full text → Ask → Trust receipt
- Read-aloud = one opt-in button; screen-reader users mostly won't use it
- Plain language; jargon only in details (`<details>`)

## Safety
- Never guess unreadable text; medication/legal/money notice; no scam-detection claim
- Prompt injection: document = data; no tools; schema-validated output

## Known breakpoints (see PRD §12 for all)
1. Privacy claim > code (TLS/E2EE) → claims ladder
2. Grounding ≠ correctness → P1 verification pass, honest README
3. Nobody can run it (no key) → fixtures + deployed relay
4. Verifier port too heavy → minimum honest set
5. Serverless body/time limits → downscale, one page per request, stream, Day 3 load test
6. Capture quality is the real bottleneck → model `captureIssues`, eyes-closed test photos
7. In-memory rate limit useless on serverless → shared store or prepaid key
8. Fail-closed locks users out → flagged product decision

## Edge cases that must be handled (P0)
Cut-off / rotated / glared pages · tables and forms · handwriting · not a document · model refusal · truncated output · invalid JSON · injection text · English only · attestation changes mid-session · long waits · large images · relay abuse

## Day 1 spike (ordered by impact)
1. E2EE available? 2. TEE + image models, latency, price 3. Accuracy on 10 docs **incl. bad photos** 4. Reference verifier: which checks, what language 5. Signature check 6. CORS 7. Direct slug 8. Host limits with 5-page upload 9. Cost/doc 10. Key capping 11. Record fixtures
- No usable vision → paste-text core · No E2EE → weaker claim · CORS fails → no Mode A

## Decisions already made
Computed claims · TEE-only · two-step pipeline · native camera · relay first · fixtures · paste-text P0 · model capture issues · no voice pipeline · no payments in v1 (ADR-9)
