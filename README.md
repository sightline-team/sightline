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

**What that runs today:** paste text — or choose one of four synthetic demo letters — and the whole
flow completes in the browser. **Photographing** is on the same screen (**C-02**): add up to five
pictures, see each one as the app will send it, remove or retake the last, and press *Read these
photographs* — which runs the page loop and, in this mode, stops at demo mode's own door, because
fixture mode has no recorded reply for a photograph (**S-11**). Nothing here claims a photographed
document has been read end to end; the screen is proved as far as the door, and the sentence you hear is
the catalogue's. A paste over **20,000 characters** is refused on the spot, in the words
of `paste_too_long`, before Sightline asks anything of the service: the sentence offers the smaller
piece — one page, or the section you need answered — rather than naming the number, and the field's own
error is where your screen reader lands (`docs/ARCHITECTURE.md` §13, **ADR-29**). The flow itself: the
pipeline answers, the results view shows Summary → Key facts →
Actions → Warnings → Full text → Ask → Verification, questions about the letter are answered from its
text or refused by name, and the receipt lists the checks that ran and the ones that did not. The
fourth letter exists to show the other ending: its reply is not the answer the app asked for, so the
run makes its one repair retry and then shows the text you gave with no summary on it, which is the
path most likely to meet a real user and the one `docs/ARCHITECTURE.md` §13 promises. Proved by
`tests/e2e/flow.spec.ts` (72 of the suite's 94 Playwright tests) against exactly these two commands. The corpus is
**authored synthetic**, never recorded — no fixture has ever been on the wire (`fixtures/README.md`,
item S-11) — and it is matched by content, so pasting your own document gets a refusal explaining that
demo answers belong to demo documents, never an authored summary presented as a reading of your letter.

**What it does not do:** read a photo (C-01…C-06), or run in relay/direct mode. The live modes still
refuse at the door, and since 2026-11-03 the reason is precise rather than general: the model
allowlist has no transport yet (F-04) and the relay forwards nothing (F-05), and even with both, the
attestation gate would report `failed` because `/api/verify` is T-03's unimplemented route — so no
run has ever been allowed to send a document. Nothing on screen can imply a verified run before
verification exists. Questions are answered in fixture mode only; the same ask path is what a live
mode will use once it can run.

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
| Nonce binding | Not in an app run | — | T-01's `bindReport` passed **4/4 against the first real report** on 2026-11-03 and the service echoed the nonce this session minted (`docs/SPIKE_RESULTS.md` §3) — measured by `npm run spike`, not by the app, because live modes still refuse to send (F-04, F-05) |
| GPU/NRAS verdict | Not yet | — | T-03's heavy half. The GPU payload is measured in hand (49,111 bytes, §3); what is missing is the `dcap-qvl-node` decision (**B-12**), not access |
| Intel TDX quote | Not yet | — | T-03, same blocker (**B-12**); the quote itself is 5,006 bytes and in hand (§3). Port plan in `src/lib/near-ai/verifier/` |
| Response signature | Not in an app run | — | T-02 verified **one live non-streamed completion** (`provider_tee`, against the key the gate bound, §5). A *streamed* reply is signed by the gateway enclave instead, which is why the app does not stream (ADR-22) |
| End-to-end encryption to the enclave | Not yet | — | T-10; documented by NEAR, never demonstrated from a browser (ADR-16). The report carries the key such a call would encrypt to (§3), so what is left is `@noble/ciphers` (**B-07**) and a device |
| Quote consistency (the only check fixture mode runs) | Yes, in fixture mode | Per fact: a quote that is not in the transcript is shown **flagged**, never as sourced | P-02; it proves consistency with our transcript, not correctness against the page |

None of the NEAR AI verification checks above has been run. Until it is, Sightline has no
verification claim to make — which is why the receipt in fixture mode states the demo-data sentence
from `claims.ts` instead of a list of checks that passed.

## Forgetting a document

**Forget this document** sits in the navigation, so it is reachable from every screen — including
the one a run is happening on. One press: empties the session (the words you gave, the reading,
every answer, the receipt), clears the text you had typed but not yet sent, stops any request still
going — and what that request answers afterwards is thrown away, so a reading cannot reappear on a
screen you just cleared (**P-12**, proved in a browser by pressing Forget while a completion was
outstanding) — revokes any image preview this tab created (since **C-02** there is one to revoke: the page
previews on the photograph screen, and a browser test loads a revoked URL after Forget and after removing a
single page), removes this app's own `sessionStorage`
keys, and stops Sightline's own read-aloud. It stays where you are; the announcement says what was
cleared and the screen you were on changes underneath you.

What the button **cannot** do, stated here rather than implied by a tidy word on a control:

- **It cannot recall what already left the tab.** A document that was sent is gone from this app's
  reach; what a service keeps, and for how long, is its own behaviour and is not changed by a
  Forget press here.
- **It cannot reach the device's own copies.** A screen reader's speech history or speech viewer,
  the clipboard, what the operating system's keyboard suggested or predicted, browser history and
  form autofill, screenshots, and any photo the person took with the camera app are all outside
  this app.
- **It cannot reach another tab, and it cannot promise what a browser keeps for itself.** A page
  restored from a browser's back/forward cache is that browser's decision, not ours; a full page
  load loses the document anyway, because this build has no database and no document store
  (ADR-8 — the session lives in memory, which is why the app navigates with client-side links).

In fixture mode there is nothing to recall in the first place, because no document is sent anywhere
(`ROADMAP.md` F-09) — but the sentence above is what the button means in *every* mode, and it is
written as the honest version rather than the convenient one.

## Accuracy

No accuracy number exists. The golden set is item C-09 with its cases designed in
`public/sample-docs/README.md`. The photo path is now a screen as well as modules — **C-01** prepares a
page, **C-03** transcribes one against the live service, **C-11** joins five into one transcript,
**C-05** warns when the page numbers printed on those pages disagree with each other or with how many
photographs were given, and **C-02** is the screen and the run that call them — but **no photographed
document has been read end to end inside this app, so there is no photo accuracy number either.** What a
browser does reach is the door each mode answers at: demo mode has no recorded reply for a photograph
(**S-11**) and live modes refuse before a request exists (**B-12**). The transcription numbers that do
exist are measured against the *spike's* synthetic page rasters, not against this app's screen
(`docs/SPIKE_RESULTS.md` §4). Two statements will be required there and are stated now so they cannot be
quietly dropped later:

- Results include **bad photos** (glare, cut edges, small text), with the small-sample caveat.
- `quoteFound` means the quoted words appear in **our transcript**. It does **not** mean they are
  correct against the page — a model that misreads a number and then quotes its own misreading
  passes it perfectly (`src/features/analysis/grounding.ts`). The transcript it searches has
  Sightline's own `[page n could not be read]` hole marker masked out first
  (`src/lib/transcript/holes.ts`), so a quote cannot be "found" in a sentence we wrote (**P-17**).

## Cost per document

Measured per exchange (`docs/SPIKE_RESULTS.md` §4, 2026-11-04): five pages sent as five requests cost
**$0.004064 and 141.6 s** on the first run and **$0.004664 and 116.7 s** on the second (ten pages billed,
so **$0.00087 and 25.8 s a page** on average, spread $0.00061–$0.00127 each, all ten replies accepted); one structure
step over the transcript they joined **$0.0044 and 118.6 s** (**Qwen**, answered first time), and a follow-up
question **$0.00026–$0.00028 and 1.9–3.4 s** each on the model the plan (`STEP_PLANS`, **ADR-24** as amended
by **ADR-26**) puts on that step. So **a five-page photograph is ≈$0.0085–$0.0091 and ≈235–260 s of model time**
— a range across the two measured runs, not one number, and the structure-step half of the second figure is
carried from the first (**$0.0044 / 118.6 s**) rather than measured twice — or
**$0.0097 and ≈302 s** if the page model answered the structure step, because its fence costs a second billed
ask — ten questions on it add **≈$0.0027**, and a pasted document is the structure step alone. Fetching
an attestation report or a signature is free and non-billable. What dominates all of it is **reasoning
tokens**, not the answer: the measured page spent 1,008 of its 1,492 completion tokens thinking, and glm's
five-page repair thought 8,193 times before writing 679 tokens of answer. These are synthetic-document
figures at one length each; the spread across real documents is **S-03**, which is an accuracy run and not
a cost run, and no per-page figure is published here that has not been sent to the service.

## Accessibility

Built to the conventions in AGENTS.md §8: native HTML semantics, one polite live region for every
status change, focus moved after navigation and on errors, fixed results order, no gesture-only
actions, ≥ 44 px targets, 4.5:1 contrast, `prefers-reduced-motion` and `prefers-contrast` honoured.

One **read-aloud button** sits at the top of the results screen (item P-09). It is opt-in and off by
default: nothing is spoken until it is pressed, and it reads Sightline's own summary plus Sightline's
own cautions — the two parts of the screen whose wording we control. It is not a screen reader and is
not meant to replace one; the key facts, the actions and the full text stay on the page for the
reader or magnifier a person already uses. Pressing it again, leaving the screen, or pressing Forget
stops it. The speed is a setting (0.5–2), read when the button is pressed, and the control to change
it is on the Settings screen (item A-15): four named speeds — Slow, Normal, Fast, Very fast — which
apply to the next press without a reload.

Settings holds two things, because those are the two that are about the app rather than about a
document: the reading speed, and the high-contrast theme (black, white, yellow — the palette
`prefers-contrast` cannot reach but a person can choose). Both are kept in one `localStorage` blob
under `sightline.settings`, and both survive forgetting a document. The run mode is *not* one of
them: it is set by the deployment and shown on that page as a readout, because the guarantee shown
beside a result is chosen by the mode, and a second copy of that decision in a browser would be a
claim nobody recomputes.

One limit belongs with this button rather than buried: the speech engine is the device's own and is
outside Sightline's control. Some browsers offer voices that are synthesised over the network rather
than on the handset, so a person using one of those is having their document read out by something
other than Sightline. Which engines on which devices do that is **[Unverified] here** — no test device
is confirmed (B-01) — and it is the reason no sentence in this app promises that reading aloud stays
on the device.

**Not yet tested with a screen reader by a blind or low-vision user.** No device is confirmed
(B-01) and no participant is reached (U-01). The read-aloud button has never been *listened to*
either: the browser tests record the calls the app makes to the device's own speech engine, which is
not the same evidence as a person hearing it clearly. See `docs/ACCESSIBILITY_REPORT.md` for the
tested / not-tested table and `tests/a11y/manual-checklist.md` for the script that has not been run.

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
