# Replies

Copy for replies under the demo post, kept beside the post so the wording is reviewed in one place and
so the next person who asks gets the same answer. Every sentence below is traceable to a file and, where
one exists, to a test — the receipt is the one part of this app where a vague answer would be a lie.

## 2026-11-14 — "how does someone using a screen reader hear that the answer was signed by the enclave?"

Asked by @playkibble under https://x.com/playkibble/status/2121504330515677622 — a reader who knows what
they are asking, so the answer is the DOM contract, not a reassurance. Post as a **thread of three
replies** under the demo post (each is under 280 with no link, so X's 23-per-URL rule does not apply).

### 1/ — the mechanism (270)

```
Not a badge: a sentence. Below the answer, heading "Verification", then "Passed Response signature" and "Passed Signed by Model Enclave" — verdict word first, key and nonce behind a disclosure. It's the last section, so you read on to it; nothing interrupts your reader.
```

### 2/ — what it says when it cannot verify (246)

```
If a check fails or can't run, the sentence changes: "Partly checked, not verified: 2 could not run. 3 of 5 checks passed." No tick, no green, no badge — the sentence carries the status, and the raw "verified: true" stays in the technical detail.
```

### 3/ — the gap, said plainly (191)

```
The gap you're pointing at: no screen-reader user has been through this yet. axe and Playwright prove heading order and text, not what NVDA speaks. A recorded pass with a real reader is next.
```

## What each reply rests on

| Claim | Authored in | Proved by |
|---|---|---|
| The status is a sentence, not a badge | `src/features/trust/claims.ts` — the only place a privacy sentence exists (`T-04`); `TrustReceipt` renders `claimCopy(...)` into a `<p>` | `tests/e2e/flow.spec.ts` reads `trust-claim` as text |
| "Verification" is a heading and the receipt is last | `TrustReceipt` (`h2` → `h3` per call → `h4` "Checks that ran" / "Checks that did not run"); `ResultsView` mounts it last | `flow.spec.ts` `SECTION_ORDER`, `['…', 'Verification']`, asserted in order |
| "Passed Response signature", "Passed Signed by Model Enclave" | `src/lib/near-ai/signatures.ts` emits check names `response_signature` and `signed_by_model_enclave`; `TrustReceipt.statusWords` prints the verdict first, `humanise` spells the name out | the same e2e test asserts both `h4` headings; `speak.mjs` proof-read the film's copy |
| Key and nonce are out of the reading flow | `TrustReceipt`'s `<details><summary>Technical details</summary>` — a native disclosure, reachable and announced | `design.spec.ts` measures the `<details>` frame; axe clean on `/read` |
| "Partly checked, not verified: 2 could not run. 3 of 5 checks passed." | `claims.ts` → `partialCopy(checks)`, generated from `ran`/`passed`, never written by a component | `tests/unit/claims.test.ts`; `flow.spec.ts` asserts no exact-"Verified" node in fixtures |
| Nothing interrupts the reader | one announcer (`src/lib/a11y/announcer.tsx`, `role="status"`, polite); the receipt is static text, deliberately **not** a second live region | `flow.spec.ts` asserts the single region owns the outcome |
| No screen-reader user yet | `ROADMAP.md` **A-03** / **A-04** are `[ ]`; `docs/ACCESSIBILITY_REPORT.md` lists manual readers as not tested | — |

## What is deliberately not claimed in the replies

- **That the hosted demo shows the sentence above.** Its mode is the deployment's, and a fixtures build
  renders "Demo data. No real privacy guarantee." instead — verified today: the fixtures banner
  (`data-testid="fixtures-banner"`, `layout.tsx`) is **absent** from the deployed `/` HTML, so the live
  site is set to `relay`, but no live run has been exercised from here and the reply does not assert one.
- **That four checks are the whole gap.** On a live path the receipt can also read `partial` for the
  `B-12` checks; reply 2 quotes the shape, not a count that would be wrong on a different run.
- **Any accuracy claim.** Transcript consistency (`rule 8`) is not page correctness, and a listener is
  owed that distinction more than a sighted reader is.

## Follow-up worth doing (A-03)

Record a pass with a real reader that starts at `/read`'s Verification section and answers one question:
does the claim sentence arrive before the check list, and does "Did not run" get heard as easily as
"Passed"? Until that exists, reply 3 is the honest answer.
