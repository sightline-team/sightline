/**
 * Grounding (item **P-02**).
 *
 * What this proves and what it does not is a product requirement, not an
 * implementation detail (AGENTS.md §4 rule 8, `docs/ARCHITECTURE.md` §10):
 * `quoteFound: true` means the quoted words appear in **our transcript**. It says
 * nothing about whether the transcript matches the page — a model that misreads "£840"
 * as "£8400" and then quotes its own misreading passes this check perfectly. The README
 * has to say that out loud (R-04), and the only thing that closes the gap is the P1
 * numeric re-check (T-11), built only if the spike shows numeric misreads.
 *
 * So this function is a consistency check, and it is set by code, never by the model
 * (ADR-11).
 *
 * **And it is a check against the reading, not against Sightline's own sentences** (**P-17**): ADR-27
 * puts `[page n could not be read]` inside a joined transcript so the person can hear which photograph
 * is missing, which means the text the model quotes from now holds one line the paper never carried.
 * Matching goes through `groundableText` (`lib/transcript/holes.ts`), which masks those markers to the
 * same length, so a quote of the marker, of part of it, or of a run spanning the hole fails instead of
 * passing. A pasted document has no markers, so nothing about it changes.
 */

import { groundableText } from '@/lib/transcript/holes';

/** Exact substring test against the transcript. No fuzzy matching: a near-miss quote is a flag, not a pass. */
export function quoteFound(transcript: string, sourceQuote: string): boolean {
  if (sourceQuote.length === 0) return false;
  return groundableText(transcript).includes(sourceQuote);
}

/**
 * Attach `quoteFound` to every fact, action and answer. Facts that fail are kept in the
 * data with the flag set — dropping them silently would hide a model problem from the
 * user; presenting them as sourced would be a false claim. The view decides how to show
 * them (P-04: flagged, never as sourced).
 */
export function groundFacts<T extends { sourceQuote: string }>(transcript: string, items: T[]): (T & { quoteFound: boolean })[] {
  return items.map((item) => ({ ...item, quoteFound: quoteFound(transcript, item.sourceQuote) }));
}
