/**
 * `CaptureView` — item **C-02**.
 *
 * Native HTML only (AGENTS.md §8): a `<label>` + `<input type="file" accept="image/*"
 * capture="environment" multiple>` is accessible and needs no custom camera, plus a
 * paste-text `<textarea>` branch for the text path (ADR-12). No gesture-only action,
 * every target at least 44×44 px.
 */
export function CaptureView() {
  return (
    <section aria-labelledby="capture-heading">
      <h2 id="capture-heading">Add a document</h2>
      <p>Capture and paste input are built by roadmap item C-02 and P-05.</p>
    </section>
  );
}
