# `fixtures/attestation/`

Attestation reports for the verification tests (**T-08**) and for `/api/verify` (**T-03**). Each
file states which checks should pass and which should fail, so a test asserts the *verdict* rather
than a screenshot.

## What is here now

| File | What it is | Provenance |
|---|---|---|
| `good-z-ai-glm-5.3-flash.json` | The model report for the page model — 318,885 live bytes, 90,457 stored after redaction | **recorded** (redacted), 2026-11-05 00:27:08 UTC |
| `good-Qwen-Qwen3.8-27B.json` | The model report for the reading step's model — 269,710 live bytes, 87,977 stored | **recorded** (redacted), same run |

Written by `npm run fixtures:record -- --attestation --confirm` (one
`GET /v1/attestation/report?model=…&nonce=…&signing_algo=ed25519` per model this app asks). Report
retrieval is documented as **free and non-billable** (`docs/SPIKE_RESULTS.md` §5) and it completes
nothing, so this half of **S-11** costs no credits — but it does send the key, which is why the flag
still has to be confirmed by whoever is holding it.

**Two reports, because the app attests per model.** ADR-24 put `transcribe`/`qa` on one model and
`analyse` on another, and the measured consequence is in these files: the two `signing_public_key`
values differ, as do `rtmr3`, the model's `compose_hash`, and the event-log length (32 vs 30 entries).
One key cannot stand in for the other, and a fixture set with only one model's report would let a test
pass that way. The gateway half is identical in both, as it should be — same gateway.

### The redaction, because "recorded" has to keep meaning something

Each file holds the live report **minus five fields**, listed by path, size and SHA-256 in
`_meta.redacted`, with the reason next to each. `reportSha256` is the digest of the *full* response, so
the subset stays attributable to that fetch. What is dropped, and why both reasons matter:

| Path | Bytes | Why it is not in a public repo |
|---|---|---|
| `model_attestations[0].info.tcb_info.app_compose` | 18,212 | NEAR's own compose file: 448 lines of service names, internal instance labels and the *names* of their monitoring/registry tokens |
| `model_attestations[0].nvidia_payload` | 98,222 | eight per-device NVIDIA reports (certificate chain + evidence), each bound to the nonce of this fetch — per-device identity material, and stale by design |
| `model_attestations[0].compose_manager_attestation` | 87,029 / 39,904 | their container launch log (226 actions on one instance, 82 on the other) |
| `gateway_attestation.info.tcb_info.app_compose` | 37,799 | the gateway's compose file, same reason |
| `gateway_attestation.vpc` | 121 | an internal DNS name of their production gateway |

**Live bytes are not a stable quantity** — two fetches of the *same* model minutes apart returned
269,710 and 162,856 bytes, because which CVM answers changes the launch log inside it. `intel_quote`
is 10,012 hex characters (5,006 bytes) in both, so the quote is stable and the report is not; anyone
budgeting a timeout off "the report is N bytes" (S-08) should read that as a range.

None of it is document-derived, and none of it decides a check offline: a quote and a GPU report are
bound to the nonce and to a validity window, so T-03's heavy checks must fetch fresh ones from the live
service (that is **B-12**), not replay a file. What the redaction does *not* lose is measured, and it is
the reason this is a redaction rather than a truncation: **`SHA-256(app_compose)` equals the
`info.compose_hash` the report keeps**, on all four compose bodies in both files — so the bytes we
dropped are still checkable against the field that names them, and a test asserts exactly that
(`tests/verification/attestation-fixtures.test.ts`). Everything `bindReport` reads, the event logs, the
TDX quotes, the tcb measurement registers, the app certificates and the OHTTP key material are kept.

## The honesty caveat, which is now only half a caveat

A "recorded" attestation fixture used to be a contradiction: no key (B-05), no report. The `good`
case is no longer one — these bytes came off the service, `attestationReportSchema` accepted them,
and the nonce in `_meta.sentNonce` is one this repository minted and the service echoed back.
What remains true is the other half: **the moment any of these bytes is edited, it is no longer a
record**, and the edits that make a report interesting are exactly the edits that make it un-recorded.

| Case | Honest provenance | Where it lives |
|---|---|---|
| `good` | **recorded** — a live report, bound to a nonce we minted | the two files above |
| `tampered_nonce`, `tampered_address` | **derived**, one named byte-change at test time | `tests/verification/attestation-fixtures.test.ts` |
| `foreign_key` | **derived** — and it is the case that states the ceiling: a report naming *our* key passes all four browser checks, so shape and binding are not authenticity | the same file |
| `device_id` | **recorded fact, not a derivation** — every `device_id` in both reports holds `SHA-256("")` | `_meta.deviceIdIsPlaceholder`, pinned by a test |
| `expired` | **not a byte-change at all**: the good report, unchanged, is what an expired one looks like to this build — that is the finding | the same file, with an `it.todo` for the half that needs the quote |

The derived cases are deliberately **not stored as files**. Three reasons, in order: a copy of a
recording with one byte changed is precisely the artifact this directory exists to distrust, and a
filename ending `-tampered.json` invites someone to read it as traffic; two copies of each redacted
report would double 178 KB of committed service bytes to hold a single changed character; and the edit
is the *test's* claim ("flip one character of `request_nonce`"), so stating it as code next to the
assertion keeps the two from drifting apart. Each derived case is documented in the test by name:
`tampered_nonce`, `tampered_address`, `foreign_key`, `stale`.

## File shape

```jsonc
{
  "_meta": {
    "case": "good",
    "provenance": "recorded",
    "redactionNote": "a documented subset, not every byte: redacted[] names what was dropped and why…",
    "redacted": [{ "path": "model_attestations[0].info.tcb_info.app_compose", "bytes": 18212,
                   "sha256": "a0e3c6f4…", "reason": "the service's own compose file…" }, "…"],
    "item": "T-08",
    "recorder": "scripts/record-fixtures.ts",
    "recordedAt": "2026-11-05T00:27:08.288Z",
    "endpoint": "https://cloud-api.near.ai/v1/attestation/report",
    "query": { "model": "z-ai/glm-5.3-flash", "nonce": "4f9de30d…", "signing_algo": "ed25519" },
    "httpStatus": 200, "ms": 1845,
    "reportBytes": 318885, "reportSha256": "a17b31b0…",   // the FULL live response, redaction included
    "sentNonce": "4f9de30d…",        // stored apart from the report: the echo is then a check, not a tautology
    "shouldPass": ["attestation_report", "nonce_fresh", "signing_address_shape", "signing_public_key_shape"],
    "shouldFail": [],                // written as a list the recorder commits to, NOT read back from bindReport
    "observedStatus": "verified",    // what the live run actually said, kept beside the expectation
    "schemaDrops": { "measuredOn": "live bytes, pre-redaction", "topLevel": ["ohttp_key_config"],
                     "modelAttestation": ["model_name", "ohttp_attestation", "compose_manager_attestation", "ohttp_key_config"] },
    "timeFields": [".model_attestations[0].request_nonce = …"], "timeFieldCount": 82,
    "appCerts": { "model": { "present": true, "subject": "CN=demo-cert", "validTo": "Oct 24 22:43:45 2036 GMT" }, "gateway": { /* … */ } },
    "deviceIdIsPlaceholder": { "model": { "info": true, "tcb": true }, "gateway": { "info": true, "tcb": true } },
    "nonceEchoes": { "model_request_nonce": true, "gateway_request_nonce": true, "compose_nonce": true,
                     "compose_nonce_source": "client", "compose_report_data_bytes": 64,
                     "gpu": { "topLevelNonce": true, "evidenceCount": 8, "everyEvidenceEchoesNonce": true,
                              "everyEvidenceHasChain": true, "arch": "HOPPER" } },
    "newestComposeAction": "2026-11-04T04:14:09.184642051+00:00", "composeActionCount": 226,
    "purpose": "…", "notes": "…"
  },
  "report": { /* the live report, minus the five paths in _meta.redacted — NOT the value attestationReportSchema kept */ }
}
```

`report` is kept at **wire shape** rather than as `bindReport`'s input, because the schema is lossy in
ways T-03 will trip over: it strips `model_name`, both `ohttp_*` fields and the compose-manager
attestation, and it narrows `info` from eleven keys to one. Storing what the schema kept would hide
those behind the very object under test. So the tests parse first
(`attestationReportSchema.safeParse(fixture.report)`), which is what the running app does, then bind —
and one test pins the drop list above, so widening the schema cannot happen silently. The redaction is
a different thing from the schema's blindness, and both are named in `_meta`.

## What a live report carries, stated plainly before anyone is surprised by it

Measured on the fetch behind these files (`docs/SPIKE_RESULTS.md` §3, 2026-11-05 block). None of it is
document-derived — a report describes the machine, not the request — and none of it is ours: no API key,
no `chat_id`, no account address, no workspace identifier of this project. Three of the bullets below
are facts *about* bytes that are redacted; they are stated because they are what a check would need.

- **NEAR/Dstack machine identity, some of it kept**: `info.app_id` and `info.instance_id` (40 hex
  each), `info.app_name` (`dstack-nvidia-0.5.11`), and the measurement registers a verifier compares —
  `mr_aggregated`, `os_image_hash`, `compose_hash`, `tcb_info.{mrtd,rtmr0…rtmr3}`. The compose file
  behind `compose_hash`, the container launch log and the gateway's internal `vpc` hostname are
  **redacted**: they are their infrastructure, not ours to publish.
- **A certificate, and it is a demo certificate**: `info.app_cert` is a 10,756-character PEM, and Node's
  `X509Certificate` reads its subject as `CN=demo-cert`, issued by `O=Dstack; CN=Dstack App CA`, valid
  1975 → **2036**. So "the app certificate is inside its validity window" is a check that passes today
  on a certificate naming nothing. Do not let a future receipt imply otherwise.
- **`device_id` is a placeholder, in all four places** (model and gateway, `info` and
  `info.tcb_info`, in both reports): its 64 hex are exactly `SHA-256("")`. A device-identity check that
  reads this field passes on a report carrying no device identity at all. The device facts are in
  `nvidia_payload` — eight per-Hopper-GPU NVIDIA reports, each with a certificate chain, each bound to
  the nonce of that fetch, which is why a stored one cannot decide the check either. **B-12**.
- **The nonce is echoed four times, not once**: `model_attestations[0].request_nonce`,
  `gateway_attestation.request_nonce`, `compose_manager_attestation.nonce` (with
  `nonce_source: "client"` and its own 64-byte `report_data`, unlike the model attestation, which has
  none), and inside `nvidia_payload` — top level *and* per device. `bindReport` compares the first only.
- **No usable expiry.** The only plaintext times in the report are the compose-manager action log
  (`timestamp` per action — 226 and 82 entries on the two instances, newest ~5–20 h before the fetch).
  There is no `issuedAt`, no `exp`, nothing the browser half could compare to a clock; the real validity
  windows are inside `intel_quote` and the GPU evidence, in bytes this build cannot parse without the
  dependency T-03 is blocked on. That is a *finding*, not an oversight: it is why `stale` below asserts
  that nothing notices.

## Rules

- No real `chat_id`, workspace id, account address or API key in any file here — and the check for
  that is a test (`tests/verification/attestation-fixtures.test.ts`), not a promise.
- **Redactions are declared, never silent.** A re-record must keep `_meta.redacted` honest: the paths
  and digests are recomputed from the live bytes by the recorder, and the test asserts the compose-file
  digest still equals the `info.compose_hash` the report keeps. If a new field ever needs dropping, it
  goes in this table and in `REDACTION_REASONS` in the same commit.
- `_meta.shouldPass` / `shouldFail` are the assertion source; a fixture with no stated expectation
  tests nothing. The recorder writes them from a list in its own source, never from `bindReport`'s
  output, so a check that stops failing cannot be laundered into a fixture.
- Never edit a `report`. Re-record it (free) and say so in the ROADMAP log. Derived cases are derived
  in test code, one named change, and named in the test.
- If the decided check set in `docs/ARCHITECTURE.md` §10 changes, these files change in the same
  commit, because their expectations reference check names.
- These fixtures are **inputs to `bindReport`**, and nothing here proves an enclave did anything:
  `/api/verify` is still T-03's 501 (**B-12**), so every one of these cases — including `good` — ends
  the session gate at `failed`. The tests assert that too.

**Current state: two recorded good reports, and no failure-shaped ones.** Attestation *report*
retrieval is now in the corpus; what is still absent is a recorded **refused** or **malformed**
report (a 401 without a key, a report with `model_attestations: []`), which is the shape T-08's
"expired" sibling becomes once T-03 can decide expiry at all.
