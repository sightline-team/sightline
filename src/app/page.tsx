import { PasteView } from '@/features/paste/PasteView';
import { CaptureView } from '@/features/capture/CaptureView';
import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';

/**
 * Home (items **P-05**, **C-02**): the two ways in — pasted text and photographs.
 *
 * The route stays a server component so the deployment's mode is read from the server
 * environment, not from a value a page could set. What the mode *means* for the user is
 * computed in the views, and no privacy sentence is written in any of them: those come from
 * `features/trust/claims.ts` (AGENTS.md §4 rule 1).
 *
 * Two sections on one page, deliberately, rather than two routes: the person chooses *how* to give
 * Sightline a document before they have a document, and a route per input would ask them to guess
 * which one their letter is on. `B-13` closes as "no new route" for this reason — and AGENTS.md §5
 * reserves a new route to a human, which this avoids rather than argues with. The paste view comes
 * first because it is the one that has an answer today.
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
      <PasteView config={cfg} />
      <CaptureView />
    </>
  );
}
