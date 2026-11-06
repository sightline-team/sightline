import { describe, expect, it } from 'vitest';
import {
  F1_OUT_OF_SCOPE,
  STRUCTURE_DOCS,
  adrReferenceProblems,
  adrTableProblems,
  audit,
  commandProblems,
  definedItems,
  itemReferenceProblems,
  listFiles,
  liveClaimsText,
  markerOwnershipProblems,
  ownerIds,
  staleFileReferences,
  tableCommands,
  unlistedFiles,
} from '../../scripts/docs-audit';

/**
 * Tests for the documentation consistency audit (items **R-08** and **R-15**).
 *
 * The two properties that matter, asserted rather than described: **each check fires on the drift it
 * names**, because a gate that has only ever printed OK has not been observed to reject anything
 * (F-11's lesson, repeated in R-03, R-06 and R-07), and **the checks do not fire on the ways a
 * document is allowed to talk about files** — a removed-file list, a hypothetical fixture invented
 * for a mutation run, a proper noun like `Next.js`, another organisation's `openapi.json`. The second
 * half is what keeps this gate honest: a docs check with false positives gets switched off inside a
 * week, and then the prose is unguarded again.
 */

const known = new Set(['spike.ts', 'roadmap-check.ts', 'reducer.ts', 'quote.ts', 'route.ts', 'cases.ts', 'ci.yml']);

/** The owners F6 accepts, spelled out here so a test does not depend on the live ledger. */
const owners = new Set(['S-03', 'T-10', 'B-07', 'P-09']);
const f6 = (md: string, where = 'docs/TEST.md') => markerOwnershipProblems([[where, md]], owners);
const found = (md: string, where?: string) => f6(md, where).problems;

describe('F1 — a document may not name a file that is gone', () => {
  it('fires on a stale module path in the tree', () => {
    const found = staleFileReferences('see `src/lib/session/old-name.ts` for the rule', 'docs/X.md', known, true);
    expect(found).toHaveLength(1);
    expect(found[0]!.check).toBe('stale_file_reference');
    expect(found[0]!.where).toContain('old-name.ts');
  });

  it('fires on a bare filename in a document whose subject is the tree', () => {
    expect(staleFileReferences('`photographs.ts` draws it', 'docs/PROJECT_STRUCTURE.md', known, true)).toHaveLength(1);
  });

  it('ignores a bare name elsewhere, because prose mentions other people', () => {
    // `page-4.jpg` is the file a mutation run invents and never commits; `openapi.json` is NEAR's.
    expect(staleFileReferences('an unkeyed `page-4.jpg` fails it', 'ROADMAP.md', known, false)).toEqual([]);
    expect(staleFileReferences('`src/lib/x.ts` is ours though', 'ROADMAP.md', known, false)).toHaveLength(1);
  });

  it('reads a foreign path as a citation and an omitted shorthand as a claim', () => {
    // `ts/model_verifier.ts` is a file inside nearai/nearai-cloud-verifier, not inside this tree.
    expect(staleFileReferences('the layout in `ts/model_verifier.ts`', 'ROADMAP.md', known, false)).toEqual([]);
    // …but a structure document's `page-1..3.jpg` names three files that are not that file.
    expect(staleFileReferences('the three JPEGs, `page-1..3.jpg`', 'docs/PROJECT_STRUCTURE.md', known, true)).toHaveLength(1);
    // A URL is another repository's tree too, however it is spelled.
    expect(staleFileReferences('see https://github.com/nearai/cloud-api/blob/main/policies/scope.json', 'README.md', known, true)).toEqual([]);
  });

  it('does not read a proper noun, a host or an environment convention as a path', () => {
    for (const line of [
      'Stack: TypeScript with Next.js and React 19.',
      'the fake host `near.ai.evil.example` is refused',
      'nothing secret starts with process.env.NEXT_PUBLIC_',
      '`.env` is ignored and `.env.example` is the template',
    ]) {
      expect(staleFileReferences(line, 'README.md', known, true), line).toEqual([]);
    }
  });

  it('honours the section whose entire job is listing what no longer exists', () => {
    const md = ['## 8. Removed from v0.1 (and why)', '', '| `check-csp.ts` | merged into a Playwright assertion |'].join('\n');
    expect(staleFileReferences(md, 'docs/PROJECT_STRUCTURE.md', known, true)).toEqual([]);
    const same_row_elsewhere = ['## 3. Scripts', '| `check-csp.ts` | does the thing |'].join('\n');
    expect(staleFileReferences(same_row_elsewhere, 'docs/PROJECT_STRUCTURE.md', known, true)).toHaveLength(1);
  });

  it('scopes itself out of the measurement log, and says why in the list', () => {
    expect(F1_OUT_OF_SCOPE).toEqual(['docs/SPIKE_RESULTS.md']);
    expect(STRUCTURE_DOCS).toContain('docs/PROJECT_STRUCTURE.md');
  });
});

describe('F2 — nothing real may be missing from the structure document', () => {
  const files = ['scripts/spike.ts', 'tests/unit/reducer.test.ts', 'tests/e2e/flow.spec.ts', 'src/features/trust/TrustReceipt.tsx', 'src/components/Button.tsx', 'src/app/api/relay/[...path]/route.ts'];

  it('fires when a script, a test or a source directory is not named', () => {
    const found = unlistedFiles(files, 'nothing here names anything at all');
    expect(found.map((f) => f.where)).toEqual([
      'scripts/spike.ts',
      'tests/unit/reducer.test.ts',
      'tests/e2e/flow.spec.ts',
      'src/app/api/relay/',
      'src/features/trust/',
    ]);
  });

  it('accepts a mention by stem, which is how the test lists are actually written', () => {
    const doc = 'unit: config, reducer, errors; e2e: flow.spec.ts; scripts/spike.ts; trust/ and relay/';
    expect(unlistedFiles(files, doc)).toEqual([]);
  });

  it('treats a file inside a listed directory as covered, and does not invent a directory for it', () => {
    // `src/components/Button.tsx` must not become a directory row called `Button.tsx/`.
    const doc = 'components/ with Button.tsx, and features/trust, api/relay';
    expect(unlistedFiles(files, doc).map((f) => f.where)).toEqual(['scripts/spike.ts', 'tests/unit/reducer.test.ts', 'tests/e2e/flow.spec.ts']);
  });

  it('looks only at the lists the document undertakes to keep', () => {
    // src/app routes, fixtures and node config are deliberately not enumerated file by file.
    expect(unlistedFiles(['src/app/page.tsx', 'fixtures/responses/document.json', 'tsconfig.json'], 'nothing')).toEqual([]);
  });

  it('will not let a spec hide behind the unit test that shares its stem', () => {
    const twin = ['tests/unit/image-prepare.test.ts', 'tests/e2e/image-prepare.spec.ts'];
    const only_the_unit = 'unit: image-prepare (C-01)…';
    expect(unlistedFiles(twin, only_the_unit).map((f) => f.where)).toEqual(['tests/e2e/image-prepare.spec.ts']);
    expect(unlistedFiles(twin, 'unit: image-prepare (C-01); e2e/image-prepare.spec.ts')).toEqual([]);
  });
});

describe('F3 — the commands table is the commands a reader can run', () => {
  const doc = [
    '## 4. Other tables',
    '| `ghost` | an unrelated table of the same shape |',
    '## 5. Scripts',
    '',
    '| Script | Purpose |',
    '|---|---|',
    '| `dev` | Run with the configured mode |',
    '| `build` / `start` | Production |',
    '| `release:secrets` | scans the object database |',
    '',
    '## 6. Build order',
    '| `late` | belongs to the next section, not the table |',
  ].join('\n');

  it('reads the scripts section only, and splits a packed cell', () => {
    expect(tableCommands(doc).map((c) => c.name)).toEqual(['dev', 'build', 'start', 'release:secrets']);
  });

  it('fires on a script with no row, a row with no script, and prose that tells a judge to run a command that does not exist', () => {
    const scripts = ['dev', 'build', 'start', 'test:watch'];
    const found = commandProblems(scripts, doc, [['README.md', 'run `npm run test:e2e` and `npm run dev`']]);
    expect(found.map((f) => f.where).sort()).toEqual([
      'README.md: npm run test:e2e',
      'docs/PROJECT_STRUCTURE.md line 9: `release:secrets`',
      'package.json: npm run test:watch',
    ]);
  });

  it('is satisfied by a table and a package.json that agree', () => {
    const tidy = doc.replace('| `release:secrets` | scans the object database |', '| `test:watch` | vitest in watch mode |');
    expect(commandProblems(['dev', 'build', 'start', 'test:watch'], tidy, [['README.md', 'npm run dev']])).toEqual([]);
  });
});

describe('F4 — the decision records are a whole sequence', () => {
  const good = [
    '| ID | Decision | Rejected | Reason |',
    '|---|---|---|---|',
    '| ADR-1 | one | other | because |',
    '| ADR-2 | two | other | because |',
    '| ADR-3 | three | other | because |',
  ].join('\n');

  it('reads a complete table without complaint and reports its highest number', () => {
    const { problems, highest } = adrTableProblems(good);
    expect(problems).toEqual([]);
    expect(highest).toBe(3);
  });

  it('fires on a gap, on a reused number, and on a row with no reason', () => {
    expect(adrTableProblems(good.replace('| ADR-2 | two | other | because |', '')).problems.map((p) => p.where)).toContain('ADR-2');
    expect(adrTableProblems(good.replace('ADR-3', 'ADR-1')).problems.map((p) => p.where)).toContain('ADR-1 at docs/ARCHITECTURE.md:5');
    const thin = good.replace('| ADR-3 | three | other | because |', '| ADR-3 | three |  |  |');
    expect(adrTableProblems(thin).problems.map((p) => p.means)).toContain('an ADR row must carry a decision, a rejected alternative and a reason');
  });

  it('fires on a reference above the table and on an essentials page that has not met the newest decision', () => {
    const problems = adrReferenceProblems([['docs/ARCHITECTURE.md', 'as **ADR-9** decided']], 3, 'ADR-1 and ADR-2 are summarised here');
    expect(problems.map((p) => p.where)).toEqual(['docs/ARCHITECTURE.md: ADR-9', 'docs/ARCHITECTURE_ESSENTIALS.md']);
  });

  it('accepts a reference at or below the highest row once essentials names it', () => {
    expect(adrReferenceProblems([['docs/ARCHITECTURE.md', 'as **ADR-2** decided']], 3, 'ADR-3 is the newest')).toEqual([]);
  });
});

describe('F5 — an item citation must reach an item', () => {
  const roadmap = ['- [x] **A-17** done', '- [ ] **R-08** pending', '- [!] **U-04** blocked', '- [x] **T-03** done'].join('\n');

  it('defines items only from checkbox lines', () => {
    expect([...definedItems(roadmap)]).toEqual(['A-17', 'R-08', 'U-04', 'T-03']);
  });

  it('fires on a citation to an item nobody created, and ignores other people', () => {
    const found = itemReferenceProblems([['README.md', 'see A-99, and HACKATHON Q-001, and ADR-12, and T-13']], definedItems(roadmap));
    expect(found.map((f) => f.where)).toEqual(['README.md: A-99', 'README.md: T-13']);
  });

  it('clears every citation the roadmap defines', () => {
    expect(itemReferenceProblems([['docs/PRD.md', 'owned by R-08 and A-17']], definedItems(roadmap))).toEqual([]);
  });
});

describe('F6 — an unverified claim must name what could close it', () => {
  it('fires on a marker no paragraph takes responsibility for, and clears when one does', () => {
    expect(found('The gateway signs the stream instead. [Unverified]').map((f) => f.where)).toEqual(['docs/TEST.md:1']);
    expect(found('The gateway signs the stream instead. [Unverified] — owned by S-03.')).toEqual([]);
  });

  it('accepts a blocker as an owner, because a blocker is the decision that closes the question', () => {
    expect(found('Browser E2EE [Unverified], waiting on B-07')).toEqual([]);
  });

  it('reads a marker inside backticks as the word, not a claim', () => {
    // Three of this repository's own rule sentences write it that way; the gate must not shout at prose.
    expect(found('Do not build on `[Unverified]` until its spike item is done.')).toEqual([]);
    expect(f6('Do not build on `[Unverified]` until its spike item is done.').live).toBe(0);
    expect(found('The `[U]` shorthand means still unknown.')).toEqual([]);
  });

  it('reads a marker key as a definition, including on the wrapped lines of the same paragraph', () => {
    const key = ['**Markers:** **[Verified]** = read in official docs.', '**[Unverified]** = to be checked, nothing more.'].join('\n');
    expect(found(key)).toEqual([]);
    expect(f6(key).vocabulary).toBe(1); // only the unverified shape is ever counted, and here it is a definition
    // The shape is a convention, not a loophole: the very next paragraph is read as a claim.
    expect(found([key, '', 'Tee speech is [Unverified] here.'].join('\n'))).toHaveLength(1);
  });

  it('does not let a table row hide behind a neighbour row, or behind the paragraph above it', () => {
    const md = ['A run of notes about S-03 and its measurements.', '', '| TEE text-to-speech | [Unverified], assume none |'].join('\n');
    expect(found(md).map((f) => f.where)).toEqual(['docs/TEST.md:3']);
  });

  it('credits the nearest item, so a paragraph naming three does not become three open questions', () => {
    const { tally } = f6('T-10: audio is [Unverified]. S-03: the refusal field is [Unverified].');
    expect([...tally]).toEqual([['T-10', 1], ['S-03', 1]]);
  });

  it('demands that an owner carrying two markers says somewhere what the answer would change', () => {
    const two = 'First [Unverified] (T-10). Second [Unverified] (T-10).';
    expect(found(two).map((f) => f.check)).toEqual(['marker_owner_unstated']);
    expect(found(`${two} Whether the enclave decrypts the payload changes which sentence claims.ts may show.`)).toEqual([]);
  });

  it('reads ROADMAP only up to the append-only log, and every other document in full', () => {
    const md = ['## 9. Something', '', 'a live claim [Unverified] (S-03)', '', '## 10. Log', '', 'a dated note [Unverified]'].join('\n');
    expect(f6(md, 'ROADMAP.md').live).toBe(1);
    expect(liveClaimsText('docs/PRD.md', md)).toBe(md);
  });

  it('takes blocker rows from the ledger as owners, not only checkbox lines', () => {
    const roadmap = ['- [x] **S-03** measured', '| B-07 | a dependency | T-10 | Human | 2026-11-02 | Open |'].join('\n');
    expect([...ownerIds(roadmap)].sort()).toEqual(['B-07', 'S-03']);
    expect(definedItems(roadmap)).toEqual(new Set(['S-03']));
  });
});

describe('the audit against this repository as it is committed', () => {
  const root = process.cwd();

  it('lists tracked files, not this laptop', () => {
    const files = listFiles(root);
    expect(files).toContain('scripts/docs-audit.ts');
    expect(files.filter((f) => f.startsWith('.next/'))).toEqual([]);
    expect(files.filter((f) => f === 'next-env.d.ts' || f.endsWith('tsbuildinfo'))).toEqual([]);
  });

  it('finds no problem, which is the assertion that makes the five checks a gate', () => {
    const { problems } = audit(root);
    expect(problems.map((p) => `${p.check} ${p.where}`)).toEqual([]);
  });
});
