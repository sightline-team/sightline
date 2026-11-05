# `fixtures/` — what Mode F replays

Fixture mode (`npm run dev:fixtures`) runs the whole product with **zero credentials** by
replaying recorded and authored replies instead of calling NEAR AI Cloud. That is requirement R9, and
AGENTS.md §4 rule 11 makes it a hard rule: the app must work with no `.env`, and fixture mode must
show the "no real privacy guarantee" banner.

## The labelling rule (this is the reason this file exists)

| Term | Means | True today? |
|---|---|---|
| **authored synthetic** | A human wrote the JSON to look like a plausible response. It has never been on the wire. | Yes — the four pasted demo documents in `src/lib/fixtures/cases.ts` (three letters and the reply that fails to be a reading, **P-11**). |
| **recorded** | `scripts/record-fixtures.ts` (**S-11**) captured a real response from a real enclave and kept it only after its signature verified. | **Yes, for the photograph path.** The three pages, their reading and their two answers in `fixtures/responses/` were recorded on 2026-11-04 (UTC). The pasted letters above are still authored — nothing has been re-recorded for a text document. |

A fixture that has not been recorded must never be described as recorded, in a commit message, the
README, the demo, or the submission. Every recorded file here carries a `_provenance` sidecar saying
which recorder wrote it, when, against which model, and what its signature did; the authored cases
carry their provenance in `cases.ts` and in `tests/unit/fixtures.test.ts`, which refuses a corpus
that blurs the two. `src/lib/fixtures/replay.ts` tags nothing at all onto a receipt — the envelope it
serves is rebuilt with `id: fixture-<name>` and `model: fixtures/demo-model` so a screen can never
report a call this session did not make (**ADR-31**).

Why the distinction matters here rather than in a footnote: an authored fixture proves our *parsing
and UI* work. It proves nothing about the model, the enclave, or latency. If the file set is
mistaken for real traffic, the demo becomes an unearned claim.

## Layout

```
fixtures/
├─ responses/       # recorded: 3 pages, their structure reply, 2 answers (+ _provenance each)
└─ attestation/     # EMPTY — the good/tampered/expired reports T-08 needs are not recorded yet
```

`responses/` is read by `src/lib/fixtures/recorded.ts`, which pulls the reply text out and decides
nothing. `attestation/` is still empty, and that is the accurate state: **S-11**'s "Done when" also
names those three reports and this recording did not produce them, so the item stays in progress and
T-08 stays unmet.

## How a request is matched

The corpus is matched by *content*, not by call count: a text request is answered only when the
document in it is one of the recorded or authored ones, character for character. A **page** carries
no readable content — its bytes sit inside an `image_url` part — so it is matched by the SHA-256 of
the photograph file the person chose, against the keys `responses/pages/*.json` publish
(**ADR-31**, and `public/sample-docs/photographs/` for the files themselves).

Both rules exist to answer the same refusal: pasting your own letter, or choosing your own
photograph, produces a plain explanation (`no_fixture_for_input`, `no_fixture_for_page`) rather than a
demo summary dressed up as an answer about your document. `tests/e2e/flow.spec.ts` and
`tests/e2e/photo-fixtures.spec.ts` assert both in a browser.

## Contents rules

- **Synthetic documents only.** No real person's mail, medical result or bank statement, including
  the author's own (AGENTS.md §5). The recorded pages are drawn by `scripts/page_sample.ts`, and the
  disclaimer is printed into the picture so it survives the model and the joiner.
- No API keys, no workspace identifiers, no real `chat_id` values that could be looked up — which is
  why the recorded `completionId` strings here are kept in `_provenance` and never rendered.
- Never a fixture copied from a live response body that contained a real user's text.
- Every file carries `_provenance` (see `responses/README.md`) so provenance travels with the bytes. The
  authored corpus meets the same bar a different way: each document's own text says it is synthetic
  demo data, and `tests/unit/fixtures.test.ts` fails the build if one does not.

## Who reads these

`src/lib/fixtures/recorded.ts` → `src/lib/fixtures/replay.ts` (F-09) in fixture mode, `cases.ts` for
the authored documents, `tests/unit/recorded-fixtures.test.ts` for what the recorded files are claimed
to be, and `tests/unit/` wherever a test needs a model payload without a network. `tests/verification/`
(T-08) will read `attestation/` when it exists.
