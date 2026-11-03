'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createFixtureClient, transportFor, FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt } from '@/lib/near-ai/verification';
import { LIVE_MODE_UNAVAILABLE, refusedGate, refusedSignatureVerifier } from '@/app/_flow/refused_steps';
import { liveWrites } from '@/app/_flow/live_writes';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { PublicConfig } from '@/lib/config';
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
 * this supplies the collaborators and turns the outcome into state and speech.
 *
 * **Live modes refuse here, at the door.** The refusal text and the two throwing placeholders
 * are in `refused_steps.ts`, shared with the Q&A hook so a question and a document cannot get
 * two different answers about what this build can do. The gate and verifier themselves exist
 * (T-01, T-02); what is missing is a service they could reach, which is F-04 and F-05. When
 * those land the refusal is deleted and `createTrustSession` / `createSignatureVerifier` are
 * constructed here; nothing else about the run changes.
 */
export interface RunOutcome {
  ok: boolean;
}

export function useDocumentRun(config: PublicConfig) {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;
  const router = useRouter();

  return useCallback(
    async (text: string): Promise<RunOutcome> => {
      if (transportFor(config.mode) === 'network') {
        dispatch({ type: 'failed', code: LIVE_MODE_UNAVAILABLE.code });
        announce(LIVE_MODE_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      const transcript: Transcript = { text, pageOffsets: [0], uncertain: [], captureIssues: [] };
      const controller = beginRun();
      // P-12: every write this run makes, not only its last one, goes through the signal.
      const dispatchLive = liveWrites(controller.signal, dispatch);

      dispatch({ type: 'input_selected', input: 'text' });
      dispatch({ type: 'analysis_started' });
      // Mode F has no verification step to describe, so "checking the enclave" would be the lie.
      announce('Reading the demo text.');

      // Set by the run when it finished with nothing readable to show (P-08). It has to be
      // captured here rather than read back from the store, because this hook is what decides
      // which sentence the announcer gets and whether to navigate at all.
      let degraded: AppError | undefined;

      try {
        await runPipeline({
          session: { ...session, input: 'text', transcript },
          // Named in the receipt. It is not a TEE model and does not claim to be one.
          model: FIXTURE_MODEL,
          transport: createFixtureClient(),
          gate: refusedGate,
          verifySignature: refusedSignatureVerifier,
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
        if (cause instanceof RunHalt) {
          // The same rule as above: a halt caused by the user pressing Forget is not an error
          // to report on a screen they just cleared.
          if (controller.signal.aborted) return { ok: false };
          dispatch({ type: 'failed', code: cause.error.code, context: cause.error.context });
          announce(cause.error.userMessage);
          return { ok: false };
        }
        throw cause;
      } finally {
        endRun(controller);
      }
    },
    [announce, beginRun, config.mode, dispatch, endRun, router, session],
  );
}
