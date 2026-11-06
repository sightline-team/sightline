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

These are enforced by `npm run release:synthetic` (**R-07**, **ADR-39**) rather than by diligence: it
classifies every file in the corpus, **fails on one it cannot name**, scans every string value in
every one of them (the recorded SHA-256 digests included) for eleven personal-data shapes, and prints
rule + source + length for a match — never the matched value, because a real NHS number in a CI log
would be the audit creating the thing it hunts.

- Synthetic content, invented sender, invented reference numbers, invented NHS/account numbers.
- **A telephone number may come only from Ofcom's table of numbers reserved for TV and radio drama**
  — the geographic drama range, the mobile drama range, the London drama range and the rest, all
  twenty listed as data in `DRAMA_RANGES` in `scripts/synthetic-audit.ts` (transcribed second-hand
  from a reproduction of Ofcom's extract, because ofcom.org.uk answers this machine with 403; the
  table lives in the script rather than in prose, and a test asserts each range's own first number is
  accepted and one past its thousand is not). "Invented" is not a checkable property — a
  plausible-looking non-geographic number is real-format and nobody can prove it is nobody's —
  while a reserved range is a claim with a source. Three numbers in the demo corpus moved into the
  geographic drama range on 2026-11-05 for exactly that reason.
- **This README is inside the audited tree, so it may not quote a refused number either.** It used to
  spell out the three it moved, and the audit failed the run on this file's own prose (rule, source,
  length — the digits are deliberately not printed here, and that is the rule working, not an
  exemption). Describe a shape by what it is, not by an example of it.
- Never a photograph of a real document, including the author's own. A drawn page has no reason to
  own camera metadata, so the audit parses each shipped JPEG's segment table and refuses EXIF, XMP,
  Photoshop-3.0 and COM segments, then hashes the bytes it read and compares the digest with the one
  the recording keys on (**ADR-31**) — the photograph audited is the photograph Demo mode answers for.
- Never a screenshot of real mail from a real inbox.
- `expected.json` is the ground truth a human wrote, not model output saved as truth — otherwise
  the golden set measures the model against itself.

What the audit cannot see is in its own verdict: whether an invented *name* (`Northgate Example
Trust`) happens to belong to something real is a lookup, not a shape; and nothing in a repository can
see a document a person typed into a live run, which is AGENTS.md §4 rule 7 (never persisted) and
**R-06** (never committed).

**Current state: three recorded demo photographs, and no golden set.** `photographs/` exists because
of **S-11**; the case table above is still entirely unbuilt, so no accuracy number may be quoted
anywhere (README, submission, or a demo) until C-09 runs. The demo photographs make the photograph
*flow* true with no credentials; they do not make the transcription *accurate* by any measured
percentage, and must never be described as if they did.
