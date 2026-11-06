# Sightline

Understand a sensitive document — a benefits letter, a lab result, a bill — with private AI, and
see exactly what was and was not verified. Built for the **NEAR Hackathon, Privacy & Private AI
track**. Deadline: **2026-11-14 23:59 UTC**.

> **Build state: the demo flow runs in a browser; the live path has never carried a document.** Mode F
> — what the two commands below run — completes end to end with no key at all and is tested in
> Chromium doing that (72 of the suite's 141 tests). The Mode B relay is built and wired, and its
> door-refusals are gone, but **no real document has been sent through it**, because the first paid
> completion is a human decision (AGENTS.md §5). Verification answers `partial`, never `verified`,
> while the four hardware checks named in the receipt stay unrun (**B-12**). Read `ROADMAP.md` for
> live status; every claim below is dated and evidenced there.

## What it does (and what it is not)

Sightline **explains and answers questions about** a document. It is not a text-recognition tool:
the value is "what does this mean and what do I have to do", read aloud in the order the answer
matters, not a perfect transcription.

**Who it is for is a premise, not a finding.** The readers it is written for — blind and low-vision
people who today hand sensitive mail to a sighted stranger or to a chatbot with no privacy story
— have **never used this**. `ROADMAP.md` §9 set 2026-11-05 as the date by which one real session
would have settled whether the premise holds; that date passed with nobody reachable (**B-01/D-07**
is an open human decision, not a slipped task), so **U-04** fired and the Impact claim came down in
the commit that recorded it. Accordingly **no sentence in this repository claims validated impact,
improved comprehension, or a measured usability gain**, and none should be inferred from the demo.
What *is* measured is behaviour and evidence: the flow and its refusals in the committed test suite,
what each verification check does and does not prove on the receipt screen, and the audit
(`npm run release:synthetic`, **R-07**) that every sample document here is synthetic. In
`docs/ACCESSIBILITY_REPORT.md` the accessibility rows are automated checks in one headless browser:
**no screen reader has run this app** (**A-03**/**A-04**), and it has not been run on a phone.

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

Those two commands are themselves a test. `npm run release:clean-checkout` clones this repository
anonymously into a temporary folder, refuses a checkout that contains a `.env`, installs with
`npm ci` from the lockfile alone, and runs the committed browser suite against a dev server booted
**from that checkout** — no key, so every reply is replayed from `fixtures/`. Takes about three
minutes and spends nothing. It proves the repository is self-sufficient; it proves nothing about a
live model, a real phone or a screen reader (**R-03**, `docs/ARCHITECTURE.md` ADR-38).

**What that runs today:** **photographing** — add the three pictures this repo ships in
`public/sample-docs/photographs/` (one JPEG per page), see each one as the app will send it, press *Read
these photographs*, and the whole flow completes with no key: the page loop, the join,
the reading, the results view, two questions answered, the receipt. That is **S-11** and **C-13** — the
replies beside those three files came out of a TEE-hosted model on 2026-11-04 and are replayed, not
generated. **A different photograph is a different document:** any other file — or one of these with a
single byte changed — is refused at the first page by `no_fixture_for_page`, because a demo that answered
your own letter with somebody else's reading would be the opposite of what this app is for. Choosing
**two** of the three is also refused: the reading belongs to the document those three pages join into,
not to a subset of it. Proved in a browser by `tests/e2e/photo-fixtures.spec.ts` (7 tests).

**Pasting** is the other half of the same screen: paste text, or choose one of four synthetic demo
letters, and the flow completes the same way. The corpus is matched by *content*, so pasting your own
document gets a refusal explaining that demo answers belong to demo documents — never an authored summary
presented as a reading of your letter. A paste over **20,000 characters** is refused on the spot, in the
words of `paste_too_long`, before Sightline asks anything of the service: the sentence offers the smaller
piece — one page, or the section you need answered — rather than naming the number, and the field's own
error is where your screen reader lands (`docs/ARCHITECTURE.md` §13, **ADR-29**). The flow itself: the
pipeline answers, the results view shows Summary → Key facts → What you may need to do →
Warnings → Full text → Ask a question → Verification in that fixed order, questions about the letter are answered from its
text or refused by name, and the receipt lists the checks that ran and the ones that did not. **A long
fact list is bounded on the way to the reader, not in the reading:** the screen lists at most 12 facts and
at most three of any one kind, says how many it found before it lists them, and puts the rest behind one
"Show the other n facts" control with their quotes. That is item **P-16** (**ADR-36**), and the reason is
measured rather than stylistic — the same bill has come back with **33 facts for one page and 5 for five
pages**, and the photographed document in this repo's own demo comes back with **86**, 84 of them line
items. A list of 12 or fewer is left exactly as it is; a fact whose words could not be matched to the text
is never put behind the control. The
fourth letter exists to show the other ending: its reply is not the answer the app asked for, so the
run makes its one repair retry and then shows the text you gave with no summary on it, which is the
path most likely to meet a real user and the one `docs/ARCHITECTURE.md` §13 promises. Proved by
`tests/e2e/flow.spec.ts` (72 of the suite's 141 Playwright tests) against exactly these two commands.
All four offered letters are **authored synthetic**; the fifth case — photographed pages, never offered
to the paste screen — is **recorded** traffic, and the two provenances are labelled separately everywhere
they appear (`fixtures/README.md`, item **S-11**).

**What it does not do:** read *your* photo or *your* letter, yet. Both live halves now exist and are
measured — the relay's handler (**F-05**, **ADR-34**: four allowlisted paths, a live per-model TEE check
before any document byte leaves, the received bytes forwarded verbatim) and the gate that binds an
attestation report to the session (**T-01**, **T-03**, **ADR-32**) — and since 2026-11-05 the app is wired
to them: `src/app/_flow/collaborators.ts` gives a Mode B session the relay transport and one trust session
per Sightline session, whose gate attests **each model the run asks** before that step's request is built
(**ADR-35**), because a photographed run crosses two enclaves with two keys (**ADR-24**, **SPIKE §11**).
So **Mode B runs**. What has not happened is the paid half of it: no document has been sent, because a real
completion is a human decision (AGENTS.md §5), and `partial` is the strongest word a live receipt can print
while the four quote checks that need Intel's and NVIDIA's services stay open (**B-12**) — rule 5 forbids
more. Mode A — where the browser would ask with your own key — still refuses at the door, for one reason
that has not moved: there is no field to put a key in (**T-13**, held by **B-10**). Nothing on screen can
imply a verified run before verification exists, and `partial` is not the word "verified" (**AGENTS.md §4**
rule 5). Questions are answered in demo mode, and the same ask path is what a Mode B run uses — gated and
signature-checked on its own model row.

## Live demo

The demo URL and the mode it runs in are recorded here when R-01 deploys it. Until then there is no
hosted demo, and blocker B-06 (a deploy target) is open.

## What is verified

The privacy sentence the app shows is **computed**, not written. It comes from
`src/features/trust/claims.ts`, selected from the `TrustRecord` of the request that was actually
made. It is deliberately not quoted in this README: a copy here is how a claim drifts away from the
code that earns it (AGENTS.md §4 rule 1). Read the current ladder in `docs/PRD.md` §8 and the
selection logic in `claims.ts`.

**Which attestation checks ran and which did not** (the list AGENTS.md §9 requires here; the names
below are pinned by `tests/verification/attestation-fixtures.test.ts` › "the README names exactly the
checks the gate emits", which compares this list with a real gate call in both directions):

| Check | Ran? | Passed? | Why |
|---|---|---|---|
| Nonce binding | Not in an app run | — | T-01's `bindReport` passed **4/4 against the first real report** on 2026-11-03 and the service echoed the nonce this session minted (`docs/SPIKE_RESULTS.md` §3) — measured by `npm run spike`, not by the app, because live modes still refuse to send (F-04, F-05). **It ran again on 2026-11-04 with a fresh nonce per model** while `npm run fixtures:record` was fetching the demo's photographed replies (**S-11**): two reports, two nonces, and nothing sent until each `bindReport` had passed. **And on 2026-11-05 two live reports are on disk** (`fixtures/attestation/`, one per attested model, **T-08**), so this check is now asserted by `tests/verification/attestation-fixtures.test.ts` against recorded bytes — including the negative: the same report refused by a freshly minted nonce, and a *replayed* genuine report failing the gate's nonce check. **Since ADR-32 the binding is checked twice:** `quote_binds_our_nonce` reads the same 32 bytes *inside the quote*, where writing them means the enclave re-ran its attestation rather than the service editing a JSON field — measured on both live reports, and proven as a refusal by "a service that re-echoes the JSON field but cannot rewrite the quote is caught by the quote" |
| GPU/NRAS verdict | Not in an app run | — | **Measured 2026-11-05 and it needs no dependency:** one unauthenticated POST of the report's `nvidia_payload` to NVIDIA's attestation service answered **HTTP 200 in 1.6 s with the overall verdict `true`** (`npm run spike -- --stage=gpu`, `docs/SPIKE_RESULTS.md` §3). So this check is blocked by a *decision* — a server that is allowed to speak to a second host (**B-12**, AGENTS.md §4 rule 9) — and not by `dcap-qvl-node`. Until then `gpu_evidence_verdict` is listed on the receipt as a check that did not run. **A gap the recording found earlier stays:** every `device_id` in both reports holds `SHA-256("")`, so a check reading that field would pass on a report naming no device |
| Intel TDX quote | Yes — in the production gate, over live bytes; **and since 2026-11-05 inside a browser page**, though not reached from the app's own screens | 8/8 on both live reports, on both recordings, and in Chromium | **This row reversed on 2026-11-05 (ADR-32).** The quote's bytes open with arithmetic and the `@noble/hashes` already in the repo, and `lib/near-ai/quote.ts` runs the eight **inside `createTrustSession`** — `quote_is_tdx`, `td_not_debug`, `td_attributes_allowed`, `quote_binds_our_nonce`, `quote_binds_attested_key`, `quote_binds_compose_hash`, `quote_matches_report_measurements`, `event_log_replays_rtmr0_to_2` — `npm run spike` showing all eight passing on two live reports (5,006-byte quote, 35 and 30 boot events). **The same eight then ran in a page**: `npm run test:e2e:live` bundles the production modules into Chromium and a live report fetched over the network passed all eight there, with `bindReport` 4/4 and the signature verified — fourteen checks in the browser, none of them a mock (**S-06**, SPIKE §6). Two things it does **not** mean: that Intel's signature over those bytes was checked — `quote_signed_by_hardware` and `platform_still_trusted` are the `dcap-qvl-node` decision (**B-12**) and ship as checks that did not run — and that the documented **RTMR3** replay works; it does not reproduce on four quotes and eighteen framings, so the eighth check is named for what it does and its receipt line says register 3 was left out. **Freshness/expiry stays unrunnable and is named as `report_expiry`:** a live report carries no `issuedAt`, no `exp`, nothing a clock could be compared to |
| Response signature | Not in an app run | — | T-02 verified **one live non-streamed completion** (`provider_tee`, against the key the gate bound, §5), and **every one of the six replies the fixture recording stored** — three pages, one reading, two answers, all `provider_tee` ed25519 over the exact bytes, verified by this repo's own `checkSignature` before a file was written (**S-11**, SPIKE §4). **And on 2026-11-05 from inside a browser page**: `npm run test:e2e:live` asked the live service for a completion *in Chromium*, then verified it there against the key that session's own report named — `response_signature` and `signed_by_model_enclave` both ran and both passed (**SPIKE §6**). A *streamed* reply is signed by the gateway enclave instead, which is why the app does not stream (ADR-22) |
| End-to-end encryption to the enclave | Not yet | — | T-10; documented by NEAR, never demonstrated from a browser (ADR-16). The report carries the key such a call would encrypt to (§3), so what is left is `@noble/ciphers` (**B-07**) and a device |
| Quote consistency (the only check fixture mode runs) | Yes, in fixture mode | Per fact: a quote that is not in the transcript is shown **flagged**, never as sourced | P-02; it proves consistency with our transcript, not correctness against the page. **On the recorded case it is the model's own quote against the model's own transcript** — 86 facts, all consistent, which says nothing about whether any of them matches the page (**S-03**) |

**The names, as the gate's `CheckResult[]` emits them** — one call of `createTrustSession` over a
recorded live report, with the app's own `/api/verify` answering it (**T-03**, 2026-11-05):

- **Ran, and passed:** `attestation_report`, `nonce_fresh`, `signing_address_shape`, `signing_public_key_shape`, `quote_is_tdx`, `td_not_debug`, `td_attributes_allowed`, `quote_binds_our_nonce`, `quote_binds_attested_key`, `quote_binds_compose_hash`, `quote_matches_report_measurements`, `event_log_replays_rtmr0_to_2`, `server_verification`
- **Ran, and did not pass:** —
- **Did not run:** `quote_signed_by_hardware`, `platform_still_trusted`, `gpu_evidence_verdict`, `report_expiry`

`server_verification` is the newest of the thirteen, and it is worth saying what it is worth: since
**T-03** our own route re-reads the same bytes on our own machine and reports whether it agrees. It is
told this session's nonce rather than minting one, so it adds a second opinion and no new evidence about
the hardware — which is the sentence its receipt line carries. What it does when the bytes disagree, and
what it never does (say `verified`), is pinned by `tests/verification/verify_route.test.ts`.

A run that reaches **this gate** — `createTrustSession`, which ANDs its local checks with `/api/verify` —
has now run against the live service, and the sentence needs its limits kept on it: it ran from a script
pointed at the app's own running relay, not from a person's screen and not with a document (**SPIKE §11**,
2026-11-05). Mode B is wired to it today — `_flow/collaborators.ts` gives a live session the relay transport
and one trust session per Sightline session, and the gate attests **each model the run asks** (ADR-35) — so
what stops a person's document from crossing it is no longer a missing handler or a missing check but a paid
completion nobody has authorised (AGENTS.md §5) and `partial` being the ceiling while **B-12** is open. In
Mode A a person still has no place to put a key (**T-13**, held as a consent decision by **B-10**).
In fixture mode no report is
fetched at all, so what a person sees on the receipt there is the demo sentence, not this list. The
signature step adds two more names when a completion is answered — `response_signature` and
`signed_by_model_enclave` (**T-02**) — and neither is an attestation check.

**None of the NEAR AI verification checks above has been reached from the app's own screens.** What is new
on 2026-11-05 is narrower and worth stating exactly: those checks have now run **inside a browser**.
`npm run test:e2e:live` bundles the production modules (`bindReport`, `checkQuote`,
`createSignatureVerifier`, the real `NearClient`) into a Chromium page and has that page fetch a live
attestation report, post a completion and verify its signature over the exact bytes it sent and received —
**fourteen checks, all passing, no mock anywhere in the run** (**S-06**, SPIKE §6). That closes the CORS
question and it closes "can a browser even read this answer", which for two days this README could only
infer from a Node script's header dump. It is still not the sentence a user needs, for three separate
reasons, each with its own ID: the app has **no key field** for a person to start Mode A with (**T-13**,
held as a consent decision by **B-10**) — and Mode B, which needs no key from the person, is wired to the
gate but has never carried a document, because that half costs money and is a human decision (**SPIKE §11**,
AGENTS.md §5), the composed gate reaches only **`partial`** while the four checks
that need Intel's certificate service and NVIDIA's service stay unanswered (**B-12**, since **T-03** for a
new reason rather than because the route said nothing), and nothing in the round trip is **end-to-end
encrypted** — a bearer key in a header is rule 2's weaker claim, not rule 2's strong one (**B-07**, T-10).
Until those change, Sightline has no verification claim to make about a person's own document — which is
why the receipt in fixture mode states the demo-data sentence from `claims.ts` instead of a list of checks
that passed, and why every recorded fixture carries `"e2ee": false`.

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
photographs were given, **C-02** is the screen and the run that call them, and **C-13** is the first
photographed document that runs **to the end** anywhere in this app — three pages, one reading, two
answers, in Demo mode, with no key, proved in a browser. **That sentence is about the flow, not the
facts.** Nothing has been checked against what is on the page, by anyone, so there is still **no photo
accuracy number**: the recorded reading is the model's own answer replayed, and the only thing measured
about it is internal consistency. What is left of the path to prove is **C-04/C-06** (a *bad* photograph
and what it costs the person), **C-07**/`S-08` (a device, host limits), **C-09/C-10** and **S-03** (the
golden set, and the misread count that decides **T-11**). **Mode A still refuses at the door** — the
settings page has no key field by design (**ADR-21**, item **T-13**) — and Mode B runs but has never been
given a document, because the first paid completion is a human decision (AGENTS.md §5). So no real
user's photograph has been read anywhere. The transcription numbers that
do exist are measured against the *spike's* synthetic page rasters, not against this app's screen
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
a cost run, and no per-page figure is published here that has not been sent to the service. **The run that
recorded the demo's photographed replies is deliberately not priced anywhere in this repo**: the app's
completion schema does not carry `usage`, so the recorder stored the timings and the signature verdicts and
had nothing to store for cost (`docs/SPIKE_RESULTS.md` §4's S-11 block, and item 8 of "What is still
unknown"). Total spend against the demo key is not published as a number: the only arithmetic this repo can do is add
up §4's measured exchanges, which comes to a little over a cent, and the recording run above sits on top of
that with no figure of its own. What would make the real total knowable — the organisation balance, and a
`spendLimit` on the key — is still open (**B-11**, **S-10**).

## Accessibility

Built to the conventions in AGENTS.md §8: native HTML semantics, one polite live region for every
status change, focus moved after navigation and on errors, fixed results order, no gesture-only
actions, ≥ 44 px targets, 4.5:1 contrast, `prefers-reduced-motion` and `prefers-contrast` honoured.
The target minimum, the contrast ratio and the reduced-motion rest are not a review of the stylesheet:
`tests/e2e/design.spec.ts` (item **A-17**) reads the colours and sizes a browser actually computed for
the page, in all three palettes, at 1440/768/390, and fails if one pair falls under 4.5:1, if a nav
target shrinks under 44 px, or if reduced motion leaves a button still moving.

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
- Licence: MIT — [`LICENSE`](LICENSE), attributions in `docs/ARCHITECTURE.md` §2 and
  `src/lib/near-ai/verifier/README.md`
- Demo post on X: added by X-03/X-06 when it exists (a human publishes it)

## For contributors

Read `AGENTS.md` first. The non-negotiable one: **every contribution updates `ROADMAP.md` in the
same commit** — status, evidence, a §10 log entry, the dashboard and current focus. `npm run
roadmap:check` verifies it (item F-11), `npm run hooks:install` puts that check in front of every
local commit, and CI (F-12) runs it on the commits each push adds. The gate itself is tested in
`tests/unit/roadmap-check.test.ts` against ledgers that break one rule each, because a gate only
ever run against the one file it guards has never been *observed* to reject anything.

The same rule is why the release checks are scripts with mutation proofs rather than checklists.
`npm run release:clean-checkout` (**R-03**) proves README's two commands from an anonymous clone of
the pushed `main`. `npm run release:secrets` (**R-06**) reads **every object in the object
database** — reachable or not, text or JPEG — and reports a match as rule, path, commit and length
only, never as the matched text. `npm run release:synthetic` (**R-07**) walks the sample-document
corpus itself: every file must classify, every letter must say in its own text that it is synthetic,
every recorded reply must carry a signature-verified provenance block, every shipped photograph must
be metadata-free and hash to the digest Demo mode keys on, and every telephone number in it must sit
inside a range Ofcom reserves for drama. `npm run release:docs` (**R-08**) reads the documents against
the repository instead: no page may name a file that is gone, every script and every test must be
listed where the structure document says it lists them, the commands table must equal `package.json`,
the decision records must be a gap-free sequence with the newest one on the page a new reader is told
to read first, and every item citation must reach a `ROADMAP.md` checkbox line. All four have been run
against deliberately broken copies of their own subject and refused — the first two against a throwaway
repository holding a planted synthetic key that was committed then deleted, plus one staged but never
committed; the third against nine mutations and the control run beside them (a real-format number and
email planted in the recorded transcript, a provenance block
without its signature, a photograph carrying EXIF, one byte changed, a fixture the audit could not
name); the fourth against five breaks planted in the prose itself — a file renamed in one table row, a
test row deleted, a command the manifest does not define, a decision record renumbered past its own
sequence, a citation to an item that was never created. The secrets scan also refused **this
repository's own test fixture** — its first version
spelled nine credential shapes out in full, and both GitHub's push protection and the scan said so
before anything was published — which is why those planted values are assembled at runtime and a test
asserts the fixture file's own bytes are clean. `.env` is ignored and has never been added; CI takes
no credential. What none of them can see is the key that once crossed into a conversation log,
which is a rotation task (**B-11**) rather than a git finding, and what none of them can see in **any**
document is what a person types into a live run — that is AGENTS.md §4 rule 7, not a script. Nor can
`release:docs` judge whether a sentence that names a real file still describes it: that is a reading
task, and the pass behind **R-08** says so in its own evidence rather than implying the shape check
settled it.
