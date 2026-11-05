#!/usr/bin/env tsx
/**
 * The secrets scan — item **R-06**.
 *
 * "No secrets in the repository" is a claim about **history**, not about the files that happen to
 * be in the tree now: a credential committed once and deleted in the next commit is still one
 * `git clone` away, and a credential in a *dangling* blob (an aborted `git add`) is still on this
 * machine and still readable with `git cat-file`. So this walks **every object in the object
 * database** — `--batch-all-objects`, which includes unreachable ones — not just reachable commits.
 *
 * The rules are credential *shapes*, chosen so a match is worth a human's attention: the vendor
 * prefixes that mean exactly one thing (GitHub, AWS, Slack, Google, Stripe, a JWT), the PEM
 * private-key banner, the `sk-…` form this project's own NEAR AI key actually has (measured shape:
 * `sk-` plus 32 characters of `[A-Za-z0-9_-]`; the value was never read into this file), and one
 * assignment rule for a secret-named field given a long value. Names carrying `public`, `hash`,
 * `sha`, `digest`, `signature` or `url` are excluded from the assignment rule by design: an
 * attestation report is *made of* public keys, and `compose_hash` is a value this repo stores on
 * purpose.
 *
 * **Nothing here prints a matched value.** A finding is a rule, a blob, a path, the commit that
 * carried it, and the **length** of the match. The tool that hunts secrets must not become the thing
 * that leaks one, and `tests/unit/secrets-scan.test.ts` asserts that property against a planted key
 * rather than trusting it.
 *
 * Three checks the pattern list alone would miss:
 *  - was a `.env*` file **ever added** (`git log --diff-filter=A`) — only the template may be;
 *  - does `.gitignore` still ignore the env shapes, so the next `git add .` stays safe;
 *  - does CI carry a credential — `.github/workflows/ci.yml` must hold no `secrets.` reference,
 *    because this project's CI runs with no key on purpose (F-12, B-08).
 *
 * What is **outside** this script's reach, said in the verdict rather than hidden: the key that
 * crossed into a conversation log on 2026-11-03 was never committed, so a clean scan here does not
 * close **B-11**. Rotation is a human action, and AGENTS.md §10 forbids rewriting **published**
 * history to make any of this prettier — which is why this tool scans unreachable objects instead
 * of pruning them, and why it never touches a ref, the reflog or a pack.
 *
 * One distinction this item had to learn by being refused. An unreachable object is not the same
 * thing as a *deleted* one: a blob left behind by a local `git commit --amend` stays in the object
 * database because the **reflog** still names the commit that carries it, so `--batch-all-objects`
 * sees it and this scan reports it — nine times, on the fixture file of this very script, whose
 * first version spelled its synthetic credentials out in full. What is prunable and what is not is
 * therefore a question about unpublished scratch (a superseded commit no clone has ever fetched,
 * recoverable only from the reflog) versus history other people already have. `git reflog expire
 * --expire=now refs/heads/main HEAD && git gc --prune=now` removes the first kind and moves no ref;
 * it is a deliberate command a human runs, not something this script does, and the ROADMAP entry
 * for any commit that needed it is where the act belongs.
 *
 * Usage: `npm run release:secrets` (exit 0 = every rule clean or exempted with a reason)
 *   -- --verbose   list every rule with its hit count, including the clean ones
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Rule {
  name: string;
  pattern: RegExp;
  /** Why a match is worth a human: what kind of thing this shape can only be. */
  means: string;
}

/** The alphabet a credential can live in, used by the assignment rule's value. */
const TOKEN_CHARS = 'A-Za-z0-9+/_=.-';

export const RULES: Rule[] = [
  { name: 'private_key_pem', pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, means: 'a PEM private key' },
  { name: 'github_token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, means: 'a GitHub token' },
  { name: 'aws_access_key_id', pattern: /\bAKIA[0-9A-Z]{16}\b/g, means: 'an AWS access key id' },
  { name: 'near_ai_key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g, means: 'the shape of this project\u2019s NEAR AI key' },
  { name: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, means: 'a Slack token' },
  { name: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, means: 'a Google API key' },
  { name: 'stripe_secret_key', pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g, means: 'a live Stripe key' },
  { name: 'bearer_jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, means: 'a JWT (three base64url segments)' },
  {
    name: 'secret_assignment',
    // A secret-named field given a long value on the same line. 24 characters is the only length
    // filter it needs: a real key is never shorter than that, and prose never reads both like a
    // secret's name and like this much entropy.
    pattern: new RegExp(
      `\\b(api[_-]?key|access[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|client[_-]?secret|session[_-]?secret|password|passwd|passphrase)(["'])?\\s*[:=]\\s*["']?([${TOKEN_CHARS}]{24,})`,
      'gi',
    ),
    means: 'a secret-named assignment with a long value',
  },
];

/** Names that denote something public or derived, so the assignment rule must not fire on them. */
export const ASSIGNMENT_EXEMPT_NAMES = /public|hash|sha256|digest|signature|cert|url|schema|kind/i;

/**
 * A value that **begins with a dotted lower-case identifier path** is a reference to a variable,
 * not a credential: `process.env.NEAR_AI_API_KEY`, `os.environ.SECRET_KEY`, `this.token.value`.
 * No issued key starts that way, because a key is an opaque string and never an expression.
 *
 * This is a precision fix, not a weakening, and it is tested as one: the fifteen matches that
 * first appeared when this ran over history were all of the form `API_KEY = process.env.…`, and
 * the test suite keeps a literal of exactly that shape green while a 32-character value assigned to
 * the same name still fires. The difference between the two is the whole question the rule asks.
 */
export const CODE_REFERENCE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+/;

export interface RawHit {
  rule: string;
  means: string;
  /** The length of the secret-shaped part. Never the text itself: see the file header. */
  length: number;
}

/** Which rules match this blob, with no content in the answer. */
export function scanContent(content: string): RawHit[] {
  const hits: RawHit[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(content)) !== null) {
      const value = rule.name === 'secret_assignment' ? (match[3] ?? '') : (match[0] ?? '');
      if (rule.name === 'secret_assignment') {
        if (ASSIGNMENT_EXEMPT_NAMES.test(match[0])) continue;
        if (CODE_REFERENCE.test(value)) continue;
      }
      hits.push({ rule: rule.name, means: rule.means, length: value.length });
      if ((match[0] ?? '').length === 0) rule.pattern.lastIndex += 1;
    }
  }
  return hits;
}

export interface Finding extends RawHit {
  sha: string;
  /** Where it lives: a tracked path, or `''` for an object no ref reaches. */
  path: string;
  /** Short sha of a commit that added or removed this blob, when one exists. */
  commit: string;
  /** True when no ref reaches the object — a place a removed secret hides. */
  unreachable: boolean;
}

export interface Exemption {
  rule: string;
  path: string;
  /** Required: why this is not a secret. An exemption without a reason is a blind spot. */
  because: string;
}

/**
 * Nothing to exempt yet, which is the honest state of a repository whose whole history was written
 * inside the hackathon window with one untracked `.env`. If a future measurement legitimately
 * matches a rule, it lands here with a reason and the scan keeps its teeth.
 */
export const EXEMPTIONS: Exemption[] = [];

export function isExempted(finding: Pick<Finding, 'rule' | 'path'>, exemptions: readonly Exemption[] = EXEMPTIONS): boolean {
  // An empty `path` would `endsWith` everything, so an exemption can never be written to cover the
  // whole repository, and it can never cover a dangling object either — those have no path at all.
  return exemptions.some((e) => e.path !== '' && e.rule === finding.rule && finding.path.endsWith(e.path));
}

const git = (args: string[], encoding: 'utf8' | 'buffer'): string | Buffer =>
  execFileSync('git', args, { encoding, maxBuffer: 512 * 1024 * 1024 });

/** sha → the first path it is known by, for reachable objects. Dangling blobs have none. */
function pathIndex(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of (git(['rev-list', '--objects', '--all'], 'utf8') as string).split('\n')) {
    const space = line.indexOf(' ');
    if (space < 0) continue;
    const sha = line.slice(0, space);
    if (!map.has(sha)) map.set(sha, line.slice(space + 1));
  }
  return map;
}

/**
 * Decode the `git cat-file --batch` framing: `<sha> <type> <size>\n` then exactly `size` bytes then
 * one newline. Reading it by **byte length** is the only way that survives a blob with no trailing
 * newline, or a JPEG whose bytes are not text; and a parser that quietly returns nothing would turn
 * this whole scan into a green light over an empty room, which is why it is exported and tested.
 *
 * `latin1` is deliberate: it maps bytes to characters one-to-one, so an ASCII credential shape is
 * found where it actually sits, inside binary content too.
 */
export function parseBatchStream(out: Buffer): { sha: string; content: string }[] {
  const blobs: { sha: string; content: string }[] = [];
  let cursor = 0;
  while (cursor < out.length) {
    const newline = out.indexOf(0x0a, cursor);
    if (newline < 0) break;
    const [sha = '', type = '', sizeText = ''] = out.subarray(cursor, newline).toString('utf8').split(' ');
    cursor = newline + 1;
    if (!/^[0-9a-f]{40,64}$/.test(sha)) continue; // not a frame header at all
    // `--batch` answers `<sha> missing` with no size and **no body** for an object that is gone
    // from the database. Treating that as a zero-length body would swallow the next frame's sha.
    if (type === 'missing' || sizeText === '') continue;
    const size = Number(sizeText);
    if (!Number.isFinite(size) || size < 0) continue;
    const body = out.subarray(cursor, cursor + size) as Buffer;
    cursor += size + 1; // the content is always followed by exactly one newline
    if (type === 'blob') blobs.push({ sha, content: body.toString('latin1') });
  }
  return blobs;
}

function everyBlob(): { sha: string; content: string }[] {
  return parseBatchStream(git(['cat-file', '--batch-all-objects', '--batch'], 'buffer') as Buffer);
}

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** The problems, phrased so a reader can act on them without seeing a secret. */
export function describeProblem(finding: Finding): string {
  const where = finding.unreachable ? `unreachable object ${finding.sha}` : `${finding.path} @ ${finding.commit || 'this tree'}`;
  return `${finding.rule} (${finding.means}, ${finding.length} chars) in ${where}`;
}

function main(): void {
  const verbose = process.argv.slice(2).includes('--verbose');
  const paths = pathIndex();
  const blobs = everyBlob();
  const counts = new Map<string, number>();
  const findings: Finding[] = [];

  for (const blob of blobs) {
    for (const hit of scanContent(blob.content)) {
      counts.set(hit.rule, (counts.get(hit.rule) ?? 0) + 1);
      const path = paths.get(blob.sha);
      findings.push({ ...hit, sha: blob.sha, path: path ?? '', commit: '', unreachable: path === undefined });
    }
  }

  const live = findings.filter((f) => !f.unreachable && !isExempted(f));
  const dangling = findings.filter((f) => f.unreachable && !isExempted(f));
  // Ask git which commit carried each real finding only now: one process per finding, never per blob.
  for (const finding of live) {
    const commits = (git(['log', '--all', '--format=%h', `--find-object=${finding.sha}`], 'utf8') as string).trim().split('\n');
    finding.commit = commits[0] ?? '';
  }

  const addedEnv = (git(['log', '--all', '--diff-filter=A', '--name-only', '--pretty=format:', '--', '.env', '.env.*'], 'utf8') as string)
    .split('\n')
    .map((line) => line.trim())
    .filter((p) => p !== '' && p !== '.env.example');
  const notIgnored = ['.env', '.env.local', '.env.production'].filter((p) => !isIgnored(p));
  // Read the workflow from **this repository's** tree, not from wherever the script happens to sit:
  // the first mutation run showed those two can be different directories, and a check that reads a
  // file in another repository is a check that reports on the wrong project. A missing workflow is
  // its own finding rather than an exception — CI is item F-12 and it is supposed to exist.
  const workflow = resolve(process.cwd(), '.github', 'workflows', 'ci.yml');
  const workflowMissing = !existsSync(workflow);
  const ciCarriesSecrets = !workflowMissing && /secrets\./.test(readFileSync(workflow, 'utf8'));

  const problems = [
    ...live.map(describeProblem),
    ...dangling.map(describeProblem),
    ...addedEnv.map((p) => `a credential file was added to history: ${p}`),
    ...notIgnored.map((p) => `${p} is not ignored by .gitignore`),
    ...(workflowMissing
      ? ['no `.github/workflows/ci.yml` to inspect — F-12 says CI exists, and it is meant to run with no credential']
      : ciCarriesSecrets
        ? ['`.github/workflows/ci.yml` references `secrets.` — CI is meant to run with no credential (F-12, B-08)']
        : []),
  ];

  console.log(`secrets-scan — ${blobs.length} blobs read from the object database, reachable and unreachable`);
  if (verbose) for (const rule of RULES) console.log(`  ${rule.name.padEnd(20)} ${counts.get(rule.name) ?? 0} match(es) — ${rule.means}`);
  console.log(`  env files ever added: ${addedEnv.length === 0 ? 'none (only .env.example, the template)' : addedEnv.join(', ')}`);
  console.log(`  env shapes ignored:   ${notIgnored.length === 0 ? '.env, .env.local, .env.production' : `NOT ${notIgnored.join(', ')}`}`);
  console.log(`  CI credential refs:   ${workflowMissing ? 'no workflow found' : ciCarriesSecrets ? 'present' : 'none'}`);
  console.log(`  unreachable objects:  ${new Set(dangling.map((d) => d.sha)).size} with a match (read here, never pruned by this script: an unreachable blob is usually a locally amended commit still held by the reflog, and pruning one moves no ref but is a decision, not a scan)`);

  if (problems.length > 0) {
    console.error(`\nR-06 FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  · ${problem}`);
    console.error('A match is reported as rule, path, commit and length only; this tool never prints what it found.');
    process.exit(1);
  }
  console.log(
    `\nR-06 OK — no credential shape in any object of this repository, no \`.env\` ever added beyond the template,` +
      `\n  every env shape ignored, and CI carries no secret reference.` +
      (EXEMPTIONS.length > 0 ? ` ${EXEMPTIONS.length} exemption(s), each with a reason.` : ''),
  );
  console.log(
    'Outside this scan, and not excused by it: the key that entered a conversation log on 2026-11-03 was never committed, so it is B-11\u2019s to rotate.',
  );
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) main();
