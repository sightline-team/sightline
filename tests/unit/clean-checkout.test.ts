import { describe, expect, it } from 'vitest';
import { envFileViolations, parsePlaywrightOutput, proofProblems } from '../../scripts/clean-checkout';

/**
 * Tests for the clean-checkout proof (item **R-03**).
 *
 * Same rule **F-11**'s tests follow: the parts of this script that decide pass-or-fail are proven
 * against synthetic inputs, because a release gate that has only ever been seen green has never
 * been observed to reject anything. The git/npm/Chromium half lives where it runs — the script
 * itself, whose real output is the evidence in `ROADMAP.md` §10.
 */

/** The tail of a list-reporter run over the seven flow specs, as Playwright prints it. */
const SAMPLE_RUN = [
  'Running 141 tests using 1 worker',
  '',
  '  ✓  1 [chromium] › tests/e2e/shell.spec.ts:24:5 › the header, banner and measure line up (1.2s)',
  '  ✓  2 [chromium] › tests/e2e/flow.spec.ts:40:5 › a pasted document reaches a receipt (9.4s)',
  '  ✓  3 [chromium] › tests/e2e/capture.spec.ts:31:5 › six photographs are refused before decode (3.1s)',
  '  ✓  4 [chromium] › tests/e2e/photo-fixtures.spec.ts:22:5 › a photographed document finishes in demo mode (12.0s)',
  '  ✓  5 [chromium] › tests/e2e/paste-cap.spec.ts:18:5 › the paste limit is stated before a request (0.9s)',
  '  ✓  6 [chromium] › tests/e2e/image-prepare.spec.ts:20:5 › EXIF and GPS are gone (1.4s)',
  '  ✓  7 [chromium] › tests/e2e/design.spec.ts:88:5 › both edges agree at 390 (2.2s)',
  '  -   8 [chromium] › tests/e2e/browser-cors.spec.ts:68:3 › the page makes the round trip itself',
  '',
  '  139 passed, 2 skipped (241.6s)',
].join('\n');

describe('the env-file audit of a fresh checkout', () => {
  it('accepts the tracked template and nothing else', () => {
    expect(envFileViolations({ envFiles: ['.env.example'] })).toEqual([]);
  });

  it('rejects a real `.env` that reached the repository', () => {
    const problems = envFileViolations({ envFiles: ['.env.example', '.env'] });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('.env');
  });

  it('rejects the local overrides too, and a nested one, naming each path', () => {
    const problems = envFileViolations({ envFiles: ['.env.local', 'deploy/.env.production'] });
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('deploy/.env.production');
  });
});

describe('reading Playwright output back as a proof', () => {
  it('takes the counts from the summary line and the specs from the test lines', () => {
    const report = parsePlaywrightOutput(SAMPLE_RUN);
    expect(report).toMatchObject({ passed: 139, failed: 0, skipped: 2 });
    // A skipped test still names its file, so `browser-cors.spec.ts` appears even though nothing of
    // it ran. `proofProblems` only asks about the required flow specs, so this stays a superset.
    expect(report.specs.sort()).toEqual([
      'browser-cors.spec.ts',
      'capture.spec.ts',
      'design.spec.ts',
      'flow.spec.ts',
      'image-prepare.spec.ts',
      'paste-cap.spec.ts',
      'photo-fixtures.spec.ts',
      'shell.spec.ts',
    ]);
  });

  it('reads the last mention of a count, so an earlier line cannot be mistaken for the summary', () => {
    const report = parsePlaywrightOutput(`${SAMPLE_RUN}\n  3 passed, 141 total\n`);
    expect(report.passed).toBe(3);
  });

  it('counts a failed test, and an internal error, as a failure', () => {
    expect(parsePlaywrightOutput('  2 failed\n  130 passed\n').failed).toBe(2);
    expect(parsePlaywrightOutput('  1 error\n  139 passed\n').failed).toBe(1);
  });

  it('reports nothing collected as zero passed rather than a crash', () => {
    const report = parsePlaywrightOutput('Running 0 tests using 1 worker\n\nNo tests found\n');
    expect(report).toEqual({ passed: 0, failed: 0, skipped: 0, specs: [] });
  });
});

describe('what stops the run being a proof', () => {
  const full = parsePlaywrightOutput(SAMPLE_RUN);

  it('accepts a green run that covered every flow spec', () => {
    expect(proofProblems(full)).toEqual([]);
  });

  it('names a flow spec that produced no test line', () => {
    const missing = { ...full, specs: full.specs.filter((s) => s !== 'photo-fixtures.spec.ts') };
    expect(proofProblems(missing)).toEqual([
      'photo-fixtures.spec.ts produced no test line, so the flow was not fully exercised',
    ]);
  });

  it('refuses a suite that collected nothing, even with no failures', () => {
    expect(proofProblems({ passed: 0, failed: 0, skipped: 0, specs: [] })).toContain(
      'no e2e test ran — a suite that collected nothing proves nothing',
    );
  });

  it('refuses a failing test before anything else is considered', () => {
    expect(proofProblems({ ...full, failed: 4 })).toEqual(['4 e2e test(s) failed in the clean checkout']);
  });
});
