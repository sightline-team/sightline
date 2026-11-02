#!/usr/bin/env tsx
/**
 * The ROADMAP gate — item **F-11**.
 *
 * AGENTS.md §2 makes `ROADMAP.md` part of every commit, and §10 says a commit without a
 * roadmap change is rejected here. Until this script exists, agents perform the same checks
 * by hand (that is what has happened through F-01..F-10); the risk of that is exactly why
 * F-11 is early: a human-sized ledger file is easy to update wrongly.
 *
 * Checks to implement (Done when, ROADMAP §3):
 *  1. HEAD's diff touches `ROADMAP.md` — unless it is a merge commit or this commit is the
 *     initial import. This is the rule that rejects a silent commit.
 *  2. Every checkbox line matches `[^-] \[([-x~!\]])\]` and every status is legal; `[x]`
 *     requires an `Evidence:` line for that item.
 *  3. IDs are unique, never reused after a cut, and never renumbered — the ID space is
 *     append-only (AGENTS.md §2 rule 2).
 *  4. `-` (cut) requires a reason in the same line or the §7 cut list.
 *  5. §10's newest entry is dated and appears above every older entry (the log is prepend-only).
 *  6. The §1 dashboard counts match the checkboxes recomputed from the phase sections, and
 *     §2 "Current focus" names only IDs that still exist.
 *  7. §8 blocker rows have an ID, what they block, an owner and a status.
 *
 * Exit non-zero with a one-line message per violation. `-- --write` recomputes and rewrites
 * the §1 dashboard (and only the dashboard) so the numbers cannot drift by hand.
 *
 * This must never be weakened to let a commit through: a failing gate means the roadmap is
 * wrong, which is the thing the gate exists to catch.
 */
console.error('scripts/roadmap-check.ts is not implemented yet. Owner: ROADMAP item F-11.');
console.error('Until then, AGENTS.md §2 says to perform these checks by hand before every commit.');
process.exit(3);
