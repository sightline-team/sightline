# Sample documents (synthetic only)

Owned by **C-09** (golden set) and **S-03** (accuracy on real photos). Nothing here may be a
real person's document — AGENTS.md §5 forbids using real personal documents, photos or medical
data in this project, including for testing. Every file added to this directory must be authored
for the test.

## What goes here

Once C-09 is built, one folder per case, each holding:

```
bill-three-line/
  page-1.png          # synthetic, rendered or drawn for the test
  expected.json       # transcript we expect, plus the facts the model must find
  notes.md            # what this case is probing (small text? glare? cut edge?)
```

Cases the golden set must cover, from PRD §11 and ARCH §14:

| Case | Probes |
|---|---|
| Clear printed bill, good light | baseline transcription + amount/date recall |
| Low contrast, photographed at an angle | `captureIssues` detection |
| Small text at 40 cm | `too_small_text`, `[illegible]` behaviour |
| One edge cut off | `cut_off_*` and the retake path (C-05) |
| Handwriting in the margin | `handwriting_present` |
| Numbers with £ and thousands separators | the numeric misread count that triggers T-11 |
| A document containing instructions to the AI | A-14 prompt injection |
| Multi-page (5 pages) | page indexing, `MAX_PAGES` boundary |

## Rules for adding files

- Synthetic content, invented sender, invented reference numbers, invented NHS/account numbers.
- Never a photograph of a real document, including the author's own.
- Never a screenshot of real mail from a real inbox.
- `expected.json` is the ground truth a human wrote, not model output saved as truth — otherwise
  the golden set measures the model against itself.

**Current state: empty.** No golden set exists, so no accuracy number may be quoted anywhere
(README, submission, or a demo) until C-09 runs.
