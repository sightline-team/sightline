---
name: roadmap-guard
description: >-
  Enforces the mandatory Sightline ROADMAP.md protocol (AGENTS.md §2). Use before committing
  any change to code, tests, docs, scripts, or config to verify that ROADMAP.md is updated
  with evidence, dashboard counts, current focus, and clean roadmap check.
---

# Sightline ROADMAP Protocol Guard

Use this skill whenever preparing to commit changes in the Sightline repository.
Repository Rule: Every contribution MUST update `ROADMAP.md` in the same commit.

## Pre-Commit Protocol Checklist

1. **Item Statuses (ROADMAP.md §6)**:
   - Mark touched items `[~]` (in progress) or `[x]` (done).
   - Rule: **No evidence, no `[x]`**. Every `[x]` must include an `Evidence:` line citing a test, command output, or file.
   - If blocked, mark `[!]` and add a row to §8 (Blockers).
   - If cut, mark `[-]` with a reason.

2. **Update Log (ROADMAP.md §10)**:
   - Append an entry at the **top** of §10.
   - Format: `date (UTC) · who · item IDs · summary · files/areas · evidence · follow-ups`.
   - Never rewrite past log entries.

3. **Dashboard Recount (ROADMAP.md §1)**:
   - Run `npm run roadmap:check -- --write` to automatically update the dashboard table and item counts.

4. **Current Focus (ROADMAP.md §2)**:
   - Keep to 3–5 active items reflecting the immediate next work.

5. **Validation**:
   - Run `npm run roadmap:check` to verify no violations exist before committing.
   - Run `npm run release:docs` if any documentation or claims were edited.
