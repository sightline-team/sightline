#!/usr/bin/env tsx
/**
 * Golden-set accuracy report — item **C-09** (and the accuracy half of S-03).
 *
 * The golden set is a small pile of *synthetic* document images plus the transcript and
 * facts we expect from each. `docs/PRD.md` requires a measured accuracy number before any
 * claim about how well Sightline reads photos, and `docs/ARCHITECTURE.md` §14 lists the
 * count of numeric misreads as the trigger for the numeric re-check (T-11).
 *
 * Done when (C-09): run the set through the real pipeline, print per-page exact-match on
 * the transcript, per-field recall on the expected facts, and the numeric misread count.
 * Two hard rules while it is written:
 *  - Only synthetic documents. Real personal, medical or financial documents are forbidden
 *    (AGENTS.md §5 "Never do"), so anything placed in `public/sample-docs/` must be authored.
 *  - Nothing from this run may be quoted in the UI as an accuracy claim until it is measured
 *    against a real user's photos, which is U-04 and needs a human.
 */
console.error('scripts/run-golden.ts is not implemented yet. Owner: ROADMAP item C-09 (needs the image path C-01..C-05 and a key, B-05).');
console.error('Synthetic golden images go in public/sample-docs/; expected outputs go beside them, never in src/.');
process.exit(3);
