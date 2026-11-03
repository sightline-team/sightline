/**
 * Settings (item **A-15**).
 *
 * Built now, and proved in `tests/e2e/flow.spec.ts`:
 * - the read-aloud rate, which writes the same blob `lib/settings.ts` reads on every press, so the
 *   next "Read the answer aloud" uses it with no reload;
 * - the high-contrast theme, whose colours live in `globals.css` and whose application lives in
 *   `_flow/HighContrastTheme.tsx` because the theme belongs to the whole app, not this page.
 *
 * Deliberately not built here, with the reason on the page so the absence is visible rather than
 * implied:
 * - **A mode switcher.** The run mode comes from `NEXT_PUBLIC_DEFAULT_MODE` and what the deployment
 *   can actually honour (`lib/config.ts` fails closed), and the privacy claim a reader is shown is
 *   selected *by* the mode (AGENTS.md §4 rule 1). A second, browser-side copy of that decision would
 *   be a claim nobody recomputes — and the modes it would choose between do not run yet (F-04, F-05,
 *   B-05). So this page reports the mode; it does not offer one. **A human decides otherwise.**
 * - **The Mode A API key.** Item **T-13**, conditional on the S-06 CORS measurement (B-03). Its
 *   storage rule is already written down (`sessionStorage` under the `sightline.` prefix, so Forget
 *   can reach it — ARCH §5.4) and a field that collected a credential with no mode to use it in
 *   would be a risk with no function.
 *
 * Plain language, one control per field, every label a real `<label>`.
 */
import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';
import { SettingsControls } from '@/app/_flow/SettingsControls';

export default function SettingsPage() {
  const availability: Availability = { relayEnabled: serverConfig().relayEnabled, directEnabled: false };
  const cfg = publicConfig(process.env, availability);

  return (
    <>
      <h1>Settings</h1>
      <p>Two things are yours to change: how fast an answer is read aloud, and whether the screen uses a high-contrast theme.</p>
      <p className="muted">
        Forgetting a document leaves these two as they are: a reading speed is not somebody’s letter.
      </p>

      <SettingsControls />

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
      <p className="muted">
        The mode is chosen by whoever runs this app, not from this page, because the guarantee shown
        with a result depends on it. There is nowhere to enter a key: no running mode uses one yet.
      </p>
    </>
  );
}
