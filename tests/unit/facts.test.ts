import { describe, expect, it } from 'vitest';
import { FACTS_PER_KIND, FACTS_SHOWN_MAX, FACT_KIND_PRIORITY, planFactList } from '@/features/analysis/facts';
import { factKindSchema } from '@/features/analysis/schemas';
import type { FactKind, KeyFact } from '@/types';

/**
 * The results screen's fact list (item **P-16**). These tests exist because the shape they guard was
 * **measured, not imagined**: one page of a synthetic bill returned 32–33 facts, five pages of the same
 * bill returned 5–7, and the three photographed pages recorded in `fixtures/responses/document.json`
 * returned **86** — 84 of them line items, every one quoting the transcript so `quoteFound` passed them
 * all. A screen reader reads a fact as label-value-quote, so the pipeline's invisible case is the
 * person's two-minute wall of audio.
 *
 * What is pinned here, in order of how much it costs to get wrong: a short list is untouched (the demo
 * must not acquire a control it does not need); the reference survives (a plain `slice(0, n)` spends
 * every slot on the first line items and hides it); an ungrounded fact is never held back (rule 8's
 * flag has to be in the reading, not behind a disclosure); nothing is lost or doubled; and the order a
 * person hears is the document's, not the priority table's.
 */

const ALL_KINDS: FactKind[] = [...factKindSchema.options];

function fact(kind: FactKind, label: string, value = 'x'): KeyFact {
  return { kind, label, value, sourceQuote: `quote for ${label}`, quoteFound: true };
}

/** The recorded shape: 84 line-item amounts with a reference and a page indicator alongside. */
function recordedReading(): KeyFact[] {
  const amounts = Array.from({ length: 84 }, (_, i) =>
    fact('amount', `Line ${String(i + 1).padStart(3, '0')} example service ${(i % 4) + 1} amount`, `GBP ${i}`),
  );
  return [fact('reference', 'Reference', 'NC-0000-SYN'), fact('other', 'Page indicator'), ...amounts];
}

describe('a list that does not need help is left exactly as it is', () => {
  it('shows every fact when there are at most the cap of them', () => {
    const facts = Array.from({ length: FACTS_SHOWN_MAX }, (_, i) => fact('amount', `f${i}`));
    const plan = planFactList(facts);
    expect(plan.shown).toHaveLength(FACTS_SHOWN_MAX);
    expect(plan.held).toEqual([]);
  });

  it('leaves the demo-sized readings alone — five facts never become a truncated list', () => {
    // Measured: five pages of the same bill returned 7 and 5 facts. Both must reach the plain screen.
    for (const size of [4, 5, 7, 11]) {
      const facts = Array.from({ length: size }, (_, i) => fact(i % 2 === 0 ? 'amount' : 'date', `f${i}`));
      const plan = planFactList(facts);
      expect(plan.shown).toHaveLength(size);
      expect(plan.held).toEqual([]);
    }
  });

  it('truncates on the first fact past the cap, so the boundary is one rule not two', () => {
    const atTheCap = Array.from({ length: FACTS_SHOWN_MAX }, (_, i) => fact('amount', `f${i}`));
    expect(planFactList(atTheCap).held).toEqual([]);
    const onePast = [...atTheCap, fact('amount', 'one past')];
    expect(planFactList(onePast).held.length).toBeGreaterThan(0);
  });
});

describe('the recorded 86-fact reading', () => {
  const recorded = recordedReading();
  const plan = planFactList(recorded);

  it('lists a handful and names the rest', () => {
    expect(plan.shown.length).toBeLessThanOrEqual(FACTS_SHOWN_MAX);
    expect(plan.shown.length).toBeGreaterThan(FACTS_PER_KIND);
    expect(plan.held).toHaveLength(86 - plan.shown.length);
  });

  it('keeps the reference, which a plain first-N cut would have hidden', () => {
    // The other half of the demo proves a person asks for this value (fixtures/responses/qa), and it is
    // the only fact in the whole reading that identifies the matter.
    expect(plan.shown.map((f) => f.label)).toContain('Reference');
    expect(plan.held.map((f) => f.label)).not.toContain('Reference');
  });

  it('gives the line items at most FACTS_PER_KIND of a hearing', () => {
    expect(plan.shown.filter((f) => f.kind === 'amount')).toHaveLength(FACTS_PER_KIND);
  });

  it('collapses the repetition without losing a single fact', () => {
    expect([...plan.shown, ...plan.held].sort((a, b) => recorded.indexOf(a) - recorded.indexOf(b))).toEqual(recorded);
    expect(new Set([...plan.shown, ...plan.held]).size).toBe(recorded.length);
  });

  it('hears the facts in document order, not in the priority table order', () => {
    const indices = plan.shown.map((f) => recorded.indexOf(f));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe('what the cap never does', () => {
  it('never holds back a fact whose quote could not be matched, even past the cap', () => {
    // 20 facts, every one of them ungrounded: the cap would hide a model problem, so it does not apply.
    const facts = Array.from({ length: 20 }, (_, i) => ({ ...fact('amount', `f${i}`), quoteFound: false }));
    const plan = planFactList(facts);
    expect(plan.held).toEqual([]);
    expect(plan.shown.filter((f) => !f.quoteFound)).toHaveLength(20);
  });

  it('puts the ungrounded ones in the list even when they arrive after the cap is reached', () => {
    const facts = [
      ...Array.from({ length: 20 }, (_, i) => fact('amount', `line${i}`)),
      fact('date', 'Payment deadline'),
      { ...fact('phone', 'Fraud line'), quoteFound: false },
    ];
    const plan = planFactList(facts);
    expect(plan.shown.map((f) => f.label)).toContain('Fraud line');
    expect(plan.held.every((f) => f.quoteFound)).toBe(true);
  });

  it('never lets one kind crowd out another kind that exists', () => {
    // One kind with 30 facts, two kinds with one fact each, in an order that puts the crowd first.
    const facts = [...Array.from({ length: 30 }, (_, i) => fact('amount', `line${i}`)), fact('dose', 'Twice daily'), fact('medication', 'Amoxicillin')];
    const shown = planFactList(facts).shown.map((f) => f.kind);
    expect(shown).toContain('dose');
    expect(shown).toContain('medication');
  });
});

describe('the two numbers are a rule, not a preference', () => {
  it('respects the total cap when every kind is present and long', () => {
    const facts = ALL_KINDS.flatMap((kind) => Array.from({ length: 6 }, (_, i) => fact(kind, `${kind}-${i}`)));
    const plan = planFactList(facts);
    expect(plan.shown).toHaveLength(FACTS_SHOWN_MAX);
    // One of each kind first: with eight kinds and a cap of twelve, nothing may be missing.
    for (const kind of ALL_KINDS) expect(plan.shown.map((f) => f.kind)).toContain(kind);
  });

  it('gives every kind its three before any kind gets a fourth', () => {
    const facts = [
      ...Array.from({ length: 30 }, (_, i) => fact('amount', `a${i}`)),
      ...Array.from({ length: 30 }, (_, i) => fact('date', `d${i}`)),
    ];
    const plan = planFactList(facts);
    expect(plan.shown.filter((f) => f.kind === 'amount')).toHaveLength(FACTS_PER_KIND);
    expect(plan.shown.filter((f) => f.kind === 'date')).toHaveLength(FACTS_PER_KIND);
    expect(plan.shown).toHaveLength(FACTS_PER_KIND * 2);
  });

  it('knows every kind the schema can return, in a fixed order', () => {
    // A new `factKindSchema` value must join the priority table or the reading silently deprioritises it.
    expect([...ALL_KINDS].sort()).toEqual([...FACT_KIND_PRIORITY].sort());
    expect(new Set(FACT_KIND_PRIORITY).size).toBe(ALL_KINDS.length);
    expect(FACT_KIND_PRIORITY[FACT_KIND_PRIORITY.length - 1]).toBe('other');
  });

  it('sends the leftovers to the control in document order too', () => {
    const facts = Array.from({ length: 30 }, (_, i) => fact('other', `o${i}`));
    const plan = planFactList(facts);
    expect(plan.shown.map((f) => f.label)).toEqual(['o0', 'o1', 'o2']);
    expect(plan.held.map((f) => f.label)).toEqual(Array.from({ length: 27 }, (_, i) => `o${i + 3}`));
  });
});
