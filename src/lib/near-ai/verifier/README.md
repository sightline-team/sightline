# `lib/near-ai/verifier/` — ported attestation checks

Owner: **T-03** (`/api/verify`), with **S-04** already decided in
`docs/ARCHITECTURE.md` §10. Nothing lives here yet on purpose. What was left of the port after
**ADR-32** is the half that needs Intel's certificate service, and that is a dependency decision
(**B-12**), not a missing key (**B-05**, closed 2026-11-03) or a missing report. The eight checks that
needed only the quote's bytes and SHA-384 were measured as runnable in the browser, so they live in
`../quote.ts` and run inside `createTrustSession` rather than waiting for a server.

## Source and licence

- Port from `github.com/nearai/nearai-cloud-verifier`, which is **MIT** ("Copyright
  (c) 2025 nearai-cloud") and ships a native TypeScript directory (`ts/`, pnpm)
  depending on `ethers`, `tsx` and **`dcap-qvl-node`** for Intel TDX quotes.
  Keep its `LICENSE` and a copyright notice in this directory when the code lands
  (R-05).
- `github.com/near-examples/nearai-cloud-verification-example` (MIT, Node 22+) is the
  reference for field names only. It says of itself: "This demo intentionally stops
  short of a full verifier."
- Do **not** copy from `nearai/cloud-api` — that is **PolyForm Strict 1.0.0**: we may
  read it (we did, for the CORS finding) but may not vendor or copy it.

## What gets ported, in order — status 2026-11-05

1. Nonce binding — **built, and stronger than planned.** `bindReport` compares `request_nonce`, and
   `../quote.ts` now compares the same nonce inside `report_data[32..64]` of the quote, measured to be
   the fresh one on both live reports (`docs/SPIKE_RESULTS.md` §3). The GPU nonce is read from
   `nvidia_payload.nonce`, not an `eat_nonce` claim — a live NRAS answer carries none.
2. Response signature verification (`@noble/curves`) — built in `../signatures.ts` (**T-02**).
3. GPU-evidence verdict via NRAS (`https://nras.attestation.nvidia.com/v3/attest/gpu`) — **measured,
   not wired.** One unauthenticated POST of `JSON.parse(nvidia_payload)` answered HTTP 200 with
   `x-nvidia-overall-att-result: true` in 1.6 s (`npm run spike -- --stage=gpu`). It needs no
   dependency — it needs a server allowed to reach a second host, which is a decision (**B-12**, and
   AGENTS.md §4 rule 9), so `gpu_evidence_verdict` still ships as `ran: false`.
4. Intel TDX quote verification through `dcap-qvl-node` — **split by ADR-32.** Indexing, the debug-bit
   abort, the reserved-attribute check, `app_compose` → `mr_config_id`, the register comparison and the
   RTMR0–2 replay are built in `../quote.ts`. What is left for this directory is Intel's signature over
   those bytes and collateral/TCB revocation — the `js_get_collateral(pccs, quote)` +
   `js_verify(quote, collateral, now)` pair — which is what `quote_signed_by_hardware` and
   `platform_still_trusted` name as gaps.
5. Measurement/replay checks — built **except one**: the documented `rt_mr3` replay does not reproduce.
   Registers 0–2 replay exactly on all four recorded quotes and both live ones; RTMR3 matches nothing,
   because dstack logs those boot events with an empty `digest`, and eighteen framings of
   `event`/`event_payload` all failed. Do not write this check from the docs — find the framing first.

Each becomes a named `CheckResult { name, ran, passed }`. If step 4 does not ship, the
receipt says so plainly — "hardware quote not independently verified in this build" —
and the claim drops to the weaker rung. Overclaiming is the failure mode this whole
directory exists to avoid. Since 2026-11-05 that is structural, not a promise:
`QUOTE_CHECKS_THAT_CANNOT_RUN` returns the four as `ran: false`, the receipt lists them by name, and
they hold `verified` back in `createTrustSession` until `/api/verify` answers one of them *by that
name* — at which point its own entry replaces the placeholder and nothing else has to be re-argued.
