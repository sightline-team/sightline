# Accessibility report

Item **A-13**. Structure required by `docs/PROJECT_STRUCTURE.md` §7 and AGENTS.md §8: tested,
not tested, failures, fixes. Two rules make this file worth reading:

- **Never claim a platform was tested unless it was.** Anything in "not tested" stays there even
  if it "should" work.
- **Automated axe results are necessary but not sufficient.** A green axe run is a weak sentence,
  not a conclusion; a screen-reader pass is the real test and it needs a human with a device (A-03,
  A-04, A-05, A-06 — all blocked on B-01 until a device and a user exist).

**Status as of 2026-11-02: automated checks exist; nothing has been tested with an assistive
technology.** The shell is built and swept by axe. The rows below are the honest current state of each.

## Tested

| # | What | How | Date | Result |
|---|---|---|---|---|
| 1 | Empty shell — machine-verifiable WCAG rules on `/`, `/read`, `/trust`, `/settings` | axe-core via Playwright, **Chromium headless only** (`tests/e2e/shell.spec.ts`, `npx playwright test`) | 2026-11-02 | 0 serious or critical violations on all four routes; 12 tests passed |
| 2 | Shell structure by keyboard: `Tab` reaches the skip link first and activating it moves focus to `main#main` | Playwright, same file | 2026-11-02 | Pass |
| 3 | Exactly one live region, `aria-live="polite"`, `role="status"`; landmarks; `lang="en"`; viewport not zoom-locked | Playwright DOM assertions, same file | 2026-11-02 | Pass |

**What these rows do not mean.** All three are automated checks in one headless browser. Nothing here was
heard through a screen reader, and a green axe run cannot tell whether the announcer reads well, whether
the document flow is comprehensible non-visually, or whether VoiceOver on iOS behaves the same. A-03..A-06
remain open and blocked on B-01.

Not yet run, though now cheap: the full keyboard traversal of the four routes beyond the skip link (only
the first tab stop is asserted, which is A-05), and 200% zoom / high contrast / reduced motion (A-08).

## Not tested (and therefore not claimed)

| Platform | Why not | Blocks |
|---|---|---|
| iOS VoiceOver | No device; B-01 asks the human which devices are available | A-03 |
| Android TalkBack | No device | A-04 |
| NVDA + Firefox on Windows | No machine | A-05 |
| macOS VoiceOver | No machine | A-06 |
| Braille display / embosser path | Never covered by any item; PRD §12 assumption, unverified | — |
| Real user session | U-01 open | U-02, U-03 |
| Screen magnification / 200% zoom, `prefers-contrast`, `prefers-reduced-motion` | Not exercised since the styles exist | A-08 |
| Dynamic text / OS font scaling | Not exercised | A-08 |

## Known gaps in the current shell

These are design decisions we are aware of, not surprises:

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

_None recorded yet — no run has produced one. Empty here is a statement about testing, not about
the app's quality._

## Fixes

| ID | Failure | Fix | Verified by |
|---|---|---|---|
| — | | | |

## What the README and the submission are allowed to say

Only what the "Tested" table supports. The current honest sentence is: *"Built to accessibility
conventions (native HTML semantics, single live-region announcer, focus management, contrast and
target-size rules from AGENTS.md §8); automated checks plus a keyboard pass; not yet verified with
a screen reader by a blind or low-vision user."* Anything stronger has to wait for A-03..A-06.
