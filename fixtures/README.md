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

## Contents rules

- **Synthetic documents only.** No real person's mail, medical result or bank statement, including
  the author's own (AGENTS.md §5).
- No API keys, no workspace identifiers, no real `chat_id` values that could be looked up.
- Never a fixture copied from a live response body that contained a real user's text.
- Every file carries `_meta` (see `responses/README.md`) so provenance travels with the bytes.

## Who reads these

`src/lib/fixtures/replay.ts` (F-09) in fixture mode, `tests/verification/` (T-08) for the
tampered/expired cases, and `tests/unit/` wherever a test needs a model payload without a network.
