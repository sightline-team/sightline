# Sightline

Understand a sensitive document — a benefits letter, a lab result, a bill — with private AI, and
see exactly what was and was not verified. Built for the **NEAR Hackathon, Privacy & Private AI
track**. Deadline: **2026-11-14 23:59 UTC**.

> **Build state: structural scaffold, no working flow yet.** The repository now contains the whole
> shape of the product — data models, session reducer, error catalogue, module boundaries, route
> stubs, config and CSP — with every unfinished function refusing loudly and naming the ROADMAP
> item that owns it. Read `ROADMAP.md` for live status; do not read this README as a description of
> working behaviour.

## What it does (and what it is not)

Sightline **explains and answers questions about** a document. It is not a text-recognition tool:
the value is "what does this mean and what do I have to do", read aloud in the order the answer
matters, not a perfect transcription. For blind and low-vision users, who today hand sensitive
mail to a sighted stranger or a chatbot with no privacy story.

Sensitive documents are the point. A photo or pasted letter goes to an AI service; Sightline's
claim is about *which* service and *how* we know — see "What is verified" below.

## Run it with no credentials

```bash
npm ci
npm run dev:fixtures
```

No `.env`, no API key, no account. Fixture mode replays a local corpus instead of calling the
model, and it always shows the demo-data banner — that sentence is defined in
`src/features/trust/claims.ts` and is deliberately not repeated here, so a README edit cannot make
it disagree with the app (requirement R9, `docs/PRD.md` §7).

**What that runs today:** paste text — or choose one of three synthetic demo letters — and the whole
flow completes in the browser: the pipeline answers, the results view shows Summary → Key facts →
Actions → Warnings → Full text → Ask → Verification, and the receipt lists the checks that ran and
the ones that did not. Proved by `tests/e2e/flow.spec.ts` (26 Playwright tests) against exactly these
two commands. The corpus is **authored synthetic**, never recorded — no fixture has ever been on the
wire (`fixtures/README.md`, item S-11) — and it is matched by content, so pasting your own document
gets a refusal explaining that demo answers belong to demo documents, never an authored summary
presented as a reading of your letter.

**What it does not do:** read a photo (C-01…C-06), answer a question about the document (P-06), or
run in relay/direct mode — T-01/T-02 are unbuilt, so those modes refuse rather than show an answer
with no verification behind it.

## Live demo

The demo URL and the mode it runs in are recorded here when R-01 deploys it. Until then there is no
hosted demo, and blocker B-06 (a deploy target) is open.

## What is verified

The privacy sentence the app shows is **computed**, not written. It comes from
`src/features/trust/claims.ts`, selected from the `TrustRecord` of the request that was actually
made. It is deliberately not quoted in this README: a copy here is how a claim drifts away from the
code that earns it (AGENTS.md §4 rule 1). Read the current ladder in `docs/PRD.md` §8 and the
selection logic in `claims.ts`.

**Which attestation checks ran and which did not** (the list AGENTS.md §9 requires here, to be
filled by T-14 when `CheckResult` output is real):

| Check | Ran? | Passed? | Why |
|---|---|---|---|
| Nonce binding | Not yet | — | T-01, needs an API key (B-05) |
| GPU/NRAS verdict | Not yet | — | T-01 |
| Intel TDX quote | Not yet | — | T-01, gated on B-05; port plan in `src/lib/near-ai/verifier/` |
| Response signature | Not yet | — | T-02 (procedure decided in ADR-19) |
| End-to-end encryption to the enclave | Not yet | — | T-10; documented by NEAR, not yet demonstrated from a browser (ADR-16) |
| Quote consistency (the only check fixture mode runs) | Yes, in fixture mode | Per fact: a quote that is not in the transcript is shown **flagged**, never as sourced | P-02; it proves consistency with our transcript, not correctness against the page |

None of the NEAR AI verification checks above has been run. Until it is, Sightline has no
verification claim to make — which is why the receipt in fixture mode states the demo-data sentence
from `claims.ts` instead of a list of checks that passed.

## Accuracy

No accuracy number exists. The golden set is item C-09 with its cases designed in
`public/sample-docs/README.md`, and the image path (C-01…C-06) is not built. Two statements will be
required there and are stated now so they cannot be quietly dropped later:

- Results include **bad photos** (glare, cut edges, small text), with the small-sample caveat.
- `quoteFound` means the quoted words appear in **our transcript**. It does **not** mean they are
  correct against the page — a model that misreads a number and then quotes its own misreading
  passes it perfectly (`src/features/analysis/grounding.ts`).

## Cost per document

Unknown: it needs a measured run (S-09, blocked on B-05). No estimate is published here.

## Accessibility

Built to the conventions in AGENTS.md §8: native HTML semantics, one polite live region for every
status change, focus moved after navigation and on errors, fixed results order, no gesture-only
actions, ≥ 44 px targets, 4.5:1 contrast, `prefers-reduced-motion` and `prefers-contrast` honoured.

**Not yet tested with a screen reader by a blind or low-vision user.** No device is confirmed
(B-01) and no participant is reached (U-01). See `docs/ACCESSIBILITY_REPORT.md` for the tested /
not-tested table and `tests/a11y/manual-checklist.md` for the script that has not been run.

## User research

No session has taken place yet. `docs/USER_RESEARCH.md` holds the protocol, the consent rules and
the empty findings table. If the deadline in U-04 passes without one, the design is stated as
un-validated rather than implied otherwise.

## Limitations

Not medical advice. Not a certified reading aid. English only. Cannot clear OS-level logs or a
camera roll's own history. No scam detection. Will not guess unreadable text — it marks it
unreadable. A relay deployment means an operator we trust for transport sees the document in
transit unless end-to-end encryption is proven (see the table above).

## Architecture in one paragraph

Next.js App Router, TypeScript strict, no database, no accounts, no server-side document storage.
Three modes: **B** relay (our server forwards to NEAR AI Cloud), **A** direct with the user's own
key, **F** fixtures. Before any document bytes leave the device, an attestation report is fetched
with a fresh nonce and verified; each response's signature is verified before it is shown. Full
detail in `docs/ARCHITECTURE.md` (and its one-page `ARCHITECTURE_ESSENTIALS.md`).

## Links

- Repo: `https://github.com/sightline-team/sightline` (public from the start; the rules file
  `HACKATHON.md` is committed at root)
- Live status and remaining work: **[`ROADMAP.md`](ROADMAP.md)**
- Licence: MIT — [`LICENSE`](LICENSE), attributions in `docs/ARCHITECTURE.md` §17 and
  `src/lib/near-ai/verifier/README.md`
- Demo post on X: added by X-03/X-06 when it exists (a human publishes it)

## For contributors

Read `AGENTS.md` first. The non-negotiable one: **every contribution updates `ROADMAP.md` in the
same commit** — status, evidence, a §10 log entry, the dashboard and current focus. `npm run
roadmap:check` verifies it (item F-11), `npm run hooks:install` puts that check in front of every
local commit, and CI (F-12) runs it on the commits each push adds. The gate itself is tested in
`tests/unit/roadmap-check.test.ts` against ledgers that break one rule each, because a gate only
ever run against the one file it guards has never been *observed* to reject anything.
