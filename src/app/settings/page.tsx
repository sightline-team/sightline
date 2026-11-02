/**
 * Settings — placeholder until item **A-15**.
 *
 * Planned controls, all non-sensitive except where noted (docs/ARCHITECTURE.md §7):
 * - mode: `fixtures` | `relay` | `direct`, with a fail-closed downgrade to fixtures when
 *   the deployment cannot honour the request (`lib/config.ts`);
 * - API key for Mode A only: held in `sessionStorage`, never `localStorage`, never an
 *   environment variable, never in a URL — and disclosed as being in the browser,
 *   because the attestation and signature endpoints require a key themselves (ADR-17);
 * - read-aloud rate (0.5–2) and high contrast: these two are what `Settings` may keep
 *   in `localStorage`.
 *
 * Plain language, one control per field, every label a real `<label>`.
 */
export default function SettingsPage() {
  return (
    <>
      <h1>Settings</h1>
      <p>Nothing is configurable yet. This page is built by roadmap item A-15.</p>
      <p className="muted">
        It will hold the run mode, an optional key for people who have one, the reading speed and a
        high-contrast option. There is nowhere to enter a key yet: Mode A is item T-13, so this page
        makes no promise about where one would be kept.
      </p>
    </>
  );
}
