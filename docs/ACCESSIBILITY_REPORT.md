# Accessibility report

Item **A-13**. Structure required by `docs/PROJECT_STRUCTURE.md` §7 and AGENTS.md §8: tested,
not tested, failures, fixes. Two rules make this file worth reading:

- **Never claim a platform was tested unless it was.** Anything in "not tested" stays there even
  if it "should" work.
- **Automated axe results are necessary but not sufficient.** A green axe run is a weak sentence,
  not a conclusion; a screen-reader pass is the real test and it needs a human with a device (A-03,
  A-04, A-05, A-06 — all blocked on B-01 until a device and a user exist).

**Status as of 2026-11-05: automated checks cover the whole demo flow, including the screen the demo flow
reaches when an answer cannot be read, and — since A-17 — the stylesheet's own contrast, target and motion
rules in all three palettes. Nothing has been tested with an assistive technology.** The shell,
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

| 15 | **The visual system itself, as an accessibility property** (A-17, **ADR-37**): the three palettes' real pixel pairs computed from the page rather than read off the stylesheet — body text, nav links, the muted hint, the banner, and all three button states (primary label, secondary label, disabled label) at ≥ 4.5:1; one centred measure shared by `nav`, the banner and `main` at 1440/768/390 with no block sitting outside it; every `nav a` ≥ 44 px; the heading scale descending from one body size; a hovered button visibly changing fill and stepping, and under `prefers-reduced-motion` keeping the colour step while the movement goes; `.fact-list` stacking its label above its value at 390 px; and 12 axe sweeps — four routes × light/dark/high-contrast at 390 px | `tests/e2e/design.spec.ts`, Chromium headless, no credentials, `npx playwright test tests/e2e/design.spec.ts`. Each rule was mutation-checked: six separate edits to `globals.css` (drop the measure, drop the hover step, drop the reduced-motion rest, drop the light `color-scheme` on the native controls, invert the primary/secondary fills, collapse the type scale) each fail the tests that own them, and the suite passes again with the edits reverted. The suite was then re-run three times in one command (`--repeat-each=3`, 57/57) because the first full run had produced two timing flakes rather than two style flakes — see fixes A-17.3 and A-17.4 | 2026-11-05 | Pass — 19 tests, 139 e2e overall. Two findings came out of the pass and are now pinned: the app's own `color-scheme: dark` was drawing unselected radios as dark discs on a near-black page (under WCAG 1.4.11 for a control's indicator), and 11 class names in the markup had drifted out of the stylesheet entirely and were rendering with browser defaults. Both fixes are in `globals.css`. Row 12's limit still applies: these are computed ratios in one headless browser, not the 200%-zoom or real-device contrast check A-08 owes |

**What these rows do not mean.** All fifteen are automated checks in one headless browser. Nothing here was
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
`prefers-reduced-motion` and `prefers-contrast: more` now have in-browser assertions from row 15, so what
remains is whether a real person finds the resting state and the harder borders right; the app's own
high-contrast theme has an axe pass at desktop width in row 12 and one at 390 px in row 15, plus a manual
checklist line that can finally be run), and the full keyboard traversal of the results view headings and
links (row 7 covers the input view's stops, not the answer's).

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
| Screen magnification / 200% zoom | Not exercised at all; the 390 px column in row 15 is a narrow viewport, not enlarged text | A-08 |
| `prefers-contrast` and `prefers-reduced-motion` **on a real device, at real OS settings** | Row 15 emulates both in one headless browser and asserts what the stylesheet promises there; whether a person's own OS setting reaches the app the same way, and whether the result reads as *calmer* rather than merely *not moving*, is theirs | A-08 |
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

| 4 | **A press on the Settings theme checkbox that arrives before the app has hydrated does nothing at all** — no `onChange` runs, nothing is written, and the hydration render puts the server-rendered `false` back. The control is visible, enabled and stable, so Playwright's own actionability checks pass it straight through and report `Clicking the checkbox did not change its state`. Measured on `next dev` the same day: a press 0, 100, 200 or 400 ms after the navigation commits writes nothing to `sightline.settings`, leaves `data-high-contrast` absent and announces nothing — and the DOM checkbox is left **`checked: true`**. A reader at that moment hears "High contrast, checked" from a control the app has not acted on. The same press at 800 ms is heard. So this is not only a swallowed press, it is a control that reports a state the app does not have — AGENTS.md §8's "no silent transitions" in its sharpest available form. | `tests/e2e/design.spec.ts`'s phone-width sweep, second palette iteration, 2026-11-05, reproduced once and then hidden by a retry — `useStoredSettings`' server snapshot is `null` by design (A-15), so this is the window between that and the first client read. | **Understood, worked around in the test, not fixed in the app** — the tests now wait until the control agrees with its own storage before touching it. The app-side question (what a press before hydration should do, and what the same window looks like on a production build, which was **not** measured) is filed as **A-18** and belongs with A-03/A-04, because the answer is a keyboard-and-reader judgement, not a CSS one. |
| 3 | The stylesheet itself: `color-scheme: dark` hid the unselected radio indicator, and 11 class names the components render had no rule at all. Neither produced a violation any runner reported — axe has no rule for a control *indicator*, and it cannot see a class the stylesheet never mentions. | Found by A-17's screenshot pass at 1440/768/390 in the three palettes, 2026-11-05, and confirmed against `globals.css` by grep | **Fixed**, both in the stylesheet, each pinned by a test now — see fixes A-17.1 and A-17.2 below. |

_Four rows, and they are the whole list of what any check has produced: two from a test failing, one from a
human looking at screenshots, one from a retry that changed the answer. None of it came from a person using an assistive technology, which
is the difference between this table and a conclusion._

## Fixes

| ID | Failure | Fix | Verified by |
|---|---|---|---|
| A-17.1 | `color-scheme: dark` on `:root` — added so form controls stop flashing white in the dark palette — also made the **browser** draw an unselected radio as a dark disc. On the high-contrast theme (black page) that indicator is near-invisible. That is WCAG 1.4.11's 3:1 rule for a control's indicator, not a colour-contrast rule for text, so no axe check caught it | The two selectors carrying native controls (`input[type="radio"]` in `.setting-options`, `input[type="checkbox"]` in `.setting-row`) ask for the light rendering of the widget itself; the page around them stays dark | `design.spec.ts` "the native radio and checkbox stay visible on a dark page": every native control on `/settings`, in all three palettes, must compute `color-scheme: light`. Mutation-checked — deleting the rule fails it in dark and high-contrast and correctly still passes in light |
| A-17.3 | The twelve phone-width axe sweeps lived in **one** test, so twelve injections plus three demo runs shared a single 30 s limit. It passed on an idle machine and timed out with the suite running its workers — a gate that fails according to load is a gate nobody trusts, and the first full run of this pass produced exactly that. | Split into **one test per palette** (four injections each), with a 90 s timeout on those three and the reason written next to it. A failure now names the palette that produced it. | `npx playwright test tests/e2e/design.spec.ts --repeat-each=3` → **57 passed**, measured at 18-24 s per sweep under parallel load with the 90 s ceiling; the full suite is 139 passed, 2 skipped. |
| A-17.4 | A colour read taken inside the app's own 120 ms background transition returns the **interpolated** value, not the palette's. A high-contrast assertion reported `1.29:1` for a label that is black on yellow, and it did so only while the rest of the suite was competing for CPU. | `colours()` now re-reads two animation frames apart and returns the first pair of identical answers, so every contrast assertion in the file measures a **settled** palette rather than a frame of a cross-fade. The same hazard applies to any automated contrast read against this stylesheet, axe included - which is why it is written down here rather than only in the helper. | The three-repeat run above (57/57, zero retries) on a machine that had just failed two of those tests. |
| A-17.2 | 11 class names the components render had **no rule in `globals.css` at all**: the paste/capture/question hints, the mode-downgraded notice, the record count, the flagged-fact / flagged-answer / unsourced-answer markers, the empty capture frame, the file button. They were inheriting browser defaults, so the sheet and the markup had quietly drifted apart | Rules for each, from the tokens the rest of the sheet already uses: hints and callouts get `--text-hint` with a left border, the flags get `--warn-fg` **and** a weight change (colour alone is not a signal), the empty frame gets the dashed border, the native file button gets a real target size instead of the platform's | Screenshots re-shot at 1440/768/390 before and after; axe's own contrast rule covers those strings on the results screen, in every run of `flow.spec.ts` and of `design.spec.ts`'s 12 phone-width sweeps, and row 7 above is what actually pins that a flag is carried by **words** and not only by a colour. What no test yet pins is the flags' size and the dashed frame — said here rather than claimed |


## What the README and the submission are allowed to say

Only what the "Tested" table supports. The current honest sentence is: *"Built to accessibility
conventions (native HTML semantics, single live-region announcer, focus management, contrast and
target-size rules from AGENTS.md §8); automated checks plus a keyboard pass; not yet verified with
a screen reader by a blind or low-vision user."* Anything stronger has to wait for A-03..A-06.
