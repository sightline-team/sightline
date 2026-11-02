import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';

/**
 * Placeholder home view. P-05 replaces it with the paste-text input and C-02 with
 * capture. It deliberately contains no privacy sentence: those are computed by
 * `features/trust/claims.ts` and appear only in the trust receipt and banner
 * (AGENTS.md §4 rule 1).
 */
export default function Home() {
  const availability: Availability = {
    relayEnabled: serverConfig().relayEnabled,
    // A user-supplied key is only known in the browser, so server render never claims direct.
    directEnabled: false,
  };
  const cfg = publicConfig(process.env, availability);

  return (
    <>
      <h1>Sightline</h1>
      <p>Nothing has been read yet. Add a document to begin.</p>
      <h2>Build state</h2>
      <p className="muted">
        Running mode: <code>{cfg.mode}</code>
        {cfg.downgraded ? (
          <>
            {' '}(requested <code>{cfg.requestedMode}</code>, which this deployment cannot
            satisfy, so it fell back)
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
