import { LandingHero } from '@/features/landing/LandingHero';
import { PasteView } from '@/features/paste/PasteView';
import { CaptureView } from '@/features/capture/CaptureView';
import { publicConfig, type Availability } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';

/**
 * Home (items **P-05**, **C-02**):
 * Leads with the Web3 Taste-skill Landing Hero, followed by the two input streams:
 * pasted text and photographs.
 *
 * The route stays a server component so the deployment's mode is read from the server
 * environment, not from a value a page could set. What the mode *means* for the user is
 * computed in the views, and no privacy sentence is written in any of them: those come from
 * `features/trust/claims.ts` (AGENTS.md §4 rule 1).
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
      <LandingHero />
      <div id="workbench" className="workbench-section">
        <PasteView config={cfg} />
        <CaptureView />
      </div>
    </>
  );
}
