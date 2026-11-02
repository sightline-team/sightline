#!/usr/bin/env tsx
/**
 * Records real NEAR AI responses into `fixtures/` — item **S-11**.
 *
 * Until this runs, everything in `fixtures/` is **authored synthetic** data and has to be
 * described that way (AGENTS.md §4 rule 11, and the provenance note in `fixtures/README.md`).
 * "Recorded" is a claim about provenance, so it becomes true only here.
 *
 * Requirements when built:
 * - writes to `fixtures/responses/` with a `_provenance` sidecar: model id, date, endpoint,
 *   whether E2EE was used, and the request hash (never the body);
 * - synthetic documents only — a real document, photo or medical record must never be
 *   recorded into this repository (AGENTS.md §5 "Never do");
 * - strips any header containing the API key;
 * - also records attestation reports in three shapes for T-08: good, tampered, expired.
 */
console.error('scripts/record-fixtures.ts is not implemented yet. Owner: ROADMAP item S-11 (needs an API key, blocker B-05).');
process.exit(3);
