'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt } from '@/lib/near-ai/verification';
import { DIRECT_MODE_UNAVAILABLE } from '@/app/_flow/refused_steps';
import { collaboratorsFor, modelFor } from '@/app/_flow/collaborators';
import { liveWrites } from '@/app/_flow/live_writes';
import { pasteLengthProblem } from '@/lib/session/reducer';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import { createProgressTicker } from '@/lib/a11y/progress';
import { createWakeLockManager } from '@/lib/a11y/wake_lock';
import { appError } from '@/lib/errors';
import type { AppError, Transcript } from '@/types';

/**
 * The composition root for one run (item **P-05**).
 *
 * This lives under `app/` rather than in a feature because it is where the flow's parts are
 * joined: the store, the announcer, the router, the transport choice and the pipeline. Keeping
 * it here avoids a feature→feature import edge (`AGENTS.md` §7), and the `_flow` folder name is
 * Next's convention for "not a route".
 *
 * The pipeline decides *what* happens and in which order (`features/analysis/pipeline.ts`);
 * this supplies the collaborators and turns the outcome into state and speech. The three
 * collaborators a run needs — transport, gate, signature verifier — and the model each step
 * asks for come from one place now (`_flow/collaborators.ts`), which is what keeps a pasted
 * document and a question about it from getting two different answers about who they asked.
 *
 * **Mode A still refuses at the door** (`refused_steps.ts`, item **T-13**: no place to hold the
 * person's own key). Mode B runs for real: the gate fetches and binds an attestation report before
 * the request body exists, and the answer's signature is checked against the key that report bound
 * before a single word of it reaches the screen. Mode F replays its own documents and says so.
 * What has *not* changed is that no run may claim more than its checks decided — the receipt is
 * still computed from the `TrustRecord`, and a live run's ceiling is `partial` while **B-12** stays
 * open (AGENTS.md §4 rule 5).
 */
export interface RunOutcome {
  ok: boolean;
}

export function useDocumentRun(): (text: string) => Promise<RunOutcome> {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;
  const router = useRouter();

  return useCallback(
    async (text: string): Promise<RunOutcome> => {
      // Which input the person is using is recorded **before** anything can refuse, for the same reason
      // `usePhotoRun` does it: the screen's failure summary belongs to the section that owns the run, and
      // a refusal that left `input` on `'images'` would put the paste error in the photograph section and
      // hand its focus target to that component (A-06).
      dispatch({ type: 'input_selected', input: 'text' });

      // **C-12**: the input guard comes first, in every mode, before a controller exists and before a
      // request body is assembled. A document this long is refused *for its length*, and the sentence
      // offers the smaller piece — the alternative is a request the service refuses for the same reason
      // after billing its input (ADR-29).
      const tooLong = pasteLengthProblem(text);
      if (tooLong !== undefined) {
        dispatch({ type: 'failed', code: tooLong.code });
        announce(tooLong.userMessage);
        return { ok: false };
      }

      if (session.mode === 'direct') {
        dispatch({ type: 'failed', code: DIRECT_MODE_UNAVAILABLE.code });
        announce(DIRECT_MODE_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      const { transport, gate, verifySignature } = collaboratorsFor(session);
      const transcript: Transcript = { text, pageOffsets: [0], uncertain: [], captureIssues: [] };
      const controller = beginRun();
      // P-12: every write this run makes, not only its last one, goes through the signal.
      const dispatchLive = liveWrites(controller.signal, dispatch);

      dispatch({ type: 'analysis_started' });
      // One sentence, chosen by mode, and neither one claims more than the run does. Mode F has no
      // verification step to describe, so "checking the enclave" would be the lie; Mode B has one, and
      // saying only "reading your text" would hide the seconds the gate spends before it asks.
      announce(session.mode === 'fixtures' ? 'Reading the demo text.' : 'Checking the service first, then reading your text.');

      // Set by the run when it finished with nothing readable to show (P-08). It has to be
      // captured here rather than read back from the store, because this hook is what decides
      // which sentence the announcer gets and whether to navigate at all.
      let degraded: AppError | undefined;
      let backgrounded = false;
      const progressTicker = createProgressTicker(announce);
      const wakeLock = createWakeLockManager();

      const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          backgrounded = true;
          controller.abort();
        }
      };

      try {
        void wakeLock.acquire();
        progressTicker.start();
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        await runPipeline({
          // C-02: the pipeline takes the transcript and the mode, not the session. The paste-shaped
          // transcript above is the one this run built, so it is handed over rather than re-read.
          mode: session.mode,
          transcript,
          // `STEP_PLANS.analyse` for a live run, the fixture's own name for Mode F (ADR-24). Named in
          // the receipt either way, so a demo run never reads as a TEE call.
          model: modelFor(session.mode, 'analyse'),
          transport,
          gate,
          verifySignature,
          signal: controller.signal,
          onTranscript: (t) => dispatchLive({ type: 'transcript_received', transcript: t }),
          onTrustRecord: (record) => dispatchLive({ type: 'trust_recorded', record }),
          onAnalysis: (analysis) => dispatchLive({ type: 'analysis_received', analysis }),
          onDegraded: (error) => {
            degraded = error;
            dispatchLive({ type: 'run_degraded', code: error.code, context: error.context });
          },
        });

        // Forget (P-10) aborts a run that is still going. From here on this run's result
        // belongs to a session that no longer exists, so it writes nothing — not state, not a
        // sentence over the Forget announcement, not a navigation the user did not ask for.
        // The check is the signal rather than an error type because the fixture transport
        // answers regardless of cancellation, so a completed run can arrive after Forget too.
        // The dispatches are gated by `liveWrites` (P-12); what this line still owns is the speech
        // and the journey, which are not dispatches and would speak over the Forget announcement.
        if (controller.signal.aborted) return { ok: false };

        // Both outcomes navigate: the transcript is on `/read` either way, and leaving the user
        // on the paste screen with no idea the run ended is the silent transition §8 forbids.
        // What differs is the sentence — a degraded run must not announce "here is what I read".
        announce(
          degraded === undefined
            ? 'Done. Showing what Sightline read.'
            : `${degraded.userMessage} Showing the text you gave instead.`,
        );
        router.push('/read');
        return { ok: true };
      } catch (cause) {
        if (backgrounded) {
          const error = appError('aborted');
          dispatch({ type: 'failed', code: error.code });
          announce(error.userMessage);
          return { ok: false };
        }
        if (cause instanceof RunHalt) {
          // The same rule as above: a halt caused by the user pressing Forget is not an error
          // to report on a screen they just cleared.
          if (controller.signal.aborted) return { ok: false };
          dispatch({ type: 'failed', code: cause.error.code, context: cause.error.context });
          announce(cause.error.userMessage);
          return { ok: false };
        }
        if (controller.signal.aborted) return { ok: false };
        throw cause;
      } finally {
        progressTicker.stop();
        void wakeLock.release();
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        endRun(controller);
      }
    },
    [announce, beginRun, dispatch, endRun, router, session],
  );
}
