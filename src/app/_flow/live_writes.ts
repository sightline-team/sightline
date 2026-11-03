import type { Dispatch } from 'react';
import type { SessionAction } from '@/lib/session/reducer';

/**
 * The writes a run that was cancelled is still allowed to make (item **P-12**): none.
 *
 * `useForget` aborts every registered controller, and both composition roots checked
 * `signal.aborted` before their *final* dispatch. That was not enough: the pipeline reports as it
 * works — transcript, trust record, analysis, degradation — and a press landing between two of
 * those steps wrote the rest of a reading into the session the person had just emptied. Measured
 * in a browser on 2026-11-03 (`tests/e2e/flow.spec.ts`, "a run that was forgotten writes nothing
 * back"): after one press the summary, the facts, the actions and the warnings all reappeared,
 * while the transcript stayed gone.
 *
 * So the rule is the same one P-10 wrote, applied to every write instead of only the last: a run
 * whose controller has been aborted has nothing left to say about the session. The reducer cannot
 * make this check for itself — a late `analysis_received` is indistinguishable from a timely one —
 * so the run that knows it was cancelled is the one that has to filter.
 */
export function liveWrites(signal: AbortSignal, dispatch: Dispatch<SessionAction>): (action: SessionAction) => void {
  return (action) => {
    if (!signal.aborted) dispatch(action);
  };
}
