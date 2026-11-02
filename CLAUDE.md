# CLAUDE.md

Claude Code reads this file, not `AGENTS.md`, so the shared instructions are imported here. Do not duplicate them.

@AGENTS.md
@docs/ARCHITECTURE_ESSENTIALS.md

## Claude Code specifics

**The ROADMAP rule applies to you in every session.** Before you finish any task, update `ROADMAP.md` (item status with evidence, a new entry at the top of §10, dashboard, current focus, blockers) in the same commit as the work, then run `npm run roadmap:check`. This is in `AGENTS.md` §2; it is repeated here because it is the rule most likely to be forgotten.

**Context discipline**
- `ROADMAP.md` is large and is deliberately **not** imported. Read its §1–§3 and §8, then only the phase for your item, using targeted reads.
- Open sections of `docs/PRD.md` and `docs/ARCHITECTURE.md` only when an item references them. The essentials file above is the default reference.
- Keep this file short. Procedures and facts belong in `docs/` or `AGENTS.md`, not here.

**Plan mode** before changing anything under `src/lib/near-ai/`, `src/features/trust/`, `src/lib/server/`, or `src/app/api/`. These hold the privacy claims and the relay's security boundary. State the plan, the tests you will add, and which ROADMAP items you will update.

**Memory**
- Project facts go in the repo docs (they are shared, reviewed and versioned). Do not leave them only in personal or auto memory.
- If these instructions seem ignored, run `/context` and confirm `CLAUDE.md` and the imports are loaded.

**Enforcement lives in tooling, not prose.** `npm run roadmap:check` (item F-11) runs in a git hook and CI. If you configure Claude Code hooks for this repo, wire them to that command rather than re-implementing the rule. Check the Claude Code hooks documentation for the current configuration format before relying on it.

**Session end routine**
1. `npm run lint && npm run typecheck && npm test` (and `npm run test:e2e` for UI changes)
2. Update `ROADMAP.md` as above
3. `npm run roadmap:check`
4. Summarise for the human: what changed, what you ran and saw, what is still `[~]` or `[!]`, and the next item

**Personal preferences** go in `CLAUDE.local.md` (git-ignored), not here.
