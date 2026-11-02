/**
 * Results view — placeholder until item **P-04** builds it.
 *
 * When it exists the section order is fixed (AGENTS.md §8): Summary → Key facts →
 * Actions → Warnings → Full text → Ask → Trust receipt, with a "Skip to full text"
 * link. Facts whose `quoteFound` is false are shown flagged or dropped, never
 * presented as sourced. No privacy sentence is written here (rule 1) — the receipt at
 * the end is rendered by `features/trust/TrustReceipt.tsx` from a computed claim.
 */
export default function ReadPage() {
  return (
    <>
      <h1>What Sightline read</h1>
      <p>Nothing is here yet. This view is built by roadmap item P-04.</p>
      <p className="muted">
        Once a document has been read, its summary, key facts, actions, warnings, full text and a
        way to ask a question appear here, in that order. Adding a document is item P-05.
      </p>
    </>
  );
}
