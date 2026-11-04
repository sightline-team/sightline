import { describe, expect, it } from 'vitest';
import { groundFacts, quoteFound } from '@/features/analysis/grounding';
import { GROUNDING_MASK, groundableText, unreadablePageMarker } from '@/lib/transcript/holes';

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

describe('a quote that lands on Sightline\'s own marker is not grounded (P-17, ADR-27)', () => {
  // The joined photo transcript is verbatim *except* for the line ADR-27 puts in where a page yielded
  // nothing. If that line could ground a quote, the screen would say "these are the words it read"
  // about words this app wrote — the one way rule 8 can be broken from inside our own code.
  const WITH_HOLE = ['Amount due: £840', unreadablePageMarker(1), 'NHS number 943 476 1989'].join('\n\n');

  it('refuses the whole marker', () => {
    expect(quoteFound(WITH_HOLE, unreadablePageMarker(1))).toBe(false);
  });

  it('refuses part of the marker, which is how a model tends to quote a note it has seen', () => {
    expect(quoteFound(WITH_HOLE, 'could not be read')).toBe(false);
    expect(quoteFound(WITH_HOLE, '[page 2 could not be read]')).toBe(false);
  });

  it('refuses a run that quotes across the hole, because those words were never adjacent on the paper', () => {
    expect(quoteFound(WITH_HOLE, `Amount due: £840\n\n${unreadablePageMarker(1)}`)).toBe(false);
  });

  it('still grounds the real pages on either side of the hole', () => {
    expect(quoteFound(WITH_HOLE, 'Amount due: £840')).toBe(true);
    expect(quoteFound(WITH_HOLE, 'NHS number 943 476 1989')).toBe(true);
  });

  it('masks every hole in the document, not just the first', () => {
    const twoHoles = [unreadablePageMarker(0), 'Amount due: £840', unreadablePageMarker(2)].join('\n\n');
    expect(groundFacts(twoHoles, [{ sourceQuote: 'Amount due: £840' }, { sourceQuote: 'could not be read' }])).toEqual([
      { sourceQuote: 'Amount due: £840', quoteFound: true },
      { sourceQuote: 'could not be read', quoteFound: false },
    ]);
  });

  it('leaves a transcript with no hole byte-identical, which is what the paste path depends on', () => {
    expect(groundableText(TRANSCRIPT)).toBe(TRANSCRIPT);
    expect(groundableText(WITH_HOLE)).toBe(WITH_HOLE.replace(unreadablePageMarker(1), GROUNDING_MASK.repeat(unreadablePageMarker(1).length)));
  });

  it('keeps the length, so pageOffsets and uncertain spans mean the same thing in both forms', () => {
    expect(groundableText(WITH_HOLE).length).toBe(WITH_HOLE.length);
  });

  it('fails toward rule 8 when a document genuinely carries the marker shape as its own text', () => {
    // Stated as behaviour, not as a bug: a letter that literally prints "[page 3 could not be read]"
    // stops grounding that line. The wrong answer it can produce is a real quote flagged as unconfirmed,
    // never our sentence credited as the model's.
    expect(quoteFound('Form 7 says [page 3 could not be read] in the margin', 'Form 7 says')).toBe(true);
    expect(quoteFound('Form 7 says [page 3 could not be read] in the margin', '[page 3 could not be read]')).toBe(false);
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
