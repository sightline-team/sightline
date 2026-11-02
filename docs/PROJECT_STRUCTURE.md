# Sightline — Project Structure (v0.4)

> Companion to `ARCHITECTURE.md`. Trimmed after the hard-questions review: fewer files, fewer scripts, fewer rules. Everything removed is listed in §8. v0.3 reflects the Day-1 spike reading: `models.ts` needs a per-model call (ADR-18), `signatures.ts` has a concrete fetch-and-rebuild shape (ADR-19), `e2ee.ts` has a named cipher stack, `verifier/` ports from the reference verifier's TypeScript directory, and `scripts/crosscheck.ts` is new (ADR-20).
>
> v0.4 is the **as-built** tree after item F-14 scaffolded every directory in §1 on 2026-11-02. Three files this document did not name were added by the scaffold and are now part of the structure: `src/lib/not_built.ts` (the throwing stub contract), `public/icons/icon.svg` (the manifest needs an icon), and the `README.md` files inside `fixtures/`, `fixtures/responses/`, `fixtures/attestation/` and `public/sample-docs/`, which hold the authored-vs-recorded labelling rules and the golden-set case list rather than payloads. §1 entries that describe intent were rewritten to describe behaviour that exists, and the two test directories that had placeholders state which assertions are still `it.todo`.
>
> **Tracking rule:** every contribution to this repo (code, tests, docs, config, fixtures, scripts) must update `ROADMAP.md` in the same commit: item status with evidence, an update-log entry, the dashboard, current focus and blockers. `ROADMAP.md` is the single source of truth for remaining work. See `AGENTS.md` §2.

## 1. Directory tree

```
sightline/
├─ README.md                      # See §7: judges' automated screen reads this
├─ AGENTS.md                      # Instructions for any coding agent (incl. the ROADMAP rule)
├─ CLAUDE.md                      # Imports AGENTS.md + Claude Code specifics
├─ ROADMAP.md                     # Source of truth for remaining work; updated on EVERY contribution
├─ HACKATHON.md                   # Official event rules, committed as evidence; re-read before submitting
├─ LICENSE
├─ package.json
├─ tsconfig.json                  # strict: true
├─ next.config.ts                 # CSP + security headers, production responses only
├─ eslint.config.mjs              # flat config extending eslint-config-next
├─ vitest.config.mts              # .mts because Vite loads a .ts config as CommonJS; aliases @, stubs server-only
├─ playwright.config.mts          # one chromium project; see the honesty note inside
├─ .env.example                   # No secrets. App must run with NO .env (fixtures)
├─ .gitignore
│
├─ docs/
│  ├─ PRD.md
│  ├─ ARCHITECTURE.md
│  ├─ ARCHITECTURE_ESSENTIALS.md
│  ├─ PROJECT_STRUCTURE.md
│  ├─ SPIKE_RESULTS.md            # Day 1 answers, filled in before product code
│  ├─ USER_RESEARCH.md            # Real user notes, honestly stated (even if one session)
│  └─ ACCESSIBILITY_REPORT.md     # What was tested, on what, what failed, what was not tested
│
├─ public/
│  ├─ manifest.webmanifest        # Icons only; no offline mode (referenced from layout metadata)
│  ├─ icons/icon.svg              # The manifest + favicon icon
│  └─ sample-docs/                # Synthetic documents only, incl. deliberately bad photos
│                                 # README.md here is the golden-set case list (C-09/S-03); empty until then
│
├─ fixtures/                      # NEAR AI responses + attestation reports replayed in Mode F
│  ├─ responses/                  # transcribe / structure / qa samples
│  └─ attestation/                # good, tampered, expired
│                                 # Until a key exists (B-05) these are AUTHORED SYNTHETIC files and must be
│                                 # labelled that way; "recorded" is only true after S-11
│
├─ scripts/
│  ├─ spike.ts                    # Day 1: list models, fetch attestation, run reference verifier, time calls
│  ├─ record-fixtures.ts          # Saves real responses to fixtures/
│  ├─ run-golden.ts               # Runs sample-docs through the pipeline; prints fact accuracy
│  ├─ crosscheck.ts               # Official SDK as a *second opinion* against our own verifier output (ADR-20); never in the app bundle
│  └─ roadmap-check.ts            # Fails if a commit skips ROADMAP.md, dashboard counts are wrong, or [x] lacks Evidence
│
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx               # <html lang>, skip link, landmarks, announcer + session store mount, fixtures banner
│  │  ├─ _flow/useDocumentRun.ts  # Composition root for one run: store, announcer, router, transport, pipeline. `_` = not a route
│  │  ├─ page.tsx                 # Add pages or paste text (`features/paste/PasteView.tsx`)
│  │  ├─ read/page.tsx            # Results + ask (`features/analysis/ResultsView.tsx`)
│  │  ├─ trust/page.tsx           # Trust receipt, exact claim, checks that ran / did not
│  │  ├─ settings/page.tsx        # Mode, API key (Mode A), read-aloud rate, high contrast
│  │  ├─ globals.css              # Tokens, high-contrast theme
│  │  └─ api/
│  │     ├─ verify/route.ts       # Heavy attestation checks; receives no user content
│  │     └─ relay/[...path]/route.ts  # Mode B: fixed host, exact-path allowlist, size cap
│  │
│  ├─ features/
│  │  ├─ capture/                 # CaptureView, PageList (remove, retake last), useCapture
│  │  ├─ paste/PasteView.tsx      # Text input, demo document buttons, error summary focus
│  │  ├─ analysis/                # pipeline.ts, prompts.ts, schemas.ts, grounding.ts, ResultsView
│  │  ├─ qa/                      # ask.ts, AskPanel.tsx
│  │  ├─ speech/                  # speak.ts, SpeakButton.tsx
│  │  └─ trust/                   # claims.ts (record → claim → copy), TrustReceipt.tsx, TrustView.tsx
│  │
│  ├─ lib/
│  │  ├─ near-ai/
│  │  │  ├─ client.ts             # baseUrl + header provider; abort; one retry. Mode F is `fixtures/replay.ts`, never this
│  │  │  ├─ models.ts             # Per-model metadata call (attestationSupported/providerType/inputModalities) + allowlist — NOT /v1/models (ADR-18)
│  │  │  ├─ attestation.ts        # Nonce, fetch, call /api/verify, named checks
│  │  │  ├─ signatures.ts         # fetch by chat id → rebuild hash pair → verify; retry "not found"; streaming trailing newlines (ADR-19)
│  │  │  ├─ e2ee.ts               # X25519 ECDH + HKDF-SHA256 + XChaCha20-Poly1305 via @noble/*; T-10, gated on the browser path being proven
│  │  │  └─ verifier/             # Ported from nearai-cloud-verifier ts/ (MIT; keep license + attribution); dcap-qvl-node for TDX quotes
│  │  ├─ image/prepare.ts         # createImageBitmap resize, orientation, JPEG, EXIF strip
│  │  ├─ a11y/announcer.tsx       # Single aria-live announcer + interval progress
│  │  ├─ session/                 # reducer.ts (state shape, page cap), store.tsx (provider + in-flight run registry), forget.ts
│  │  ├─ fixtures/                # replay.ts (content-matched Mode F client, `transportFor`), cases.ts (authored synthetic demo corpus)
│  │  ├─ server/                  # Server-only: env.ts, allowlist.ts, rateLimit.ts (all `import 'server-only'`)
│  │  ├─ config.ts                # Env validation (zod); mode selection
│  │  ├─ errors.ts                # AppError → plain-language messages
│  │  └─ not_built.ts             # `NotBuilt` + `notBuilt(item, what)`: every scaffold stub throws this, naming its ROADMAP item
│                                 # A stub that returned a plausible fake would let a pipeline 'work' on nothing
│  │
│  ├─ components/                 # Button, StatusMessage (focusable, ref as prop), SkipLink (native elements)
│  └─ types/index.ts
│
└─ tests/
   ├─ unit/                       # config, server-env, session reducer, errors, nonce, grounding, schemas, near-client, pipeline, fixtures; image prep still to write
   ├─ verification/               # attestation.test.ts: stubs refuse + strong claim unreachable; 9 `it.todo` rows name what T-01/T-02/T-05 must still prove
   ├─ relay/                      # relay.test.ts: both API routes answer 501, name their item, forward nothing, leak no key. A-09 adds rejected path/oversize/rate limit
   ├─ stubs/server-only.ts        # no-op stand-in so unit tests can import server modules (see vitest.config.mts)
   ├─ e2e/shell.spec.ts           # Playwright + axe on the four shell routes, skip link/tab order, one live region, zoomable viewport, off-origin request assertion
   ├─ e2e/flow.spec.ts            # The whole Mode F flow with no key: demo document → fixed section order → flagged fact → receipt; refusals; focus; axe with content
   └─ a11y/manual-checklist.md    # Screen-reader scripts and results
```

## 2. Import rule (one rule)

- Code in `lib/server/` and `app/api/` must never be imported by client components. Enforce with the `server-only` package.

Everything else is convention, not lint: features may import `lib/*` and `components/*`; avoid features importing each other.

## 3. Conventions

- TypeScript strict. No `any` without a comment.
- **Never log** documents, transcripts, images, API keys, or document-derived values. Log status codes and timings only.
- Validate with zod: env, model JSON, API responses.
- Errors are `AppError { code, userMessage, retryable }`; `userMessage` is plain language.
- **Every state change calls the announcer.** No silent transitions.
- **UI claim text comes from `features/trust/claims.ts` only.** No hand-written privacy sentences in components.
- Accessibility is part of done: keyboard-operable and noted from a screen-reader pass.
- Minimal dependencies, pinned versions. No analytics, third-party scripts or fonts.
- Small, frequent commits. Code written since the announcement counts **[Verified: event page]**, and history is the evidence.
- **Every commit updates `ROADMAP.md`** (see `AGENTS.md` §2 and `ROADMAP.md` §3). Run `npm run roadmap:check` before committing; it also runs in a git hook and CI.

## 4. Environment variables

`.env.example` (the app must still run without a `.env`):

```bash
# Mode B (relay) only. Leave empty to disable.
NEAR_AI_API_KEY=
RELAY_ENABLED=false
ALLOWED_MODELS=
RATE_LIMIT_PER_IP_PER_HOUR=20
RATE_LIMIT_STORE_URL=            # shared store; in-memory limits do not work on serverless

NEXT_PUBLIC_NEAR_AI_BASE_URL=https://cloud-api.near.ai/v1
NEXT_PUBLIC_DEFAULT_MODE=fixtures   # fixtures | relay | direct
NEXT_PUBLIC_ALLOW_DIRECT=false     # Mode A stays off until spike item S-06
```

Enforced in `lib/server/env.ts`, not just documented: in production the relay reports
`relayDisabledReason: 'no_rate_limit_store'` and stays off unless `RATE_LIMIT_STORE_URL` is
set, because an in-memory counter does nothing across serverless instances. A requested mode
the deployment cannot honour falls back to fixtures rather than silently changing the privacy
story (`lib/config.ts`).

Nothing secret may start with `NEXT_PUBLIC_`. The user's own key (Mode A) lives only in the browser.

## 5. Scripts

| Script | Purpose |
|---|---|
| `dev` | Run with the configured mode |
| `dev:fixtures` | Run with **no credentials**, replaying fixtures (R9). Until S-11 records real ones, these files are authored synthetic and labelled as such |
| `build` / `start` | Production |
| `lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `test` | Vitest (unit, verification, relay) |
| `test:e2e` | Playwright + axe |
| `spike` | `scripts/spike.ts` |
| `fixtures:record` | `scripts/record-fixtures.ts` |
| `golden` | `scripts/run-golden.ts` |
| `crosscheck` | `scripts/crosscheck.ts` — official SDK as a second opinion against our verifier output; dev-only, never imported by the app (ADR-20, T-15) |
| `roadmap:check` | `scripts/roadmap-check.ts` (`-- --write` refreshes the ROADMAP dashboard) |

## 6. Build order (maps to PRD timeline)

1. `scripts/spike.ts` + `docs/SPIKE_RESULTS.md` (Day 1, before any UI)
2. `lib/config`, `lib/near-ai/*`, `lib/server/*`, `app/api/relay`, **relay first**
3. `features/analysis` text path (paste text) + `fixtures:record` + `dev:fixtures`
4. `lib/image` + `features/capture` + transcription step
5. `features/qa`, results UI, `features/trust` + verification tests
6. `lib/a11y`, `lib/session/forget`, `features/speech`, settings
7. Accessibility pass → README → demo → submission

## 7. README must contain

1. What it is, the track, and the honest value proposition (explain-and-answer, not text recognition).
2. **Run with no credentials:** two commands, fixture mode.
3. Which mode the live demo uses and what that means for privacy.
4. The exact claim shown, why, and **which attestation checks ran and which did not**.
5. Golden-set accuracy (including bad photos) with the small-sample caveat. State that `quoteFound` checks consistency with the transcript, not correctness against the page.
6. Cost per document.
7. Accessibility results, devices tested, and known gaps.
8. User research summary (even if one conversation).
9. Limitations: not medical advice, not certified, English only, cannot clear OS-level logs, no scam detection.
10. Links: demo post on X, repo, licence.
11. Link to `ROADMAP.md` for live status and remaining work.

## 8. Removed from v0.1 (and why)

| Removed | Reason |
|---|---|
| `lib/image/quality.ts` | Local blur/brightness metrics misfire on text pages; model reports capture issues instead |
| `PageList` reordering | Visual interaction; capture order + remove/retake-last instead |
| `features/qa/VoiceInput.tsx`, `features/speech/spellOut.ts`, voice picker | Voice pipeline and spell-out cut |
| `features/settings/*` store, verbosity/theme variants | Collapsed into one small settings page |
| `lib/session/sessionStore.ts` (Zustand) | Replaced by one reducer |
| `lib/a11y/{focus,haptics}.ts` | Folded into announcer; haptics optional |
| `lib/server/spendCap.ts` | Use prepaid key balance as the cap |
| `app/api/health`, `app/about` | Padding; trust page covers it |
| `components/{Heading,Disclosure}` | Native elements / `<details>` |
| `scripts/check-models.ts`, `verify-attestation.ts`, `check-csp.ts` | Merged into `spike.ts` and a Playwright assertion |
| `tests/integration/` mock server | Replaced by fixture replay used for tests and screening |
| Import-rule matrix + lint restrictions | One `server-only` rule is enough |
| `tests/fixtures/*` duplicate dirs | Single top-level `fixtures/` |
