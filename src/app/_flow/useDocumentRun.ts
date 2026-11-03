'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createFixtureClient, transportFor, FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt } from '@/lib/near-ai/verification';
import { LIVE_MODE_UNAVAILABLE, refusedGate, refusedSignatureVerifier } from '@/app/_flow/refused_steps';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { PublicConfig } from '@/lib/config';
import type { Transcript } from '@/types';

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
 * two different answers about what this build can do. When T-01/T-02 land, the refusal is
 * deleted and the gate and verifier are constructed there; nothing else about the run changes.
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

      dispatch({ type: 'input_selected', input: 'text' });
      dispatch({ type: 'analysis_started' });
      // Mode F has no verification step to describe, so "checking the enclave" would be the lie.
      announce('Reading the demo text.');

      try {
        await runPipeline({
          session: { ...session, input: 'text', transcript },
          // Named in the receipt. It is not a TEE model and does not claim to be one.
          model: FIXTURE_MODEL,
          transport: createFixtureClient(),
          gate: refusedGate,
          verifySignature: refusedSignatureVerifier,
          signal: controller.signal,
          onTranscript: (t) => dispatch({ type: 'transcript_received', transcript: t }),
          onTrustRecord: (record) => dispatch({ type: 'trust_recorded', record }),
          onAnalysis: (analysis) => dispatch({ type: 'analysis_received', analysis }),
        });

        announce('Done. Showing what Sightline read.');
        router.push('/read');
        return { ok: true };
      } catch (cause) {
        if (cause instanceof RunHalt) {
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
