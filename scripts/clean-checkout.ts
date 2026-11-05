#!/usr/bin/env tsx
/**
 * The clean-checkout proof — item **R-03**.
 *
 * "It works on my machine" is worth nothing in a hackathon whose reviewers screen the repository
 * with a coding agent and no API key (HACKATHON.md Q-012, Q-017). This script throws away this
 * laptop's advantage: it clones the **public URL anonymously**, installs from the lockfile alone,
 * and runs the committed tests against the throwaway checkout — with no `.env`, and therefore with
 * no credential anywhere near it (AGENTS.md §4 rule 11).
 *
 * What "fresh clone" is allowed to prove, stated exactly:
 *  - the **pushed** `main` is self-sufficient: `npm ci` from `package-lock.json` is enough, no
 *    hand-placed file, nothing that only exists in this working tree;
 *  - the two commands in README's quickstart (`npm ci`, `npm run dev:fixtures`) boot an app that
 *    completes the whole flow in fixtures mode;
 *  - the checkout carries no `.env`.
 *
 * What it cannot prove, and the script says so instead of implying it:
 *  - **nothing about a live mode.** The clone has no key on purpose, so every request the flow
 *    makes is replayed from `fixtures/` (ADR-8, S-11). The accuracy and privacy claims are C-10
 *    and B-12's, not this script's;
 *  - the browsers come from this machine's Playwright cache, so it proves *this* machine can run
 *    e2e, not that a phone can.
 *
 * The two assertions that decide pass or fail — the required spec files, and the shape of an
 * unacceptable checkout — are pure functions exported at the top and tested in
 * `tests/unit/clean-checkout.test.ts`, because a gate nobody has ever seen fail is not a gate.
 *
 * Usage: `npm run release:clean-checkout`
 *   -- --keep            leave the clone in place and print its path
 *   -- --url=<git url>   clone somewhere else (default: the public repository URL)
 *   -- --skip=e2e        skip the Playwright half (the clone + npm ci + vitest path only)
 *
 * Exits 0 only when the clone's `main` equals this working tree's `HEAD`: proving an commit that
 * was never pushed would be the most flattering kind of false report this project has spent two
 * weeks refusing to write.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_URL = 'https://github.com/sightline-team/sightline.git';

/**
 * The e2e files that together are "the full flow": the shell and its banner, the pasted document
 * end to end, the photographed document end to end, the two refusals, the paste cap, image
 * preparation, and the visual/contrast pass. A run that green-lights only some of them has not
 * run the flow, so the set is asserted rather than assumed.
 */
const REQUIRED_SPECS = [
  'shell.spec.ts',
  'flow.spec.ts',
  'capture.spec.ts',
  'photo-fixtures.spec.ts',
  'paste-cap.spec.ts',
  'image-prepare.spec.ts',
  'design.spec.ts',
];

export interface CheckoutAudit {
  /** Paths in the checkout whose basename is `.env` or `.env.<anything>`. */
  envFiles: string[];
}

/**
 * `.env.example` is the documented template and is tracked on purpose; a real `.env` in a fresh
 * clone means one was committed, which is R-06's worst case arriving through R-03's door.
 */
export function envFileViolations(audit: CheckoutAudit): string[] {
  return audit.envFiles
    .filter((path) => !path.endsWith('.env.example'))
    .map((path) => `the fresh clone contains ${path} — a credential file reached the repository`);
}

export interface ProofReport {
  /** Test counts as Playwright reported them. */
  passed: number;
  failed: number;
  skipped: number;
  /** Basenames of the spec files that produced at least one test line. */
  specs: string[];
}

/** The problems that make the run not-a-proof. Empty means every beat ran and nothing failed. */
export function proofProblems(report: ProofReport, required: readonly string[] = REQUIRED_SPECS): string[] {
  const problems: string[] = [];
  if (report.failed > 0) problems.push(`${report.failed} e2e test(s) failed in the clean checkout`);
  if (report.passed === 0) problems.push('no e2e test ran — a suite that collected nothing proves nothing');
  for (const spec of required) {
    if (!report.specs.includes(spec)) problems.push(`${spec} produced no test line, so the flow was not fully exercised`);
  }
  return problems;
}

/** The counts Playwright prints at the end ("139 passed", "2 skipped"), and the specs it named. */
export function parsePlaywrightOutput(stdout: string): ProofReport {
  // The *last* mention of each label wins: the summary line comes after every test line, and a
  // test name containing the word "passed" would otherwise be read as a count.
  const count = (label: string): number => {
    const hits = stdout.match(new RegExp(`(\\d+)\\s+${label}\\b`, 'g'));
    const last = hits?.[hits.length - 1] ?? '';
    return Number(/(\d+)/.exec(last)?.[1] ?? 0);
  };
  const specs = new Set<string>();
  for (const line of stdout.split('\n')) {
    const match = /tests\/e2e\/([^\\/\s:]+\.spec\.ts):/.exec(line);
    if (match?.[1]) specs.add(match[1]);
  }
  return { passed: count('passed'), failed: count('failed') + count('error'), skipped: count('skipped'), specs: [...specs] };
}

interface Step {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  /** Print the whole output when the step fails (default) or always. */
  quiet?: boolean;
}

/** Run a step, streaming its output so a four-minute install is not silence, and keep it for parsing. */
function run({ command, args, cwd, env, quiet }: Step): Promise<{ code: number; stdout: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, {
      cwd,
      // Colour is turned off because the output is parsed afterwards and the counts are printed as
      // evidence; an ANSI escape inside "139 passed" makes both jobs worse.
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    const collect = (chunk: Buffer): void => {
      stdout += chunk.toString();
      if (!quiet) process.stdout.write(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => done({ code: code ?? 1, stdout }));
  });
}

const step = (label: string): void => void console.log(`\n=== ${label} ===`);

function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });
}

/**
 * Nothing may already be answering on the port the clone is about to use. This is not formality:
 * with a fixed 3100 and a developer's own dev server already on it, Playwright's `webServer.url`
 * poll would be satisfied by **that** server and the suite would silently test this laptop instead
 * of the clone. A refused connection is the only acceptable answer here.
 */
async function assertPortVacant(port: number): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    throw new Error(`port ${port} is already answering (HTTP ${response.status}) — the e2e run would test that server, not the clone`);
  } catch (error) {
    if ((error as Error).message.includes('already answering')) throw error;
  }
}

/** `.env*` anywhere in the checkout, and the tracked list, which is what a reviewer's clone really holds. */
function auditCheckout(dir: string): CheckoutAudit {
  const tracked = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((p) => /(^|\/)\.env(\.|$)/.test(p));
  const onDisk = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /^\.env(\.|$)/.test(e.name))
    .map((e) => e.name);
  return { envFiles: [...new Set([...tracked, ...onDisk])] };
}

function main(): void {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const keep = argv.includes('--keep');
  const url = flag('url') ?? REPO_URL;
  const skipE2e = (flag('skip') ?? '').split(',').includes('e2e');

  const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const root = mkdtempSync(join(tmpdir(), 'sightline-clean-'));
  const dir = join(root, 'sightline');

  console.log(
    `R-03 clean-checkout proof\n` +
      `  this HEAD:  ${localHead}\n` +
      `  clone from: ${url} (anonymous: no credential helper, no prompt)\n` +
      `  into:       ${dir}`,
  );

  void (async () => {
    const started = Date.now();
    try {
      step('1. anonymous fresh clone of main');
      const clone = await run({
        command: 'git',
        // `credential.helper=` is not paranoia: this machine's helper answers for a different
        // account than the one that pushes here, and an anonymous read of a public repo must look
        // like an anonymous read — that is what a logged-out reviewer does (R-11's same evidence).
        args: ['-c', 'credential.helper=', 'clone', '--depth', '1', '--single-branch', '--branch', 'main', url, dir],
        cwd: root,
        env: { GIT_TERMINAL_PROMPT: '0' },
        quiet: true,
      });
      if (clone.code !== 0) {
        console.log(clone.stdout);
        throw new Error('the public clone failed — R-11 says the repository must be reachable logged out');
      }
      const cloned = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      console.log(`  cloned main = ${cloned}`);
      if (cloned !== localHead) {
        throw new Error(
          `the clone is not this working tree (cloned ${cloned}, HEAD ${localHead}). ` +
            (cloned.startsWith(localHead.slice(0, 7)) || localHead.startsWith(cloned.slice(0, 7))
              ? 'Either the local commit is not pushed, or the remote has moved on.'
              : 'Push the commit you want proved, or prove the remote one by checking it out first.'),
        );
      }

      step('2. the checkout holds no credential file');
      const audit = envFileViolations(auditCheckout(dir));
      if (audit.length > 0) audit.forEach((m) => console.error(`  ${m}`));
      if (audit.length > 0) throw new Error('a credential file exists in the fresh clone');
      console.log('  no `.env` in the checkout; `.env.example` is the only env file, as designed.');

      step('3. npm ci (lockfile only — nothing already installed is allowed to help)');
      const ci = await run({ command: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: dir, quiet: true });
      process.stdout.write(ci.stdout.split('\n').slice(-4).join('\n'));
      if (ci.code !== 0) {
        console.log(ci.stdout);
        throw new Error('npm ci failed in the clean checkout — the lockfile is not sufficient on its own');
      }

      step('4. npm test (the committed unit / verification / relay suites)');
      const unit = await run({ command: 'npm', args: ['test', '--', '--reporter=dot'], cwd: dir, quiet: true });
      process.stdout.write(unit.stdout.split('\n').slice(-8).join('\n'));
      if (unit.code !== 0) {
        console.log(unit.stdout);
        throw new Error('npm test failed in the clean checkout');
      }

      let proof = 'e2e skipped with --skip=e2e';
      if (!skipE2e) {
        if (!existsSync(join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(process.env.HOME ?? '', '.cache', 'ms-playwright')))) {
          throw new Error('no Playwright browser cache on this machine — run `npx playwright install chromium` first');
        }
        const port = await freePort();
        await assertPortVacant(port);
        step(`5. the full flow in fixtures mode, in Chromium, on a server booted from the clone (port ${port})`);
        console.log('  CI=1 so the config boots its own `next dev` from this checkout instead of reusing a server.');
        const e2e = await run({
          command: 'npx',
          args: ['playwright', 'test'],
          cwd: dir,
          env: { CI: '1', E2E_PORT: String(port) },
          quiet: true,
        });
        const report = parsePlaywrightOutput(e2e.stdout);
        process.stdout.write(`${e2e.stdout.split('\n').slice(-12).join('\n')}\n`);
        console.log(`  e2e: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped across ${report.specs.length} spec files`);
        const problems = proofProblems(report);
        if (problems.length > 0) problems.forEach((m) => console.error(`  ${m}`));
        if (e2e.code !== 0 || problems.length > 0) {
          console.log(e2e.stdout.split('\n').slice(-120).join('\n'));
          throw new Error('the committed flow did not run end to end in the clean checkout');
        }
        proof = `${report.passed} passed, ${report.skipped} skipped across ${report.specs.length} spec files, no credential`;
      }

      const minutes = ((Date.now() - started) / 60000).toFixed(1);
      console.log(
        `\nR-03 PROVED (${minutes} min) — cloned ${cloned.slice(0, 7)} anonymously, no \`.env\`, ` +
          `npm ci from the lockfile, ${skipE2e ? 'vitest green' : `vitest + e2e green: ${proof}`}.`,
      );
      console.log('Not claimed: any live mode (there is no key in this clone), any real device, any screen reader.');
      if (keep) console.log(`Clone kept at ${dir}`);
    } finally {
      if (!keep) rmSync(root, { recursive: true, force: true });
    }
    process.exit(0);
  })().catch((error: unknown) => {
    console.error(`\nR-03 NOT PROVED: ${(error as Error).message}`);
    if (keep) console.error(`Clone left at ${dir} for inspection.`);
    process.exit(1);
  });
}

/** Guarded so the unit test can import the two pure functions without starting a clone. */
if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) main();
