/**
 * `ResultsView` — item **P-04**.
 *
 * Section order is fixed by AGENTS.md §8 and must not drift, because a screen-reader
 * user learns the layout by position: Summary → Key facts (with quotes) → Actions →
 * Warnings → Full text → Ask → Trust receipt. Headings real, one "Skip to full text"
 * link, and a fact whose `quoteFound` is false is shown flagged — never as sourced.
 *
 * No privacy sentence is written in this file (AGENTS.md §4 rule 1); the receipt at the
 * end renders whatever `features/trust/claims.ts` computed.
 */
export function ResultsView() {
  return (
    <section aria-labelledby="results-heading">
      <h2 id="results-heading">What Sightline read</h2>
      <p>The results view is built by roadmap item P-04.</p>
    </section>
  );
}
