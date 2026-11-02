import { PasteView } from '@/features/paste/PasteView';
import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';

/**
 * Home (item **P-05**): the paste-text input.
 *
 * The route stays a server component so the deployment's mode is read from the server
 * environment, not from a value a page could set. What the mode *means* for the user is
 * computed in `PasteView`, and no privacy sentence is written in either: those come from
 * `features/trust/claims.ts` (AGENTS.md §4 rule 1). Photo capture is C-02, so this view says
 * plainly that there is no camera path yet rather than leaving a control that does nothing.
 */
export default function Home() {
  const availability: Availability = {
    relayEnabled: serverConfig().relayEnabled,
    // A user-supplied key is only known in the browser, so server render never claims direct.
    directEnabled: false,
  };
  const cfg = publicConfig(process.env, availability);

  return <PasteView config={cfg} />;
}
