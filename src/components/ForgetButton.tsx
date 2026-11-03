'use client';

import { Button } from '@/components/Button';
import { useForget } from '@/app/_flow/useForget';

/**
 * The Forget control (item **P-10**).
 *
 * It sits in the shell rather than in the results view because the two moments it exists for
 * are not the same screen: bailing out of a run that is still going (while the user is on the
 * paste view) and clearing a reading that is already on screen. A control that only appears on
 * `/read` cannot stop a request that has not finished.
 *
 * Always present, always does the same thing. Showing and hiding it by session state would be
 * a moving target for a screen-reader user who was told it was there a moment ago, and the
 * announcement says plainly when there was nothing to clear.
 *
 * No privacy sentence here (rule 1) — this names an action on this app's own state, and the
 * announcement it triggers is built from what the code counted.
 */
export function ForgetButton() {
  const forget = useForget();
  // Located in tests by its accessible name rather than a `data-testid`: the name is the
  // contract a screen-reader user hears, so an assertion on it fails when the contract does.
  return (
    <li>
      <Button onClick={forget}>Forget this document</Button>
    </li>
  );
}
