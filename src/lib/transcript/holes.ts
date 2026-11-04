/**
 * Sightline's own sentence for a page that yielded no text — and the rule that keeps that sentence
 * from being read as evidence (item **P-17**, the cost **ADR-27** accepted when it put the marker
 * **inside** the joined reading rather than beside it).
 *
 * ADR-27's decision was that a page which answered with nothing still occupies its place in the
 * transcript: the person hears which page is missing where it belonged, and the structure step sees
 * that part of the document is absent instead of concluding that four photographs were the whole of
 * it. The cost, recorded in the ADR, is that the transcript is now **not entirely the model's
 * reading of the paper** — one sentence in it is ours. `quoteFound` is an exact substring test
 * against that transcript (P-02, AGENTS.md §4 rule 8), so without anything here a model quoting our
 * own marker, or quoting across the hole it sits in, would be reported as **sourced**, and the screen
 * would say "these are the words it read" about words the page never carried. That is the one way this
 * project's grounding check can be made to affirm a sentence this project wrote.
 *
 * So grounding does not search `Transcript.text`; it searches `groundableText(text)`, which is the
 * same string with every marker replaced by the OBJECT REPLACEMENT CHARACTER, one mask character per
 * masked character:
 *  - the length is unchanged, so `pageOffsets` and `uncertain` spans keep pointing at the same places
 *    whether read against the transcript or against the groundable form;
 *  - the marker's own words are no longer present anywhere in what grounding searches, so a quote of
 *    the marker, of part of it, or of a run that spans the hole all fail the test rather than pass it;
 *  - a transcript with no hole is returned byte-identical, which is why the paste path (which has no
 *    markers at all, `Transcript.missingPages` being absent) behaves exactly as it did before.
 *
 * **The direction of the one false positive this cannot avoid is stated rather than glossed:** if a
 * document's own text happened to contain a line shaped like the marker, that line stops grounding too.
 * It fails toward rule 8 — a real quote gets flagged as unconfirmed — rather than toward a false claim,
 * and it needs a document that literally says "[page 3 could not be read]" for that to happen.
 *
 * This module lives in `lib/` rather than in `features/capture/` because both the capture feature
 * (which writes the marker, `features/capture/assemble.ts`) and the analysis feature (which must not
 * believe it) need it, and AGENTS.md §7 keeps features from importing each other.
 */

/** The words shown where a photographed page contributed nothing. `page` is 0-based, like every other page index in the app. */
export function unreadablePageMarker(page: number): string {
  return `[page ${page + 1} could not be read]`;
}

/** The marker carries a page number, so what grounding must find is this shape rather than one string. */
const MARKER_PATTERN = /\[page \d+ could not be read\]/g;

/** One per masked character, so the string's length and every offset in it survive. */
export const GROUNDING_MASK = '\uFFFC';

/** The text grounding is allowed to match against: the reading, with Sightline's own sentences masked out. */
export function groundableText(text: string): string {
  return text.replace(MARKER_PATTERN, (marker) => GROUNDING_MASK.repeat(marker.length));
}
