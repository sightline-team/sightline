#!/usr/bin/env tsx
/**
 * The Day-1 spike runner — item **S-02** (and S-03, S-05, S-07, S-09 inside it).
 *
 * The reading half of the spike is already done and recorded in
 * `docs/SPIKE_RESULTS.md`. What is left is measurement, and measurement needs the API
 * key that blocker B-05 is about. When it exists, this script must print, for the model
 * we plan to use:
 *   1. `GET /v1/model/{model_name}` → attestationSupported, providerType, inputModalities,
 *      pricing (nano-USD, `scale: 9`);
 *   2. `GET /v1/attestation/report` with a fresh 64-hex nonce, then run the ported checks
 *      and show which pass;
 *   3. one transcription of a synthetic page, timed, with the completion id;
 *   4. `GET /v1/signature/{chat_id}` for that id and the rebuilt hash-pair verification;
 *   5. an E2EE attempt from a browser-shaped stack, and whether the enclave decrypted it;
 *   6. cost per page from the usage fields.
 *
 * Output goes into `docs/SPIKE_RESULTS.md` as [Measured] rows. It must never log request
 * bodies or document text — timings, ids, status codes and counts only (AGENTS.md §4 rule 7).
 */
console.error('scripts/spike.ts is not implemented yet. Owner: ROADMAP item S-02 (needs blocker B-05 cleared: an API key).');
console.error('The documentation/source half is already recorded in docs/SPIKE_RESULTS.md.');
process.exit(3);
