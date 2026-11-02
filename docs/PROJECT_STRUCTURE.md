# Sightline — Project Structure (v0.2)

> Companion to `ARCHITECTURE.md`. Trimmed after the hard-questions review: fewer files, fewer scripts, fewer rules. Everything removed is listed in §8.
>
> **Tracking rule:** every contribution to this repo (code, tests, docs, config, fixtures, scripts) must update `ROADMAP.md` in the same commit: item status with evidence, an update-log entry, the dashboard, current focus and blockers. `ROADMAP.md` is the single source of truth for remaining work. See `AGENTS.md` §2.

## 1. Directory tree

```
sightline/
├─ README.md                      # See §7: judges' automated screen reads this
├─ AGENTS.md                      # Instructions for any coding agent (incl. the ROADMAP rule)
├─ CLAUDE.md                      # Imports AGENTS.md + Claude Code specifics
├─ ROADMAP.md                     # Source of truth for remaining work; updated on EVERY contribution
├─ LICENSE
├─ package.json
├─ tsconfig.json                  # strict: true
├─ next.config.ts                 # CSP + security headers
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
│  ├─ manifest.webmanifest        # Icons only; no offline mode
│  └─ sample-docs/                # Synthetic documents only, incl. deliberately bad photos
│
├─ fixtures/                      # Recorded NEAR AI responses + sample attestation reports
│  ├─ responses/                  # transcribe / structure / qa samples
│  └─ attestation/                # good, tampered, expired
│
├─ scripts/
│  ├─ spike.ts                    # Day 1: list models, fetch attestation, run reference verifier, time calls
│  ├─ record-fixtures.ts          # Saves real responses to fixtures/
│  ├─ run-golden.ts               # Runs sample-docs through the pipeline; prints fact accuracy
│  └─ roadmap-check.ts            # Fails if a commit skips ROADMAP.md, dashboard counts are wrong, or [x] lacks Evidence
│
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx               # <html lang>, skip link, landmarks, announcer mount, fixtures banner
│  │  ├─ page.tsx                 # Add pages or paste text
│  │  ├─ read/page.tsx            # Results + ask
│  │  ├─ trust/page.tsx           # Trust receipt, exact claim, checks that ran / did not
│  │  ├─ settings/page.tsx        # Mode, API key (Mode A), read-aloud rate, high contrast
│  │  ├─ globals.css              # Tokens, high-contrast theme
│  │  └─ api/
│  │     ├─ verify/route.ts       # Heavy attestation checks; receives no user content
│  │     └─ relay/[...path]/route.ts  # Mode B: fixed host, exact-path allowlist, size cap
│  │
│  ├─ features/
│  │  ├─ capture/                 # CaptureView, PageList (remove, retake last), useCapture
│  │  ├─ analysis/                # pipeline.ts, prompts.ts, schemas.ts, grounding.ts, ResultsView
│  │  ├─ qa/                      # ask.ts, AskPanel.tsx
│  │  ├─ speech/                  # speak.ts, SpeakButton.tsx
│  │  └─ trust/                   # claims.ts (record → claim → copy), TrustReceipt.tsx
│  │
│  ├─ lib/
│  │  ├─ near-ai/
│  │  │  ├─ client.ts             # baseUrl + header provider; abort; one retry
│  │  │  ├─ models.ts             # Catalog, TEE + modality filter, allowlist
│  │  │  ├─ attestation.ts        # Nonce, fetch, call /api/verify, named checks
│  │  │  ├─ signatures.ts
│  │  │  ├─ e2ee.ts               # Only if the spike shows it is available
│  │  │  └─ verifier/             # Adapted reference verifier (keep license + attribution)
│  │  ├─ image/prepare.ts         # createImageBitmap resize, orientation, JPEG, EXIF strip
│  │  ├─ a11y/announcer.tsx       # Single aria-live announcer + interval progress
│  │  ├─ session/                 # reducer.ts, forget.ts
│  │  ├─ fixtures/                # Replay layer for Mode F and tests
│  │  ├─ server/                  # Server-only: rateLimit.ts, allowlist.ts
│  │  ├─ config.ts                # Env validation (zod); mode selection
│  │  └─ errors.ts                # AppError → plain-language messages
│  │
│  ├─ components/                 # Button, StatusMessage, SkipLink (native elements)
│  └─ types/index.ts
│
└─ tests/
   ├─ unit/                       # signatures, nonce, grounding, claims ladder, schemas, image prep
   ├─ verification/               # good/tampered/expired fixtures → fail-closed, partial ≠ verified
   ├─ relay/                      # rejected paths, size cap, rate limit, no content in logs
   ├─ e2e/                        # Playwright + axe per route + network-host assertion
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
```

Nothing secret may start with `NEXT_PUBLIC_`. The user's own key (Mode A) lives only in the browser.

## 5. Scripts

| Script | Purpose |
|---|---|
| `dev` | Run with the configured mode |
| `dev:fixtures` | Run with **no credentials**, replaying recorded fixtures (R9) |
| `build` / `start` | Production |
| `lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `test` | Vitest (unit, verification, relay) |
| `test:e2e` | Playwright + axe |
| `spike` | `scripts/spike.ts` |
| `fixtures:record` | `scripts/record-fixtures.ts` |
| `golden` | `scripts/run-golden.ts` |
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
