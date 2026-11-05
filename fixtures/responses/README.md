# `fixtures/responses/`

Replayed instead of `POST /v1/chat/completions` when mode is `fixtures` (F-09). **The six files here
are recorded traffic** — written by `npm run fixtures:record` (**S-11**) on 2026-11-04 (UTC) against
the live TEE-hosted models, and kept only after each reply's ed25519 signature verified against the
attestation-bound key. The authored synthetic documents stay in code
(`src/lib/fixtures/cases.ts`); nothing in this directory is authored, and nothing authored may be
described as recorded (`fixtures/README.md`).

## What is here

| File | What it is | Step | Model |
|---|---|---|---|
| `pages/page-1.json` … `page-3.json` | One photographed page each, and the digest of the JPEG the demo ships | `transcribe` | `z-ai/glm-5.3-flash` |
| `document.json` | The reading of the three pages joined, plus the transcript it was asked about | `analyse` | `Qwen/Qwen3.8-27B` |
| `qa/question-1.json`, `qa/question-2.json` | Two questions about that reading, one answered and one honestly not in the document | `qa` | `z-ai/glm-5.3-flash` |

The naming follows the recording order (a page is a page, and the reading is one document) rather
than the `<flow>-<case>.json` scheme this file first proposed; `src/lib/fixtures/recorded.ts` is the
only reader, so the two cannot drift apart silently.

## File shape

```jsonc
{
  "_provenance": {
    "recordedAt": "2026-11-04T23:22:36.034Z",   // one run, shared stamp across all six files
    "recorder": "scripts/record-fixtures.ts",
    "item": "S-11",
    "purpose": "transcribe",                    // transcribe | analyse | qa — local metadata, never a body field
    "endpoint": "https://cloud-api.near.ai/v1/chat/completions",
    "requestedModel": "z-ai/glm-5.3-flash",     // what was asked for
    "servedModel": "z-ai/glm-5.3-flash",        // what answered
    "completionId": "29761709df7c4984…",        // a real id, kept here and never rendered on screen
    "e2ee": false,                              // the browser half is still B-12's, so this stays false
    "requestBytes": 283328, "requestSha256": "71fea30b…",
    "usage": {},                                // not the service's silence — see "File shape"
    "ms": 16420,
    "signature": { "verified": true, "origin": "provider_tee", "algo": "ed25519", "detail": "…" },
    "synthetic": true,
    "syntheticNote": "Drawn by scripts/page_sample.ts. This fixture describes an invented invoice and no real person, provider, account or debt.",
    "fixtureKey": "e769e06a…",                  // pages only: SHA-256 of the shipped JPEG (ADR-31)
    "imageFile": "public/sample-docs/photographs/page-1.jpg",
    "prepared": { "bytes": 211378, "width": 1200, "height": 1600, "sourceBytes": 897438, "sourceWidth": 3024, "sourceHeight": 4032 },
    "question": "What reference number is on these pages?",   // qa files only
    "transcriptChars": 3557, "transcriptSha256": "bc52434e…"  // document.json only
  },
  "transcript": "…",                            // document.json only: the exact text the reading was asked about
  "envelope": { /* the completion as our transport schema parsed it: id, model, choices */ }
}
```

`envelope` holds `choices[0].message.content` **exactly as the service returned it**, because the thing
under test is our parsing of it (`src/features/capture/schemas.ts`, `src/features/analysis/schemas.ts`,
`src/features/qa/schemas.ts`). Reshaping a recording into our internal type would make the test circular.

What that file is *not* is a packet capture. It is the value `completionEnvelopeSchema`
(`src/lib/near-ai/envelope.ts`) parsed out of the response, and zod drops what the schema does not name:
`created`, `object` and **`usage`** are gone (§1's finding — "the envelope schema does not carry `usage`
at all"). Two consequences, both of which this file got wrong until 2026-11-04 and both worth keeping in
mind when someone reads a fixture as evidence:

- **`"usage": {}` means the recorder had nothing to store, not that the service billed nothing.** The
  six calls were billed; this run simply cannot say what they cost, so no cost figure may be quoted from
  a fixture's `_provenance`. The page and step rates in §4 and §1 of `docs/SPIKE_RESULTS.md` are the only
  measured prices this project has, and they come from reading the raw JSON, not this schema.
- The signature verdict in `_provenance.signature` **does** cover the full wire bytes — `checkSignature`
  was handed `response.rawText`, the untouched body, not the stripped object stored here. So the proof is
  stronger than the file, and the file is what the app would have seen anyway, which is exactly why
  replaying it is a fair test of the app.

`document.json` also stores the transcript so the join can be re-derived and compared
(**ADR-31**'s chain).

## Cases the set still needs

The recording covers the photographed path and its two answers. It does **not** yet cover the failure
rows the plan asked for, which is why **S-11** stays in progress:

| Case | Exercises | Item |
|---|---|---|
| attestation reports: good / tampered / expired | the verification ladder with real payloads | **T-08**, `fixtures/attestation/` (still empty) |
| `finish_reason: "length"` on a page | truncation → split by page, retry once | P-08, C-11 |
| a model refusal | refusal shown plainly + paste-text offered | ARCH §13 |
| a page reply carrying `uncertain` spans | "never guess unreadable text" on the photo path | C-04 |

The authored corpus already covers the malformed-JSON retry (**P-11**), a quote that fails grounding
(**P-02/P-04**) and the honest `notInDocument` answer (**P-06**); a recorded page with a capture
problem in it is **C-04**'s to record along with its cost.

## Rules

- Synthetic content only: invented sender, invented reference numbers. The recorded pages are drawn by
  `scripts/page_sample.ts` and print `SYNTHETIC INVOICE - NOT A REAL DOCUMENT` into the image, so the
  label survives the model, the joiner and the screen.
- Never edit a recorded reply. If it is wrong, re-record it and say so in the ROADMAP log — a reply
  edited to make a test pass is no longer a recording, and `tests/unit/recorded-fixtures.test.ts` will
  fail on the changed digest, the changed transcript or the drifted count until it is updated on purpose.
- No API keys, no workspace identifiers. A real `completionId` is allowed **only** in `_provenance`,
  never in what the app renders (**ADR-31**).
- Re-recording spends money: the recorder prints its plan and refuses to send anything without
  `--confirm` (ADR-23's per-step budgets, and B-11's spend cap is still open).
