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
│     └─ photographs/             # BUILT (S-11): the three JPEGs Demo mode answers for, `page-1..3.jpg`
│                                 # 1200×1600, drawn by `scripts/page_sample.ts`, hashed by ADR-31
│                                 # README.md here is the golden-set case list (C-09/S-03); the golden set is still empty
│
├─ fixtures/                      # NEAR AI responses + attestation reports replayed in Mode F
│  ├─ responses/                  # BUILT (S-11): 6 recorded replies — pages/page-1..3.json, document.json, qa/question-1..2.json
│  │                              # each with a `_provenance` sidecar (recorder, endpoint, model, completion id, timing, signature verdict, e2ee:false)
│  └─ attestation/                # good, tampered, expired — STILL EMPTY; the second half of S-11 and all of T-08
│                                 # "recorded" is now true for `responses/`; nothing authored may be called recorded (`fixtures/README.md`)
│
├─ scripts/
│  ├─ spike.ts                    # Built (S-02). Stages: `catalog` (bulk model list → `isAllowed` verdicts, S-02/S-07), `attestation` (first real report through `attestationReportSchema` + `bindReport`), `complete` (one probe completion → price → signature verify), `image` (C-01-prepared page, priced), `document` (structure step over a transcript, both models), `pages` (five photographed pages → C-11's join → C-05's labels), `qa` (the ask step). `--model=`, `--stream`. Prints statuses, bytes, timings, token counts and check verdicts — **never** content (AGENTS §4 rule 7), and it runs through the production client and schemas, not around them
│  ├─ page_sample.ts              # Draws the synthetic photographed page in Chromium at 3024×4032, crooked by 0.011 rad (**0.63°**, "what a hand-held shot looks like"), with real glyphs and `SYNTHETIC INVOICE - NOT A REAL DOCUMENT` printed in. Shared by `spike.ts` and `record-fixtures.ts`, so the pricing run and the recording ask about the same picture; the JPEGs it writes are the ones in `public/sample-docs/photographs/`
│  ├─ record-fixtures.ts          # BUILT (S-11; the 18-line refusal is gone). Asks the live service for the photographed document Demo mode replays: attests per model (fresh nonce, `bindReport` must pass), sends three `prepareImage` pages through `readCompletion`'s own body, joins them with `assembleDocument`, then `analyse` and two `qa` calls. **Verifies every reply's signature against the attested key and `die()`s if one fails**, so an unattested reply cannot become a fixture. Writes `fixtures/responses/{pages,document,qa}` + `_provenance` (never the report, never the key). **Refuses to send anything without `--confirm`** — this script spends money, and it says what it will spend before it does
│  ├─ run-golden.ts               # Runs sample-docs through the pipeline; prints fact accuracy
│  ├─ crosscheck.ts               # Official SDK as a *second opinion* against our own verifier output (ADR-20); never in the app bundle
│  └─ roadmap-check.ts            # F-11 gate: commits must touch ROADMAP.md, `[x]` needs Evidence, IDs unique, dashboard must equal §6, §2/§8/§10 shape.
│                                 # `-- --write` refreshes §1, `-- --staged` for the hook, `-- --range=<git range>` for CI. Ledger rules are `checkLedger(text)`, tested in tests/unit/roadmap-check.test.ts
│
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx               # <html lang>, skip link, landmarks, announcer + session store (over the nav too, so Forget reaches every route), fixtures banner
│  │  ├─ _flow/useDocumentRun.ts  # Composition root for one run: store, announcer, router, transport, pipeline. `_` = not a route. Its **first** statement is the paste length guard (`pasteLengthProblem`, C-12/**ADR-29**) — before the mode check, before a controller, before a body exists
│  │  ├─ _flow/usePhotoRun.ts   # Composition root for a photographed document (**C-02**, §5.1): `readPages` → the pre-analysis notices (holes, C-05 labels, unplaceable spans, capture issues) spoken as ONE announcement → `usable` → `runPipeline` with the joined transcript. Same door-refusal, same `liveWrites`, same "a forgotten run writes nothing"
│  │  ├─ _flow/useAskAboutDocument.ts # Same shape for one question (P-06); reads the mode off the session, not the build
│  │  ├─ _flow/useForget.ts       # Same shape for Forget (P-10): store + announcer + the read-aloud stop, and the sentence built from what was counted
│  │  ├─ _flow/live_writes.ts     # `liveWrites(signal, dispatch)` (P-12): once a run is aborted its own callbacks write nothing into the session Forget emptied
│  │  ├─ _flow/SettingsControls.tsx # A-15's two controls: four named speeds (native radio group) and the contrast checkbox, both driven by the store
│  │  ├─ _flow/HighContrastTheme.tsx # Layout-mounted, renders nothing: puts the stored theme on `<html>` where `globals.css` defines it (A-15)
│  │  ├─ _flow/useStoredSettings.ts # `useSyncExternalStore` over the settings blob; raw string as the snapshot (A-15)
│  │  ├─ _flow/refused_steps.ts   # Live modes refuse at the door (T-01/T-02 unbuilt) with one shared sentence
│  │  ├─ _flow/ReadAloud.tsx      # Composition root for the read-aloud control (P-09): session store + the words to speak
│  │  ├─ _flow/spoken_answer.ts   # `spokenAnswer(analysis)` — summary + Sightline's own cautions, and the button's label (P-09)
│  │  ├─ page.tsx                 # The document screen, two ways in: paste text (`features/paste/PasteView.tsx`, P-05) or photograph it (`features/capture/CaptureView.tsx`, **C-02**). **B-13** closes as "no new route" — the photo input grows on `/` beside the paste box, because a second screen for one document would split the person's own sense of what is in flight
│  │  ├─ read/page.tsx            # Results, ask and read-aloud: the only file that knows all three (`ResultsView` slots)
│  │  ├─ trust/page.tsx           # Trust receipt, exact claim, checks that ran / did not
│  │  ├─ settings/page.tsx        # Read-aloud rate and high contrast (A-15), plus the mode readout. No mode switcher and no key field: ADR-21
│  │  ├─ globals.css              # Tokens, high-contrast theme
│  │  └─ api/
│  │     ├─ verify/route.ts       # Heavy attestation checks; receives no user content
│  │     └─ relay/[...path]/route.ts  # Mode B: fixed host, exact-path allowlist, size cap
│  │
│  ├─ features/
│  │  ├─ capture/                 # **As built (C-02)** `CaptureView.tsx` (the screen: a native `<input type="file" accept="image/*" capture="environment" multiple>`, keyed on `session.id` for P-10, its own failure summary only while `session.input` is `'images'` — ADR-30), `PageList.tsx` (each page's number, pixel size, preview of the bytes that will be sent, *Remove* on any and *Retake* on the last), `useCapture.ts` (prepare every file before it joins the session, refuse a sixth page **before its bytes are decoded**, hash the chosen file for Demo mode's matching (**ADR-31**, `pageFixtureKey`), and speak one joined announcement per batch because the announcer holds one message), prompts.ts + schemas.ts (C-03's own instruction and response contract, moved out of analysis the way P-06 moved qa's), transcribe.ts (C-03: one page, one `readCompletion` call, `max_tokens: 8192`, and — since **C-13** — a `fixtureKey` it hands to the transport as local metadata), assemble.ts (C-11/**ADR-27**: joins pages, remaps `uncertain` spans onto their page's region, marks a page that yielded nothing), page-labels.ts (C-05/**ADR-28**: reads the page numbers the model reported and warns where they disagree with each other or with how many photographs were given — never reorders, never guesses a missing label), read_pages.ts (**C-02**: the page loop — one page at a time in capture order, each announced before its request exists, a refusal halting before the next page is sent, the signal checked between pages, each page's `fixtureKey` carried to `transcribePage`, and every outcome handed to `assembleDocument`)
│  │  ├─ paste/PasteView.tsx      # Text input, demo document buttons, error summary focus — that summary renders only while `session.input` is `'text'`, because `/` now has two forms and one failure gets one summary (**ADR-30**). The hint states the length cap in the screen's own words and comes from `MAX_PASTE_CHARS`, so the number on the page is the number in the guard (C-12)
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
│  │  │  ├─ models.ts             # Catalog metadata parsing (`modelCatalogRowSchema`) + the fail-closed TEE decision (`isAllowed`, `isNearUpstreamHost`) — NOT /v1/models (ADR-18, amended by measurement 2026-11-03: the bulk list carries the flags, and `attestationSupported` alone is not a TEE test) + `STEP_PLANS`, the model and the `max_tokens` each step sends (ADR-24; `planModelIds()` is what a deployment must allowlist for a run to be completable at all). The **transport** that reaches those endpoints is F-05's question, so `listCandidates`/`readModelMetadata` still refuse
│  │  │  ├─ attestation.ts        # Nonce, fetch, call /api/verify, named checks; `createTrustSession` binds gate + verifier to one session nonce (T-01)
│  │  │  ├─ signatures.ts         # fetch by chat id → rebuild hash pair → verify; retry "not found"; streaming trailing newlines (ADR-19)
│  │  │  ├─ e2ee.ts               # X25519 ECDH + HKDF-SHA256 + XChaCha20-Poly1305 via @noble/*; T-10, gated on the browser path being proven
│  │  │  └─ verifier/             # Ported from nearai-cloud-verifier ts/ (MIT; keep license + attribution); dcap-qvl-node for TDX quotes
│  │  ├─ image/prepare.ts         # C-01: orientation-aware resize → JPEG re-encode (the re-encode is the EXIF/GPS strip); quality ladder, 768 KiB/page budget, injected decode/encode seam; `toDataUrl` (C-03: chunked base64 of the *prepared* bytes, fixed `image/jpeg` label)
│  │  ├─ a11y/announcer.tsx       # Single aria-live announcer + interval progress
│  │  ├─ session/                 # reducer.ts (state shape, page cap, and the paste cap `MAX_PASTE_CHARS`/`pasteLengthProblem` — C-12, ADR-29), store.tsx (provider + in-flight run + object-URL registry + forget()), forget.ts (P-10: the pure clear, the `sightline.` key rule)
│  │  ├─ fixtures/                # replay.ts (content-matched Mode F client, `transportFor`; page digests decide a photographed answer, **ADR-31**, and it rebuilds each replayed envelope as `fixture-<name>` so a receipt cannot name a call this session did not make), cases.ts (the demo corpus: four **authored synthetic** letters, each carrying either an `analysis` or one `unreadableReply` — the prose case is what makes the transcript-only screen reachable with no key, P-11 — plus the fifth case, **recorded**: three photographed pages, joined, read, and asked about, `offered: false` so nobody can paste its way in), recorded.ts (the reader for those six files; no validation, that is `tests/unit/recorded-fixtures.test.ts`), page_key.ts (`pageFixtureKey(file)`: streaming SHA-256 of the chosen file, 64 KB chunks — **local metadata only**, never a body field, never logged)
│  │  ├─ transcript/holes.ts      # P-17, ADR-27: the words for a page that yielded no text (`unreadablePageMarker`), `missingPagesAnnouncement()` — the same page numbers spoken, for the run that has a hole in it (**C-02**) — and `groundableText()`, the same-length mask grounding searches. Shared because both the writer (`features/capture`) and the reader (`features/analysis`, `features/qa`) need one wording
│  │  ├─ server/                  # Server-only: env.ts, allowlist.ts, rateLimit.ts (all `import 'server-only'`)
│  │  ├─ config.ts                # Env validation (zod); mode selection
│  │  ├─ settings.ts              # `sightline.settings` in localStorage, and the only code that reads or writes it: validated read of `speechRate`/`highContrast` (both defaulted), the re-validating read-modify-write, `applyHighContrast`, `describeRate`, and the external store the controls subscribe to (P-09 read, A-15 both). Non-sensitive only — never a key, never document data
│  │  ├─ errors.ts                # AppError → plain-language messages, one row per `ErrorCode` (`tests/unit/errors.test.ts` fails if any code lacks a row, and a second test asserts the catalogue covers all **23** of them). `paste_too_long` is C-12's; `no_fixture_for_page` is C-13/**ADR-31**'s — Mode F's "your photograph is not the demo's" refusal, kept separate from `no_fixture_for_input` because the sentence a photo-person hears must not talk about words they never typed
│  │  └─ not_built.ts             # `NotBuilt` + `notBuilt(item, what)`: every scaffold stub throws this, naming its ROADMAP item
│                                 # A stub that returned a plausible fake would let a pipeline 'work' on nothing
│  │
│  ├─ components/                 # Button, StatusMessage (focusable, ref as prop), SkipLink, ForgetButton (P-10: the shell control, in the nav on every route)
│  └─ types/index.ts
│
└─ tests/
   ├─ unit/                       # config, server-env, session reducer, errors, nonce, grounding (incl. P-17's marker holes), schemas, assemble (C-11), read-pages (C-02, incl. the `fixtureKey` reaching the transport), page-labels (C-05), near-client, pipeline, fixtures (what the replay client *does*, incl. ADR-31's digest matching in both directions), recorded-fixtures (S-11: re-hashes the shipped JPEGs, re-derives the join with `assembleDocument`, re-parses every reply against the live schema and re-reads each provenance claim — the corpus cannot change its story by itself; it cannot re-verify a signature, which is a 60-minute lookup), page_key (the digest of a chosen file), transcribe (C-03 + the recorded page answer), qa, roadmap-check, forget (P-10), live-writes (P-12), safety-notices (P-07/P-11), speech (P-09), settings-writer (A-15), model-allowlist (F-04, payloads copied from live JSON); image prep still to write
   ├─ verification/               # attestation.test.ts: stubs refuse + strong claim unreachable; 9 `it.todo` rows name what T-01/T-02/T-05 must still prove
   ├─ relay/                      # relay.test.ts: both API routes answer 501, name their item, forward nothing, leak no key. A-09 adds rejected path/oversize/rate limit
   ├─ stubs/server-only.ts        # no-op stand-in so unit tests can import server modules (see vitest.config.mts)
   ├─ e2e/shell.spec.ts           # Playwright + axe on the four shell routes, skip link/tab order, one live region, zoomable viewport, off-origin request assertion
   ├─ e2e/flow.spec.ts            # The whole Mode F flow with no key: demo document → fixed section order → flagged fact → questions and answers → receipt; the transcript-only screen reached by the reply that is not JSON (P-11); Forget pressed while a completion is owed, both clicks in one task (P-12); refusals; focus; read-aloud and the settings that change it, with the speech engine replaced by a recorder; axe with content, on the degraded screen, and in both themes
   ├─ e2e/paste-cap.spec.ts       # C-12 from the screen: the hint states the cap, an over-cap paste is refused for its length with focus on the error and no transcript written (`/read` still says nothing was read), and the same paste one character under the cap reaches the pipeline — so the guard is a guard, not a blanket block
   ├─ e2e/capture.spec.ts        # C-02 in Chromium with no key: a chosen file really becomes a named page and a `blob:` preview; three files chosen at once are added in the order they came and spoken as one sentence; a non-picture is skipped out loud; a sixth page is refused *before* its bytes are opened (proved by feeding a sixth file that also cannot be decoded — the sentence names whichever check ran first); remove / retake-last / remove-all each say what happened; Forget and Remove make the preview URL unreadable; "Read these photographs" reaches the page loop and stops at demo mode's door — **with the page refusal now naming the photographs it answers for** (**C-13**, `no_fixture_for_page`) — with the page holding exactly one failure summary; keyboard reachability from the paste box; axe at zero and at two pages
   ├─ e2e/photo-fixtures.spec.ts # **C-13** — the photographed document run end to end with no key: the three JPEGs this repo ships become three pages, one join, one recorded reading in the fixed section order, two answered questions (one of them "the document does not answer this"), a receipt that names the fixture's own identity and the demo-data claim; plus the two refusals **ADR-31** exists for — two of the three photographs is a different document, and one changed byte at the end of a demo photograph is a different photograph
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
| `fixtures:record` | `scripts/record-fixtures.ts` — **spends money**: attests, asks the live service for the photographed document, verifies every signature, writes `fixtures/responses/`. Refuses to send anything without `--confirm` (S-11) |
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
