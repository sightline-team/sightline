# Accessibility report

Item **A-13**. Structure required by `docs/PROJECT_STRUCTURE.md` §7 and AGENTS.md §8: tested,
not tested, failures, fixes. Two rules make this file worth reading:

- **Never claim a platform was tested unless it was.** Anything in "not tested" stays there even
  if it "should" work.
- **Automated axe results are necessary but not sufficient.** A green axe run is a weak sentence,
  not a conclusion; a screen-reader pass is the real test and it needs a human with a device (A-03,
  A-04, A-05, A-06 — all blocked on B-01 until a device and a user exist).

**Status as of 2026-11-03: automated checks cover the whole demo flow, including the screen the demo flow
reaches when an answer cannot be read; nothing has been tested with an assistive technology.** The shell,
the Mode F results view, the Settings controls and the transcript-only view are built and swept by axe.
The rows below are the honest current state of each.

## Tested

| # | What | How | Date | Result |
|---|---|---|---|---|
| 1 | Empty shell — machine-verifiable WCAG rules on `/`, `/read`, `/trust`, `/settings` | axe-core via Playwright, **Chromium headless only** (`tests/e2e/shell.spec.ts`, `npx playwright test`) | 2026-11-02 | 0 serious or critical violations on all four routes; 12 tests passed |
| 2 | Shell structure by keyboard: `Tab` reaches the skip link first and activating it moves focus to `main#main` | Playwright, same file | 2026-11-02 | Pass |
| 3 | Exactly one live region, `aria-live="polite"`, `role="status"`; landmarks; `lang="en"`; viewport not zoom-locked | Playwright DOM assertions, same file | 2026-11-02 | Pass |
| 4 | The completed Mode F flow — paste a demo document, read the results — axe-swept for all three demo documents | `tests/e2e/flow.spec.ts`, Chromium headless, dev server with no credentials | 2026-11-03 | 0 serious or critical violations; 26 tests passed (13 shell, 13 flow) |
| 5 | Focus after navigation lands on the results `<h1>`; after a failure, on the error summary | Playwright `toBeFocused()` on the same run | 2026-11-03 | Pass |
| 6 | Section order (Summary → Key facts → Actions → Warnings → Full text → Ask → Verification) is what a reader navigates by | `main h2` text asserted as an array | 2026-11-03 | Pass |
| 7 | The ungrounded fact is flagged in **words**, not by colour; every `main button` is ≥ 44 px tall; the keyboard path reaches the text box and the submit control in order | Playwright, same file | 2026-11-03 | Pass |
| 8 | Only one `role="status"` region exists during client navigation, and the route title is identical on every route | Playwright, same file | 2026-11-03 | Pass |
| 9 | The Forget control (P-10) is reachable on all four routes, and one press empties the screen, says so through the announcer, moves focus to the heading of what is left, and is ≥ 44 px | Playwright `toBeFocused()` + `boundingBox()`, same file | 2026-11-03 | Pass (47 tests: 12 shell, 35 flow) |
| 10 | The read-aloud control (P-09): nothing is spoken before a press; the label and `aria-pressed` change together and revert when the engine reports the end; the rate comes from the stored setting and an unreadable one falls back to normal; Forget cancels it; no button appears where there is no answer or no engine; the section order does not move | Playwright, same file, with `window.speechSynthesis` replaced by a recorder before the app loads | 2026-11-03 | Pass (58 tests: 12 shell, 46 flow) |
| 11 | The Settings controls (A-15) meet the target minimum as **rows**, not as 20 px native inputs; a speed chosen there is the speed the next reading uses; the theme reaches `globals.css`, is announced through the single live region, survives client navigation and a reload, and is not applied unless asked for; Forget leaves both values alone | Playwright, `tests/e2e/flow.spec.ts` ("Settings a person can change"), with the speech engine replaced by a recorder so the rate is read off the utterance | 2026-11-03 | Pass (69 tests: 12 shell, 57 flow) |
| 12 | axe over `/settings` **with the controls on screen, in both themes** — default and high contrast | `AxeBuilder` twice in the same test, same file | 2026-11-03 | 0 serious or critical violations in either theme. This is an axe colour-contrast pass, **not** the 200%-zoom / real-device contrast check A-08 still owes |
| 13 | **The screen a person meets when the service fails them** (P-11): the transcript-only view, reached in a browser by demo document 4 whose reply is prose rather than the JSON asked for — sections that need a reading asserted *absent* rather than empty, the failure announced through the single live region, focus on the heading, the English-only caution present and the content cautions not, no read-aloud control and zero utterances reaching the engine, both retry receipts on the page, the model's own prose nowhere on the screen, Forget clearing the degraded state, axe over the result | `tests/e2e/flow.spec.ts` ("the transcript-only screen"), Chromium headless, no credentials | 2026-11-03 | Pass — 0 serious or critical violations, and its `main button` targets measured ≥ 44 px. 80 tests overall (12 shell, 68 flow). Until this row the degraded view had **never been rendered by a browser**: P-08 proved it in a reducer only, which is the gap P-11 existed to close |

| 14 | **Forget pressed while an answer is still owed** (P-12): both presses are dispatched inside one browser task, so the run really is unresolved when the second lands. What is asserted: the announcement names the request it stopped (`Stopped the request that was still going.` — a sentence no test had ever caused to be spoken, and the first press of it found the grammar wrong); the abandoned run navigates nowhere, leaves the box empty and writes nothing further into the session — no transcript, no record, no reading, no degradation; the same press during a question leaves no answer; and a Mode F run issues no request to any model or relay endpoint, so “cancelled” here means the app’s own controller rather than a socket | `tests/e2e/flow.spec.ts` (“the request that was still going”), Chromium headless, no credentials, with `tests/unit/live-writes.test.ts` proving the same rule against the **real reducer** in Node — including the counter-factual that the reducer cannot tell a late write from a timely one | 2026-11-03 | Pass — 84 tests overall (12 shell, 72 flow). Before this row there was **no** browser evidence for a press during a pending completion, and the first one showed the reading arriving after the person had cleared it |

**What these rows do not mean.** All fourteen are automated checks in one headless browser. Nothing here was
heard through a screen reader, and a green axe run cannot tell whether the announcer reads well, whether
the document flow is comprehensible non-visually, or whether VoiceOver on iOS behaves the same. A-03..A-06
remain open and blocked on B-01. Row 10 is the sharpest version of that limit: it records the **calls the
app makes to the device's speech engine**, which is not evidence that anyone can hear the result clearly,
at a usable speed, over their own reader. Row 11 inherits it: the rate the tests prove is the rate *sent*,
not a speed anyone found comfortable. Row 13 is the same limit on the failure screen: it proves the DOM
contract a reader depends on there, not what a person hears when the app has no answer.

Row 3 says "one live region" about the **server-rendered shell**. It is still true, but it is now a
narrower statement than it sounds: see the Next.js route announcer in "Known gaps" below.

Not yet run, though now cheap: 200% zoom / reduced motion / `prefers-contrast` on a real device (A-08 —
the app's own high-contrast theme now has an axe pass in row 12 and a manual checklist line that can
finally be run), and the full keyboard traversal of the results view headings and links (row 7 covers the
input view's stops, not the answer's).

## Not tested (and therefore not claimed)

| Platform | Why not | Blocks |
|---|---|---|
| iOS VoiceOver | No device; B-01 asks the human which devices are available | A-03 |
| Android TalkBack | No device | A-04 |
| NVDA + Firefox on Windows | No machine | A-05 |
| macOS VoiceOver | No machine | A-06 |
| Braille display / embosser path | Never covered by any item; PRD §12 assumption, unverified | — |
| The read-aloud voice (P-09), and which device voices synthesise over the network | The tests record the calls the app makes; nobody has listened to the result, and whether a given browser voice is on-device is a property of the device | A-03, A-04 |
| Whether four named speeds is the right set, and whether the theme is usable at high contrast on a real screen | The control exists and is checked structurally; whether it is *right* is a person's judgement, and the first one available is U-01 | A-08, U-01, B-01 |
| The transcript-only screen as a person experiences it (P-11) | It is now rendered and swept in a browser, but nobody has landed on it with a reader running — and "there is no read-aloud control here" is a decision made from the DOM, not from hearing a failure | A-03, A-04, A-06, U-01 |
| A Forget press against a run that is genuinely slow (P-12) | The browser proof holds both presses inside one task because Mode F answers in microtasks and issues no request at all. What a real person's press does to a live completion — a cancelled socket, how long after the announcement the screen settles, whether the counted sentence is heard as reassurance or as jargon — waits on F-04, F-05 and B-05 | A-06, F-04, F-05, B-05 |
| Real user session | U-01 open | U-02, U-03 |
| Screen magnification / 200% zoom, `prefers-contrast`, `prefers-reduced-motion` | Not exercised since the styles exist | A-08 |
| Dynamic text / OS font scaling | Not exercised | A-08 |

## Known gaps in the current shell

These are design decisions we are aware of, not surprises:

- **Next.js injects a second live region on client navigation.** `app-page.runtime` renders a
  `<next-route-announcer>` shadow host containing `div[role=alert][aria-live=assertive]`, and fills
  it with `document.title`, falling back to the first `<h1>` when the title is empty. Measured on
  2026-11-03 on a `next build` + `next start` run: it stayed **empty** through the whole flow,
  because `layout.tsx` gives every route the one title `Sightline` and no page overrides it. Measured
  on the same day under `next dev`: the fallback fires and the region does take the new `<h1>`, so
  while developing the user hears the route name as well as our sentence — a duplicate speech, and
  an `assertive` one. Two consequences: giving a route its own `metadata.title` is an accessibility
  change and must be decided, not inherited; and A-03/A-04 must listen to a **production** build,
  because the dev server is not the app. Row 8 asserts the invariant that keeps it silent.
- The announcer (`src/lib/a11y/announcer.tsx`) is a single `role="status"` live region, mounted in
  `layout.tsx`. Repeating an identical message may not re-announce across all screen readers; the
  e2e suite proves there is exactly one live region, it cannot prove re-announcement. Open item,
  to be settled by A-03/A-04 rather than papered over with a zero-width space hack.
- Progress is specified to announce about every 10 s, not per tick (AGENTS.md §8). Not implemented —
  owned by **A-07**, and untestable until something takes 10 s (P-03).
- `SpeakButton` is currently a placeholder text, not a disabled control, because an inert button
  that speaks nothing is an accessibility bug disguised as a feature (P-09 owns the real one).
- Dictation as an input path (users who speak rather than type) is documented as an OS-level feature
  in `AskPanel`, not something Sightline implements (A-11).

## Failures

| # | Failure | How it was found | Status |
|---|---|---|---|
| 1 | Every interactive assertion failed: the page rendered but never hydrated, so clicking a demo button put nothing in the text box and a "submit" fell through to a native GET form post (`/?document-text=`). | `tests/e2e/flow.spec.ts` first run, 2026-11-02 | **Fixed, test-side.** The dev server refuses client bootstrap when the page is reached through a host it does not recognise: Playwright's `baseURL` was `http://127.0.0.1:3100` while Next was answering as `localhost`. Proved by measuring both hosts — `#document-text` had no React props under `127.0.0.1` and did under `localhost`. `playwright.config.mts` now uses `localhost`; `allowedDevOrigins` was deliberately **not** widened, since that relaxes a dev-time security default to suit a test. |
| 2 | A second `aria-live` region appeared after client navigation, so the shell's "exactly one live region" assertion stopped holding once the app could navigate. | Same run, 2026-11-03 | **Understood, guarded, not removed** — see the Next.js route announcer in "Known gaps". Production is silent; dev is not. Needs a human ear on A-03 before anything stronger is claimed. |

_Nothing else has produced a failure. The empty rest of this table is a statement about testing, not
about the app's quality._

## Fixes

| ID | Failure | Fix | Verified by |
|---|---|---|---|
| — | | | |

## What the README and the submission are allowed to say

Only what the "Tested" table supports. The current honest sentence is: *"Built to accessibility
conventions (native HTML semantics, single live-region announcer, focus management, contrast and
target-size rules from AGENTS.md §8); automated checks plus a keyboard pass; not yet verified with
a screen reader by a blind or low-vision user."* Anything stronger has to wait for A-03..A-06.
