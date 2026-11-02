import { describe, expect, it } from 'vitest';
import { groundFacts, quoteFound } from '@/features/analysis/grounding';

/**
 * Grounding tests (P-02). The whole point of these is to pin down what `quoteFound: true`
 * does **not** mean, because the number one way this feature becomes a lie is a future reader
 * assuming it checks the document. It checks our transcript. Nothing more (AGENTS.md §4 rule 8).
 */
const TRANSCRIPT =
  'Northgate Care NHS Trust\nYour appointment: 14 March 2026 at 11:30\nAmount due: £840\nPlease bring your NHS number 943 476 1989';

describe('quoteFound is a consistency check against the transcript', () => {
  it('accepts a literal excerpt', () => {
    expect(quoteFound(TRANSCRIPT, 'Amount due: £840')).toBe(true);
  });

  it('accepts a partial phrase inside the transcript', () => {
    expect(quoteFound(TRANSCRIPT, '14 March 2026')).toBe(true);
  });

  it('rejects an empty quote — a fact with no excerpt is not sourced', () => {
    expect(quoteFound(TRANSCRIPT, '')).toBe(false);
  });

  it('rejects a quote the model rounded or reformatted', () => {
    // These four are the realistic model behaviours, not adversarial ones.
    expect(quoteFound(TRANSCRIPT, '£840.00')).toBe(false);
    expect(quoteFound(TRANSCRIPT, 'Amount due is £840')).toBe(false);
    expect(quoteFound(TRANSCRIPT, '840 pounds')).toBe(false);
    expect(quoteFound(TRANSCRIPT, '14/03/2026')).toBe(false);
  });

  it('rejects a quote that only differs by whitespace', () => {
    // Deliberate: a transcript that wrapped the line and a quote that did not are not the same
    // bytes. If this proves too strict in practice the fix is normalising both sides in one
    // place and saying so here — not loosening the claim the UI makes.
    expect(quoteFound(TRANSCRIPT, 'Amount due:  £840')).toBe(false);
    expect(quoteFound(TRANSCRIPT, 'Amount due:\n£840')).toBe(false);
  });

  it('is case sensitive, because a quote should be an excerpt not a paraphrase', () => {
    expect(quoteFound(TRANSCRIPT, 'AMOUNT DUE: £840')).toBe(false);
  });

  it('does not prove the transcript matches the page — the misread passes perfectly', () => {
    // This is the test that documents the limitation. The model misreads £840 as £8400 on the
    // photo; the transcript now contains £8400; the quote matches; quoteFound is true; the
    // number is still wrong. Only T-11 (numeric re-check) can catch that.
    const misread = TRANSCRIPT.replace('£840', '£8400');
    expect(quoteFound(misread, 'Amount due: £8400')).toBe(true);
  });

  it('handles a quote longer than the transcript', () => {
    expect(quoteFound('short', 'a much longer quoted passage')).toBe(false);
  });
});

describe('groundFacts sets the flag from code, never from the model', () => {
  it('marks every item it can find and keeps the ones it cannot', () => {
    const facts = [
      { sourceQuote: 'Amount due: £840' },
      { sourceQuote: 'Pay within 30 days' },
      { sourceQuote: 'Northgate Care NHS Trust' },
    ];
    const grounded = groundFacts(TRANSCRIPT, facts);
    expect(grounded.map((f) => f.quoteFound)).toEqual([true, false, true]);
  });

  it('never drops an ungrounded fact — hiding it silently would hide a model problem', () => {
    expect(groundFacts(TRANSCRIPT, [{ sourceQuote: 'invented by the model' }])).toHaveLength(1);
  });

  it('does not mutate the input items', () => {
    const facts = [{ sourceQuote: '£840' }];
    const grounded = groundFacts(TRANSCRIPT, facts);
    expect('quoteFound' in facts[0]!).toBe(false);
    expect(grounded[0]!.quoteFound).toBe(true);
  });

  it('carries the other fields through untouched', () => {
    const [out] = groundFacts(TRANSCRIPT, [{ sourceQuote: '£840', label: 'Amount', kind: 'amount' as const }]);
    expect(out).toEqual({ sourceQuote: '£840', label: 'Amount', kind: 'amount', quoteFound: true });
  });

  it('works on the empty list, which is what a refused document produces', () => {
    expect(groundFacts('', [])).toEqual([]);
  });
});
