import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLedger } from '../../scripts/roadmap-check';

/**
 * Tests for the ROADMAP gate (item **F-11**).
 *
 * A gate that is only ever run against the one document it guards has never been *observed* to
 * reject anything, so every rule here is proven against a synthetic ledger that breaks exactly
 * that rule — plus one positive control that reads the real `ROADMAP.md`. The git half is not
 * tested here on purpose: it is about the repository, and `npm run roadmap:check -- --staged`
 * and CI exercise it where it lives.
 */

/** A minimal well-formed ledger. Each test breaks one thing in it. */
function ledger(
  items: string[],
  parts: { dashboard?: string; focus?: string; log?: string; blockers?: string } = {},
): string {
  const rows = parts.dashboard ?? '| Phase | Done | In progress | Blocked | Todo | Cut | Total (excl. cut) | % |\n|---|---|---|---|---|---|---|---|\n| F — Foundation | 1 | 0 | 0 | 1 | 0 | 2 | 50% |\n| **All P0 work** | **1** | | | | | **2** | **50%** |';
  return [
    '# ROADMAP',
    '',
    '## 1. Status dashboard',
    '',
    '<!-- progress:start -->',
    rows,
    '<!-- progress:end -->',
    '',
    '## 2. Current focus',
    '',
    parts.focus ?? '1. **F-01** and **F-02** are next. Blocker **B-01**.',
    '',
    '## 5. Readiness gates',
    '',
    '| 2 | Fixture demo | works | F-01 – F-02 |',
    '',
    '## 6. Phases and items',
    '',
    '### Phase F — Foundation',
    '',
    ...items,
    '',
    '## 8. Blockers and open decisions',
    '',
    '| ID | Item | Blocks | Owner | Opened | Status |',
    '|---|---|---|---|---|---|',
    parts.blockers ?? '| B-01 | D-07 | A-03 | Human | 2026-11-02 | Open |',
    '',
    '## 9. Risk watchlist (trigger → action)',
    '',
    '| Trigger | Action |',
    '|---|---|',
    '',
    '## 10. Update log (newest first; append at the top; never edit past entries)',
    '',
    parts.log ?? '- **2026-11-03 · agent · F-01 · summary · files · evidence: the test that runs it · none**',
  ].join('\n');
}

const DONE = '- [x] **F-01** scaffold. _Evidence:_ `vitest run` 20 passed.';
const TODO = '- [ ] **F-02** relay.';

describe('the gate accepts a well-formed ledger', () => {
  it('passes a synthetic ledger with nothing wrong in it', () => {
    const report = checkLedger(ledger([DONE, TODO]));
    expect(report.problems).toEqual([]);
    expect(report.items).toBe(2);
  });

  it('passes the real ROADMAP.md — the positive control that makes every rule above meaningful', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', '..', 'ROADMAP.md'), 'utf8');
    const report = checkLedger(text);
    expect(report.problems).toEqual([]);
    expect(report.logEntries).toBeGreaterThan(1);
  });

  it('excludes the §7 stretch items from the P0 totals, and from Phase X', () => {
    const withStretch = ledger([DONE, TODO]).replace(
      '## 8. Blockers',
      ['## 7. Stretch (only after Gate 5; excluded from the 100% total)', '', '- [ ] **Z-01** voice input.', '', '## 8. Blockers'].join('\n'),
    );
    const report = checkLedger(withStretch);
    // Six-ish stretch lines would otherwise be counted as Submission work and move the totals.
    expect(report.problems).toEqual([]);
    expect(report.items).toBe(3);
  });
});

describe('each rule is proven by a ledger that breaks it', () => {
  it('[x] with no Evidence line is rejected', () => {
    const report = checkLedger(ledger(['- [x] **F-01** scaffold. _Done when:_ it builds.', TODO]));
    expect(report.problems.join('\n')).toMatch(/F-01.*is \[x\] with no "Evidence:" line/);
  });

  it('an illegal status mark is rejected', () => {
    const report = checkLedger(ledger(['- [X] **F-01** scaffold. _Evidence:_ ok.', TODO]));
    expect(report.problems.join('\n')).toMatch(/illegal status "\[X\]"/);
  });

  it('a reused ID is rejected — the ID space is append-only', () => {
    const report = checkLedger(ledger([DONE, DONE]));
    expect(report.problems.join('\n')).toMatch(/F-01" is used twice/);
  });

  it('a cut item with no reason is rejected', () => {
    const report = checkLedger(ledger(['- [-] **F-01** scaffold.', TODO]));
    expect(report.problems.join('\n')).toMatch(/F-01" is \[-\] \(cut\) without a reason/);
  });

  it('a cut item with a reason is accepted and leaves the totals', () => {
    const report = checkLedger(
      ledger(
        ['- [-] **F-01** scaffold — cut: no vision model by 11-08.', TODO],
        { dashboard: '| Phase | Done | In progress | Blocked | Todo | Cut | Total (excl. cut) | % |\n|---|---|---|---|---|---|---|---|\n| F — Foundation | 0 | 0 | 0 | 1 | 1 | 1 | 0% |\n| **All P0 work** | **0** | | | | | **1** | **0%** |' },
      ),
    );
    expect(report.problems).toEqual([]);
  });

  it('a hand-edited dashboard that no longer matches the checkboxes is rejected', () => {
    const report = checkLedger(ledger([DONE, '- [x] **F-02** relay. _Evidence:_ relay.test.ts 5 passed.']));
    expect(report.problems.join('\n')).toMatch(/dashboard does not match the checkboxes/);
    // ...and --write is what fixes it: the computed block says two done.
    expect(report.dashboard).toContain('| F — Foundation | 2 | 0 | 0 | 0 | 0 | 2 | 100% |');
  });

  it('a phase with items and no dashboard row is rejected rather than silently omitted', () => {
    const withT = ledger([DONE, TODO]);
    const moved = withT.replace('## 8. Blockers', '### Phase T — Trust\n\n- [ ] **T-01** gate.\n\n## 8. Blockers');
    expect(checkLedger(moved).problems.join('\n')).toMatch(/no row for phase "T"/);
  });

  it('§2 naming an item that does not exist is rejected', () => {
    const report = checkLedger(ledger([DONE, TODO], { focus: '1. **F-01**, then **F-77**.' }));
    expect(report.problems.join('\n')).toMatch(/F-77, which is not an item/);
  });

  it('§2 naming a blocker is not mistaken for a missing item', () => {
    expect(checkLedger(ledger([DONE, TODO], { focus: '1. **F-01** is blocked by **B-01** and **B-99**.' })).problems).toEqual([]);
  });

  it('a §10 entry newer than the one above it is rejected — the log is prepended at the top', () => {
    const report = checkLedger(
      ledger([DONE, TODO], {
        log: ['- **2026-11-02 · agent · F-01 · s · f · evidence: e · none**', '- **2026-11-03 · agent · F-02 · s · f · evidence: e · none**'].join('\n'),
      }),
    );
    expect(report.problems.join('\n')).toMatch(/newer than the entry above it/);
  });

  it('a §10 entry with no evidence is rejected', () => {
    const noSeparators = ledger([DONE, TODO], { log: '- **2026-11-03 agent F-01 did a thing**' });
    expect(checkLedger(noSeparators).problems.join('\n')).toMatch(/no "·" separators/);
    const noEvidence = ledger([DONE, TODO], { log: '- **2026-11-03 · agent · F-01 · did a thing · src/x.ts**' });
    expect(checkLedger(noEvidence).problems.join('\n')).toMatch(/carries no evidence line/);
  });

  it('a blocker row with an empty column is rejected', () => {
    const report = checkLedger(ledger([DONE, TODO], { blockers: '| B-01 | D-07 | A-03 |  | 2026-11-02 | Open |' }));
    expect(report.problems.join('\n')).toMatch(/blocker "B-01" has an empty owner/);
  });

  it('a missing heading is reported rather than skipped', () => {
    const report = checkLedger(ledger([DONE, TODO]).replace('## 8. Blockers and open decisions', '## 8. Renamed away'));
    expect(report.problems.join('\n')).toMatch(/no longer has the heading/);
  });

  it('an item line outside any "### Phase" section is reported, not silently counted', () => {
    // F-02's checkbox moved up into §5: still a real item, but with no phase to belong to, so it
    // can neither be attributed to a phase row nor reach the totals unnoticed.
    const stray = ledger([DONE, TODO])
      .replace(`\n${TODO}`, '')
      .replace('## 6. Phases and items', `${TODO}\n\n## 6. Phases and items`);
    const problems = checkLedger(stray).problems.join('\n');
    expect(problems).toMatch(/outside any "### Phase" section/);
    expect(problems).toMatch(/no row for phase/);
  });
});
