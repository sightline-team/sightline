# Replies

Copy for replies under the demo post, kept beside the post so the wording is reviewed in one place and
so the next person who asks gets the same answer. Every sentence below is traceable to a file and, where
one exists, to a test — the receipt is the one part of this app where a vague answer would be a lie.

## 2026-11-14 — "how does someone using a screen reader hear that the answer was signed by the enclave?"

Asked by @playkibble under https://x.com/playkibble/status/2121504330515677622 — a reader who knows what
they are asking, so the answer is the DOM contract, not a reassurance. Post as a **thread of three
replies** under the demo post (each is under 280 with no link, so X's 23-per-URL rule does not apply).

Voice: one idea per sentence, no more than 20 words, plain words, no participle piles. A public reply is
plain prose even under a compression checklist — the terseness is in how much is left out, not in broken
grammar (the `caveman` skill's own rule 5).

### 1/ — the mechanism (252)

```
No badge. It is a sentence. Under the answer you hear a heading, "Verification", and a list. Each item starts with its verdict: "Passed Response signature". The key and the nonce stay in a closed "Technical details" box. Nothing interrupts your reader.
```

### 2/ — what it says, both ways (201)

```
When it works it reads: "The AI model was verified as running in a private enclave and each answer was proven to come from it." When a check cannot run: "Partly checked, not verified: 2 could not run."
```

### 3/ — the gap, said plainly (148)

```
The real gap: no screen-reader user has tried it yet. Our tests check heading order and text, not what NVDA says. A pass with a real reader is next.
```

## What each reply rests on

| Claim | Authored in | Proved by |
|---|---|---|
| The status is a sentence, not a badge | `src/features/trust/claims.ts` — the only place a privacy sentence exists (`T-04`); `TrustReceipt` renders `claimCopy(...)` into a `<p>` | `tests/e2e/flow.spec.ts` reads `trust-claim` as text |
| "Verification" is a heading and the receipt is last | `TrustReceipt` (`h2` → `h3` per call → `h4` "Checks that ran" / "Checks that did not run"); `ResultsView` mounts it last | `flow.spec.ts` `SECTION_ORDER`, `['…', 'Verification']`, asserted in order |
| "Passed Response signature", "Passed Signed by Model Enclave" | `src/lib/near-ai/signatures.ts` emits check names `response_signature` and `signed_by_model_enclave`; `TrustReceipt.statusWords` prints the verdict first and `humanise` spells the name out | `flow.spec.ts` asserts both `h4` headings under the receipt |
| Key and nonce are out of the reading flow | `TrustReceipt`'s native `<details><summary>Technical details</summary>`, so the disclosure is a real control in the accessibility tree rather than a hover target | `flow.spec.ts` ("the trust page shows the same receipt…") asserts `fixtures/demo-model` and `verified: false` are **hidden** until that summary is clicked; `design.spec.ts` sweeps axe over `/read` at phone width in all three palettes |
| "The AI model was verified as running in a private enclave and each answer was proven to come from it." / "Partly checked, not verified: 2 could not run." | `claims.ts` → `CLAIM_COPY.attested_model_signed_responses` and `partialCopy(checks)`, the latter generated from `ran`/`passed` and never written by a component | `tests/unit/claims.test.ts`; `flow.spec.ts` asserts no exact-"Verified" node in fixtures |
| Each check item starts with its verdict | `TrustReceipt.statusWords` → `Passed` / `Did not pass` / `Did not run` before the name | `flow.spec.ts` asserts both `h4` headings; `claims.test.ts` covers the partial sentence |
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
