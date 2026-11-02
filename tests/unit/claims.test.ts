import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { CLAIM_COPY, FIXTURES_BANNER, claimCopy, claimFor, partialCopy } from '@/features/trust/claims';
import { E2EE_PROVEN_IN_BROWSER } from '@/lib/near-ai/e2ee';
import type { CheckResult, TrustRecord } from '@/types';

/**
 * The claims ladder, tested (**T-05**), and the mechanical half of AGENTS.md §4 rule 1.
 *
 * `claimFor` is the only place a privacy statement is decided, so this file is the guard
 * on the product's central claim. The three rungs and what earns them:
 *  - `e2ee_enclave` — needs a proven browser E2EE path. It is not proven, so no record
 *    shape may reach this rung (tested, and the flag itself is asserted).
 *  - `attested_model_signed_responses` — attestation verified **and** signature verified.
 *  - `partial` — everything else, including a hard failure. "Not verified" is the true
 *    statement for both, and rule 5 forbids dressing `partial` up as verified.
 *  - `fixtures` — Mode F, where nothing was sent to any enclave.
 *
 * The last describe block is the one that keeps rule 1 true as the UI grows: it walks the
 * source tree and fails if a privacy sentence is typed somewhere other than `claims.ts`.
 * A convention that is not checked is a convention that drifts.
 */

function check(name: string, ran: boolean, passed = false): CheckResult {
  return { name, ran, passed };
}

function record(over: Partial<TrustRecord> & Pick<TrustRecord, 'endpoint'>): TrustRecord {
  return {
    id: 't-1',
    purpose: 'analyse',
    model: 'Qwen/Test',
    requestId: 'chat-1',
    e2ee: false,
    attestation: { nonce: 'a'.repeat(64), fetchedAt: 0, checks: [check('attestation_report', true, true)], status: 'verified' },
    signature: { algo: 'ed25519', verified: true },
    claim: 'partial',
    ...over,
  };
}

describe('claimFor selects a rung from the record, not from the screen (rule 1)', () => {
  test('a fully verified, signed, non-E2EE record earns the middle rung', () => {
    expect(claimFor(record({ endpoint: 'relay' }))).toBe('attested_model_signed_responses');
    expect(claimFor(record({ endpoint: 'direct' }))).toBe('attested_model_signed_responses');
    expect(claimFor(record({ endpoint: 'gateway' }))).toBe('attested_model_signed_responses');
  });

  test('fixture data never earns a privacy rung at all', () => {
    // Even a record built to look fully verified, because in Mode F the checks did not run
    // against anything: the endpoint is the fact that decides.
    expect(claimFor(record({ endpoint: 'fixtures' }))).toBe('fixtures');
    expect(claimFor(record({ endpoint: 'fixtures', attestation: { nonce: '', fetchedAt: 0, checks: [], status: 'failed' } }))).toBe('fixtures');
  });

  test('e2ee:false can never yield the E2EE statement', () => {
    expect(claimFor(record({ endpoint: 'relay', e2ee: false }))).not.toBe('e2ee_enclave');
  });

  test('a record asserting e2ee is treated as the bug it is while the browser path is unproven', () => {
    expect(E2EE_PROVEN_IN_BROWSER).toBe(false);
    // The rung it actually earned, not the one it claims: attestation and signature were
    // verified, so the middle sentence is true; the strong one is not.
    expect(claimFor(record({ endpoint: 'direct', e2ee: true }))).toBe('attested_model_signed_responses');
  });

  test('partial attestation never becomes "verified"', () => {
    expect(claimFor(record({ endpoint: 'relay', attestation: { ...record({ endpoint: 'relay' }).attestation, status: 'partial' } }))).toBe('partial');
  });

  test('failed attestation is also not verified', () => {
    const base = record({ endpoint: 'relay' });
    expect(claimFor({ ...base, attestation: { ...base.attestation, status: 'failed' } })).toBe('partial');
  });

  test('an unverified signature blocks both strong rungs', () => {
    expect(claimFor(record({ endpoint: 'relay', signature: { algo: 'ed25519', verified: false } }))).toBe('partial');
    expect(claimFor(record({ endpoint: 'direct', e2ee: true, signature: { algo: 'ecdsa', verified: false } }))).toBe('partial');
  });

  test('a claim already sitting on the record does not decide the claim', () => {
    const wrongOnPurpose: TrustRecord = { ...record({ endpoint: 'relay' }), claim: 'fixtures' };
    expect(claimFor(wrongOnPurpose)).toBe('attested_model_signed_responses');

    const factsSayPartial: TrustRecord = {
      ...record({ endpoint: 'relay' }),
      attestation: { ...record({ endpoint: 'relay' }).attestation, status: 'partial' },
      claim: 'e2ee_enclave',
    };
    expect(claimFor(factsSayPartial)).toBe('partial');
  });
  test('Mode F records no checks ran and earns no privacy rung', () => {
    const base = record({ endpoint: 'relay' });
    const notRun: TrustRecord = {
      ...base,
      attestation: { ...base.attestation, status: 'not_run', checks: [] },
    };
    // A relay deployment that somehow recorded `not_run` still gets no rung — the status is
    // not a licence to say "verified", and it is not Mode F either (no banner would show).
    expect(claimFor(notRun)).toBe('partial');
    const fixtureVersion: TrustRecord = { ...notRun, endpoint: 'fixtures' };
    expect(claimFor(fixtureVersion)).toBe('fixtures');
  });

  // The stronger half of this guarantee is at compile time and cannot be shown as an
  // assertion: `claimFor` takes `ClaimInput = Omit<TrustRecord, 'claim'>`, so writing
  // `claimFor({ ...facts, claim: 'e2ee_enclave' })` as a fresh literal is a tsc error.
  // That is what stops a screen from pre-seeding the sentence it would rather say.
});

describe('the sentence for each rung is exactly the ladder copy (PRD §8)', () => {
  test('claimCopy returns the ladder verbatim for the rungs that have fixed text', () => {
    expect(claimCopy('attested_model_signed_responses', [])).toBe(CLAIM_COPY.attested_model_signed_responses);
    expect(claimCopy('fixtures', [])).toBe('Demo data. No real privacy guarantee.');
    expect(claimCopy('e2ee_enclave', [])).toBe(CLAIM_COPY.e2ee_enclave);
  });

  test('the fixtures banner is the same string, not a second copy of it', () => {
    expect(FIXTURES_BANNER).toBe(CLAIM_COPY.fixtures);
  });

  test('partial has no fixed sentence: it is generated from the checks', () => {
    const checks = [check('attestation_report', true, true), check('quote_consistency', true, false), check('gpu_tee', false)];
    const copy = partialCopy(checks);
    expect(copy).toContain('Partly checked, not verified');
    expect(copy).toContain('1 did not pass');
    expect(copy).toContain('1 could not run');
    expect(copy).toContain('1 of 3 checks passed');
    expect(copy).not.toMatch(/\battestation\b|\bTEE\b|\bnonce\b|quote_consistency/i);
  });

  test('rule 5: the partial sentence says not verified and is never a strong rung', () => {
    const checks = [check('a', true, false)];
    const copy = claimCopy('partial', checks);
    expect(copy).toContain('not verified');
    expect(copy).not.toBe(CLAIM_COPY.attested_model_signed_responses);
    expect(copy).not.toBe(CLAIM_COPY.e2ee_enclave);
  });

  test('claimCopy for partial uses the record checks, so the words cannot outrun the facts', () => {
    const copy = claimCopy('partial', [check('a', true, true), check('b', true, true), check('c', true, true)]);
    expect(copy).toContain('3 of 3 checks passed');
    expect(copy).toContain('not verified');
  });
});

describe('AGENTS.md §4 rule 1 enforced by walking the tree', () => {
  const CLAIMS_FILE = path.join('src', 'features', 'trust', 'claims.ts');

  /** Relative paths, so the exclusion below matches and a failure names a readable file. */
  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(path.join(process.cwd(), dir))) {
      const full = path.join(dir, entry);
      if (statSync(path.join(process.cwd(), full)).isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(full)) out.push(full);
    }
    return out;
  }

  const files = [...sourceFiles('src'), 'README.md'];

  /** Phrases that state a privacy or data-flow guarantee. Only `claims.ts` may write them. */
  const PRIVACY_PHRASES = [
    'Only the verified private enclave can read',
    'proven to come from it',
    'No real privacy guarantee',
    'nothing was sent',
    'only the enclave can read',
    'not stored on our servers',
    'encrypted before it leaves',
  ];

  test('the scan covers the app source and the README', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(CLAIMS_FILE);
    expect(files).toContain('README.md');
  });

  for (const phrase of PRIVACY_PHRASES) {
    test(`"${phrase}" appears nowhere outside claims.ts`, () => {
      const offenders = files
        .filter((f) => f !== CLAIMS_FILE)
        .filter((f) => readFileSync(path.join(process.cwd(), f), 'utf8').toLowerCase().includes(phrase.toLowerCase()));
      expect(offenders, `privacy sentence found in ${offenders.join(', ')}`).toEqual([]);
    });
  }
});
