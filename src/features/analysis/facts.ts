import type { FactKind, KeyFact } from '@/types';

/**
 * How many facts the results screen lists (item **P-16**).
 *
 * Two numbers, one rule: **a short list is left exactly as it is, and a long one is collapsed by
 * kind rather than cut off at the end.**
 *
 * The measured case that made this an item (`docs/SPIKE_RESULTS.md` §4, and C-13's own recording):
 * one page of a synthetic bill returned **32 facts on glm and 33 on Qwen**, five pages of the *same*
 * bill returned **7 and 5**, and the three photographed pages recorded in `fixtures/responses/document.json`
 * came back with **86** — 84 of them line items, each labelled `Line 0NN example service N amount`,
 * every one quoting the transcript so `quoteFound` passed them all. Nothing in the pipeline can see
 * that: the length is neither bounded nor stable, and a screen reader reads every fact as
 * label-value-quote, so 86 of them are minutes of audio about one number per line.
 *
 * Why collapse **by kind** and not take the first N: the recorded 86 also holds the invoice reference
 * (`NC-0000-SYN`) and a page indicator. A plain `slice(0, 12)` would spend every slot on the first
 * twelve line items and hide the reference — and the reference is the thing `fixtures/responses/qa`
 * proves a person asks about. A per-kind limit keeps one of every kind the model named and throws
 * away only the repetition, which is the actual wall of audio.
 *
 * Why 12 and 3: 12 is above every measured summarising run (5–7 for five pages, 4 in each authored
 * demo case), so a well-behaved answer is never truncated and this feature is invisible in the normal
 * case; and 12 is above the eight `FactKind` values, so the per-kind pass can give every kind a slot
 * before any slot is spent twice. 3 is enough to hear that a kind repeats — the first two line items
 * plus the count sentence that names the other 81 says more than listening to them does.
 *
 * The one thing the cap never does is hide a flag: a fact whose `sourceQuote` could not be matched
 * (§4 rule 8) is listed whatever the cost to the total, because the sentence below the list points at
 * "these facts above" and that pointer has to stay true.
 */

/** Listed at most once the list is long enough to need collapsing. */
export const FACTS_PER_KIND = 3;

/** Listed at most, except that unflagged-by-grounding facts are never held back. */
export const FACTS_SHOWN_MAX = 12;

/**
 * Which kinds get a slot first when the per-kind pass cannot give every kind all three. Ordered by
 * what a person is most likely to act on or be harmed by: a dose, then a sum of money, then a date.
 * `other` is last on purpose — the enumeration case (`Page indicator`, and any line item the model
 * declined to class) is exactly what should not fill the list.
 */
export const FACT_KIND_PRIORITY: readonly FactKind[] = [
  'medication',
  'dose',
  'amount',
  'date',
  'phone',
  'reference',
  'address',
  'other',
];

export interface FactPlan {
  /** What the screen lists. In the model's own order, so the reading follows the document. */
  shown: KeyFact[];
  /** What the "show the other n facts" control reveals. Always grounded. */
  held: KeyFact[];
}

export function planFactList(facts: KeyFact[]): FactPlan {
  if (facts.length <= FACTS_SHOWN_MAX) return { shown: facts, held: [] };

  const chosen = new Set<number>();
  const perKind = new Map<FactKind, number>();
  const take = (index: number) => {
    const fact = facts[index];
    if (fact === undefined) return;
    chosen.add(index);
    perKind.set(fact.kind, (perKind.get(fact.kind) ?? 0) + 1);
  };

  // Pass 1, unconditional: every ungrounded fact is listed, even past the cap. Hiding a model problem
  // behind a disclosure control would be rule 8's failure mode with better manners.
  facts.forEach((fact, index) => {
    if (!fact.quoteFound) take(index);
  });

  // Pass 2: one of each kind, in priority order, so no kind the model named vanishes from the reading
  // before another kind is given its second or third line item.
  for (const kind of FACT_KIND_PRIORITY) {
    if (chosen.size >= FACTS_SHOWN_MAX) break;
    for (const [index, fact] of facts.entries()) {
      if (fact.kind === kind && !chosen.has(index)) {
        take(index);
        break;
      }
    }
  }

  // Pass 3: fill to FACTS_PER_KIND for each kind, in priority order, until the total runs out.
  for (const kind of FACT_KIND_PRIORITY) {
    if (chosen.size >= FACTS_SHOWN_MAX) break;
    for (const [index, fact] of facts.entries()) {
      if (chosen.size >= FACTS_SHOWN_MAX) break;
      if (fact.kind !== kind || chosen.has(index)) continue;
      if ((perKind.get(kind) ?? 0) >= FACTS_PER_KIND) continue;
      take(index);
    }
  }

  const shown: KeyFact[] = [];
  const held: KeyFact[] = [];
  facts.forEach((fact, index) => (chosen.has(index) ? shown : held).push(fact));
  return { shown, held };
}
