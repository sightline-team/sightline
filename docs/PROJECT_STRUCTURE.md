# Sightline — Project Structure (v0.4)

> Companion to `ARCHITECTURE.md`. Trimmed after the hard-questions review: fewer files, fewer scripts, fewer rules. Everything removed is listed in §8. v0.3 reflects the Day-1 spike reading: `models.ts` needs a per-model call (ADR-18), `signatures.ts` has a concrete fetch-and-rebuild shape (ADR-19), `e2ee.ts` has a named cipher stack, `verifier/` ports from the reference verifier's TypeScript directory, and `scripts/crosscheck.ts` is new (ADR-20).
>
> **Measured 2026-11-03** against the live API, two of those readings changed: `models.ts` gets its flags from the bulk `GET /v1/model/list` in one call and must also check the provider host (ADR-18 amended), and `signatures.ts`'s rebuild is right but its key depends on `signature_kind` — a `gateway` signature verifies against `gateway_attestation.signing_address`, which is why the app does not stream (ADR-22). `scripts/spike.ts` is the measurement that produced both, and it is built now rather than planned.
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
├─ .githooks/pre-commit           # F-11: runs `roadmap:check --staged` (this commit stages ROADMAP.md + the ledger is valid). Opt-in: `npm run hooks:install`
├─ .github/workflows/ci.yml       # F-12: lint, typecheck, test, roadmap:check --range on main and on every PR. No e2e here yet — see B-08
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
│                                 # A key exists now (B-05 closed 2026-11-03) and these are STILL authored
│                                 # synthetic: "recorded" becomes true only when S-11 writes them
│
├─ scripts/
│  ├─ spike.ts                    # Built (S-02). Stages: `catalog` (bulk model list → `isAllowed` verdicts, S-02/S-07), `attestation` (first real report through `attestationReportSchema` + `bindReport`), `complete` (one probe completion → price → signature verify). `--model=`, `--stream`. Prints statuses, bytes, timings, token counts and check verdicts — **never** content (AGENTS §4 rule 7), and it runs through the production client and schemas, not around them
│  ├─ record-fixtures.ts          # Saves real responses to fixtures/
│  ├─ run-golden.ts               # Runs sample-docs through the pipeline; prints fact accuracy
│  ├─ crosscheck.ts               # Official SDK as a *second opinion* against our own verifier output (ADR-20); never in the app bundle
│  └─ roadmap-check.ts            # F-11 gate: commits must touch ROADMAP.md, `[x]` needs Evidence, IDs unique, dashboard must equal §6, §2/§8/§10 shape.
│                                 # `-- --write` refreshes §1, `-- --staged` for the hook, `-- --range=<git range>` for CI. Ledger rules are `checkLedger(text)`, tested in tests/unit/roadmap-check.test.ts
│
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx               # <html lang>, skip link, landmarks, announcer + session store (over the nav too, so Forget reaches every route), fixtures banner
│  │  ├─ _flow/useDocumentRun.ts  # Composition root for one run: store, announcer, router, transport, pipeline. `_` = not a route
│  │  ├─ _flow/useAskAboutDocument.ts # Same shape for one question (P-06); reads the mode off the session, not the build
│  │  ├─ _flow/useForget.ts       # Same shape for Forget (P-10): store + announcer + the read-aloud stop, and the sentence built from what was counted
│  │  ├─ _flow/live_writes.ts     # `liveWrites(signal, dispatch)` (P-12): once a run is aborted its own callbacks write nothing into the session Forget emptied
│  │  ├─ _flow/SettingsControls.tsx # A-15's two controls: four named speeds (native radio group) and the contrast checkbox, both driven by the store
│  │  ├─ _flow/HighContrastTheme.tsx # Layout-mounted, renders nothing: puts the stored theme on `<html>` where `globals.css` defines it (A-15)
│  │  ├─ _flow/useStoredSettings.ts # `useSyncExternalStore` over the settings blob; raw string as the snapshot (A-15)
│  │  ├─ _flow/refused_steps.ts   # Live modes refuse at the door (T-01/T-02 unbuilt) with one shared sentence
│  │  ├─ _flow/ReadAloud.tsx      # Composition root for the read-aloud control (P-09): session store + the words to speak
│  │  ├─ _flow/spoken_answer.ts   # `spokenAnswer(analysis)` — summary + Sightline's own cautions, and the button's label (P-09)
│  │  ├─ page.tsx                 # Add pages or paste text (`features/paste/PasteView.tsx`)
│  │  ├─ read/page.tsx            # Results, ask and read-aloud: the only file that knows all three (`ResultsView` slots)
│  │  ├─ trust/page.tsx           # Trust receipt, exact claim, checks that ran / did not
│  │  ├─ settings/page.tsx        # Read-aloud rate and high contrast (A-15), plus the mode readout. No mode switcher and no key field: ADR-21
│  │  ├─ globals.css              # Tokens, high-contrast theme
│  │  └─ api/
│  │     ├─ verify/route.ts       # Heavy attestation checks; receives no user content
│  │     └─ relay/[...path]/route.ts  # Mode B: fixed host, exact-path allowlist, size cap
│  │
│  ├─ features/
│  │  ├─ capture/                 # CaptureView, PageList (remove, retake last), useCapture, prompts.ts + schemas.ts (C-03's own instruction and response contract, moved out of analysis the way P-06 moved qa's)
│  │  ├─ paste/PasteView.tsx      # Text input, demo document buttons, error summary focus
│  │  ├─ analysis/                # pipeline.ts, prompts.ts, schemas.ts, grounding.ts, ResultsView
│  │  ├─ qa/                      # ask.ts (grounded Q&A), prompts.ts, schemas.ts, AskPanel.tsx
│  │  ├─ safety/notices.ts        # P-07: Sightline's own cautions (medicine, money, deadline, English-only), computed from the validated Analysis — never the model's warnings, never a privacy sentence. `appLimitationNotices()` is the English-only line on its own, so the transcript-only screen can say it with no Analysis (P-11)
│  │  ├─ speech/                  # speak.ts (`speak`/`stopSpeaking` with the engine injected, `chunkForSpeech`), SpeakButton.tsx (play/stop, off by default, absent with no engine) — P-09
│  │  └─ trust/                   # claims.ts (record → claim → copy), record.ts (the only TrustRecord builder), TrustReceipt.tsx, TrustView.tsx
│  │
│  ├─ lib/
│  │  ├─ near-ai/
│  │  │  ├─ client.ts             # baseUrl + header provider; abort; one retry; returns the exact wire bytes. Mode F is `fixtures/replay.ts`, never this
│  │  │  ├─ envelope.ts             # Completion-envelope zod schema shared by the analysis call and the Q&A call; optional [U] `finish_reason`/`refusal` + the three readers
│  │  │  ├─ verification.ts         # Gate + signature-verifier contracts, RunHalt, Mode F outcomes, halt mapping (the T-01/T-02 shapes)
│  │  │  ├─ completion.ts           # readCompletion (P-08): gate → body → signature → record → read, one repair retry, ok/truncated/refused/unreadable
│  │  │  ├─ models.ts             # Catalog metadata parsing (`modelCatalogRowSchema`) + the fail-closed TEE decision (`isAllowed`, `isNearUpstreamHost`) — NOT /v1/models (ADR-18, amended by measurement 2026-11-03: the bulk list carries the flags, and `attestationSupported` alone is not a TEE test). The **transport** that reaches those endpoints is F-05's question, so `listCandidates`/`readModelMetadata` still refuse
│  │  │  ├─ attestation.ts        # Nonce, fetch, call /api/verify, named checks; `createTrustSession` binds gate + verifier to one session nonce (T-01)
│  │  │  ├─ signatures.ts         # fetch by chat id → rebuild hash pair → verify; retry "not found"; streaming trailing newlines (ADR-19)
│  │  │  ├─ e2ee.ts               # X25519 ECDH + HKDF-SHA256 + XChaCha20-Poly1305 via @noble/*; T-10, gated on the browser path being proven
│  │  │  └─ verifier/             # Ported from nearai-cloud-verifier ts/ (MIT; keep license + attribution); dcap-qvl-node for TDX quotes
│  │  ├─ image/prepare.ts         # C-01: orientation-aware resize → JPEG re-encode (the re-encode is the EXIF/GPS strip); quality ladder, 768 KiB/page budget, injected decode/encode seam
│  │  ├─ a11y/announcer.tsx       # Single aria-live announcer + interval progress
│  │  ├─ session/                 # reducer.ts (state shape, page cap), store.tsx (provider + in-flight run + object-URL registry + forget()), forget.ts (P-10: the pure clear, the `sightline.` key rule)
│  │  ├─ fixtures/                # replay.ts (content-matched Mode F client, `transportFor`), cases.ts (authored synthetic demo corpus: four letters, each carrying either an `analysis` or one `unreadableReply` — the prose case is what makes the transcript-only screen reachable with no key, P-11)
│  │  ├─ server/                  # Server-only: env.ts, allowlist.ts, rateLimit.ts (all `import 'server-only'`)
│  │  ├─ config.ts                # Env validation (zod); mode selection
│  │  ├─ settings.ts              # `sightline.settings` in localStorage, and the only code that reads or writes it: validated read of `speechRate`/`highContrast` (both defaulted), the re-validating read-modify-write, `applyHighContrast`, `describeRate`, and the external store the controls subscribe to (P-09 read, A-15 both). Non-sensitive only — never a key, never document data
│  │  ├─ errors.ts                # AppError → plain-language messages
│  │  └─ not_built.ts             # `NotBuilt` + `notBuilt(item, what)`: every scaffold stub throws this, naming its ROADMAP item
│                                 # A stub that returned a plausible fake would let a pipeline 'work' on nothing
│  │
│  ├─ components/                 # Button, StatusMessage (focusable, ref as prop), SkipLink, ForgetButton (P-10: the shell control, in the nav on every route)
│  └─ types/index.ts
│
└─ tests/
   ├─ unit/                       # config, server-env, session reducer, errors, nonce, grounding, schemas, near-client, pipeline, fixtures, qa, roadmap-check, forget (P-10), live-writes (P-12), safety-notices (P-07/P-11), speech (P-09), settings-writer (A-15), model-allowlist (F-04, payloads copied from live JSON); image prep still to write
   ├─ verification/               # attestation.test.ts: stubs refuse + strong claim unreachable; 9 `it.todo` rows name what T-01/T-02/T-05 must still prove
   ├─ relay/                      # relay.test.ts: both API routes answer 501, name their item, forward nothing, leak no key. A-09 adds rejected path/oversize/rate limit
   ├─ stubs/server-only.ts        # no-op stand-in so unit tests can import server modules (see vitest.config.mts)
   ├─ e2e/shell.spec.ts           # Playwright + axe on the four shell routes, skip link/tab order, one live region, zoomable viewport, off-origin request assertion
   ├─ e2e/flow.spec.ts            # The whole Mode F flow with no key: demo document → fixed section order → flagged fact → questions and answers → receipt; the transcript-only screen reached by the reply that is not JSON (P-11); Forget pressed while a completion is owed, both clicks in one task (P-12); refusals; focus; read-aloud and the settings that change it, with the speech engine replaced by a recorder; axe with content, on the degraded screen, and in both themes
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
ALLOWED_MODELS=                    # exact ids, case-sensitive; what F-04's `isAllowed` will accept on top of its own checks. Measured live and answerable: `z-ai/glm-5.3-flash,Qwen/Qwen3.8-27B`
RATE_LIMIT_PER_IP_PER_HOUR=20
RATE_LIMIT_STORE_URL=            # shared store; in-memory limits do not work on serverless

NEXT_PUBLIC_NEAR_AI_BASE_URL=https://cloud-api.near.ai/v1
NEXT_PUBLIC_DEFAULT_MODE=fixtures   # fixtures | relay | direct
NEXT_PUBLIC_ALLOW_DIRECT=false     # Mode A stays off until S-06 is closed in a **browser** — the live CORS preflight passed 2026-11-03, so CORS is not what is left (SPIKE §6)
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
| `roadmap:check` | `scripts/roadmap-check.ts` (`-- --write` refreshes the ROADMAP dashboard, `-- --staged` for the hook, `-- --range=<git range>` for CI) |
| `hooks:install` | `git config core.hooksPath .githooks` — turns the F-11 pre-commit hook on for this checkout. It changes git config, so a human runs it (`git config --unset core.hooksPath` turns it off) |

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
