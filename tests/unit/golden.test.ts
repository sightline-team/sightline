import { describe, expect, it } from 'vitest';
import {
  GOLDEN_BENCHMARK_CASES,
  evaluateGoldenCase,
  extractDigits,
  runGoldenBenchmark,
  verifyNumericMatch,
  type GoldenCase,
} from '@/../scripts/run-golden';

describe('Golden Set Accuracy Benchmark (C-09, C-10)', () => {
  it('defines 6 synthetic benchmark cases covering all required test categories', () => {
    expect(GOLDEN_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(6);
    const categories = GOLDEN_BENCHMARK_CASES.map((c) => c.category);
    expect(categories).toContain('printed_bill');
    expect(categories).toContain('financial_statement');
    expect(categories).toContain('medical_prescription');
    expect(categories).toContain('table_heavy');
    expect(categories).toContain('adversarial_injection');
    expect(categories).toContain('multi_page_photo');
  });

  it('runs the full benchmark suite with 100% expected fact recall on synthetic corpus', () => {
    const summary = runGoldenBenchmark();
    expect(summary.totalCases).toBe(GOLDEN_BENCHMARK_CASES.length);
    expect(summary.totalRecalledFacts).toBe(summary.totalExpectedFacts);
    expect(summary.overallRecallRate).toBe(100);
  });

  it('verifies numeric digits across all cases with 0 numeric misreads (T-11 trigger clean)', () => {
    const summary = runGoldenBenchmark();
    expect(summary.totalNumericFieldsTested).toBeGreaterThanOrEqual(20);
    expect(summary.totalNumericMisreads).toBe(0);
    expect(summary.t11TriggerFired).toBe(false);
    expect(summary.t11Decision).toContain('NOT FIRED');
  });

  it('flags near-miss quotes as ungrounded (rule 8 consistency check)', () => {
    const summary = runGoldenBenchmark();
    const riverside = summary.results.find((r) => r.caseId === 'case-2-riverside');
    expect(riverside).toBeDefined();
    // Riverside carries 1 authored near-miss quote to prove grounding catches it
    expect(riverside!.ungroundedFacts.length).toBe(1);
    expect(riverside!.ungroundedFacts[0]).toContain('Closing balance is £1,204.55');
  });

  describe('numeric verification logic', () => {
    it('extracts all digit sequences correctly', () => {
      expect(extractDigits('Invoice NC-2026-0441 for £840.50')).toEqual(['2026', '0441', '840.50']);
      expect(extractDigits('Account 1,234,5678')).toEqual(['12345678']);
      expect(extractDigits('No numbers here')).toEqual([]);
    });

    it('matches identical numeric values', () => {
      const res = verifyNumericMatch('£840 due by 14 March 2026', 'Amount: £840, Deadline: 14 March 2026');
      expect(res.match).toBe(true);
    });

    it('detects corrupted or misread digits and fires numeric misread error', () => {
      const res = verifyNumericMatch('Amount due: £840', 'Amount due: £84');
      expect(res.match).toBe(false);
      expect(res.expected).toEqual(['840']);
      expect(res.extracted).toEqual(['84']);
    });

    it('fires T-11 trigger when a numeric misread is introduced', () => {
      const corruptedCase: GoldenCase = {
        ...GOLDEN_BENCHMARK_CASES[0]!,
        analysis: {
          ...GOLDEN_BENCHMARK_CASES[0]!.analysis,
          facts: [
            { kind: 'amount', label: 'Amount due', value: '£84', sourceQuote: 'Amount due: £840' },
          ],
        },
      };

      const result = evaluateGoldenCase(corruptedCase);
      expect(result.numericMisreads).toBeGreaterThanOrEqual(1);

      const summary = runGoldenBenchmark([corruptedCase]);
      expect(summary.t11TriggerFired).toBe(true);
      expect(summary.t11Decision).toContain('TRIGGER FIRED');
    });
  });
});
