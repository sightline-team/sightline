'use client';

import { useAnnouncer } from '@/lib/a11y/announcer';
import { describeRate, SPEECH_RATE_OPTIONS, updateSettings } from '@/lib/settings';
import { useStoredSettings } from './useStoredSettings';

/**
 * The two controls **A-15** can ship without a credential or a human decision: the read-aloud rate
 * and the high-contrast theme. The page's other planned fields are deliberately absent, and the
 * reasons are in `ROADMAP.md` rather than in this file's prose — the mode is decided by the
 * deployment (`lib/config.ts` fails closed, and the claim shown to a reader is chosen by the mode,
 * AGENTS.md §4 rule 1), and the API key belongs to item **T-13**, which is conditional on the CORS
 * spike and has no mode to use it in yet.
 *
 * Three rules this file is written against:
 *  - **The stored value is the state.** Both controls are driven by `useStoredSettings()`, so what
 *    is selected is what the app will read next, and a write the browser refuses makes the control
 *    snap back rather than sit on a lie. That is also why the rate control needs no "Save" button:
 *    there is nothing pending.
 *  - **Nothing is announced twice.** Changing a radio is announced by the screen reader itself, from
 *    the real `<label>`; P-09's rule ("the voice *is* the feedback") applies, so a successful rate
 *    change is silent here. Changing the colour theme is invisible to a screen reader, so it goes
 *    through the announcer (AGENTS.md §8: no silent transitions).
 *  - **A failed write is spoken, not swallowed.** `localStorage.setItem` throws in some private
 *    modes; `updateSettings` reports it and the sentence says the setting stayed as it was. The
 *    same reasoning as `lib/session/forget.ts` counting what it could not remove.
 */
const NOT_SAVED = 'Sightline could not save that in this browser, so this page stays as it was.';

export function SettingsControls() {
  const { speechRate, highContrast } = useStoredSettings();
  const { announce } = useAnnouncer();

  function chooseRate(value: number): void {
    if (!updateSettings({ speechRate: value }).saved) announce(NOT_SAVED);
  }

  function toggleContrast(on: boolean): void {
    const result = updateSettings({ highContrast: on });
    // `announce` the theme, never the failure and the theme: if the write was refused the colours
    // do not change either, so the second sentence would describe a state the page is not in.
    if (!result.saved) announce(NOT_SAVED);
    else announce(on ? 'High contrast is on.' : 'High contrast is off.');
  }

  return (
    <>
      <section>
        <h2>Reading aloud</h2>
        <fieldset className="setting-group">
          <legend>Speed</legend>
          <ul className="setting-options">
            {SPEECH_RATE_OPTIONS.map((option) => (
              <li key={option.value}>
                <label>
                  <input
                    type="radio"
                    name="speech-rate"
                    value={String(option.value)}
                    checked={speechRate === option.value}
                    onChange={() => chooseRate(option.value)}
                  />
                  {option.label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <p className="muted">
          Current speed: <strong>{describeRate(speechRate)}</strong>. It applies the next time you
          press “Read the answer aloud”, with no reload.
        </p>
      </section>

      <section>
        <h2>Screen</h2>
        <p className="setting-row">
          <label>
            <input
              type="checkbox"
              name="high-contrast"
              checked={highContrast}
              onChange={(event) => toggleContrast(event.target.checked)}
            />
            High contrast
          </label>
        </p>
        <p className="muted">Black background, white text, yellow highlights.</p>
      </section>
    </>
  );
}
