#!/usr/bin/env tsx
/**
 * Second opinion — item **T-15** (ADR-20).
 *
 * Sightline's product is the receipt that names which checks ran. That only means
 * something if the checks are *our* code, so `@nearai/inference-sdk` is deliberately not a
 * dependency of the app (ADR-20). The risk of writing our own verification is silently
 * getting it wrong, and this script is the guard against that: it runs NEAR's official SDK
 * against the same live response and prints where the two verdicts disagree.
 *
 * Shape, once S-05, T-02 and T-03 exist:
 *   1. make one encrypted request through our own client + E2EE path;
 *   2. verify the response with `src/lib/near-ai/*` and record every check's verdict;
 *   3. in a separate process context, `new InferenceClient({ apiKey, e2ee: true })` and
 *      `client.verifyResponse(id)`;
 *   4. print our verdict, the SDK's, and the diff. Any disagreement is a bug in our
 *      verifier, not a passing result — the script exits non-zero on a diff.
 *
 * Constraints: dev-only (it is never imported by `src/app` or anything that reaches a client
 * bundle), it needs blocker B-05 (an API key), and it logs only ids and verdicts — never
 * request bodies or document text (AGENTS.md §4 rule 7).
 */
console.error('scripts/crosscheck.ts is not implemented yet. Owner: ROADMAP item T-15 (needs B-05, S-05, T-02, T-03).');
console.error('Do not import this from the app: ADR-20 keeps the official SDK out of the trust path.');
process.exit(3);
