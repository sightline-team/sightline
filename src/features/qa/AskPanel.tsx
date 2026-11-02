/**
 * `AskPanel` — item **P-06**.
 *
 * One labelled text field, one ask button, answers read in place with their quote or an
 * explicit "that is not in the document". `<output>`-style live region is **not** used
 * here: the single announcer (F-08) is the only `aria-live` region in the app.
 *
 * If the user dictates, that is the OS doing it, and the panel must disclose it — the
 * OS speech service can hear the question even though Sightline never sends audio
 * anywhere (docs/PRD.md §12 Q2).
 */
export function AskPanel() {
  return (
    <section aria-labelledby="ask-heading">
      <h2 id="ask-heading">Ask about this document</h2>
      <p>Questions are built by roadmap item P-06.</p>
    </section>
  );
}
