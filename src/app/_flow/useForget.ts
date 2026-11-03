'use client';

import { useCallback } from 'react';
import { stopSpeaking } from '@/features/speech/speak';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';

/**
 * The composition root for Forget (item **P-10**), the sibling of `useDocumentRun`.
 *
 * It lives here because three things have to happen on one press and only this layer is
 * allowed to know all three: the session's own data goes (`store.forget`), the announcer says
 * what happened (§8: no silent transitions), and read-aloud stops — P-09's rule that our own
 * voice never outlives the document it was reading. `src/lib/` may not import
 * `src/features/` (AGENTS.md §7), which is exactly why the store cannot make that call itself.
 *
 * It does not navigate. The screen the user is standing on changes underneath them and the
 * results view moves focus to its own heading when it does (AGENTS.md §8), so sending them
 * back to the start would be an unasked-for journey after the button they meant to press.
 */
export function useForget(): () => void {
  const forget = useSessionStore().forget;
  const announce = useAnnouncer().announce;

  return useCallback(() => {
    stopSpeaking();
    const report = forget();

    // Spoken from what the code actually did, and about this app's own state. What may be said
    // about the bytes is `claims.ts`'s, computed from a `TrustRecord` — and a Forget leaves no
    // record behind to compute one from, which is the second reason this sentence stays local.
    const parts = ['Forgotten. Sightline has cleared the document and everything it read.'];
    if (report.aborted > 0) {
      parts.push(`Stopped the ${report.aborted === 1 ? 'request that was' : `${report.aborted} requests that were`} still going.`);
    }
    if (report.failed > 0) {
      parts.push(
        `${report.failed} ${report.failed === 1 ? 'thing could' : 'things could'} not be removed from this browser, so check the browser’s own saved data.`,
      );
    }
    announce(parts.join(' '));
  }, [announce, forget]);
}
