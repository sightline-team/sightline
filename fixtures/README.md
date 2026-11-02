# `fixtures/` — what Mode F replays

Fixture mode (`npm run dev:fixtures`) runs the whole product with **zero credentials** by
replaying files from this directory instead of calling NEAR AI Cloud. That is requirement R9, and
AGENTS.md §4 rule 11 makes it a hard rule: the app must work with no `.env`, and fixture mode must
show the "no real privacy guarantee" banner.

## The labelling rule (this is the reason this file exists)

| Term | Means | True today? |
|---|---|---|
| **authored synthetic** | A human wrote the JSON to look like a plausible response. It has never been on the wire. | Yes — this is all we have. |
| **recorded** | `scripts/record-fixtures.ts` (S-11) captured a real response from a real enclave. | **No.** Needs blocker B-05 (an API key). |

A fixture that has not been recorded must never be described as recorded, in a commit message, the
README, the demo, or the submission. `src/lib/fixtures/replay.ts` therefore tags every fixture with
its provenance, and anything that cannot be tagged is treated as authored synthetic.

Why the distinction matters here rather than in a footnote: an authored fixture proves our *parsing
and UI* work. It proves nothing about the model, the enclave, or latency. If the file set is
mistaken for real traffic, the demo becomes an unearned claim.

## Layout

```
fixtures/
├─ responses/       # transcribe / structure / qa payloads (one file per case)
└─ attestation/     # good, tampered, expired reports for the verification tests (T-08)
```

**Both directories are empty as built, and that is the accurate state, not an oversight.** Mode F
does not read files from here yet. It replays an in-code corpus —
`src/lib/fixtures/cases.ts` (F-09) — of three authored synthetic documents, each with the analysis
the demo answers with. This directory is where **recorded** payloads land once S-11 can capture
them, which needs blocker B-05 (an API key and a live session).

The corpus is matched by *content*, not by call count: a request is answered only when the document
in it is one of the three, character for character. Pasting your own letter therefore produces a
refusal (`no_fixture_for_input`), not a demo summary dressed up as an answer about your document.
`tests/e2e/flow.spec.ts` asserts that refusal in a browser.

## Contents rules

- **Synthetic documents only.** No real person's mail, medical result or bank statement, including
  the author's own (AGENTS.md §5).
- No API keys, no workspace identifiers, no real `chat_id` values that could be looked up.
- Never a fixture copied from a live response body that contained a real user's text.
- Every file carries `_meta` (see `responses/README.md`) so provenance travels with the bytes. The
  in-code corpus meets the same bar a different way: each document's own text says it is synthetic
  demo data, and `tests/unit/fixtures.test.ts` fails the build if one does not.

## Who reads these

`src/lib/fixtures/replay.ts` (F-09) in fixture mode — today from `cases.ts`, later from
`responses/` — `tests/verification/` (T-08) for the tampered/expired cases, and `tests/unit/`
wherever a test needs a model payload without a network.
