#!/usr/bin/env tsx
/**
 * The ROADMAP gate — item **F-11**.
 *
 * AGENTS.md §2 makes `ROADMAP.md` part of every commit. Until this script existed, agents
 * performed the same checks by hand — which is exactly the failure mode F-11 names: a rule
 * enforced only by diligence is a rule that dies quietly the first time someone is tired.
 *
 * Checks (one violation = one line on stderr, exit 1):
 *  1. every non-merge commit in the range touches `ROADMAP.md`;
 *  2. every checkbox line carries a legal status, and `[x]` requires `Evidence:`;
 *  3. IDs are unique — the ID space is append-only (AGENTS.md §2 rule 2);
 *  4. `[-]` (cut) requires a reason in the same line;
 *  5. §10's log entries are dated, shaped, and newest first (the log is prepend-only);
 *  6. the §1 dashboard equals the checkboxes recomputed from §6, and §2 "Current focus" names
 *     only item IDs that exist;
 *  7. every §8 blocker row has ID, item, blocks, owner, opened and status.
 *
 * Usage: `npm run roadmap:check` (the file + HEAD), `-- --range=<git range>`, `-- --staged`
 * (from the pre-commit hook), `-- --write` (rewrite the §1 dashboard block and nothing else).
 *
 * The ledger rules are `checkLedger(text)`: pure, and tested in `tests/unit/roadmap-check.test.ts`
 * against synthetic ledgers, because a gate that is only ever run against the one document it
 * guards has never been observed to reject anything. The git half stays in `main` — it is about
 * the repository, not about the text.
 *
 * This gate must never be weakened to let a commit through. A red run means the roadmap is
 * wrong, which is the only thing this script is able to know for sure.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROADMAP = resolve(import.meta.dirname, '..', 'ROADMAP.md');
const PHASES = ['D', 'S', 'F', 'U', 'P', 'C', 'T', 'A', 'R', 'X', 'Z'] as const;
const STATUSES = [' ', 'x', '~', '!', '-'];
const START = '<!-- progress:start -->';
const END = '<!-- progress:end -->';

interface Item {
  id: string;
  phase: string;
  status: string;
  line: number;
  raw: string;
}

interface Counts {
  x: number;
  in_progress: number;
  blocked: number;
  todo: number;
  cut: number;
}

export interface LedgerReport {
  problems: string[];
  items: number;
  logEntries: number;
  /** The §1 block as §6's checkboxes say it should read; empty when the markers are missing. */
  dashboard: string;
}

/** Every rule that lives inside the file. No git, no filesystem, no printing. */
export function checkLedger(text: string): LedgerReport {
  const problems: string[] = [];
  const fail = (message: string): void => void problems.push(message);
  const lines = text.split('\n');

  /* --------------------------------------------------------------- items ---- */

  const items: Item[] = [];
  let phase: string | undefined;
  lines.forEach((raw, index) => {
    // A phase runs until the next `### Phase` **or** the next `## ` section: the §7 stretch list
    // follows Phase X, and counting its Z-items as X-items mis-states the dashboard.
    const heading = /^### Phase ([A-Z]) —/.exec(raw);
    if (heading !== null) {
      phase = heading[1];
      return;
    }
    if (/^## 7\. Stretch/.test(raw)) {
      // Stretch items are real IDs (Z-nn) that §2 and the log may name, but §7 is excluded from
      // the 100% total by definition, so they get a phase of their own and no dashboard row.
      phase = 'Z';
      return;
    }
    if (/^## /.test(raw)) {
      phase = undefined;
      return;
    }
    const checkbox = /^- \[(.)\] \*\*([A-Z]-\d+)\*\*/.exec(raw);
    if (checkbox === null) return;
    const status = checkbox[1]!;
    const id = checkbox[2]!;
    if (!STATUSES.includes(status)) {
      fail(`line ${index + 1}: "${id}" has an illegal status "[${status}]" — legal: [ ] [x] [~] [!] [-]`);
      return;
    }
    if (phase === undefined) fail(`line ${index + 1}: "${id}" sits outside any "### Phase" section`);
    items.push({ id, phase: phase ?? '?', status, line: index + 1, raw });
  });

  const seen = new Map<string, Item>();
  for (const item of items) {
    const first = seen.get(item.id);
    if (first !== undefined) fail(`ID "${item.id}" is used twice (line ${first.line} and line ${item.line}); IDs are append-only`);
    else seen.set(item.id, item);
  }

  for (const item of items) {
    if (item.status === 'x' && !/Evidence:/i.test(item.raw)) {
      fail(`line ${item.line}: "${item.id}" is [x] with no "Evidence:" line — AGENTS.md §2: no evidence, no [x]`);
    }
    if (item.status === '-' && !/\b(cut|reason)\b/i.test(item.raw)) {
      fail(`line ${item.line}: "${item.id}" is [-] (cut) without a reason on the same line`);
    }
  }

  /* -------------------------------------------------------------- counts ---- */

  const byPhase = new Map<string, Counts>();
  for (const item of items) {
    const c = byPhase.get(item.phase) ?? { x: 0, in_progress: 0, blocked: 0, todo: 0, cut: 0 };
    if (item.status === 'x') c.x += 1;
    else if (item.status === '~') c.in_progress += 1;
    else if (item.status === '!') c.blocked += 1;
    else if (item.status === '-') c.cut += 1;
    else c.todo += 1;
    byPhase.set(item.phase, c);
  }

  /* ----------------------------------------------------------- dashboard ---- */

  let dashboard = '';
  const start = lines.findIndex((l) => l.includes(START));
  const end = lines.findIndex((l) => l.includes(END));
  if (start === -1 || end === -1 || end < start) {
    fail(`§1 dashboard is missing its ${START} / ${END} markers, so the counts cannot be verified`);
  } else {
    dashboard = renderDashboard(lines.slice(start + 1, end), byPhase, fail);
    if (lines.slice(start + 1, end).join('\n').trim() !== dashboard.trim()) {
      fail('§1 dashboard does not match the checkboxes in §6. Run: npm run roadmap:check -- --write');
    }
  }

  /* --------------------------------------------------------------- focus ---- */

  const focus = section(text, '## 2. Current focus', fail);
  /**
   * §2 names both item IDs and blocker IDs, and blockers (B-nn) live in §8 rather than §6, so
   * membership is tested against the phase letters only — otherwise every "blocker B-05" in the
   * focus list would be reported as a missing item.
   */
  const mentioned = [...new Set(focus.match(/\b[A-Z]-\d+\b/g) ?? [])].filter((id) => PHASES.includes(id[0] as (typeof PHASES)[number]));
  for (const id of mentioned) {
    if (!seen.has(id)) fail(`§2 "Current focus" names ${id}, which is not an item in §6 (IDs are append-only — never renumbered away)`);
  }

  /* ----------------------------------------------------------------- log ---- */

  const logSection = section(text, '## 10. Update log', fail);
  const logDates = [...logSection.matchAll(/^- \*\*(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]!);
  if (logDates.length === 0) fail('§10 has no dated update entry — every contribution prepends one');
  logDates.forEach((date, i) => {
    // Newest first: an entry must not be newer than the one above it. Same-day entries are
    // ordered by insertion and cannot be told apart by a date alone, so equality passes.
    if (i > 0 && date > logDates[i - 1]!) {
      fail(`§10 entry ${i + 1} is dated ${date}, newer than the entry above it (${logDates[i - 1]}); the log is prepended at the top`);
    }
  });
  logSection
    .split('\n- **')
    .slice(1)
    .forEach((entry, i) => {
      if (!entry.includes('·')) fail(`§10 entry ${i + 1} has no "·" separators (date · who · item IDs · summary · files · evidence · follow-ups)`);
      if (!/evidence/i.test(entry)) fail(`§10 entry ${i + 1} carries no evidence line`);
    });

  /* ------------------------------------------------------------ blockers ---- */

  const blockers = section(text, '## 8. Blockers and open decisions', fail);
  for (const row of blockers.split('\n').filter((l) => /^\| B-\d+/.test(l))) {
    const cells = row.split('|').slice(1, -1).map((c) => c.trim());
    const labels = ['ID', 'item', 'what it blocks', 'owner', 'opened', 'status'];
    cells.forEach((cell, i) => {
      if (cell === '') fail(`§8 blocker "${cells[0]}" has an empty ${labels[i] ?? `column ${i}`}`);
    });
    if (cells.length !== 6) fail(`§8 blocker "${cells[0]}" has ${cells.length} columns, expected 6 (ID, item, blocks, owner, opened, status)`);
  }

  return { problems, items: items.length, logEntries: logDates.length, dashboard };
}

/**
 * Rows are rebuilt from the table already in the file, so the human-written phase **names** stay
 * human-owned and only the numbers are computed. A phase with items and no row is a violation,
 * because the totals would otherwise omit it silently.
 */
function renderDashboard(block: string[], byPhase: Map<string, Counts>, fail: (m: string) => void): string {
  const rows: string[] = [];
  const totals = { x: 0, in_progress: 0, blocked: 0, todo: 0, cut: 0, total: 0 };
  for (const row of block) {
    const m = /^\| ([A-Z]) — (.+?) \|(\s*\d+\s*\|){5}\s*\*{0,2}(\d+)\*{0,2}\s*\| .*\|$/.exec(row);
    if (m === null) {
      rows.push(row);
      continue;
    }
    const counts = byPhase.get(m[1]!);
    if (counts === undefined) {
      rows.push(row);
      continue;
    }
    const total = counts.x + counts.in_progress + counts.blocked + counts.todo;
    const pct = total === 0 ? '0%' : `${Math.round((100 * counts.x) / total)}%`;
    rows.push(`| ${m[1]} — ${m[2]} | ${counts.x} | ${counts.in_progress} | ${counts.blocked} | ${counts.todo} | ${counts.cut} | ${total} | ${pct} |`);
    if (m[1] === 'Z') continue;
    totals.x += counts.x;
    totals.in_progress += counts.in_progress;
    totals.blocked += counts.blocked;
    totals.todo += counts.todo;
    totals.cut += counts.cut;
    totals.total += total;
  }
  const totalRow = rows.findIndex((r) => r.startsWith('| **All P0 work**'));
  if (totalRow === -1) fail('§1 has no "All P0 work" total row to check against §6');
  else {
    const pct = totals.total === 0 ? 0 : Math.round((100 * totals.x) / totals.total);
    rows[totalRow] = `| **All P0 work** | **${totals.x}** | | | | | **${totals.total}** | **${pct}%** |`;
  }
  for (const phase of byPhase.keys()) {
    if (phase === 'Z') continue;
    if (!rows.some((r) => r.startsWith(`| ${phase} —`))) fail(`§1 has no row for phase "${phase}", which has items in §6`);
  }
  return rows.join('\n');
}

/**
 * A `## ` section runs to the next `## ` heading, not to a marker named by the caller: a document
 * whose sections were renumbered would otherwise have its section read as running to the end of
 * the file, and §2 would appear to mention every ID in §8.
 */
function section(text: string, heading: string, fail: (m: string) => void): string {
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.startsWith(heading));
  if (begin === -1) {
    fail(`ROADMAP.md no longer has the heading "${heading}" — roadmap-check reads it by heading`);
    return '';
  }
  const body = lines.slice(begin + 1);
  const next = body.findIndex((l) => /^## /.test(l));
  return (next === -1 ? body : body.slice(0, next)).join('\n');
}

/* ------------------------------------------------------------------ CLI ---- */

function main(argv: string[]): number {
  const write = argv.includes('--write');
  const rangeArg = argv.find((a) => a.startsWith('--range='));
  const range = rangeArg === undefined ? undefined : rangeArg.slice('--range='.length);
  const staged = argv.includes('--staged');

  const text = readFileSync(ROADMAP, 'utf8');
  const report = checkLedger(text);
  const problems = [...report.problems];

  const git = (args: string[]): string[] => {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
    } catch {
      problems.push(`git ${args.join(' ')} failed — is this a git checkout with the refs the range names?`);
      return [];
    }
  };

  if (staged) {
    const files = git(['diff', '--cached', '--name-only']);
    if (files.length > 0 && !files.includes('ROADMAP.md')) {
      problems.push(`this commit stages ${files.length} file(s) and no ROADMAP.md — AGENTS.md §2: every contribution updates the roadmap in the same commit`);
    }
  } else {
    const commitRange = range ?? 'HEAD';
    const shas = git(['rev-list', '--no-merges', commitRange]);
    if (shas.length === 0) problems.push(`git rev-list found no commits in "${commitRange}" — a range that names nothing is not a pass`);
    for (const sha of shas) {
      const lineage = (git(['rev-list', '--parents', '-n', '1', sha])[0] ?? '').trim().split(/\s+/);
      if (lineage.length <= 1) continue; // the root commit imported the docs; there was no rule to break
      if (!git(['show', '--name-only', '--format=', sha]).includes('ROADMAP.md')) {
        problems.push(`commit ${sha.slice(0, 8)} does not touch ROADMAP.md (AGENTS.md §2)`);
      }
    }
  }

  if (write && report.dashboard !== '') {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.includes(START));
    const end = lines.findIndex((l) => l.includes(END));
    writeFileSync(ROADMAP, [...lines.slice(0, start + 1), ...report.dashboard.split('\n'), ...lines.slice(end)].join('\n'), 'utf8');
    console.log(`roadmap:check: §1 dashboard rewritten from ${report.items} checkbox lines.`);
  }

  if (problems.length > 0) {
    console.error(`roadmap:check — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  · ${problem}`);
    console.error('Fix the roadmap; do not relax this gate to make it pass (AGENTS.md §2).');
    return 1;
  }
  console.log(`roadmap:check — OK. ${report.items} items, ${report.logEntries} log entries, no violations.`);
  return 0;
}

/** Guarded so the unit test can import `checkLedger` without running the gate against the repo. */
if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
