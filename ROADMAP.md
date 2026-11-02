# Sightline — ROADMAP

> **Single source of truth for all remaining work.**
> **This file MUST be updated by every contribution** (code, tests, docs, config, fixtures, scripts), by humans and agents alike, **in the same commit as the work**. No exceptions except merge commits. Procedure: §3. Enforced by `npm run roadmap:check` (item F-11).
>
> **Deadline:** 2026-11-14 23:59 UTC (repo + X demo post + form). **Internal submit target:** 2026-11-14 12:00 UTC. **Feature freeze:** 2026-11-13 00:00 UTC.
> **Reading guide for agents:** read §1–§3 and §8, then only the phase containing your item. Do not load the whole file.

---

## 1. Status dashboard

<!-- progress:start -->
| Phase | Done | In progress | Blocked | Todo | Cut | Total (excl. cut) | % |
|---|---|---|---|---|---|---|---|
| D — Documentation and planning | 6 | 0 | 0 | 1 | 0 | 7 | 86% |
| S — Day 1 spike | 0 | 0 | 0 | 14 | 0 | 14 | 0% |
| F — Foundation | 0 | 0 | 0 | 13 | 0 | 13 | 0% |
| U — User research | 0 | 0 | 0 | 5 | 0 | 5 | 0% |
| P — Paste-text path, results, Q&A | 0 | 0 | 0 | 10 | 0 | 10 | 0% |
| C — Capture and transcription | 0 | 0 | 0 | 10 | 0 | 10 | 0% |
| T — Trust and verification | 0 | 0 | 0 | 14 | 0 | 14 | 0% |
| A — Accessibility and hardening | 0 | 0 | 0 | 15 | 0 | 15 | 0% |
| R — Release readiness | 0 | 0 | 0 | 13 | 0 | 13 | 0% |
| X — Submission | 0 | 0 | 0 | 7 | 0 | 7 | 0% |
| **All P0 work** | **6** | | | | | **108** | **6%** |
<!-- progress:end -->

**Last updated:** 2026-11-02 (UTC) · **Time to deadline at last update:** 12 days · **Repo exists yet:** yes — `sightline-team/sightline`, docs only, no code yet

## 2. Current focus

Update this list on every contribution. Keep it to 3–5 items.

1. **D-07** (human) Answer the four open questions from `docs/PRD.md` §12. Blocks the testing plan and claim wording.
2. **S-00 → S-03** Get a NEAR AI Cloud key; check E2EE, TEE vision models, and accuracy on 10 documents incl. bad photos.
3. **U-01** Start looking for one real blind or low-vision person to talk to. This has a long lead time, so start now.
4. **F-01** Initialise the repo once S-00 is done (the spike scripts live in it).

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
- [ ] **S-01** **E2EE to the enclave:** available? mechanism? usable from a browser? _Done when:_ yes/no + minimal working call or a written reason it is not feasible. _Ref:_ ARCH §14.1. **Sets the privacy claim.**
- [ ] **S-02** List models: which are TEE-hosted **and** accept images; record latency and price per page. _Deps:_ S-00. _Done when:_ table in SPIKE_RESULTS naming the chosen vision model and a fallback.
- [ ] **S-03** Prepare 10 synthetic test documents plus 4–5 deliberately bad photos (glare, angle, cut-off, rotated, table-heavy bill, medicine label), **taken without looking at the screen**. Run them through the vision model. _Deps:_ S-02. _Done when:_ transcripts saved; numeric misreads counted. **Trigger:** ≥1 numeric misread → build T-11.
- [ ] **S-04** Reference verifier review: which checks does it perform, in what language, what would a port take? _Done when:_ the **minimum honest verification set** is written down (ARCH §10) with a go/no-go on the TDX quote check.
- [ ] **S-05** Response-signature fetch + verification end to end. _Deps:_ S-02, S-04. _Done when:_ one real response verified against the attested key (script output saved).
- [ ] **S-06** Browser CORS test against `cloud-api.near.ai`. _Done when:_ allowed/blocked recorded. **Blocked → T-13 is cut.**
- [ ] **S-07** Direct-completions host exists for the chosen model(s)? _Done when:_ slug recorded or "none".
- [ ] **S-08** Hosting limits: request body size and execution time on the plan you will deploy to, tested with a real 5-page upload and a slow vision call. _Done when:_ pass/fail and any needed design change recorded.
- [ ] **S-09** Measure cost per document (1-page and 5-page). _Done when:_ numbers in SPIKE_RESULTS.
- [ ] **S-10** Can the demo key be capped by a prepaid balance? _Done when:_ answer recorded; else F-06 uses a shared counter.
- [ ] **S-11** Record fixtures: real transcribe/structure/Q&A responses and sample attestation reports (good, tampered, expired). _Deps:_ S-02 – S-05. _Done when:_ files in `fixtures/` with no real personal data.
- [ ] **S-12** Fill `docs/SPIKE_RESULTS.md`; flip `[Unverified]` → `[Verified]` (or revise) in PRD/ARCH/ESSENTIALS. _Done when:_ no `[Unverified]` remains for items the spike covered.
- [ ] **S-13** Go/no-go decisions recorded as log entry + ADRs: (a) privacy claim level, (b) vision core vs paste-text core, (c) Mode A in or out, (d) verification set, (e) numeric verification pass in or out. _Done when:_ all five decided in writing.

### Phase F — Foundation (2026-11-03 → 11-05)

- [ ] **F-01** Initialise repo: Next.js (App Router), TypeScript strict, ESLint, Vitest, Playwright; commit docs to `docs/`, and `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` to root. _Done when:_ `npm run lint`, `typecheck`, `test` run (even with no tests).
- [ ] **F-02** `.env.example`, `lib/config.ts` (zod). _Done when:_ app starts with **no `.env`** and defaults to fixtures mode.
- [ ] **F-03** `lib/near-ai/client.ts`: baseUrl + header provider, abort, one retry, no content logging. _Done when:_ unit tests with a mocked fetch.
- [ ] **F-04** `lib/near-ai/models.ts`: catalog fetch, TEE + modality filter, allowlist; refuses non-TEE models. _Done when:_ test proves a proxied model is rejected.
- [ ] **F-05** `/api/relay/[...path]`: fixed host, exact-path allowlist, model allowlist, size cap, streaming, no body logging. _Deps:_ F-03, S-08. _Done when:_ A-09 tests exist and pass for rejected path/oversize.
- [ ] **F-06** Rate limit on shared store, or prepaid-balance cap per S-10. _Deps:_ S-10. _Done when:_ limit demonstrably holds across two instances/processes.
- [ ] **F-07** `lib/session/reducer.ts` + `types/index.ts` (Session, Page, Transcript, Analysis, TrustRecord…). _Done when:_ types match ARCH §7; reducer unit-tested.
- [ ] **F-08** `lib/a11y/announcer.tsx` + `layout.tsx` (skip link, landmarks, `<html lang>`, fixtures banner). _Done when:_ axe clean on the empty shell.
- [ ] **F-09** `lib/fixtures` replay layer, `scripts/record-fixtures.ts`, `npm run dev:fixtures`. _Deps:_ S-11. _Done when:_ clean checkout runs the full flow with no key (R9).
- [ ] **F-10** `lib/errors.ts`: `AppError` codes → plain-language messages. _Done when:_ every error in ARCH §13 has a message.
- [ ] **F-11** `scripts/roadmap-check.ts` + `npm run roadmap:check` (+ `--write` regenerates the dashboard): fails if any non-merge commit in the range does not touch `ROADMAP.md`, if dashboard counts are wrong, or if an `[x]` item has no `Evidence`. Add a git hook and CI step. _Done when:_ a commit without a ROADMAP change is rejected locally and in CI.
- [ ] **F-12** CI workflow: lint, typecheck, test, `roadmap:check`. _Deps:_ F-01, F-11. _Done when:_ green on the default branch.
- [ ] **F-13** `.gitignore` (`.env*`, build output), `server-only` guard on `lib/server` and `app/api`. _Done when:_ importing server code into a client component fails the build.

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

- [ ] **T-01** `near-ai/attestation.ts`: fresh nonce per session, fetch report, short-lived cache, call `/api/verify`. _Deps:_ S-04.
- [ ] **T-02** `near-ai/signatures.ts`: fetch + verify response signatures with `@noble/curves`; fixed test vectors. _Deps:_ S-05.
- [ ] **T-03** `/api/verify`: heavy checks to the scope decided in S-13(d); receives no user content. _Done when:_ returns named `CheckResult[]` with `ran`/`passed`.
- [ ] **T-04** `TrustRecord` builder + `features/trust/claims.ts` mapping record → claim → copy. _Done when:_ no privacy sentence exists outside `claims.ts`.
- [ ] **T-05** Claims-ladder unit tests: `e2ee:false` can never yield the E2EE statement; `partial` never renders as "verified"; fixtures mode shows the demo banner statement.
- [ ] **T-06** Fail-closed flow: nothing document-derived is sent before required checks pass; plain-language block message. _Done when:_ test asserts zero outbound document bytes on failure.
- [ ] **T-07** Attestation changes mid-session: re-fetch once, then fail clearly.
- [ ] **T-08** Fixtures for good / tampered / expired attestation and the verification tests that use them. _Deps:_ S-11.
- [ ] **T-09** `TrustReceipt` + `/trust` page: plain-language claim, checks that ran and did not, technical details in `<details>`.
- [ ] **T-10** (conditional on S-01) E2EE to the attested key. _Done when:_ request bodies are ciphertext on the wire in a test. _Cut if S-01 = no._
- [ ] **T-11** (conditional on C-10) Numeric verification pass; sets `numbersRechecked`; UI says "double-check this number" on disagreement. _Cut if no numeric misreads._
- [ ] **T-12** Signature failure path: discard the response, tell the user, retry.
- [ ] **T-13** (conditional on S-06) Mode A direct / bring-your-own key via `sessionStorage`. _Cut if CORS blocked._
- [ ] **T-14** README section listing exactly which attestation checks ran and which did not, matching `CheckResult` output.

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

### Phase X — Submission (2026-11-13 → 11-14)

- [ ] **X-01** Read `https://nearhackathon.com/HACKATHON.md` (demo-post tips and submission steps) and record any rule that changes this plan.
- [ ] **X-02** Record demo video and screenshots covering all six demo beats.
- [ ] **X-03** Post on X: say it was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, attach video/screenshots. _Deps:_ X-02.
- [ ] **X-04** Prepare form fields: project name, team lead, email, team size, track(s), NEAR wallet address, repo link, demo post link, description (20–2,000 characters), optional website, consent.
- [ ] **X-05** Submit the form **before 2026-11-14 12:00 UTC** (hard limit 23:59 UTC). _Deps:_ R-10, R-11, X-03, X-04.
- [ ] **X-06** Verify repo and post open logged-out; confirm form receipt; tag the submitted commit `submission-v1`.
- [ ] **X-07** During judging (2026-11-16 → 11-18): watch Discord/X for questions. Do not push risky changes; whether post-submission edits are allowed is **[Unverified]**, so check HACKATHON.md first.

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
| B-02 | E2EE availability (S-01) | Privacy claim, T-10 | Human/agent | 2026-11-02 | Open |
| B-03 | CORS (S-06) | T-13, Mode A | Agent | 2026-11-02 | Open |
| B-04 | TEE-hosted vision model (S-02) | C-03, whole image path | Agent | 2026-11-02 | Open |

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

- **2026-11-02 · Qoder agent (for `abrcrmb`) · D-01 – D-06 (evidence now in-repo)** · First real commit to `sightline-team/sightline`: the seven planning docs were untracked on disk and are now committed and pushed to `main`. Placed per `docs/PROJECT_STRUCTURE.md` §1 — `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` at root; `PRD.md`, `ARCHITECTURE.md`, `ARCHITECTURE_ESSENTIALS.md`, `PROJECT_STRUCTURE.md` under `docs/`. Fixed the two bare `PRD.md` references in §2 and R-12 to `docs/PRD.md`; no item status changed, dashboard counts unchanged (D phase still 6/7). · files: `docs/*`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md` · evidence: commit pushed to `main`, `git ls-files` lists all seven; `docs/SPIKE_RESULTS.md` still absent (created by S-12) · follow-ups: D-07 (human answers), S-00; `roadmap:check` (F-11) must be taught the root/`docs/` split when it lands.
- **2026-11-02 · Claude (chat) · D-05, D-06** · Created `ROADMAP.md`, `AGENTS.md`, `CLAUDE.md`; added the "every contribution updates ROADMAP.md" rule to PRD, ARCHITECTURE, ARCHITECTURE_ESSENTIALS and PROJECT_STRUCTURE; added ADR-15 and a `roadmap:check` script to the structure. · files: root instruction files, `docs/*` · evidence: files delivered; no repo yet · follow-ups: D-07, S-00.
- **2026-11-02 · Claude (chat) · D-01 – D-04** · Revised PRD/ARCHITECTURE/ESSENTIALS/STRUCTURE from v0.1 to v0.2 after the hard-questions review: claims ladder, fixtures mode, paste-text path, cuts (voice pipeline, reorder UI, local blur checks, extra libraries). · files: `docs/*` · evidence: documents delivered · follow-ups: S-phase.
- **2026-11-02 · Claude (chat) · D-01 – D-04** · First drafts (v0.1) of PRD, ARCHITECTURE, ARCHITECTURE_ESSENTIALS, PROJECT_STRUCTURE; track research on nearhackathon.com. · evidence: documents delivered · follow-ups: hard-questions review.
