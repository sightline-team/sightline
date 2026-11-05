# Sample documents (synthetic only)

Owned by **C-09** (golden set), **S-03** (accuracy on real photos) and — since **S-11** —
**C-13** (the three photographs Mode F answers for). Nothing here may be a
real person's document — AGENTS.md §5 forbids using real personal documents, photos or medical
data in this project, including for testing. Every file added to this directory must be authored
for the test.

## What is here now

```
photographs/
  page-1.jpg   page-2.jpg   page-3.jpg
```

Three 1200×1600 JPEGs of a synthetic invoice, drawn by `scripts/page_sample.ts` and recorded by
`npm run fixtures:record` on 2026-11-04 UTC. They are the *only* photographs Demo mode answers for:
`fixtures/responses/pages/page-N.json` holds the reading a TEE-hosted model made of each one, and
the SHA-256 of the file as chosen is the key that opens it (**ADR-31**). Choosing these three files
by name, byte for byte, gets a full run with no credentials; choosing a different file — or these
with one byte changed — gets `no_fixture_for_page`.

Two things these files are **not**, both worth stating because the folder's name invites the
assumption:

- Not the golden set. They are one document, with no `expected.json` and no deliberately bad
  variants, so they support no accuracy claim. The `expected.json` ground truth is a human's
  answer about a photo; the recorded reply beside these is a model's answer, stored for replay.
- Not served to the browser as page assets. Nothing in `src/` fetches them; the app recognises a
  photograph by hashing the file the person chose. They sit here because that is where synthetic
  test documents live, and because a person running the demo locally needs real files to pick in
  the file chooser.

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

**Current state: three recorded demo photographs, and no golden set.** `photographs/` exists because
of **S-11**; the case table above is still entirely unbuilt, so no accuracy number may be quoted
anywhere (README, submission, or a demo) until C-09 runs. The demo photographs make the photograph
*flow* true with no credentials; they do not make the transcription *accurate* by any measured
percentage, and must never be described as if they did.
