# `fixtures/attestation/`

Attestation reports for the verification tests (**T-08**) and for `/api/verify` (**T-03**). Each
file states which checks should pass and which should fail, so a test asserts the *verdict* rather
than a screenshot.

## The honesty caveat, which is stronger here than for `responses/`

A "recorded" attestation fixture is a contradiction. The checks under test are cryptographic:
signatures over report bytes, quote validity, nonce binding, expiry. Replaying a real captured
report exercises **parsing**, and the moment any of those bytes is edited the signature stops
verifying — which is exactly the tampered case.

So:

| Case | Honest provenance | How to get it |
|---|---|---|
| `good` | recorded **only** by capturing a live report with a real key (B-05, S-05) | not possible today |
| `tampered` | synthetic, by construction | take a report and change one field — expected to fail the signature check |
| `expired` | synthetic | a live capture plus a back-dated timestamp, or a hand-written report with a stale `tcb` date |

Anything labelled `good` before B-05 is a placeholder that **cannot** pass a real signature check,
and must not be used to mark T-01 done. `tests/verification/` should assert `partial`/`failed`
verdicts for the synthetic cases and leave the `verified` path to a live spike.

## File shape

```jsonc
{
  "_meta": {
    "provenance": "authored_synthetic",   // these can never be recorded honestly: see the table
    "shouldPass": ["nonce_binding", "nras_gpu_verdict"],  // check names expected to pass
    "shouldFail": ["tdx_quote"],
    "purpose": "expired report — the time check must fail",
    "notes": "Which check this fixture exists to fail, and how the bytes were made."
  },
  "report": { /* an AttestationReport from src/lib/near-ai/attestation.ts */ }
}
```

The report's real fields come from `GET /v1/attestation/report`, documented in
`docs/SPIKE_RESULTS.md` §3. Its internal shape is the `AttestationReport` type in
`src/lib/near-ai/attestation.ts`; a fixture must fit that type rather than this README inventing
one. Where a field is still unknown, the fixture leaves it out and the test asserts the fail-closed
behaviour — inventing plausible NEAR AI Cloud fields is forbidden (AGENTS.md §5, §6).

## Rules

- No real `chat_id`, workspace id, account address or API key in any file here.
- `_meta.shouldPass` / `shouldFail` are the assertion source; a fixture with no stated expectation
  tests nothing.
- If the decided check set in `docs/ARCHITECTURE.md` §10 changes, these files change in the same
  commit, because their expectations reference check names.

**Current state: empty.** T-01 and T-03 are stubs, so nothing consumes these yet.
