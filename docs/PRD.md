# Sightline — Product Requirements Document

> **Working title.** Rename freely.
> **Version:** 0.4 (the 2026-11-06 documentation-consistency pass, **R-08**, folded in) · **Date:** 6 Nov 2026 · the body carries measurements dated 2026-11-03 to 2026-11-06
> **Hackathon:** NEAR Hackathon · **Track:** Privacy & Private AI (also eligible for Open Innovation)
> **Hard deadline:** 14 Nov 2026, 23:59 UTC (public repo + X demo post + form)

Markers: **[Verified]** = read in official docs, the OpenAPI contract, vendor source code, or the event page. **[Measured]** = run against the live API (first **[Measured]** rows 2026-11-03, after ROADMAP blocker B-05 cleared — `SPIKE_RESULTS.md` §3–§6). **[Unverified]** = assumption to check in the spike (`ARCHITECTURE.md` §14). **[Certain] / [Likely] / [Guessing]** = my confidence in an analytical claim.

**What changed from v0.1:** the privacy claim is downgraded unless end-to-end encryption to the enclave is available; voice input, page reordering, local blur/brightness checks, spell-out speech, offline PWA and the PII classifier are cut; a paste-text path and a zero-config fixture mode are added. Reasons are in §12.

**Tracking rule:** every contribution to this repo (code, tests, docs, config, fixtures, scripts) must update `ROADMAP.md` in the same commit: item status with evidence, an update-log entry, the dashboard, current focus and blockers. `ROADMAP.md` is the single source of truth for remaining work. See `AGENTS.md` §2.

---

## 1. One-line summary

A web app that helps blind and low-vision people understand sensitive paper documents (medical, banking, legal, ID, prescriptions): photograph or paste the text, hear what it says and what it asks of you, and ask follow-up questions. Processing happens only inside a hardware-attested enclave, and the app shows exactly what was and was not verified.

## 2. Problem

Sighted people read a bank letter or a hospital result in private. Blind and low-vision people often can't, so they either ask a family member or carer (loss of privacy and independence), or upload the document to a general cloud AI and trust a privacy policy they cannot check.

**Why not just use the phone's built-in text recognition?** Fair challenge. iOS and Android can already recognise text in photos on-device, and apps like Seeing AI and Be My Eyes exist **[Likely]**. On-device reading is *more* private than anything we build. What those tools do not do well is the **understanding layer**: "what is this letter, what do they want from me, when is it due, is this number the amount I owe?" That layer needs a large model, and that is where verifiable privacy matters. So Sightline's value is **explain and answer, privately**, not "read text from a photo". That is why a **paste-text path** is P0: a user who already has text from their phone's own recognition can get the explanation without uploading an image at all.

**Our claim:** NEAR AI Cloud runs inference in Trusted Execution Environments and returns cryptographic attestation **[Verified]**, which lets the app show what was verified instead of just promising privacy. How strong that claim can honestly be depends on one open question (§8).

## 3. Target users

These personas are **hypotheses**. Talk to at least one real blind or low-vision user by Day 3 and rewrite this section from what they say.

| Persona | Description | Needs |
|---|---|---|
| **Amara** (primary) | 34, fully blind, smartphone + built-in screen reader. Gets paper mail from bank, hospital, landlord. | Accurate explanation. Privacy she can believe. An app that works with her screen reader. |
| **Daniel** (secondary) | 68, low vision, uses magnification, not a screen-reader power user. | Large text, high contrast, very short flow, optional spoken output. |
| **Caregiver** (out of scope) | Helps one of the above. | Not designed for in v1. |

Not in scope: deaf and hard-of-hearing users.

**Open product question (unresolved):** a real Amara will not paste an API key, so the "bring your own key" mode is for developers and judges only. A real deployment needs someone to pay per document and a way to hold the key without seeing her documents. See §12 Q1 #3 and ADR-7.

## 4. Goals and non-goals

### Goals
- G1. A blind user gets a document explained, unassisted, in under a minute.
- G2. The privacy statement shown to the user is exactly as strong as the code can back up, no stronger (§8).
- G3. Usable with real screen readers, not just an automated checker.
- G4. The repo runs from the README with **zero credentials**, because submissions are screened first by Claude Code and Codex, which check that the project runs and does what the README says **[Verified: event FAQ]**. A project that needs a private API key may fail that gate **[Likely]**.

### Non-goals (v1)
- No accounts, no server-side document storage, no sync.
- Not medical, legal or financial advice, and not a certified accessibility product.
- No custom camera, no live framing guidance, no voice-input pipeline, no page-reorder UI.
- No languages beyond English promised.
- No payments or NEAR-account login in v1 (see ADR-9).
- No deaf/HoH features.

## 5. Core user flow

1. **Open** the app (works in a phone or desktop browser).
2. **Add content:** take photos with the native camera (1–5 pages) **or** paste text.
3. **Send:** the app checks the enclave attestation, then sends the images or text.
4. **First read** (images only): verbatim transcript comes back first. If the model reports capture problems (page cut off, glare, sideways, tiny text), the app says so and offers a retake before spending time on analysis. **As built (C-02/C-03/C-11):** it says so — the reported issues are summarised out loud before the reading goes on — and then **carries on**; the retake offer that *stops the run for an answer* is **C-04**, still open, and the capture screen's own controls are remove / retake-last / remove-all. The step-4 wording above is the target, not the shipped gate.
5. **Understand:** summary, key facts with quoted sources, actions needed, warnings.
6. **Ask:** type a question (the on-screen keyboard's dictation works, see R4).
7. **Trust receipt:** shows what was verified and what was not.
8. **Forget:** clears the session.

## 6. Functional requirements

**P0** = must ship. **P1** = ship if time allows and the spike supports it. Anything not listed is out.

### R1. Capture (P0)
- Native camera via `<input type="file" accept="image/*" capture="environment">`. Native camera apps already work with the built-in screen readers **[Likely]**.
- 1–5 pages. Pages are processed **in capture order** and labelled "Page 1…N". The user can **remove** a page or **retake the last one**. No reorder UI (a drag-and-drop is a visual interaction).
- In the browser: downscale, honour EXIF orientation, re-encode as JPEG (this strips EXIF including GPS).
- **No local blur/brightness scoring.** Capture quality is judged by the model's `captureIssues` report (R2), because simple sharpness metrics misfire on mostly-white text pages **[Likely]**.
- **Acceptance:** with a screen reader on, a user can add, remove and retake pages and proceed without sighted help.

### R2. Private analysis (P0)
- Step 1, **transcribe** (vision model): verbatim text, tables kept row by row, unreadable spans marked, plus `captureIssues[]` (cut-off edges, glare, rotated/upside-down, text too small, not a document).
- Step 2, **structure** (text-only): summary, key facts, actions, warnings, as validated JSON.
- Responses that hit the length limit, are refused by the model, or fail validation are handled (§12 Q2).
- **Acceptance:** one clean printed page completes in under 30 s **[Measured, and it holds on average but not on the tail]** — SPIKE §4's two five-page runs: mean **25.8 s** a page, spread **16.4–39.9 s**, so the slowest page this service gave was over the limit. Whether the *person* waits 30 s or 40 s is not a model fact but a UI fact, and the interval announcer (R3) is what covers it.

### R3. Accessible reading (P0)
- Output uses real headings in this order: Summary → Key facts → What you may need to do → Warnings → Full text. (**R-08:** this row named the sections internally; the `h2` text is what a reader's heading lands on, so the row now quotes that.)
- Key facts show the **exact source quote** next to each value.
- **How many facts a person is offered is a decided quantity** (item **P-16**, ADR-36): at most 12 listed and
  at most 3 of any one kind, short lists untouched, the count stated before the list and the remainder one
  native disclosure control away with its quotes. A fact whose quote could not be matched is always listed.
- The **Full text** section shows the verbatim transcript only. (It is the section's `h2`; "read exactly what it says" was the name this document used for it, and the screen never says it.)
- **Read aloud:** one button, play/stop, rate control, using on-device speech. Screen-reader users will mostly not use it, because it duplicates their own reader **[Likely]**. It exists mainly for low-vision users like Daniel.
- **Acceptance:** everything is reachable in logical order by screen reader and by keyboard.

### R4. Ask questions (P0, text only)
- Answers come from the document only. If it isn't there, the app says "not in the document".
- Each answer shows its source quote.
- Input is a text field. The phone's keyboard dictation can fill it, but dictation is handled by the operating system, not by us, and the UI says so. (Voice-in via our own recording pipeline is cut; see §12 Q3.)
- **Acceptance:** 5 prepared questions on 3 sample documents are answered correctly or correctly refused.

### R5. Trust receipt (P0)
- Before sending any document data, the app fetches the model attestation with a fresh nonce and checks what it can check. After each response it verifies the response signature against the attested key.
- Status is one of **Verified**, **Partially verified** (lists exactly which checks ran), or **Failed** (nothing is sent).
- Plain-language statement matches the claims ladder in §8. "Partially verified" is never shown as "Verified".
- **Acceptance:** a tampered or failed attestation blocks sending, shown in a unit test and in the demo.

### R6. Forget (P0)
- Session lives in memory. "Forget" clears app state, revokes object URLs, aborts in-flight requests.
- **Acceptance (honest version):** after Forget the app holds no document text or images in its own state or storage. We **cannot** control OS logs, screen-reader history, browser back-forward cache, screenshots or the clipboard, and the README says so. (v0.1 promised "nothing remains in memory", which cannot be tested rigorously.)

### R7. Safety guardrails (P0)
- Medication, dosage, legal-deadline and money content gets a short notice: confirm with a pharmacist, doctor or the sender.
- Unreadable text is surfaced as unreadable, never guessed.
- Numbers and dates are shown as separate facts with their source quotes.
- The app does **not** claim to detect scams (§12 Q2), and says that scam letters will be read as faithfully as real ones.

### R8. Accessibility baseline (P0)
See §7.

### R9. Run with zero credentials (P0, new)
- `npm run dev:fixtures` runs the full UI against **recorded sample responses and sample attestation fixtures**, so a reviewer with no API key can run the app and see every screen.
- **What it cannot show is a verification verdict, and the README says so too:** fixture mode fetches **no attestation report at all**, so its gate answers `not_run` and the receipt on screen is the *unverified* one with the no-guarantee banner above it. The `failed` ending is proved in `tests/verification/` and over the two recorded reports in `fixtures/attestation/`, never on the demo screen — that is the honest shape of R9, and quoting the demo receipt as evidence that verification ran would be exactly the overclaim AGENTS.md §4 rule 5 forbids.
- Fixture mode shows a persistent banner: "Demo data. No real privacy guarantee in this mode."
- A public deployed URL in relay mode (rate-limited, small prepaid budget) **would be** the live demo. **As of 2026-11-06 there is none**: no deployment target is decided and nothing is hosted (**R-01**, **B-06**), so the demo a reviewer runs is the two commands in the README, not a URL.
- **Acceptance:** a clean checkout runs with two commands and no `.env`.

### R10. Paste text (P0, new)
- A text box accepts pasted or shared text and goes straight to Step 2 and Q&A.
- Why it is P0: it is cheap (reuses Step 2), it has a smaller privacy footprint, and it is the **fallback if no usable TEE vision model exists** (risk 1).

### P1
- **Verification pass for numbers:** re-check each extracted number/date against the image (or a second independent read) and flag disagreement. **Build it only if the Day 1 spike shows at least one numeric misread across the 10-document test set** (small sample, so treat as a trigger, not a statistic).
- Wake-lock during analysis so the phone does not sleep mid-request.
- Installable manifest (icons only, no offline mode).

### Later (not planned, listed so nobody builds them by accident)
Encrypted local history, NEAR-account login or pay-per-use, live camera guidance, own-pipeline voice input, PII classifier, document-type presets.

## 7. Accessibility requirements

- Target **WCAG 2.2 AA**. Do not claim more.
- Manual testing with the screen readers you can actually access, recorded in the README with **what was not tested**. Three platforms was the v0.1 plan; it is only worth stating if the devices exist. Minimum: one mobile screen reader plus NVDA (free) **[Certain NVDA is free]**.
- Native HTML elements first (`button`, `details`, `label`, headings). Add an accessibility library only if a specific widget needs it.
- No gesture-only actions. Targets ≥ 44×44 px. Full keyboard operation. Visible focus.
- One live-region announcer. Progress during long waits is announced at intervals, not on every tick (no spam).
- Honour `prefers-reduced-motion`, `prefers-contrast`, and system text size. One extra high-contrast theme at most.
- Plain language in the main flow. "TEE" and "attestation" appear only in the details view.

## 8. Privacy and trust requirements

### The open question that sets the claim
Attestation proves an enclave exists and which key it holds. It does **not** by itself prove that *your upload* lands in that enclave. A web page cannot inspect or pin the TLS certificate of the server it talks to **[Certain]** — NEAR's own SDK states the same **[Verified]** — so the browser cannot check that the connection terminates inside the attested enclave. The only mechanism that closes this gap in a browser is **encrypting the request to the enclave's attested public key**. That mechanism **is documented**: E2EE protocol v2, X25519 + HKDF-SHA256 + XChaCha20-Poly1305, key from `model_attestations[0].signing_public_key` **[Verified: `SPIKE_RESULTS.md` §2]**. What is still **[Unverified]** is running it from a **browser** — the item that owns that question is **T-10**, and the dependency it waits on is the decision recorded as **B-07**: only Python and Node examples exist, and the cipher is not a WebCrypto algorithm, so it needs `@noble/ciphers`. The claim printed in the UI stays on the lower rung until a live enclave decrypts our payload; nothing about the sentences in the ladder below changes before then.

### Claims ladder (show exactly one of these in the UI)
| Situation | Statement we may show |
|---|---|
| **E2EE to the attested key works** | "Only the verified private enclave can read your document." |
| **No E2EE, attestation + response signatures verified** | "The AI model was verified as running in a private enclave and each answer was proven to come from it. Your upload travels over standard secure web connections to NEAR AI Cloud." |
| **Verification partial** | State which checks ran and which did not. |
| **Fixture mode** | "Demo data. No real privacy guarantee." |

### Never claimed
HIPAA/GDPR or any compliance; protection from a compromised device, extension or onlooker; that the model read the document *correctly*; that proxied third-party models are private (they are not covered **[Verified]**); that the relay mode hides content from our server (it does not today — only if T-10's browser E2EE is proven does that stop being true, ADR-16).

## 9. Success criteria

### Demo (X post and video)
1. A screen-reader session capturing a sample document (photos taken **without looking at the screen**, to mimic real conditions).
2. The attestation step visibly happening before upload.
3. Spoken or on-screen summary and two follow-up questions with quoted sources.
4. The trust receipt with the exact claim for the mode in use.
5. A failed-verification case blocking the upload.
6. A deliberately bad photo producing a useful retake prompt.

### Judging map
No scoring weights are published. Previous NEAR hackathons evaluated technical implementation, design, impact, originality and sustainability **[Verified: FAQ]**.

| Criterion | How we address it | Weak spot |
|---|---|---|
| Technical implementation | Real attestation checks, signature verification, grounded two-step pipeline | Full TDX quote verification may not ship; say so |
| Design | Tested accessibility, native camera, plain-language trust UI | Limited device testing |
| Impact | Real need, one real-user session | **No session by 2026-11-05, so this is unvalidated by decision, not by schedule**: §9's trigger fired, **U-04** is `[!]`, and README's Impact claim was weakened in the commit that recorded it (`docs/USER_RESEARCH.md`) |
| Originality | Verifiable privacy as the accessibility feature | Reading itself is not novel |
| Sustainability | Open source, no data custody | **Who pays per document is unanswered** |

## 10. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | No usable TEE vision model, or poor on numbers | **Closed on the first half, measured with the key 2026-11-03 [Measured]**: of 41 image-capable models the catalog lists **6** as `attestationSupported: true`, **4** pass this app's own allowlist and **2 answer** — `z-ai/glm-5.3-flash` and `Qwen/Qwen3.8-27B` (`SPIKE_RESULTS.md` §1–§2). `Qwen/Qwen3-VL-30B-A3B-Instruct` is flagged `attestationSupported` *and* `isReady` and **never answers**; `moonshotai/kimi-k3` returns 502. What is still open is the second half — **how it reads numbers on bad photographs** — and that needs no key, only the golden set (**S-03**, **C-09**) | Day 1 spike; paste-text path (R10) keeps the product alive |
| 2 | Browser calls to NEAR AI Cloud blocked (CORS) | **Closed as a risk.** The server's CORS layer allows any origin on every non-`/v1/admin` path **[Verified in source]**, the live preflight answered 200 with the origin echoed **[Measured 2026-11-03]**, and on **2026-11-05 a page in Chromium completed the whole authenticated round trip** — report, completion, signature — with all three calls 200, the page's own origin echoed on every response, and the reply verified against the attested key **[Measured]** (`npm run test:e2e:live`, SPIKE §6). Our shipped `connect-src` was measured on a production build admitting the NEAR host and refusing a host outside it, so the app's own policy is not the obstacle either. | Relay mode first regardless; direct mode is now blocked only by the key field A-15 deliberately does not have (T-13/**B-10**, ADR-21), not by the network |
| 3 | Full attestation verification (TDX quote, GPU evidence) too heavy to port | Low–Medium — the reference verifier ships **TypeScript** with `dcap-qvl-node` **[Verified]**, so this is a port; it still needs a real report to test against | Ship the checks that work, label the rest "not verified" (§8) |
| 4 | Model misreads a number | High | Verbatim-first, quoted sources, uncertainty markers, safety notices; P1 verification pass |
| 5 | Public demo key abused | Medium | Small prepaid budget, shared-store rate limit, path/model allowlist |
| 6 | Reviewer agents cannot run the project without a key | **High** | R9 fixture mode |
| 7 | No real user input | High | One session by Day 3, honestly reported |
| 8 | Privacy claim overstated | Medium | Claims ladder; code-enforced wording |
| 9 | Test set too clean, accuracy overstated | High | Include bad photos taken eyes-closed |
| 10 | Scope creep from "nice" features | High | Cut list in §12 Q3 |

## 11. Timeline (ends 14 Nov 23:59 UTC)

| Days | Dates | Goal |
|---|---|---|
| 1 | 2–3 Nov | **Spike** (list in `ARCHITECTURE.md` §14). Go/no-go on risks 1–3. Decide claim level. |
| 2–3 | 3–5 Nov | Scaffold, NEAR client, **relay mode first**, paste-text path, fixtures recorded from real responses. Talk to one real user. |
| 4–6 | 5–8 Nov | Capture, transcription, structure step, Q&A, results page. |
| 7 | 8–9 Nov | Trust receipt, verification checks, failed-verification test. |
| 8–9 | 9–11 Nov | Accessibility pass on the screen readers available; fix what breaks. |
| 10 | 11–12 Nov | Forget, safety notices, rate limits, deployed URL, optional P1 items. |
| 11 | 13 Nov | Feature freeze, README, golden-set numbers, demo script. |
| 12 | 14 Nov | Record demo, post on X (@NEARProtocol, #NEARHackathon), submit before 23:59 UTC. |

**Rule:** if the spike fails on risk 1 or 2, cut scope. Do not extend the schedule.

**Live status:** this table is the original plan. Remaining work, status and the update log live in `ROADMAP.md`, which every contribution must update.

---

## 12. Hard questions review

### Q0. Does this need to exist?
Covered in §2. Short answer: not as a "photo to text" app. It is justified only as a private **explain-and-answer** layer. If a user tester says their phone's built-in reading is enough and they do not want explanation, the project's premise is weaker than assumed. [Likely]

### Q1. What would break?

Ranked by (likelihood × damage).

| # | What breaks | Why | Conf. | Decision |
|---|---|---|---|---|
| 1 | **The privacy claim is stronger than the code.** | A browser cannot pin TLS, so it cannot prove the upload ended inside the attested enclave. Response signatures only detect misrouting *after* the document was sent. | Certain | Claims ladder (§8). Make E2EE the first thing the spike checks. If unavailable, ship the weaker true statement. **Update after spike reading:** E2EE *is* documented (protocol v2, `SPIKE_RESULTS.md` §2) and its primitives exist in `@noble/*`, so the strong claim is reachable — but "documented" ≠ "proven from a browser", so the ladder still governs what we print. |
| 2 | **The grounding check gives false comfort.** | "Quote is an exact substring of the transcript" proves the summary matches the transcript, not that the transcript matches the page. A misread "£840" passes perfectly. | Certain | Say so in the README. P1 verification pass, triggered by spike data. Drop the model's self-reported "confidence" field; self-reported model confidence is poorly calibrated **[Likely]**. |
| 3 | **Nobody can run it.** | Reviewer agents screen first and likely have no API key; real users cannot paste one. | Likely | R9 fixture mode; deployed relay URL. |
| 4 | **The attestation verifier port.** | Reference verifier code may not be TypeScript; TDX quote verification needs Intel collateral and GPU evidence needs NVIDIA's service. 12 days is tight. | **Lowered from Likely** — `nearai/nearai-cloud-verifier` is MIT *and* ships a native TypeScript `ts/` that uses `dcap-qvl-node` for TDX quotes **[Verified]**. Collateral mechanics are delegated to `dcap-qvl`, and we still need a real report to test against | Define the minimum honest set (nonce binding, signature check, GPU-evidence token check) and label the rest "not verified". See `ARCHITECTURE.md` §10, now decided. |
| 5 | **Serverless limits on the relay.** | Request body size and execution time limits on common hosts can be smaller than five photographed pages plus a slow vision call **[Likely; check your plan's limits]**. | Likely | Downscale images hard, send pages in separate requests, test with 5 pages. **Not streaming: a stream is gateway-signed, so ADR-22 rules it out and the relay refuses one (`streaming_not_supported`, ADR-34). The downscale is built (C-01, ≤1600 px / ≤768 KiB) and five pages were assembled (C-11); the host-limit half still waits on **C-07**/**S-08**.** |
| 6 | **Capture is the real accuracy bottleneck.** | Blind users cannot frame a page; cut-off, rotated and glared photos are the common case, and brightness/blur metrics do not detect them. | Likely | Model-reported `captureIssues`, retake loop, eyes-closed test photos. |
| 7 | **In-memory rate limiting does nothing on serverless.** | Instances do not share memory. | Likely | Use a shared store, or rely on a small prepaid key balance as the cap. |
| 8 | **Fail-closed locks the user out.** | If verification is down, a user with an urgent medical letter gets nothing. | Likely | Keep fail-closed in v1 (the claim stays clean) but show this as an explicit product decision, not an accident. Revisit with real users. |
| 9 | **Speech duplication.** | Own TTS plus the user's screen reader can talk over each other. | Likely | Read-aloud is opt-in, off by default, single button. |
| 10 | **Test set flatters us.** | Clean synthetic documents overstate real accuracy. | Likely | Add bad photos taken eyes-closed, with glare, at angles. |

### Q2. Edge cases we were missing

| Edge case | Handling | Priority |
|---|---|---|
| Page cut off at an edge | `captureIssues`, announce which edge, offer retake | **Partly built:** the issue is reported and announced (`captureIssueSummary` in `app/_flow/usePhotoRun.ts`), the run then **carries on**. The retake *offer that stops for an answer* is **C-04**, open — see ESSENTIALS pipeline step 5 for why halting on a reported tilt would stop more runs than it saves |
| Upside-down or sideways page | Report orientation in `captureIssues`; retake prompt | **Partly built, same as the row above:** `rotated` came off **6 of 14** measured pages, so the announcement is the shipped behaviour and the prompt is **C-04**. `prepareImage` bakes the EXIF rotation into the pixels before the tag is dropped (C-01) |
| Glare / shadow / curved page | Same | Same as the two rows above: reported and announced, not blocked on; the copy review for each issue is **C-06** (`[~]`) |
| Tables and forms (amount due vs previous balance) | Transcribe tables **row by row**; facts must quote the row | P0 |
| Handwriting, stamps, checkboxes | Mark as low-reliability; do not interpret checkbox state without saying "appears" | P0 |
| Pages out of order, duplicated, or wrong document mixed in | Look for "Page x of y"; warn on gaps/duplicates; no silent reorder | P1 |
| Not a document (face, screen, object, blank) | `captureIssues: not_a_document`; plain message | P0 |
| Model refuses (ID card, medical image, safety filter) | Show the refusal plainly, offer paste-text path | P0 |
| Output truncated (`finish_reason: length`) | Detect, split by page, retry | **Not built as written** — the answer is detected and left as a marked hole, `[page n could not be read]` (**ADR-27**, C-11); there is **no retry and no split** (`lib/near-ai/completion.ts`). Splitting is not needed on the photo path because a page is one request, which is what the hole is for |
| Invalid JSON from the model | One repair retry, then show transcript only | P0 |
| Document contains instructions to the AI ("ignore previous…") | Treat as data; no tools exist; schema-validated output | P0 |
| **Scam or fake letters** | Read faithfully; **do not** claim detection; one generic caution on payment/urgent requests | P0 (wording only) |
| Mixed languages / non-English | Say English only is supported; do not guess | P0 |
| Phone locks or app backgrounded mid-analysis | Wake-lock; on abort, say what was lost and allow retry | P1 |
| Very long wait with no audio feedback | Interval announcements (every ~10 s), then done tone/haptic | P0 |
| Attestation changes between check and use (model redeploy) | Re-fetch once; then fail with a clear message | **Half built:** a report is fetched **once per model per session** (**ADR-35**) and a response that no longer verifies against the attested key fails the run — fail-closed, nothing sent on the stale key. The *re-fetch and retry* is not built; `attestation_changed` exists as an error code and its message only (`types/index.ts`, `lib/errors.ts`) |
| Screen reader announces progress twice | Single announcer instance | P0 |
| Large camera images (memory) | One page decoded at a time, bitmap closed as soon as its JPEG is written; output ≤1600 px / ≤768 KiB. **As built (C-01): the downscale is at draw time, not during decode** — `createImageBitmap` resize options need the target size, which is only known after decoding. Whether that is survivable across five pages on a mid-range phone is C-07, on a device | P0 |
| User already has text from their phone | Paste-text path | P0 |
| User's own dictation sends audio to the OS vendor | Disclose in the UI | P0 |
| Relay abuse (arbitrary path/host, huge bodies) | Exact-path allowlist, model allowlist, size cap | P0 |
| Cost per document unknown | Measure in spike; report in README | P0 |

### Q3. What is overengineered?

| Cut | Why | Replaced by |
|---|---|---|
| Local brightness/blur scoring | Unreliable on text pages; wrong failure mode | Model `captureIssues` |
| Page reorder UI | Visual drag interaction, hard for the target user | Capture order + remove/retake-last + page-number check |
| Voice input via recording + TEE transcription | Audio formats vary by browser; heavy; the *question* is far less sensitive than the document | Text field + OS dictation (disclosed) |
| Spell-out speech, voice picker, autoSpeak, verbosity | Screen readers already do character navigation | One read-aloud button + rate |
| Model self-reported `confidence` | Not trustworthy | Code-derived flags (quote found, numbers re-checked) |
| Multiple themes | Low value | System theme + one high-contrast |
| React Aria / Zustand / extra libraries | Native HTML covers this app | Native elements, one reducer/context |
| Offline PWA shell | App is useless offline | Manifest icons only |
| PII classifier, document-type presets | Not needed for the core demo | "Later" list |
| In-app spend-cap code | Extra code | Small prepaid key balance |
| Integration mock server built only for tests | Duplicate effort | **Fixture replay server** used for tests *and* R9 |
| `check-csp` script, `/api/health`, `/about` route, custom Disclosure component | Padding | Playwright network assertion; native `<details>` |
| Strict feature-isolation lint matrix | Solo, 12 days | One rule: server-only code stays out of client bundles |
| Three-screen-reader test promise | Only valid if devices exist | Test what you have; report gaps |

**What I would not cut:** the two-step transcript-then-structure pipeline (it is the only thing that makes quoting and honest reading possible) and the failed-verification demo (it is the one thing a judge can *see* working).

### Decisions needed from you
1. **Which devices and screen readers do you actually have?** This sets §7 testing honestly.
2. **Can you reach one real blind or low-vision user by Day 3?** If not, say so in the README and weaken the Impact claim.
   **Answered 2026-11-06: no.** The date in the roadmap version of this question was 2026-11-05 and it passed unanswered, so the second half of this instruction is what happened — README says so plainly and **U-04** is `[!]`. The question is still open as a *request*: one session before 2026-11-14 would be recorded as U-02 evidence and would be the first real finding this project has.
3. **Are you willing to ship the weaker (but true) privacy sentence if E2EE is unavailable?** I recommend yes.
4. **Who pays per document in a real deployment?** There is no good answer yet. A NEAR-based pay-per-use idea is the obvious story, but not a v1 build item.
