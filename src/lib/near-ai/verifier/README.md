# `lib/near-ai/verifier/` — ported attestation checks

Owner: **T-03** (`/api/verify`), with **S-04** already decided in
`docs/ARCHITECTURE.md` §10. Nothing lives here yet on purpose: the port is the
hardest part of the trust half of this project and it must be done against a real
report, which needs the API key (blocker **B-05**).

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

## What gets ported, in order

1. Nonce binding — `request_nonce` equals our 64-hex nonce; GPU token `eat_nonce` matches.
2. Response signature verification (`@noble/curves`).
3. GPU-evidence verdict via NRAS (`https://nras.attestation.nvidia.com/v3/attest/gpu`).
4. Intel TDX quote verification through `dcap-qvl-node`, including aborting when
   `td_attributes[0]` shows debug mode, the `app_compose` → `mr_config_id` check and
   replaying the event log through SHA-384 extend to match `rt_mr3`.

Each becomes a named `CheckResult { name, ran, passed }`. If step 4 does not ship, the
receipt says so plainly — "hardware quote not independently verified in this build" —
and the claim drops to the weaker rung. Overclaiming is the failure mode this whole
directory exists to avoid.
