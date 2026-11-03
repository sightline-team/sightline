# Screen-reader and keyboard manual checklist

Owned by **A-03** (device 1), **A-04** (device 2), **A-05** (keyboard-only), **A-06** (focus
management). Automated axe results are in `tests/e2e/shell.spec.ts`; **they are not a substitute
for this file** (AGENTS.md §8).

## Rules for filling this in

- Record the **exact** device, OS, screen reader and version. "VoiceOver" is not a result;
  "iPhone 12, iOS 18.1, VoiceOver with default speaking rate" is.
- A row you did not run stays blank and gets listed as untested in
  `docs/ACCESSIBILITY_REPORT.md`. Never mark it ✓ because it "should" work.
- Record what you **heard**, not what the DOM says. The point of the pass is that the announcement
  reaches the user.
- One real task per row. If a step needs a mouse, that is a finding, not an instruction.

## Devices

| # | Device | OS + version | Screen reader + version | Braille? | Available | Date tested |
|---|---|---|---|---|---|---|
| 1 | (B-01: ask the human) | | | | Unknown — A-03 blocked | |
| 2 | | | | | Unknown — A-04 blocked | |
| — | Desktop keyboard only | current | none (tab order + visible focus) | n/a | **Available** | see A-05 |

## Tasks (device 1, A-03)

Run in this order. Each cell: heard correctly? (Y/N), what was actually spoken, defect ID.

| Step | What to do | Expected to hear | Result |
|---|---|---|---|
| 1 | Open the app | Landmark "main", heading "Sightline", and in fixture mode the banner "Demo data. No real privacy guarantee." | |
| 2 | Skip link | "Skip to main content" is the first thing Tab reaches; activating it moves focus into the content | |
| 3 | Add a page | Focus lands on the new "Page 1" item; the page count is announced | |
| 4 | Remove a page | "Page 1 removed", remaining pages renumber in the announcement | |
| 5 | Retake a page | The specific capture problem is named ("The top of the page is missing from the photo."), then the retake flow | |
| 6 | Analyse | Progress announced about every 10 s, not per tick; no silence during a long wait | |
| 7 | Results | Order is Summary → Key facts → Actions → Warnings → Full text → Ask → Trust receipt (AGENTS.md §8) | |
| 8 | A fact with a failed quote | It is flagged as not sourced, never read as sourced | |
| 9 | Ask a question | Answer is read; a not-in-document answer says the document does not say | |
| 10 | Trust receipt | Names each check with ran/passed; `partial` is never read as "verified" | |
| 11 | Forget | Confirmation that nothing remains; focus returns to the start | |
| 12 | Error path | The error summary receives focus and its one-sentence reason is plain language | |
| 13 | 200% zoom / largest text | Nothing is clipped or requires horizontal scrolling | |
| 14 | High contrast (Settings) | Colours change and text stays ≥ 4.5:1 | |
| 15 | Reduced motion | No animation is required to understand a state change | |
| 16 | Read the answer aloud (P-09) | Nothing is spoken before the press; the button's own label change is heard; the summary and Sightline's cautions are the words read, not the model's warnings; a second press, leaving the screen, or Forget stops it; the device's route announcer does not talk over it | |
| 17 | Choose a reading speed (A-15) | Each radio is announced with its word ("Fast"), not a number; the next reading uses it; no second announcement follows the selection; the off-list case (a hand-edited 1.8) says what it means | |
| 18 | Turn on high contrast (A-15) | "High contrast is on." reaches the live region; colours change on every route and after a reload; text stays ≥ 4.5:1 to the eye, not only to axe | |

## Keyboard-only pass (A-05) — can be run today

| Check | Command / action | Result |
|---|---|---|
| Tab order is skip link → nav → main → page controls | `Tab` from the address bar | |
| Every control reachable and operable with keyboard alone, ≥ 44×44 px targets | `Tab`/`Enter`/`Space` traversal of all four routes | |
| Focus visibly indicated | watch each `:focus-visible` | |
| No focus trap in the announcer or nav | | |
| Routes render no content requiring a hover state | | |

## Findings

| ID | Device | Step | What happened | Fix / item | Verified |
|---|---|---|---|---|---|
| — | | | | | |

**Status as of 2026-11-02: zero rows filled.** No device has been confirmed (B-01) and no user has
been reached (U-01). If that is still true on 2026-11-05, U-04 applies and the submission says the
accessibility work is convention-based plus automated, not user-verified.
