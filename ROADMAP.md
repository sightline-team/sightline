# Sightline — ROADMAP

> **Single source of truth for all remaining work.**
> **This file MUST be updated by every contribution** (code, tests, docs, config, fixtures, scripts), by humans and agents alike, **in the same commit as the work**. No exceptions except merge commits. Procedure: §3. Enforced by `npm run roadmap:check` (item F-11).
>
> **Deadline:** 2026-11-14 23:59 UTC (public repo + X demo post + submission via `POST https://nearhackathon.com/api/applications`, or the same fields at `https://nearhackathon.com/#apply`). **Internal submit target:** 2026-11-14 12:00 UTC. **Feature freeze:** 2026-11-13 00:00 UTC. Rules live in `HACKATHON.md` at repo root.
> **Reading guide for agents:** read §1–§3 and §8, then only the phase containing your item. Do not load the whole file.

---

## 1. Status dashboard

<!-- progress:start -->
| Phase | Done | In progress | Blocked | Todo | Cut | Total (excl. cut) | % |
|---|---|---|---|---|---|---|---|
| D — Documentation and planning | 6 | 0 | 0 | 1 | 0 | 7 | 86% |
| S — Day 1 spike | 1 | 5 | 0 | 8 | 0 | 14 | 7% |
| F — Foundation | 3 | 0 | 0 | 10 | 0 | 13 | 23% |
| U — User research | 0 | 0 | 0 | 5 | 0 | 5 | 0% |
| P — Paste-text path, results, Q&A | 0 | 0 | 0 | 10 | 0 | 10 | 0% |
| C — Capture and transcription | 0 | 0 | 0 | 10 | 0 | 10 | 0% |
| T — Trust and verification | 0 | 0 | 0 | 15 | 0 | 15 | 0% |
| A — Accessibility and hardening | 0 | 0 | 0 | 15 | 0 | 15 | 0% |
| R — Release readiness | 0 | 0 | 0 | 14 | 0 | 14 | 0% |
| X — Submission | 1 | 0 | 0 | 8 | 0 | 9 | 11% |
| **All P0 work** | **11** | | | | | **112** | **10%** |
<!-- progress:end -->

**Last updated:** 2026-11-02 (UTC) · **Time to deadline at last update:** 12 days · **Repo:** `github.com/sightline-team/sightline`, **already public** (HACKATHON.md step 2 satisfied), `main` green — docs + a building toolchain (config boundaries, CSP/headers, lint/typecheck/test/build); no product features yet

## 2. Current focus

Update this list on every contribution. Keep it to 3–5 items.

1. **S-00 (human, ~15 minutes, unblocks everything)** Get a NEAR AI Cloud API key at `https://cloud.near.ai`; $10 of credits can be claimed by joining NEAR Builders at `https://nearbuilders.org/join` (HACKATHON.md Q-000). Source reading has taken the spike as far as it can go: what a key still buys is (a) a browser E2EE call against a live enclave → sets the privacy claim, (b) which image model is actually served, with latency and price, (c) numeric accuracy on bad photos → decides T-11, (d) a live CORS preflight, (e) real fixtures, (f) the cost figure. Blocker B-05.
2. **Agent track, no key needed:** F-07 and F-10 (types, reducer, `AppError`), then T-04/T-05 `claims.ts` and its tests, then P-01…P-06 to reach Gate 2 (fixture demo). F-03 (client) and the rewritten F-04 (per-model allowlist) can also be built now against the endpoint shapes in `SPIKE_RESULTS.md`; only their live halves wait for the key.
3. **F-11 `roadmap:check`** — the roadmap rule is currently enforced by hand, and hand enforcement is how it silently dies. Next slot after the reducer.
4. **D-07** (human) Answer the four open questions from `docs/PRD.md` §12: which devices and screen readers exist, whether one real blind or low-vision user is reachable by Day 3, acceptance of the weaker true privacy sentence if E2EE is unavailable, and who pays per document. Question 3 is now better informed — E2EE is documented, just not proven from a browser (`SPIKE_RESULTS.md` §2). Blocks the testing plan and claim wording. Blocker B-01.
5. **U-01** Start looking for one real blind or low-vision person to talk to. Long lead time, so start now.

## 3. Update protocol (every contribution)

Do all of these **in the same commit as the work**:

1. **Status:** set the checkbox of every item you touched (legend in §4). Add the date and your name/agent id on `[~]`.
2. **Evidence:** for `[x]`, add one line `Evidence:` naming the test, command output, file, or SPIKE_RESULTS entry that proves it. No evidence → not done.
3. **New work found:** add a new item with the next free ID in its phase. **Never reuse or renumber IDs.**
4. **Cut work:** mark `[-]` with a reason. Do not delete items.
5. **Update log:** append an entry at the **top** of §10: `date (UTC) · who · item IDs · summary · files/areas · evidence · follow-ups`. Trivial changes (typos, docs-only) still get a one-line entry.
6. **Dashboard:** refresh the progress table (`npm run roadmap:check -- --write` once F-11 exists; by hand before that).
7. **Current focus (§2):** update to the next 3–5 items.
8. **Blockers (§8):** add or clear entries.
9. **Facts:** if you resolved a `[Unverified]` claim, record it in `docs/SPIKE_RESULTS.md`, update the affected doc's marker, and list the doc in the log entry.
10. **Merge conflicts in this file:** keep both sides' log entries, sort by timestamp, newest first; recount the dashboard.

Never rewrite or delete past log entries. Never mark something done that was not run.

## 4. Legend and definition of done

| Mark | Meaning |
|---|---|
| `[ ]` | Not started |
| `[~]` | In progress (add `— name, YYYY-MM-DD`) |
| `[x]` | Done **with evidence** |
| `[!]` | Blocked (add reason and an entry in §8) |
| `[-]` | Cut (add reason; excluded from totals) |

**An item is done when:** it meets its "Done when", `npm run lint`, `typecheck` and `test` pass, accessibility basics are met for any UI, no new `[Unverified]` assumption is left unrecorded, and this file is updated.

Item format: **ID** · task · _Deps_ · _Done when_ · _Ref_.

## 5. Readiness gates ("100% ready")

The repo is **100% ready** when Gates 0–6 pass; Gate 7 is submission.

| Gate | Name | Passes when | Required items |
|---|---|---|---|
| 0 | Docs & agent instructions | All docs at v0.2+, instruction files exist | D-01 – D-07 |
| 1 | Spike decisions | Unknowns answered, go/no-go recorded | S-00 – S-13 |
| 2 | Fixture demo | `npm run dev:fixtures` works with no `.env`: paste-text → results → Q&A → trust page, incl. a failed-verification case | F-01 – F-11, P-01 – P-10, T-08 |
| 3 | Real end-to-end | Relay → NEAR AI Cloud works for text **and** images (5-page case) | C-01 – C-10, F-03 – F-06 |
| 4 | Trust | Claims computed from checks; tampered attestation blocks sending; tests green | T-01 – T-09, T-12, T-14 (+ T-10/T-11/T-13 unless cut) |
| 5 | Accessibility | axe clean; manual screen-reader pass on available devices; report written | A-01 – A-15 |
| 6 | Release | README complete, clean-checkout run, deployed URL, secrets scan, licence, docs audit, cold agent dry run | R-01 – R-13 |
| 7 | Submitted | X post live, form submitted, links verified logged-out | X-01 – X-07 |

## 6. Phases and items

Dates are target windows in UTC. If a phase slips, cut scope (§9), do not move the deadline.

### Phase D — Documentation and planning

- [x] **D-01** PRD v0.2. _Evidence:_ `docs/PRD.md` v0.2 incl. §12 hard-questions review.
- [x] **D-02** ARCHITECTURE v0.2. _Evidence:_ `docs/ARCHITECTURE.md` v0.2.
- [x] **D-03** ARCHITECTURE_ESSENTIALS v0.2. _Evidence:_ `docs/ARCHITECTURE_ESSENTIALS.md`.
- [x] **D-04** PROJECT_STRUCTURE v0.2. _Evidence:_ `docs/PROJECT_STRUCTURE.md`.
- [x] **D-05** AGENTS.md and CLAUDE.md. _Evidence:_ files at repo root; CLAUDE.md imports AGENTS.md.
- [x] **D-06** ROADMAP.md with update protocol; rule added to all docs. _Evidence:_ this file; tracking-rule notes in PRD, ARCHITECTURE, ESSENTIALS, STRUCTURE.
- [ ] **D-07** (human) Answer the four open questions in `PRD.md` §12: devices/screen readers owned; access to a real user by Day 3; accept the weaker true privacy sentence if E2EE is unavailable; who pays per document. _Done when:_ answers recorded in `docs/PRD.md` §12 and §8, and in the log.

### Phase S — Day 1 spike (2026-11-02 → 11-03)

Outputs go in `docs/SPIKE_RESULTS.md`. Do not build product code on a `[Unverified]` item before its spike item is done.

- [ ] **S-00** Get a NEAR AI Cloud API key; confirm credits/billing and any key restrictions. _Done when:_ key works against `/v1/models`; stored only in local `.env`, never committed.
- [~] **S-01** **E2EE to the enclave:** available? mechanism? usable from a browser? _Done when:_ yes/no + minimal working call or a written reason it is not feasible. _Ref:_ ARCH §14.1. **Sets the privacy claim.** _2026-11-02 Qoder agent — half closed by reading:_ the mechanism is documented in full (protocol v2: X25519 ECDH → HKDF-SHA256 `info "ed25519_encryption"` → XChaCha20-Poly1305, Ed25519 keys converted, model key from `model_attestations[0].signing_public_key`, wire `[eph32][nonce24][ct+tag]`) in `docs/SPIKE_RESULTS.md` §2. The browser half is open: only Python/Node examples exist and XChaCha20-Poly1305 is not a WebCrypto algorithm, so it needs `@noble/ciphers`. Needs a key to close.
- [ ] **S-02** List models: which are TEE-hosted **and** accept images; record latency and price per page. _Deps:_ S-00. _Done when:_ table in SPIKE_RESULTS naming the chosen vision model and a fallback. _Reading done 2026-11-02:_ candidates are `Qwen/Qwen3-VL-30B-A3B-Instruct`, `Qwen/Qwen3.8-27B`, `Qwen/Qwen3.8-27B-abliterated`, `moonshotai/kimi-k2.6`, `moonshotai/kimi-k3`, `z-ai/glm-5.3-flash` (all `attestationSupported: true` with `image` input on the catalog page). Liveness, latency and price still need the key. **Design consequence: the flags are per-model, not on `/v1/models` — see ADR-18 and the F-04 rewrite.**
- [ ] **S-03** Prepare 10 synthetic test documents plus 4–5 deliberately bad photos (glare, angle, cut-off, rotated, table-heavy bill, medicine label), **taken without looking at the screen**. Run them through the vision model. _Deps:_ S-02. _Done when:_ transcripts saved; numeric misreads counted. **Trigger:** ≥1 numeric misread → build T-11.
- [x] **S-04** Reference verifier review: which checks does it perform, in what language, what would a port take? _Done when:_ the **minimum honest verification set** is written down (ARCH §10) with a go/no-go on the TDX quote check. _Evidence:_ `docs/SPIKE_RESULTS.md` §7 reads `nearai/nearai-cloud-verifier` (MIT) as shipping a native TypeScript `ts/` that uses `dcap-qvl-node` for TDX quotes, plus the check list from its README (GPU TEE via NRAS, Intel TDX quote validation, ECDSA signature verification, Sigstore provenance, gateway TLS domain verification, compose-manifest → `mr_config`, nonce-in-`report_data`) — so the port is a port, not a rewrite. The resulting set is written in `docs/ARCHITECTURE.md` §10 with go/no-go per check: nonce binding **[Go]**, response signature **[Go]**, NRAS GPU verdict **[Go]**, TDX quote **[Go, last, gated on B-05]**.
- [ ] **S-05** Response-signature fetch + verification end to end. _Deps:_ S-02, S-04. _Done when:_ one real response verified against the attested key (script output saved). _Shape now known (ADR-19):_ `GET /v1/signature/{chat_id}`, signed text `{model_id}:{request_hash}:{response_hash}` (`provider_tee`) or `{request_hash}:{response_hash}` (`gateway`), retry on "Chat id not found or expired", 60-minute byte retention.
- [~] **S-06** Browser CORS test against `cloud-api.near.ai`. _Done when:_ allowed/blocked recorded. **Blocked → T-13 is cut.** _2026-11-02 Qoder agent:_ `nearai/cloud-api` `crates/api/src/lib.rs:1075-1097` **[Verified in source]** opens CORS for any origin on every non-`/v1/admin` path, and NEAR's own SDK ships a browser entry. T-13 therefore **stays in** (it is no longer cut by default), but a source read is not a live preflight — the browser test still needs a key.
- [ ] **S-07** Direct-completions host exists for the chosen model(s)? _Done when:_ slug recorded or "none".
- [ ] **S-08** Hosting limits: request body size and execution time on the plan you will deploy to, tested with a real 5-page upload and a slow vision call. _Done when:_ pass/fail and any needed design change recorded.
- [ ] **S-09** Measure cost per document (1-page and 5-page). _Done when:_ numbers in SPIKE_RESULTS.
- [~] **S-10** Can the demo key be capped by a prepaid balance? _Done when:_ answer recorded; else F-06 uses a shared counter. _2026-11-02 Qoder agent:_ the mechanism exists **[Verified]** — `PATCH /v1/workspaces/{workspace_id}/api-keys/{key_id}/spend-limit` with `spendLimit` in nano-USD, and billing is split in integer nano-USD across the org's active credit limits (`grant → staking_farm → transfer → payment → postpay`). Open half: whether that PATCH is reachable on the account type we get, which needs the key. F-06 should plan for **both** the cap and a shared counter.
- [ ] **S-11** Record fixtures: real transcribe/structure/Q&A responses and sample attestation reports (good, tampered, expired). _Deps:_ S-02 – S-05. _Done when:_ files in `fixtures/` with no real personal data. _Note:_ fixtures built before S-11 are **authored synthetic** and must be labelled as such, never called "recorded".
- [~] **S-12** Fill `docs/SPIKE_RESULTS.md`; flip `[Unverified]` → `[Verified]` (or revise) in PRD/ARCH/ESSENTIALS. _Done when:_ no `[Unverified]` remains for items the spike covered. _2026-11-02 Qoder agent:_ file created with 9 sections and every claim sourced; markers flipped in `ARCHITECTURE.md` §2/§3/§4/§8/§10/§14/§17, `ARCHITECTURE_ESSENTIALS.md`, `PRD.md` §8/§11/§12, `PROJECT_STRUCTURE.md` §1. Still `[Unverified]`: everything that needs a live call (nothing left that reading could settle). Reopens when S-02/S-03/S-05 produce measurements.
- [~] **S-13** Go/no-go decisions recorded as log entry + ADRs: (a) privacy claim level, (b) vision core vs paste-text core, (c) Mode A in or out, (d) verification set, (e) numeric verification pass in or out. _Done when:_ all five decided in writing. _2026-11-02 Qoder agent, 3 of 5 decided:_ **(c) Mode A: in** (source-level CORS is open; key must be in the browser — ADR-17), **(d) verification set: decided** in ARCH §10, and **(e) numeric pass: on trigger** (built only if S-03/C-10 show a numeric misread). **(a)** the claim level is still set by the browser-E2EE unknown, and **(b)** vision-core vs paste-text-core by S-02 — both need the key, so both stay open; ADR-16–20 recorded for what is settled.

### Phase F — Foundation (2026-11-03 → 11-05)

- [x] **F-01** Initialise repo: Next.js (App Router), TypeScript strict, ESLint, Vitest, Playwright; commit docs to `docs/`, and `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` to root. _Evidence:_ `npx eslint .`, `npx tsc --noEmit` and `npx vitest run` (20 tests in 2 files) all exit 0; `npx next build` exits 0 with route `/`. Next 16.4.4, React 19.3.1, TS 5.9.3 pinned in `package.json`. Vitest/Playwright configs use `.mts` because Vite 7 loads a `.ts` config as CommonJS.
- [x] **F-02** `.env.example`, `lib/config.ts` (zod). _Done when:_ app starts with **no `.env`** and defaults to fixtures mode. _Evidence:_ `npx next dev` with no `.env` file present returned HTTP 200 and rendered `Running mode: fixtures · Relay enabled: false · Direct mode allowed: false`; `tests/unit/config.test.ts` (13 tests) covers the fail-closed downgrade of relay and direct to fixtures, an unknown mode name throwing, and a non-URL base throwing. `NEXT_PUBLIC_ALLOW_DIRECT` defaults to false until S-06 proves CORS.
- [ ] **F-03** `lib/near-ai/client.ts`: baseUrl + header provider, abort, one retry, no content logging. _Done when:_ unit tests with a mocked fetch.
- [ ] **F-04** `lib/near-ai/models.ts`: candidate list + **per-model metadata call**, TEE + image-modality filter, exact-id allowlist; refuses non-TEE models. _Rewritten 2026-11-02 per ADR-18:_ the flags we need (`metadata.attestationSupported`, `providerType`, `metadata.verifiable`, `architecture.inputModalities`) are **absent from `GET /v1/models`** and live on `GET /v1/model/{model_name}`, so the filter cannot be list-only. Fail closed on any model whose metadata is missing or unreadable. _Done when:_ test proves a proxied (`providerType: external`, `attestationSupported: false`) model is rejected **and** a model with unknown metadata is rejected.
- [ ] **F-05** `/api/relay/[...path]`: fixed host, exact-path allowlist (`POST /v1/chat/completions`, `GET /v1/attestation/report`, `GET /v1/signature/{chat_id}`), model allowlist, size cap, streaming, no body logging. _Deps:_ F-03, S-08. _Done when:_ A-09 tests exist and pass for rejected path/oversize. If T-10 ships, the body forwarded is ciphertext (ADR-16).
- [ ] **F-06** Rate limit on shared store **plus** a key cap where available. _Deps:_ S-10. _Note 2026-11-02:_ the per-key `spendLimit` PATCH is confirmed to exist, but reachability on our account is open, so build the shared counter as the primary control and treat the cap as belt-and-braces. _Done when:_ limit demonstrably holds across two instances/processes.
- [ ] **F-07** `lib/session/reducer.ts` + `types/index.ts` (Session, Page, Transcript, Analysis, TrustRecord…). _Done when:_ types match ARCH §7; reducer unit-tested.
- [ ] **F-08** `lib/a11y/announcer.tsx` + `layout.tsx` (skip link, landmarks, `<html lang>`, fixtures banner). _Done when:_ axe clean on the empty shell.
- [ ] **F-09** `lib/fixtures` replay layer, `scripts/record-fixtures.ts`, `npm run dev:fixtures`. _Deps:_ S-11. _Done when:_ clean checkout runs the full flow with no key (R9).
- [ ] **F-10** `lib/errors.ts`: `AppError` codes → plain-language messages. _Done when:_ every error in ARCH §13 has a message.
- [ ] **F-11** `scripts/roadmap-check.ts` + `npm run roadmap:check` (+ `--write` regenerates the dashboard): fails if any non-merge commit in the range does not touch `ROADMAP.md`, if dashboard counts are wrong, or if an `[x]` item has no `Evidence`. Add a git hook and CI step. _Done when:_ a commit without a ROADMAP change is rejected locally and in CI.
- [ ] **F-12** CI workflow: lint, typecheck, test, `roadmap:check`. _Deps:_ F-01, F-11. _Done when:_ green on the default branch.
- [x] **F-13** `.gitignore` (`.env*`, build output), `server-only` guard on `lib/server` and `app/api`. _Done when:_ importing server code into a client component fails the build. _Evidence:_ a temporary `src/app/probe/page.tsx` marked `'use client'` that imported `serverConfig` made `npx next build` exit **1** with `You're importing a module that depends on "server-only"` and the chain `./src/lib/server/env.ts [Client Component Browser] ← ./src/app/probe/page.tsx`; the probe was then deleted and the build returned to exit 0. First probe attempt in `src/app/_probe/` proved nothing (an underscore folder is a Next private folder, never compiled) — that is why the route was re-made routable. `.gitignore` covers `.env`, `.env.*` with `!.env.example`. `app/api/*` route handlers will import the same guard when F-05 creates them.

### Phase U — User research (parallel; first session by 2026-11-05)

- [ ] **U-01** Find at least one blind or low-vision person willing to talk (through your network or community organisations). _Done when:_ a session is scheduled.
- [ ] **U-02** Hold the session with consent. Ask: how do you handle sensitive mail today, what would you trust, is explanation or reading more useful, what would make you stop using this. _Done when:_ notes in `docs/USER_RESEARCH.md` (no personal documents recorded).
- [ ] **U-03** Update PRD personas, §2 and §12 from findings; revise scope if the premise is weakened. _Deps:_ U-02.
- [ ] **U-04** If no user is reachable by 2026-11-05: record it, weaken the Impact claim in README, mark `[!]`. 
- [ ] **U-05** (P1) Second session with the working prototype.

### Phase P — Paste-text path, results, Q&A (2026-11-04 → 11-06)

Built first because it needs no vision model, works in fixture mode, and is the fallback for risk 1.

- [ ] **P-01** `analysis/prompts.ts` (structure, Q&A) + `schemas.ts` (zod). _Done when:_ prompts match ARCH §9; schemas reject malformed output.
- [ ] **P-02** `analysis/grounding.ts`: sets `quoteFound` by exact substring check. _Done when:_ unit tests incl. near-miss quotes; docs never describe it as page-verified.
- [ ] **P-03** `analysis/pipeline.ts` text path. _Deps:_ F-03, P-01. _Done when:_ pasted text → validated `Analysis` in fixture mode and real mode.
- [ ] **P-04** `ResultsView`: Summary → Key facts (with quotes) → Actions → Warnings → Full text → Ask → Trust receipt; "Skip to full text". _Done when:_ heading order verified by an e2e test.
- [ ] **P-05** Home page: paste-text input. _Done when:_ keyboard- and screen-reader-operable.
- [ ] **P-06** `qa/ask.ts` + `AskPanel`: transcript-only answers, `notInDocument`, `quoteFound`. Disclose that OS dictation is handled by the OS. _Done when:_ 5 prepared questions on 3 docs answered correctly or correctly refused.
- [ ] **P-07** Safety notices (medication, dose, legal deadline, money); no scam-detection claim; English-only message; urgency caution. _Done when:_ copy reviewed for plain language.
- [ ] **P-08** Error paths: invalid JSON (one repair retry, then transcript only), `finish_reason: length`, model refusal → offer paste-text. _Done when:_ unit tests for each.
- [ ] **P-09** `speech/SpeakButton`: one opt-in read-aloud button with rate; off by default. _Done when:_ no auto-play; stops on Forget.
- [ ] **P-10** `session/forget.ts` + UI: reset state, revoke object URLs, abort requests, clear session keys. _Done when:_ test confirms app state and storage hold no document data afterwards (README states what cannot be cleared).

### Phase C — Capture and transcription (2026-11-05 → 11-08)

- [ ] **C-01** `image/prepare.ts`: `createImageBitmap` resize, orientation, JPEG, EXIF/GPS stripped. _Done when:_ test with a GPS-tagged JPEG proves metadata is gone.
- [ ] **C-02** `CaptureView` + `PageList`: native camera input, 1–5 pages, remove, retake last, labels "Page n". _Done when:_ operable with a screen reader.
- [ ] **C-03** Transcription request per page; prompt per ARCH §9 (tables row by row, `[illegible]`, `captureIssues`, page labels); strict response schema. _Deps:_ S-02, F-03.
- [ ] **C-04** Retake loop: `needs_retake` status, announce the specific issue and edge, offer retake or continue anyway. _Done when:_ deliberately cut-off photo triggers the right message.
- [ ] **C-05** Page-label sanity check: warn on gaps/duplicates ("Page 2 of 3" missing). _Done when:_ unit test.
- [ ] **C-06** Handle `not_a_document`, handwriting, rotated, glare messages; plain-language copy review. _Done when:_ each `CaptureIssue` has a tested message.
- [ ] **C-07** Memory test with large camera images on a real mid-range phone. _Done when:_ no crash at 5 pages. (Needs a device.)
- [ ] **C-08** 5-page upload end to end within host limits (one request per page). _Deps:_ S-08, F-05. _Done when:_ passes on the deployed host or an equivalent.
- [ ] **C-09** Golden set: `public/sample-docs` (synthetic + bad photos) + expected facts JSON + `scripts/run-golden.ts`. _Deps:_ S-03.
- [ ] **C-10** Measure fact accuracy on the golden set, **numbers separately**; decide T-11. _Done when:_ numbers in README draft with the small-sample caveat.

### Phase T — Trust and verification (2026-11-07 → 11-09)

- [ ] **T-01** `near-ai/attestation.ts`: fresh nonce per session (32 random bytes as 64 hex), fetch report, short-lived cache, call `/api/verify`. _Deps:_ S-04. _Note:_ `GET /v1/attestation/report` requires an API key, so in Mode A the browser calls it with the user's own key (ADR-17).
- [ ] **T-02** `near-ai/signatures.ts`: fetch + verify response signatures with `@noble/curves`; fixed test vectors. _Deps:_ S-05. _Shape fixed by ADR-19:_ the signature is a **separate** `GET /v1/signature/{chat_id}`, not part of the completion; rebuild the signed text per `signature_kind` (`provider_tee` → `{model_id}:{request_hash}:{response_hash}`, `gateway` → `{request_hash}:{response_hash}`), keep the exact wire bytes (streaming payloads end in two newlines that belong in the hash), retry on `Chat id not found or expired`, and remember bytes are only retained 60 minutes.
- [ ] **T-03** `/api/verify`: heavy checks to the scope decided in S-13(d); receives no user content. _Done when:_ returns named `CheckResult[]` with `ran`/`passed`.
- [ ] **T-04** `TrustRecord` builder + `features/trust/claims.ts` mapping record → claim → copy. _Done when:_ no privacy sentence exists outside `claims.ts`.
- [ ] **T-05** Claims-ladder unit tests: `e2ee:false` can never yield the E2EE statement; `partial` never renders as "verified"; fixtures mode shows the demo banner statement.
- [ ] **T-06** Fail-closed flow: nothing document-derived is sent before required checks pass; plain-language block message. _Done when:_ test asserts zero outbound document bytes on failure.
- [ ] **T-07** Attestation changes mid-session: re-fetch once, then fail clearly.
- [ ] **T-08** Fixtures for good / tampered / expired attestation and the verification tests that use them. _Deps:_ S-11.
- [ ] **T-09** `TrustReceipt` + `/trust` page: plain-language claim, checks that ran and did not, technical details in `<details>`.
- [ ] **T-10** (conditional on S-01) E2EE to the attested key. _Done when:_ request bodies are ciphertext on the wire in a test. _Cut if S-01 = no._ _Unblocked by reading 2026-11-02 (SPIKE §2, ADR-16):_ protocol v2 = X25519 ECDH → HKDF-SHA256 with `info "ed25519_encryption"` → XChaCha20-Poly1305, Ed25519 key from `model_attestations[0].signing_public_key` converted to X25519, wire `[eph32][nonce24][ct+tag]` hex, headers `X-Client-Pub-Key` / `X-Model-Pub-Key` / `X-Signing-Algo: ed25519` / `X-Encryption-Version: 2`. **New dependency needed: `@noble/ciphers`** (XChaCha20-Poly1305 is not WebCrypto; `@noble/curves` and `@noble/hashes` already chosen) — WASM-free, browser-safe. Response decryption covers `choices[0].message.content` (and per chunk when streaming). `/v1/responses` does not accept encrypted input, so it is not used.
- [ ] **T-11** (conditional on C-10) Numeric verification pass; sets `numbersRechecked`; UI says "double-check this number" on disagreement. _Cut if no numeric misreads._
- [ ] **T-12** Signature failure path: discard the response, tell the user, retry.
- [ ] **T-13** (conditional on S-06) Mode A direct / bring-your-own key via `sessionStorage`. _Cut if CORS blocked._ _2026-11-02:_ source reading says CORS is open for non-admin paths, so this item is **live**, pending the preflight. The key must be in the browser because the attestation and signature endpoints require one (ADR-17).
- [ ] **T-14** README section listing exactly which attestation checks ran and which did not, matching `CheckResult` output.
- [ ] **T-15** `scripts/crosscheck.ts`: run the official `@nearai/inference-sdk` (`InferenceClient({ apiKey, e2ee: true })`, `client.verifyResponse(id)`) against the same live response our verifier checks, and print where the two verdicts differ. _Deps:_ S-05, T-02, T-03. _Why (ADR-20):_ the SDK stays **out** of the app so the receipt describes our code; this script is the second opinion that catches us getting it wrong. Dev-only, never imported by `src/app` or a client bundle.

### Phase A — Accessibility and hardening (2026-11-09 → 11-11)

- [ ] **A-01** Playwright + axe on every route. _Done when:_ no serious/critical violations.
- [ ] **A-02** Network assertion: no requests outside self and NEAR AI Cloud hosts; CSP in `next.config.ts`.
- [ ] **A-03** Manual screen-reader pass, device 1 (add, remove, retake, analyse, results, ask, trust, forget). Record in `tests/a11y/manual-checklist.md`.
- [ ] **A-04** Manual screen-reader pass, device 2. If only one device exists, mark and note it.
- [ ] **A-05** Keyboard-only pass on desktop.
- [ ] **A-06** Focus-management audit (new view heading; error summary).
- [ ] **A-07** Progress announcements about every 10 s, no spam, verified with a screen reader.
- [ ] **A-08** High-contrast mode, `prefers-reduced-motion`, 200% zoom / large text.
- [ ] **A-09** Relay tests: rejected path, oversized body, rate limit, no content in logs.
- [ ] **A-10** Privacy tests: no document content in server logs; no third-party requests; no document data in storage after Forget.
- [ ] **A-11** Eyes-closed photo round (≥5 photos): record failures, fix the top three.
- [ ] **A-12** (P1) Wake lock during analysis; backgrounded-app abort → clear message → retry.
- [ ] **A-13** `docs/ACCESSIBILITY_REPORT.md`: tested, not tested, failures, fixes.
- [ ] **A-14** Prompt-injection tests: documents containing instructions to the AI do not change output structure or behaviour.
- [ ] **A-15** `settings/page`: mode, API key (Mode A), read-aloud rate, high contrast.

### Phase R — Release readiness (2026-11-11 → 11-13)

- [ ] **R-01** Deploy relay-mode URL with budget and limits; smoke-test with a 5-page upload. _Deps:_ F-05, F-06.
- [ ] **R-02** Final cost-per-document figure for the README. _Deps:_ S-09.
- [ ] **R-03** Clean-checkout test: fresh clone, two commands, no `.env`, full flow in fixtures mode.
- [ ] **R-04** README complete per `docs/PROJECT_STRUCTURE.md` §7 (incl. link to this ROADMAP).
- [ ] **R-05** LICENSE and attributions (including the reference verifier's licence).
- [ ] **R-06** Secrets scan across history; `.env*` ignored; deployed env vars only on the host.
- [ ] **R-07** Confirm all sample documents are synthetic; no real personal data anywhere.
- [ ] **R-08** Docs consistency audit: markers resolved, PRD/ARCH match the code, STRUCTURE tree matches the repo, ADRs updated.
- [ ] **R-09** Feature freeze at 2026-11-13 00:00 UTC; afterwards only bug fixes, each logged here.
- [ ] **R-10** Final run green: `lint`, `typecheck`, `test`, `test:e2e`, `roadmap:check`.
- [ ] **R-11** Repo public; confirm it opens in a logged-out browser.
- [ ] **R-12** Demo script for the six beats in `docs/PRD.md` §9.
- [ ] **R-13** Cold dry run: give the README to a coding agent with no other context; record what failed; fix. (Reviewers screen submissions with Claude Code and Codex.)
- [ ] **R-14** README compliance section, driven by the rules in `HACKATHON.md` rather than by taste. Must state: every line of code here was written inside the allowed window (announcement 2026-10-19 → 2026-11-14; first commit 2026-11-02) so there is no baseline to hide (Q-001/Q-003); the dependencies, libraries and **AI assistance** used, since both are permitted but must be disclosed (Q-005); the licence (MIT, Q-014); that the repo is public and stays public through judging; and a "do X → see Y" instruction set that a judge or a screening agent with **no API key** can follow to reproduce the whole demo, including the failed-verification case (Q-012, Q-017). Written for a machine reader first: no marketing sentences, no claim the code does not enforce. _Done when:_ a fresh clone plus two commands reproduces the six demo beats from `docs/PRD.md` §9 with no key, and this section exists.

### Phase X — Submission (2026-11-13 → 11-14)

- [x] **X-01** Read `https://nearhackathon.com/HACKATHON.md` (demo-post tips and submission steps) and record any rule that changes this plan. _Evidence:_ official file fetched and confirmed **byte-identical** to the committed copy at repo root (`diff -q` clean, 235 lines, 2026-11-02). Rules that changed this plan are applied in X-04, X-07, X-08, R-14 and logged here; the material ones: submissions go to `POST /api/applications` (not only a form), a submission **cannot be edited** after it is sent, `website` is a spam trap that rejects the submission, one submission per repository and at most two per email, the repo must be public by 2026-11-14T23:59Z, a local-only demo is acceptable if the README is reproducible (Q-012), Claude Code and Codex screen every project before the human jury (Q-017), and track id for us is `privacy`.
- [ ] **X-02** Record demo video and screenshots covering all six demo beats.
- [ ] **X-03** Demo post on X: says it was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, attaches video or screenshots. **The human publishes it**; an agent may draft the text only and must never post on their behalf (HACKATHON.md §Never without explicit confirmation). Follow HACKATHON.md §2: lead with the user problem, show one complete moment from user action to visible result, say concretely what NEAR enables (private inference inside an attested enclave — not "powered by NEAR"), link repo and demo, invite feedback. Optionally also tag @NearLegion and @NearBuilders for amplification. _Deps:_ X-02.
- [ ] **X-04** Build the submission payload against the real contract in `HACKATHON.md` §Submission API — **not** the v0.1 guess. Fields, exactly these and no others: `requestId` (UUID, generated once, **reused on every retry** of the same submission), `projectName` (2–80), `leadName` (2–80), `email` (valid, ≤160, at most 2 submissions per email), `size` (one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` — spacing exact), `tracks` (array, `["privacy"]` for us; each listed once), `nearAddress` (2–64 lowercase, must match the regex in HACKATHON.md; from the human, never invented), `projectUrl` (≤300, unique per repository), `demoUrl` (≤300, the X post), `idea` (20–2000), `consent` (true only after the human hears the notice verbatim). **Never send `website`: a non-empty value rejects the submission.** Body ≤12000 bytes. Print the payload for the human and wait for an explicit yes; 403 means stop and tell the human, 409 means already submitted or email limit. _Done when:_ payload validated against every rule above and approved by the human, held outside the repo (it contains personal data — never commit it). _Ref:_ HACKATHON.md §3, §Submission API.
- [ ] **X-05** Submit **before 2026-11-14 12:00 UTC** (hard limit 23:59 UTC) with `curl -X POST https://nearhackathon.com/api/applications`. A submission **cannot be edited afterwards**, so send only when the repo is public *and* the demo post is live. _Deps:_ R-10, R-11, X-03, X-04.
- [ ] **X-06** Verify repo and post open logged-out; confirm the **201** response from the submissions API (201 means saved; there is no edit path afterwards); tag the submitted commit `submission-v1`.
- [ ] **X-07** During judging (2026-11-16 → 11-18): watch Discord/X for questions. Do not push risky changes. The old **[Unverified]** question about post-submission edits is **resolved**: HACKATHON.md states a submission cannot be edited, the repository must stay public through judging (Q-014), and a hosted demo should be kept up to 2026-11-18, ideally 11-25 (Q-012). Repo changes during judging are allowed but cannot alter what was submitted.
- [ ] **X-08** (human) Collect the values only the human can supply, before X-04 can be finished: project name, team lead name, contact email, team size, the **mainnet NEAR account for the prize payout** (named such as `team.near`, or a 64-character implicit account — never created or invented by an agent), and confirmation the demo post link is public. Ask for them in one message; never placehold them. _Done when:_ all six recorded in the log entry that accompanies the submission. _Ref:_ HACKATHON.md §What the human decides.
- [ ] **X-09** Immediately before sending, have the human re-read the exact final JSON, with particular care on `nearAddress` and `projectUrl`: a wrong payout account cannot be corrected, and each repository may be submitted only once (409 on a repeat). _Deps:_ X-04, X-08.

## 7. Stretch (only after Gate 5; excluded from the 100% total)

- [ ] **Z-01** NEAR-account login or pay-per-use (sustainability story). _Ref:_ ADR-9.
- [ ] **Z-02** Encrypted local history unlocked by passphrase.
- [ ] **Z-03** Live camera framing guidance.
- [ ] **Z-04** PII classifier notice.
- [ ] **Z-05** Own-pipeline voice input.
- [ ] **Z-06** Document-type presets.

## 8. Blockers and open decisions

| ID | Item | Blocks | Owner | Opened | Status |
|---|---|---|---|---|---|
| B-01 | D-07 answers (devices, real user, claim wording, who pays) | A-03/A-04 plan, T-04 copy, README | Human | 2026-11-02 | Open |
| B-02 | E2EE availability (S-01) — **narrowed 2026-11-02:** the protocol is documented in full (`SPIKE_RESULTS.md` §2), so the open question is now specifically "does it run from a browser against a live enclave". `@noble/ciphers` covers the one non-WebCrypto primitive. | Privacy claim, T-10 | Human/agent | 2026-11-02 | Open (needs key) |
| B-03 | CORS (S-06) — **narrowed 2026-11-02:** server source allows any origin on non-`/v1/admin` paths, and the official SDK ships a browser entry, so Mode A is no longer assumed dead. Live preflight still outstanding. | T-13, Mode A | Agent | 2026-11-02 | Open (needs key) |
| B-04 | TEE-hosted vision model (S-02) — **narrowed 2026-11-02:** six catalog entries claim `attestationSupported: true` with image input; none is yet proven served, priced or latency-tested. | C-03, whole image path | Agent | 2026-11-02 | Open (needs key) |
| B-05 | **No NEAR AI Cloud API key.** `npm run spike`, S-00 and every measured spike item (S-01…S-03, S-05, S-08…S-11) need one. HACKATHON.md Q-000 says the dashboard at `https://cloud.near.ai` issues the key and $10 of credits can be claimed by joining `https://nearbuilders.org/join`. Fixture-mode building continues regardless. | S-phase, Gate 3, the measured privacy claim, cost per document | Human | 2026-11-02 | Open |
| B-06 | A deploy target for the relay demo (Vercel or any Node host) needs an account and, for a public key, a billing decision. HACKATHON.md Q-012 says a local-only demo is acceptable if the README is reproducible, so this blocks R-01 only, not submission. | R-01, live demo URL | Human | 2026-11-02 | Open |

## 9. Risk watchlist (trigger → action)

| Trigger | Action |
|---|---|
| S-02 finds no usable TEE vision model | Make paste-text the core; images become "experimental"; cut C-phase scope, log it |
| S-01 = no E2EE | Ship the weaker claim; cut T-10; state relay is in the trust path |
| S-06 = CORS blocked | Cut T-13; relay only |
| TDX quote verification not feasible by 2026-11-08 | Ship reduced set; label "not independently verified"; do not extend time |
| Numeric misreads in S-03/C-10 | Build T-11; strengthen warnings |
| Any phase more than 1 day behind | Cut from §7 first, then conditional items, then P1 items |
| No real user by 2026-11-05 | U-04 path; weaken Impact claim |
| Host limits fail 5-page upload (S-08) | Smaller images, one page per request, stream; if still failing, cap at 3 pages and document |
| No device for a screen-reader platform | List it as untested; never claim it |

## 10. Update log (newest first; append at the top; never edit past entries)

Format: `date (UTC) · who · item IDs · summary · files/areas · evidence · follow-ups`

- **2026-11-02 · Qoder agent (for `abrcrmb`) · S-01, S-04, S-06, S-10, S-12, S-13, F-04, F-05, F-06, T-01, T-02, T-10, T-13, new T-15** · Ran the Day-1 spike by **primary-source reading** (no API key yet, so nothing here is measured) and wrote `docs/SPIKE_RESULTS.md` from it. **S-04 is done**; S-01/S-06/S-10/S-12/S-13 are narrowed, not closed. Findings that changed the design: **(1)** E2EE to the enclave exists and is documented as protocol v2 (X25519 ECDH → HKDF-SHA256 `info "ed25519_encryption"` → XChaCha20-Poly1305, key from `model_attestations[0].signing_public_key`, headers `X-Client-Pub-Key`/`X-Model-Pub-Key`/`X-Signing-Algo`/`X-Encryption-Version`), but only Python/Node paths are documented and XChaCha20-Poly1305 is not WebCrypto → the strong claim is **reachable**, and T-10 needs one new dep (`@noble/ciphers`); ADR-16 makes the relay a **ciphertext-only** carrier once a browser call works, which is the first time "our server sees the document" can leave the threat model. **(2)** `GET /v1/attestation/report` and `GET /v1/signature/{chat_id}` both require a key and there is **no keyless attestation path** → Mode A's key must live in the browser (ADR-17), and Mode A can never be the default for our users. **(3)** `attestationSupported` / `providerType` / `verifiable` are **not on `/v1/models`** — they are on `GET /v1/model/{model_name}` — so **F-04 as written could not tell a TEE model from a proxied one** (AGENTS §4.3); rewritten (ADR-18). **(4)** The completion body carries **no signature**: `GET /v1/signature/{chat_id}` signs `{model_id}:{request_hash}:{response_hash}`, streaming payloads end in two newlines that belong in the hash, lookups can transiently 404 → retry, and bytes are retained 60 minutes → T-02 rewritten (ADR-19). **(5)** CORS is open for every non-`/v1/admin` origin in `cloud-api` `crates/api/src/lib.rs:1075-1097`, so **T-13 stays in** instead of being cut by default (live preflight still pending). **(6)** `nearai/nearai-cloud-verifier` is **MIT with a native TypeScript `ts/`** using `dcap-qvl-node`, so the TDX quote check is a port **[Go, last]** rather than the project's biggest risk; ARCH §10 now records the decided minimum honest set with a go/no-go per check. **(7)** `report_data` is "not currently returned in model reports", so nonce binding for a model is `request_nonce` + the NRAS token's `eat_nonce`. **(8)** A per-key cap exists (`PATCH …/api-keys/{key_id}/spend-limit`, nano-USD), so F-06 keeps the shared counter as primary and the cap as backup. **(9)** `@nearai/inference-sdk` is deliberately **kept out of the trust path** — the product is the receipt naming the checks that ran, so the checks must be our code; the SDK becomes a cross-check script (new T-15, ADR-20). **(10)** The `$10 Builders credit` figure is HACKATHON.md Q-000 only, not in NEAR's docs — recorded as an event promise, not an API guarantee. Also measured rather than remembered: the repo is public and reachable (`curl` on the unauthenticated API → `"private": false`, HTTP 200), so HACKATHON.md's public-by-11-14 step is already satisfied. **The claims ladder text in PRD §8 was not changed by any of this** — the UI sentence moves only when a browser call actually succeeds. · files: `docs/SPIKE_RESULTS.md` (new), `docs/ARCHITECTURE.md` §2/§3/§4/§8/§10/§14/§17 (ADR-16…20), `docs/ARCHITECTURE_ESSENTIALS.md`, `docs/PRD.md` §8/§11/§12, `docs/PROJECT_STRUCTURE.md` §1, `ROADMAP.md` · evidence: `docs/SPIKE_RESULTS.md` §1–§9, each line carrying its source URL (openapi.json, e2ee-chat-completions.md, model-attestations.md, quote-nonce-signer.md, `nearai/cloud-api` source, `nearai/nearai-cloud-verifier`, `nearai/inference-sdk`, `near.ai/models`) · follow-ups: S-02/S-03/S-05/S-07/S-08/S-09/S-11 and both halves of S-01/S-06 need B-05 (a key); T-10 additionally needs `@noble/ciphers` approved as a dependency; D-07 question 3 can now be answered with better information.

- **2026-11-02 · Qoder agent (for `abrcrmb`) · X-01, X-04, X-05, X-06, X-07, X-03, new X-08, X-09, R-14** · Read the official event rules and reconciled the plan with them. `HACKATHON.md` fetched from `nearhackathon.com` and confirmed **byte-identical** to the copy the human placed in the workspace (`diff -q` clean, 235 lines), then committed at repo root so agents and judges read the same file. Changes this forced: **X-04 was wrong** — it planned an "optional website" field, and HACKATHON.md says a non-empty `website` **rejects the submission**; it now carries the real contract (`requestId` reused on retry, exact `size` strings, `tracks: ["privacy"]`, the `nearAddress` regex, 12000-byte body, never commit the payload because it holds personal data, 403 = stop and tell the human). X-07's **[Unverified]** marker about post-submission edits is resolved (a submission cannot be edited; repo stays public through judging; hosted demo kept to 11-18, ideally 11-25). X-03 now records that **the human publishes** the X post. New X-08/X-09 cover the values only the human can give (especially the payout NEAR account, which cannot be corrected afterwards) and the final human read of the exact JSON. New R-14 turns the Q-001/Q-002/Q-003/Q-005/Q-012/Q-014/Q-017 rules into README requirements, written for a screening agent with no API key first. Also unblocked: Q-000 says the key comes from the `cloud.near.ai` dashboard with $10 claimable via NEAR Builders, which is now the wording of blocker B-05 and current focus 1. Dashboard recomputed by hand (X 1/9, R total 14, P0 10/111 = 9%). · files: `HACKATHON.md`, `ROADMAP.md`, `docs/PROJECT_STRUCTURE.md` §1 · evidence: the diff above; every rule quoted in this entry is from the committed `HACKATHON.md` · follow-ups: no code change; the submission path is now correct on paper. Still open for the human: B-05 (key), B-01 (D-07 answers), X-08 values.
- **2026-11-02 · Qoder agent (for `abrcrmb`) · F-01, F-02, F-13** · Scaffolded the toolchain and the two configuration boundaries. `package.json` pins Next 16.4.4 / React 19.3.1 / TS **5.9.3** (deliberately not TS 7.0.2, which npm offers as `latest`: the whole toolchain is built against 5.x and an unverifiable compiler swap is not worth the risk) / zod 4.6.7 / @noble 2.4.0 / Vitest 5.1.0 / Playwright 1.64.1, all exact-pinned per `docs/PROJECT_STRUCTURE.md` §3. `src/lib/config.ts` (client-safe, zod) resolves the running mode and **fails closed to fixtures**; `src/lib/server/env.ts` (`server-only`) decides relay availability and refuses to enable the relay in production without a shared rate-limit store. CSP applied to production responses only, `connect-src` pinned to self + NEAR AI Cloud hosts; the `script-src 'unsafe-inline'` concession is recorded as a known limitation in the config comment for the README. Added `NEXT_PUBLIC_ALLOW_DIRECT=false` so Mode A cannot be reached until S-06. · files: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `playwright.config.mts`, `.gitignore`, `.env.example`, `src/app/{layout,page}.tsx`, `src/app/globals.css`, `src/lib/config.ts`, `src/lib/server/env.ts`, `tests/unit/{config,server-env}.test.ts`, `tests/stubs/server-only.ts`, `docs/PROJECT_STRUCTURE.md` §1/§4, `ROADMAP.md` · evidence: `eslint` 0 errors, `tsc --noEmit` exit 0, `vitest run` 20/20 passing in 2 files, `next build` exit 0; `next dev` with **no `.env` file present** returned 200 and rendered `Running mode: fixtures · Relay enabled: false · Direct mode allowed: false`; F-13 guard proven by a temporary client route that made `next build` exit 1 naming `server-only` (first attempt in a `_probe` private folder compiled nothing and was redone). Two mistakes found and fixed in place: three guessed `@types/*` versions that do not exist made the first `npm install` fail behind a `| tail` pipe that hid the exit code, and a zod `.default()` placed after `.transform()` would have returned the untransformed string `''` where a boolean was typed. · follow-ups: F-07/F-10 next, then T-04 `claims.ts`; F-11 `roadmap:check` still missing so the checks above were done by hand; Playwright browsers are not installed yet, so no e2e run has been claimed.
- **2026-11-02 · Qoder agent (for `abrcrmb`) · D-01 – D-06 (evidence now in-repo)** · First real commit to `sightline-team/sightline`: the seven planning docs were untracked on disk and are now committed and pushed to `main`. Placed per `docs/PROJECT_STRUCTURE.md` §1 — `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` at root; `PRD.md`, `ARCHITECTURE.md`, `ARCHITECTURE_ESSENTIALS.md`, `PROJECT_STRUCTURE.md` under `docs/`. Fixed the two bare `PRD.md` references in §2 and R-12 to `docs/PRD.md`; no item status changed, dashboard counts unchanged (D phase still 6/7). · files: `docs/*`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` · evidence: commit pushed to `main`, `git ls-files` lists all seven; `docs/SPIKE_RESULTS.md` still absent (created by S-12) · follow-ups: D-07 (human answers), S-00; `roadmap:check` (F-11) must be taught the root/`docs/` split when it lands.
- **2026-11-02 · Claude (chat) · D-05, D-06** · Created `ROADMAP.md`, `AGENTS.md`, `CLAUDE.md`; added the "every contribution updates ROADMAP.md" rule to PRD, ARCHITECTURE, ARCHITECTURE_ESSENTIALS and PROJECT_STRUCTURE; added ADR-15 and a `roadmap:check` script to the structure. · files: root instruction files, `docs/*` · evidence: files delivered; no repo yet · follow-ups: D-07, S-00.
- **2026-11-02 · Claude (chat) · D-01 – D-04** · Revised PRD/ARCHITECTURE/ESSENTIALS/STRUCTURE from v0.1 to v0.2 after the hard-questions review: claims ladder, fixtures mode, paste-text path, cuts (voice pipeline, reorder UI, local blur checks, extra libraries). · files: `docs/*` · evidence: documents delivered · follow-ups: S-phase.
- **2026-11-02 · Claude (chat) · D-01 – D-04** · First drafts (v0.1) of PRD, ARCHITECTURE, ARCHITECTURE_ESSENTIALS, PROJECT_STRUCTURE; track research on nearhackathon.com. · evidence: documents delivered · follow-ups: hard-questions review.
