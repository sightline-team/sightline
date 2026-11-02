# `fixtures/responses/`

Replayed in place of `POST /v1/chat/completions` when mode is `fixtures` (F-09). **No file here is
recorded traffic** until S-11 and blocker B-05 exist; every one is authored synthetic and must say
so in its own `_meta`.

## File shape

One file per case, named `<flow>-<case>.json`:

```jsonc
{
  "_meta": {
    "provenance": "authored_synthetic",   // or "recorded" — only after scripts/record-fixtures.ts runs
    "authoredBy": "Qoder agent",
    "authoredAt": "2026-11-02",
    "endpoint": "/v1/chat/completions",
    "model": "unverified-model-name",      // never imply a live model served this
    "step": "transcribe",                   // transcribe | structure | qa
    "finishReason": "stop",                 // "length" for the truncation case
    "notes": "What this case exists to exercise."
  },
  "response": { /* the exact JSON body the upstream would return, not our parsed shape */ }
}
```

`response` holds the **wire** shape, because the thing under test is our parsing of it
(`src/features/analysis/schemas.ts`). Reshaping a fixture into our internal type would make the
test circular.

## Cases the set needs

| File | Exercises | Item |
|---|---|---|
| `transcribe-bill-clear.json` | happy path, one page | P-03 |
| `transcribe-with-illegible.json` | `uncertain` spans + `[illegible]` count → "never guess unreadable text" | C-04 |
| `transcribe-capture-issues.json` | `captureIssues: ["cut_off_bottom"]` → `needs_retake` | C-05 |
| `structure-bill.json` | facts/actions/warnings, `sourceQuote` values that exist in the transcript | P-02 |
| `structure-bad-quote.json` | a `sourceQuote` **not** in the transcript → `quoteFound: false`, flagged not dropped | P-02/P-04 |
| `structure-hallucinated-confidence.json` | a `confidence` key that must be **stripped** | P-01 |
| `structure-malformed.json` | missing required field → one repair retry, then transcript only | P-08 |
| `structure-truncated.json` | `finish_reason: "length"` → split by page, retry once | P-08 |
| `qa-answer.json` / `qa-not-in-document.json` | `notInDocument: true` path | P-06 |
| `refusal.json` | model refusal shown plainly + paste-text offered | ARCH §13 |

## Rules

- Synthetic content: invented sender, invented reference/account/NHS numbers. Never a real document.
- If a fact in a fixture is meant to fail grounding, say why in `_meta.notes` — otherwise a later
  reader "fixes" the fixture and the test silently stops testing anything.
- A recorded fixture replaces its authored twin only with a ROADMAP note; keeping both means
  `dev:fixtures` can be run with and without live-traffic assumptions.

**Current state: empty.** Nothing here exists yet, so `src/lib/fixtures/replay.ts` is a stub and
`dev:fixtures` serves the placeholder pages rather than a replayed flow.
