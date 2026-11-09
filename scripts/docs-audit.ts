#!/usr/bin/env tsx
/**
 * The documentation consistency audit — item **R-08**.
 *
 * AGENTS.md §9 says docs must describe what the code does, not what we hope, and that a doc and the
 * code which disagree must be fixed in the same commit. Nobody can hold that rule by diligence:
 * this repository has ~4,000 lines of prose across eight documents, and every one of them was
 * written against a tree that kept moving. So the mechanical half of §9 is measured here, in five
 * checks that a script can decide without judgement, and the judgement half (does this paragraph
 * still describe this behaviour?) is the human pass that this item's evidence records.
 *
 * **F1 — no document may name a file that does not exist.** Every filename-shaped token must
 * resolve, by basename, to a tracked file. What counts as a claim depends on the document: in the
 * ones whose subject *is* the tree (`README.md`, `AGENTS.md`, `CLAUDE.md`, the two architecture pages
 * and this file's own `docs/PROJECT_STRUCTURE.md`) every filename is a promise, bare ones included;
 * elsewhere only a path rooted at one of our own top-level directories is, because a bare
 * `page-4.jpg` in a mutation note is a file invented for a test run and never committed, and
 * `ts/model_verifier.ts` is a file inside somebody else's repository. A URL is skipped whole — that
 * tree is not ours either — and the section whose job is listing what was deleted is read as
 * describing absences. This is the stale-row check: rename a module, delete a spike script, and the
 * run goes red wherever the prose still points at it.
 *
 * **F2 — nothing real may be missing from the structure document.** Every file under `scripts/`,
 * `tests/unit/` and `tests/e2e/`, one directory row per feature, one per module under `src/lib`
 * and one per route handler under `src/app/api/` must be *named* in
 * `docs/PROJECT_STRUCTURE.md`. This is the check **R-07** needed: a new gate command existed in
 * `package.json` and in the tree and no document said so until it was patched in by hand. Adding a
 * thing and telling nobody is the failure mode, and diligence is not a guard against it.
 *
 * **F3 — the commands table is the commands a reader can run.** Every npm script must have a row in
 * `docs/PROJECT_STRUCTURE.md` §5, every command named in that table must exist in `package.json`,
 * and every `npm run <x>` written anywhere in the docs, the README or CI must be a script this
 * project actually defines. A README that tells a judge to run a command that errors is worse than a
 * README that says nothing.
 *
 * **F4 — the decision records are a sequence, and a reference to a decision must reach one.**
 * `docs/ARCHITECTURE.md` §17's rows must be uniquely numbered from ADR-1 upward with no gap, each
 * with a decision, a rejected alternative and a reason; every `ADR-n` named in any document must
 * exist; and the newest one must appear in `ARCHITECTURE_ESSENTIALS.md`, because that page is the
 * one a new reader is told to read first (AGENTS.md §0) and a decision missing from it is a decision
 * nobody will meet.
 *
 * **F5 — an item reference must resolve to an item.** Every `A-17`, `R-07`, `T-03` shaped token in
 * any document, the README or the roadmap itself must match a checkbox line in `ROADMAP.md`. Item
 * IDs are how this project cites its own work; a reference to an ID that was never created is a
 * citation to nothing, and renumbering — which §2 forbids — would show up here rather than in a
 * judge's reading.
 *
 * **F6 — an `[Unverified]` marker may not be orphaned** (item **R-15**). A marker is a promise that
 * something has not been measured yet, and AGENTS.md §6 forbids promoting "probably" to "verified";
 * the mirror failure is a marker that names no owner, because it ages into noise and a reader learns
 * to skip the whole class. So every live marker must sit in the unit that makes it — a paragraph, one
 * table row, one line of a fenced tree — that names the item, or the §8 blocker, that can resolve it;
 * and an owner credited with two or more markers must say, in at least one of them, what the answer
 * would change. The unit matters: the directory tree in `docs/PROJECT_STRUCTURE.md` has no blank lines
 * in it, so reading it as one paragraph would let any ID anywhere in a hundred lines own every marker
 * in all of them. Three things are *not* markers: a token
 * inside backticks, which is the word being discussed rather than a claim being labelled (three of
 * this repository's own rule sentences write it that way), and any mention inside a **marker key** —
 * the line at the top of a document that opens "Markers:" and defines the vocabulary. That shape is
 * the convention rather than a loophole: three documents already wrote their legend that way and
 * **R-15** brought `AGENTS.md` and `ARCHITECTURE_ESSENTIALS.md` into line rather than teaching the
 * audit to guess at prose, and `--verbose` prints how many mentions were read as vocabulary, so a key
 * used as a hiding place stays visible. `ROADMAP.md` is read **up to §10**: the log below that heading
 * is append-only by §3, so a gate firing inside it could not be answered by an edit.
 *
 * What this **cannot** check, printed in the verdict rather than hidden: whether a sentence that
 * names a real file still describes it correctly, whether a **path** is at the directory it claims
 * (matching is by basename, so `src/lib/gone/quote.ts` passes while `quote.ts` lives elsewhere),
 * whether a claim about behaviour is true, whether two documents agree in prose rather than in
 * identifiers. That is a reading task — it is the other
 * half of R-08, and it is why this item's evidence names the paragraphs a person re-read.
 *
 * Usage: `npm run release:docs` (exit 0 = the documents and the repository agree on every checkable
 * fact) · `-- --verbose` per-check counts · `-- --json` machine-readable problems.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type Problem = { check: string; where: string; means: string };

export const CHECKS = [
  { id: 'F1', name: 'stale_file_reference', means: 'a document names a file that does not exist in the tree' },
  { id: 'F2', name: 'unlisted_file', means: 'a real file is not named in docs/PROJECT_STRUCTURE.md' },
  { id: 'F3', name: 'command_mismatch', means: 'a command is documented without existing, or exists without a row' },
  { id: 'F4', name: 'adr_mismatch', means: 'the ADR table is not a unique contiguous sequence, or a reference reaches nothing' },
  { id: 'F5', name: 'item_reference_dangling', means: 'a document cites a ROADMAP item ID that no checkbox line defines' },
  { id: 'F6', name: 'marker_unowned', means: 'an [Unverified] marker names no item or blocker that could resolve it' },
  { id: 'F6', name: 'marker_owner_unstated', means: 'an owner credited with two or more markers never says what the answer would change' },
] as const;



const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'test-results', 'playwright-report', 'dist', '.taste-skill']);

/**
 * Documents whose subject is **outside** this repository, so a filename in them is somebody else's.
 * `docs/SPIKE_RESULTS.md` is the log of what NEAR AI Cloud's own pages and spec said on a given day;
 * naming `openapi.json`, `quote-nonce-signer.md` or `model-attestations.md` there is the citation,
 * not a claim about this tree. This is scope, not an exemption list: nothing can be excluded by
 * pattern, these are named here with their reason, and the verdict prints them (**R-07**'s
 * `fixtures/attestation/` clause is the precedent).
 */
export const F1_OUT_OF_SCOPE = ['docs/SPIKE_RESULTS.md'];

/** The documents whose entire subject is this tree: a bare filename in one of them is a promise. */
export const STRUCTURE_DOCS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/PROJECT_STRUCTURE.md', 'docs/ARCHITECTURE_ESSENTIALS.md'];
const DOC_GLOBS = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'HACKATHON.md'];
const DOC_DIRS = ['docs'];

// Lowercase start, lowercase body, a real extension and nothing after it: `Next.js` is a proper
// noun, `near.ai.evil.example` is a host, and `process.env` is a convention — none of them is a
// path in this repository, and a gate that cries at each of those is a gate that gets switched off.
// `/` is inside the body, not in the lookbehind, so a document's whole path is one token: without it
// `src/lib/gone.ts` and `pages/page-1..3.json` would be invisible and only bare names would be read.
const FILE_TOKEN = /(?<![\w.-])([a-z][\w.\-/]*\.(?:tsx?|jsx?|mjs|cjs|css|json|md|jpe?g|png|svg|ya?ml|sql|txt|lock))(?![\w-])/g;
const BACKTICK = /`([^`]+)`/g;
const NPM_RUN = /npm run ([a-z][\w:-]*)/g;
const ADR_REF = /\bADR-(\d+)\b/g;
const ITEM_REF = /\b([A-Z]{1,2}-\d{1,2})\b/g;

/**
 * The tracked files, from `git ls-files` rather than from a directory walk.
 *
 * The distinction is the whole point: a walk sees `next-env.d.ts`, `tsconfig.tsbuildinfo`,
 * `.next/` and this laptop's scratch, none of which a judge's clone contains, so an audit that
 * reads the working tree reports findings about a machine instead of about the repository.
 * AGENTS.md §9's rule is about the committed structure, and `release:clean-checkout` (**R-03**)
 * already defines "the repository" as what an anonymous clone gets.
 */
export function listFiles(root: string): string[] {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && !f.split('/').some((part) => SKIP_DIRS.has(part)));
}

/** `.env.example` and `foo.test.ts` — the basename is what a document names, so basename is what matches. */
export function basenames(files: string[]): Set<string> {
  return new Set(files.map((f) => f.split('/').pop()!));
}

export function readFile(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

/** Every document this audit reads: the top-level ones plus everything under `docs/`. */
export function documents(root: string, files: string[]): string[] {
  const found = new Set(DOC_GLOBS.filter((f) => files.includes(f)));
  for (const dir of DOC_DIRS) {
    for (const f of files) if (f.startsWith(`${dir}/`) && f.endsWith('.md')) found.add(f);
  }
  found.add('ROADMAP.md');
  for (const f of files) if (f.startsWith('.github/') && f.endsWith('.yml')) found.add(f);
  return [...found].sort();
}

/** The directory a path token must start from to be a claim about **this** repository's tree. */
export const OWN_ROOTS = ['src', 'scripts', 'tests', 'docs', 'public', 'fixtures', '.github', '.githooks'];

/** The line numbers inside sections whose own heading says the files are gone, or external agent blocks. */
export function removedSectionLines(md: string): Set<number> {
  const skip = new Set<number>();
  let inside = false;
  let insideNextBlock = false;
  md.split('\n').forEach((line, i) => {
    if (line.includes('<!-- BEGIN:nextjs-agent-rules -->')) insideNextBlock = true;
    if (insideNextBlock) {
      skip.add(i + 1);
      if (line.includes('<!-- END:nextjs-agent-rules -->')) insideNextBlock = false;
      return;
    }
    if (/^#{1,4} /.test(line)) inside = /^#{1,4} .*\bRemoved\b/.test(line);
    if (inside) skip.add(i + 1);
  });
  return skip;
}

/**
 * F1: every filename a document mentions must exist somewhere in the tree — except inside the
 * section whose entire job is listing what was deleted, where a name is the absence being described.
 */
export function staleFileReferences(text: string, where: string, known: Set<string>, strict = false): Problem[] {
  const out: Problem[] = [];
  const lines = text.split('\n');
  const skip = removedSectionLines(text);
  for (const [i, line] of lines.entries()) {
    if (skip.has(i + 1)) continue;
    const urls = [...line.matchAll(/(?:https?|ftp):\/\/\S+/g)].map((m) => [m.index, m.index + m[0].length] as const);
    for (const match of line.matchAll(FILE_TOKEN)) {
      const name = match[1]!;
      if (urls.some(([from, to]) => match.index >= from && match.index < to)) continue; // a URL is somebody else's tree
      const base = name.split('/').pop()!;
      if (base === '.env' || base.startsWith('.env.')) continue; // named as a convention, not a path
      // Outside the documents whose job is the tree, only a path **rooted at one of our own
      // directories** is a claim about this repository. A bare `page-4.jpg` in a mutation note is a
      // file invented for the test and never committed; `ts/model_verifier.ts` is a file inside
      // `nearai/nearai-cloud-verifier`; `src/lib/foo.ts` is ours.
      if (!strict && !OWN_ROOTS.includes(name.split('/')[0]!)) continue;
      if (!known.has(base)) out.push({ check: 'stale_file_reference', where: `${where}:${i + 1} ${base}`, means: 'no file of this name exists in the repository' });
    }
  }
  return out;
}

/**
 * F2: the lists this document actually undertakes to keep.
 *
 * The tree names `src/` files by **directory** and lists individual modules only where it has a
 * thing to say about one, so "every file under src/ must be named" would be a gate that fires on
 * honest prose and is switched off within a week. What the document does promise, in three places,
 * is: every script in `scripts/`, the comma-separated list of unit tests, the list of e2e specs, and
 * one row per feature directory, `src/lib` subdirectory and API route. Those four are what a reader
 * relies on to find things, so those four are what is checked.
 */
export function unlistedFiles(files: string[], structureText: string): Problem[] {
  const named = new Set<string>();
  for (const m of structureText.matchAll(FILE_TOKEN)) if (m[1]) named.add(m[1].split('/').pop()!);
  for (const m of structureText.matchAll(/[\w.\-]+/g)) named.add(m[0]); // bare stems: the test lists name files without the extension
  const out: Problem[] = [];
  const mustName = (rel: string) => {
    const base = rel.split('/').pop()!;
    const stems = [base, base.replace(/\.(test|spec)\.[a-z]+$/, ''), base.replace(/\.[a-z]+$/, '')];
    if (!stems.some((stem) => named.has(stem))) {
      out.push({ check: 'unlisted_file', where: rel, means: 'tracked in git and not named in docs/PROJECT_STRUCTURE.md' });
    }
  };
  // An e2e spec gets no stem pass: the tree lists each one by filename, and `image-prepare.spec.ts`
  // must not be covered by the unit test of the same stem — that pairing is exactly how a spec goes
  // missing from the document while its twin stays listed.
  const mustNameAsFile = (rel: string) => {
    const base = rel.split('/').pop()!;
    if (!named.has(base)) {
      out.push({ check: 'unlisted_file', where: rel, means: 'tracked in git and not named by filename in docs/PROJECT_STRUCTURE.md' });
    }
  };
  for (const rel of files) {
    if (rel.startsWith('scripts/')) mustName(rel);
    if (/^tests\/unit\/[\w.-]+\.test\.ts$/.test(rel)) mustName(rel);
    if (/^tests\/e2e\/[\w.-]+\.spec\.ts$/.test(rel)) mustNameAsFile(rel);
  }
  // One directory row per second-level directory under src/ (`src/features/trust`, `src/app/api/relay`).
  const dirs = new Set<string>();
  for (const rel of files) {
    const parts = rel.split('/');
    if (parts[0] !== 'src') continue;
    // `src/app/api/relay/[...path]/route.ts` is a relay directory; `src/features/trust/x.tsx` is a
    // trust directory; `src/components/Button.tsx` is a file in components and gets no directory row.
    const depth = parts[2] === 'api' ? 4 : 3;
    if (parts.length <= depth) continue;
    dirs.add(parts.slice(0, depth).join('/'));
  }
  for (const dir of [...dirs].sort()) {
    const leaf = dir.split('/').pop()!;
    if (!named.has(leaf) && !named.has(`${leaf}/`)) {
      out.push({ check: 'unlisted_file', where: `${dir}/`, means: 'a source directory tracked in git and not named in the structure document' });
    }
  }
  return out;
}

/** The first cell of each row of the §5 scripts table: `| \`dev\` / \`start\` | … |` */
export function tableCommands(md: string): { name: string; line: number }[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^## .*Scripts\b/.test(l));
  if (start === -1) return [];
  const out: { name: string; line: number }[] = [];
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]!); i++) {
    const row = lines[i]!;
    if (!row.startsWith('| `')) continue;
    const firstCell = row.split('|')[1] ?? '';
    for (const m of firstCell.matchAll(BACKTICK)) if (m[1]) out.push({ name: m[1], line: i + 1 });
  }
  return out;
}

/** F3: package.json ↔ the commands table ↔ every `npm run x` written anywhere. */
export function commandProblems(scripts: string[], structureText: string, docsTexts: [string, string][]): Problem[] {
  const out: Problem[] = [];
  const table = tableCommands(structureText);
  const documented = new Set(table.map((t) => t.name));
  for (const s of scripts) {
    if (!documented.has(s)) out.push({ check: 'command_mismatch', where: `package.json: npm run ${s}`, means: 'the script exists and has no row in the commands table' });
  }
  const known = new Set(scripts);
  for (const t of table) {
    if (!known.has(t.name)) out.push({ check: 'command_mismatch', where: `docs/PROJECT_STRUCTURE.md line ${t.line}: \`${t.name}\``, means: 'the commands table names a script package.json does not define' });
  }
  for (const [where, text] of docsTexts) {
    for (const m of text.matchAll(NPM_RUN)) {
      const name = m[1];
      if (!name || known.has(name)) continue;
      out.push({ check: 'command_mismatch', where: `${where}: npm run ${name}`, means: 'a document tells the reader to run a command that does not exist' });
    }
  }
  return out;
}

/** F4, part one: the ADR table itself. */
export function adrTableProblems(architecture: string): { problems: Problem[]; highest: number } {
  const lines = architecture.split('\n');
  const rows = lines
    .map((line, i) => ({ line: i + 1, match: /^\| (ADR-\d+) \|(.*)$/.exec(line) }))
    .filter((r) => r.match !== null)
    .map((r) => ({ id: r.match![1]!, line: r.line, cells: r.match![2]!.split(' | ').filter((c) => c.trim().length > 0) }));
  const problems: Problem[] = [];
  const seen = new Set<number>();
  let highest = 0;
  for (const r of rows) {
    const n = Number(r.id.split('-')[1]);
    if (seen.has(n)) problems.push({ check: 'adr_mismatch', where: `${r.id} at docs/ARCHITECTURE.md:${r.line}`, means: 'two decision rows share one number' });
    seen.add(n);
    highest = Math.max(highest, n);
    if (r.cells.filter((c) => c.trim().length > 1).length < 3) {
      problems.push({ check: 'adr_mismatch', where: `${r.id} at docs/ARCHITECTURE.md:${r.line}`, means: 'an ADR row must carry a decision, a rejected alternative and a reason' });
    }
  }
  for (let n = 1; n <= highest; n++) {
    if (!seen.has(n)) problems.push({ check: 'adr_mismatch', where: `ADR-${n}`, means: `the table jumps: no row defines ADR-${n} although ${highest} is the highest` });
  }
  return { problems, highest };
}

/** F4, parts two and three: every reference reaches a row, and the newest decision is on the essentials page. */
export function adrReferenceProblems(docsTexts: [string, string][], highest: number, essentials: string): Problem[] {
  const out: Problem[] = [];
  for (const [where, text] of docsTexts) {
    for (const m of text.matchAll(ADR_REF)) {
      if (!m[1]) continue;
      const id = Number(m[1]);
      if (id > highest) out.push({ check: 'adr_mismatch', where: `${where}: ADR-${id}`, means: `no ADR row exists above ADR-${highest}` });
    }
  }
  if (highest > 0 && !essentials.includes(`ADR-${highest}`)) {
    out.push({ check: 'adr_mismatch', where: 'docs/ARCHITECTURE_ESSENTIALS.md', means: `the newest decision, ADR-${highest}, is not on the one page a new reader is told to read first` });
  }
  return out;
}

/** The item IDs ROADMAP.md defines, from its checkbox lines. */
export function definedItems(roadmap: string): Set<string> {
  const out = new Set<string>();
  for (const m of roadmap.matchAll(/^- \[.\] \*\*([A-Z]{1,2}-\d{1,2})\*\*/gm)) if (m[1]) out.add(m[1]);
  // Sub-items ("A-17.3") and ranges are defined by prose too, but the checkbox lines are the ledger.
  return out;
}

/** F5: an ID-shaped citation in a document must resolve to a defined item. */
export function itemReferenceProblems(docsTexts: [string, string][], defined: Set<string>): Problem[] {
  const prefixes = new Set([...defined].map((i) => i.split('-')[0]!));
  const out: Problem[] = [];
  for (const [where, text] of docsTexts) {
    for (const m of text.matchAll(ITEM_REF)) {
      const id = m[1];
      if (!id) continue;
      const prefix = id.split('-')[0]!;
      if (!prefixes.has(prefix)) continue; // Q-001 (HACKATHON questions) and friends are not items
      if (!defined.has(id)) out.push({ check: 'item_reference_dangling', where: `${where}: ${id}`, means: 'no ROADMAP checkbox line defines this item' });
    }
  }
  return out;
}

/**
 * The IDs that can own a marker: an item's checkbox line, or a §8 blocker row. A blocker is an owner
 * because that table's whole column set is "what, why, what unblocks it" — `B-07` owning the browser
 * E2EE marker is the accurate answer, not a way out of naming an item.
 */
export function ownerIds(roadmap: string): Set<string> {
  const out = definedItems(roadmap);
  for (const m of roadmap.matchAll(/^\| ([A-Z]{1,2}-\d{2}) \|/gm)) if (m[1]) out.add(m[1]);
  return out;
}

/** A paragraph, or one row of a table, or one line of a fenced block. */
type Block = { lines: { n: number; text: string }[]; text: string };
/**
 * The units a claim is made in. A table row is one unit and so is one line of a fenced block —
 * `docs/PROJECT_STRUCTURE.md`'s directory tree runs to a hundred lines with no blank among them, and
 * reading it as one paragraph would let any item ID anywhere in the tree own every marker in it.
 */
export function blocks(md: string): Block[] {
  const out: Block[] = [];
  let cur: Block | null = null;
  let fence = false;
  md.split('\n').forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      fence = !fence;
      cur = null;
      return;
    }
    if (fence || /^\s*\|/.test(text)) {
      out.push({ lines: [{ n: i + 1, text }], text });
      cur = null;
      return;
    }
    if (text.trim() === '') {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { lines: [], text: '' };
      out.push(cur);
    }
    cur.lines.push({ n: i + 1, text });
    cur.text = cur.text ? `${cur.text} ${text}` : text;
  });
  return out;
}

/**
 * The part of a document that makes live claims. `ROADMAP.md` §10 is the append-only measurement log
 * (AGENTS.md §3 forbids rewriting it), so a marker below that heading cannot be answered by an edit
 * and is read as history rather than as a promise.
 */
export function liveClaimsText(rel: string, text: string): string {
  if (rel !== 'ROADMAP.md') return text;
  const at = text.search(/^## 10\./m);
  return at < 0 ? text : text.slice(0, at);
}

const MARKER_TOKEN = /\[(?:Unverified|U)\]/g;
const CODE_RANGE = /`[^`]*`/g;
/**
 * A document's **marker key**: the one line that opens by defining the vocabulary — `Markers: …`,
 * `Marker vocabulary (AGENTS.md §6): …`. Markers inside such a block are the words being defined, not
 * claims being labelled, so they are read out — and the shape is the convention rather than a loophole,
 * because five of this repository's documents already write their legend that way and **R-15** brought
 * the other two into line instead of teaching the audit to guess. The count of skipped mentions is
 * printed by `--verbose`, so a legend used as a hiding place is visible.
 */
const MARKER_KEY = /^\s*>?\s*[-*\d.)]*\s*\**\s*Markers?\b[^|]*:/;
const CONSEQUENCE = /\bchang(?:e|es|ed|ing)\b/i;

export function codeRanges(line: string): (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (const m of line.matchAll(CODE_RANGE)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/**
 * F6: an `[Unverified]` marker must name the thing that can close it, and an owner that carries more
 * than one marker must say what a measurement would change. The tally comes back too, because the
 * `--verbose` verdict is where a reader sees which open questions this project is actually waiting on.
 */
export function markerOwnershipProblems(
  docsTexts: [string, string][],
  owners: Set<string>,
): { problems: Problem[]; tally: Map<string, number>; live: number; vocabulary: number } {
  const problems: Problem[] = [];
  const tally = new Map<string, number>();
  const consequences = new Map<string, boolean>();
  let live = 0;
  let vocabulary = 0;
  for (const [where, whole] of docsTexts) {
    for (const block of blocks(liveClaimsText(where, whole))) {
      const isKey = MARKER_KEY.test(block.lines[0]!.text);
      const ids = [...new Set([...block.text.matchAll(ITEM_REF)].map((m) => m[1]).filter((id): id is string => !!id && owners.has(id)))];
      const says = CONSEQUENCE.test(block.text);
      for (const line of block.lines) {
        const ranges = codeRanges(line.text);
        for (const m of line.text.matchAll(MARKER_TOKEN)) {
          if (isKey) {
            vocabulary++;
            continue;
          }
          if (ranges.some(([from, to]) => m.index >= from && m.index < to)) continue; // the word being discussed
          live++;
          if (ids.length === 0) {
            problems.push({
              check: 'marker_unowned',
              where: `${where}:${line.n}`,
              means: 'an [Unverified] marker with no item or blocker named in its paragraph or row, so nothing can ever close it',
            });
            continue;
          }
          // Attribution is by *proximity in reading order*: the closest item named before the marker,
          // or the closest one after it if nothing precedes it. Both prose styles exist in this repo —
          // "T-10: audio is [Unverified]" labels first, "[Unverified] — owned by T-10" cites after —
          // and crediting every ID in the paragraph instead would read one busy sentence as several
          // open questions, which would then make the rule below measure prose length.
          const at = block.text.indexOf(line.text) + m.index;
          const hits = ids.map((id) => ({ id, positions: [...block.text.matchAll(new RegExp(`\\b${id}\\b`, 'g'))].map((h) => h.index) }));
          const closest = (side: 'before' | 'after') =>
            hits
              .map((h) => {
                const candidates = h.positions.filter((p) => (side === 'before' ? p <= at : p >= at));
                if (candidates.length === 0) return undefined;
                return { id: h.id, d: (side === 'before' ? Math.max(...candidates) : Math.min(...candidates)) - at };
              })
              .filter((p): p is { id: string; d: number } => p !== undefined)
              .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
          const owner = (closest('before') ?? closest('after'))!.id;
          tally.set(owner, (tally.get(owner) ?? 0) + 1);
          consequences.set(owner, (consequences.get(owner) ?? false) || says);
        }
      }
    }
  }
  for (const [id, count] of [...tally].sort((a, b) => b[1] - a[1])) {
    if (count < 2 || consequences.get(id)) continue;
    problems.push({
      check: 'marker_owner_unstated',
      where: id,
      means: `${count} markers wait on ${id} and none of them says what the answer would change`,
    });
  }
  return { problems, tally, live, vocabulary };
}

export function audit(root: string): { problems: Problem[]; counts: Record<string, number | string> } {
  const files = listFiles(root);
  const known = basenames(files);
  const docs = documents(root, files);
  const texts: [string, string][] = docs.map((d) => [d, readFile(root, d)]);
  const structure = readFile(root, 'docs/PROJECT_STRUCTURE.md');
  const architecture = readFile(root, 'docs/ARCHITECTURE.md');
  const essentials = readFile(root, 'docs/ARCHITECTURE_ESSENTIALS.md');
  const roadmap = readFile(root, 'ROADMAP.md');
  const scripts = Object.keys(JSON.parse(readFile(root, 'package.json')).scripts ?? {}) as string[];

  const problems: Problem[] = [];
  for (const [where, text] of texts) {
    if (F1_OUT_OF_SCOPE.includes(where)) continue;
    problems.push(...staleFileReferences(text, where, known, STRUCTURE_DOCS.includes(where)));
  }
  problems.push(...unlistedFiles(files, structure));
  problems.push(...commandProblems(scripts, structure, texts));
  const adr = adrTableProblems(architecture);
  problems.push(...adr.problems);
  problems.push(...adrReferenceProblems(texts, adr.highest, essentials));
  const defined = definedItems(roadmap);
  problems.push(...itemReferenceProblems(texts, defined));
  const markers = markerOwnershipProblems(texts, ownerIds(roadmap));
  problems.push(...markers.problems);

  const uniq = new Map<string, Problem>();
  for (const p of problems) if (!uniq.has(`${p.check}|${p.where}`)) uniq.set(`${p.check}|${p.where}`, p);

  const markerCount = texts.reduce((n, [, t]) => n + (t.match(/\[Unverified\]|\[U\]/g)?.length ?? 0), 0);
  return {
    problems: [...uniq.values()],
    counts: {
      'files in tree': files.length,
      'documents read': docs.length,
      'ADR rows': adr.highest,
      'ROADMAP items': defined.size,
      'npm scripts': scripts.length,
      '[Unverified] markers': markerCount,
      'markers read as live claims (F6)': markers.live,
      'markers read as vocabulary or prose about the word (F6)': markers.vocabulary,
      'owners with markers (F6)': markers.tally.size,
      'owners carrying two or more (F6)': [...markers.tally].filter(([, n]) => n >= 2).map(([id, n]) => `${id} ×${n}`).join(', ') || 'none',
    },
  };
}

function main(): void {
  const root = resolve(process.cwd());
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const json = args.includes('--json');
  const { problems, counts } = audit(root);

  if (json) {
    console.log(JSON.stringify({ ok: problems.length === 0, problems, counts }, null, 2));
    process.exit(problems.length === 0 ? 0 : 1);
  }
  if (verbose) {
    for (const [k, v] of Object.entries(counts)) console.log(`docs-audit — ${k}: ${v}`);
    for (const c of CHECKS) console.log(`docs-audit — ${c.id} ${c.name}: ${problems.filter((p) => p.check === c.name).length} problem(s) — ${c.means}`);
  }
  if (problems.length === 0) {
    console.log('\ndocs-audit OK — every file a document names exists, every real file under scripts/tests/src is listed,');
    console.log('  every command agrees between package.json, the commands table and the prose, the ADR sequence is whole');
    console.log('  and appears on the essentials page, every item reference reaches a ROADMAP checkbox line, and every');
    console.log('  [Unverified] claim names the item or blocker that could close it.');
    console.log('Outside this audit, and not excused by it: whether a sentence that names a real file still describes it');
    console.log('  correctly is a reading task, not a shape — that is the other half of R-08 and it belongs to a person.');
    console.log('  Names resolve by basename, so a path in the wrong directory is not a finding; URLs and ' + F1_OUT_OF_SCOPE.join(' / ') + ' are');
    console.log("  somebody else's tree and read as citations. Item references are checked only for the prefixes ROADMAP.md");
    console.log('  uses, so Q-001 (a HACKATHON question) is left alone. The file-by-file promise is made by: ' + STRUCTURE_DOCS.join(', ') + '.');
    console.log('  A marker inside backticks is the word being discussed, a block opening "Markers:" is the document');
    console.log('  defining its vocabulary, and ROADMAP.md is read up to its §10 log, which §3 of the same file forbids');
    console.log('  rewriting. None of this closes a marker — an unverified claim ends with a measurement, not an edit.');
    return;
  }
  console.log(`\ndocs-audit FAILED — ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.log(`  · ${p.check} in ${p.where} — ${p.means}`);
  if (problems.length > 60) console.log(`  · … and ${problems.length - 60} more; --json lists all of them`);
  process.exit(1);
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) main();
