---
name: tee-attestation
description: >-
  Verify and inspect NEAR AI Cloud hardware attestation, Intel TDX quotes, and response
  signatures for Sightline. Use when working on attestation reports, quote verification,
  cryptographic signatures, or relay routes.
---

# Sightline TEE & Cryptographic Attestation Inspector

Use this skill when implementing or verifying enclave attestation, Intel TDX quotes, or response signatures.

## Verification Rules & Standards

1. **Fresh Nonce per Session**:
   - Must be 32 cryptographically random bytes (64 hex characters).
   - Generated client-side at session start. Verified in `request_nonce` and quote `report_data`.

2. **Intel TDX Quote Parsing (`src/lib/near-ai/quote.ts`)**:
   - Version 4 Intel TDX quote byte offsets:
     - 48-byte header (bytes 0–47).
     - 584-byte TD report (bytes 48–631).
     - `report_data` at byte 568: binds session nonce and signing public key.
     - Event log SHA-384 replay verifies RTMR 0–2.

3. **Response Signature Verification (`src/lib/near-ai/signatures.ts`)**:
   - Signatures are not HTTP headers; they require a separate call: `GET /v1/signature/{chat_id}`.
   - Reconstruct hash: `SHA-256("{model_id}:{request_hash}:{response_hash}")`.
   - Verify against `signing_public_key` bound in the attested report.

4. **Honest Trust Receipt (`src/features/trust/`)**:
   - Never display `verified` unless all required checks pass.
   - In live Mode B, receipts report `partial` (e.g. 15 of 19 checks pass, 4 gaps named).
   - Privacy claims are computed by `src/features/trust/claims.ts`, never written by hand.
