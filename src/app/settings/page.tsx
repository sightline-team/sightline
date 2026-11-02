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
 *
 * Until A-15 builds the controls, this page carries the deployment readout. It was on the home
 * view while the home view was a stub, and a person reading a bank letter should not have to
 * wade through `relayEnabled: false` to get there — but `npm run dev:fixtures` has to *show* it
 * is running with no credentials, which is F-01's evidence and a reviewer's first check.
 */
import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';

export default function SettingsPage() {
  const availability: Availability = { relayEnabled: serverConfig().relayEnabled, directEnabled: false };
  const cfg = publicConfig(process.env, availability);

  return (
    <>
      <h1>Settings</h1>
      <p>Nothing is configurable yet. This page is built by roadmap item A-15.</p>
      <p className="muted">
        It will hold the run mode, an optional key for people who have one, the reading speed and a
        high-contrast option. There is nowhere to enter a key yet: Mode A is item T-13, so this page
        makes no promise about where one would be kept.
      </p>

      <h2>Build state</h2>
      <p className="muted">
        Running mode: <code>{cfg.mode}</code>
        {cfg.downgraded ? (
          <>
            {' '}(requested <code>{cfg.requestedMode}</code>, which this deployment cannot satisfy,
            so it fell back)
          </>
        ) : null}
      </p>
      <p className="muted">
        Relay enabled: <code>{String(availability.relayEnabled)}</code> · Direct mode allowed:{' '}
        <code>{String(cfg.allowDirect)}</code>
      </p>
    </>
  );
}
