'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createFixtureClient, transportFor } from '@/lib/fixtures/replay';
import { NotBuilt } from '@/lib/not_built';
import { PipelineHalt, runPipeline, type AttestationGate, type SignatureVerifier } from '@/features/analysis/pipeline';
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
 * **Live modes refuse here, at the door.** The attestation gate is T-01, the signature verifier
 * is T-02, and there is no allowlisted model yet (C-02/S-08) — so a relay run today has nothing
 * honest to show. Refusing before a transport is built is the same fail-closed shape as a failed
 * check (AGENTS.md §4 rule 6), and it keeps this file from inventing placeholder verification
 * logic or sending an empty model name. When T-01/T-02 land, the refusal is deleted and the gate
 * and verifier are constructed there; nothing else about the run changes.
 */
export interface RunOutcome {
  ok: boolean;
}

/** Capability copy, never a privacy claim (rule 1): it says what is not built, nothing about what left the device. */
const LIVE_MODE_UNAVAILABLE = {
  code: 'model_unavailable' as const,
  userMessage:
    'Sightline cannot read a document in this mode yet: the verification steps and the model allowlist are not built. Demo mode reads demo documents and says so on every page.',
  retryable: false,
};

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

      // Mode F never reaches either of these; the pipeline skips both because there is no
      // enclave. Throwing rather than returning a plausible outcome is the guard: if a future
      // change makes fixture mode call them, the run fails loudly instead of inventing a check.
      const gate: AttestationGate = () => {
        throw new NotBuilt('T-01', 'The attestation gate');
      };
      const verifySignature: SignatureVerifier = () => {
        throw new NotBuilt('T-02', 'The response signature check');
      };

      try {
        await runPipeline({
          session: { ...session, input: 'text', transcript },
          // Named in the receipt. It is not a TEE model and does not claim to be one.
          model: 'fixtures/demo-model',
          transport: createFixtureClient(),
          gate,
          verifySignature,
          signal: controller.signal,
          onTranscript: (t) => dispatch({ type: 'transcript_received', transcript: t }),
          onTrustRecord: (record) => dispatch({ type: 'trust_recorded', record }),
          onAnalysis: (analysis) => dispatch({ type: 'analysis_received', analysis }),
        });

        announce('Done. Showing what Sightline read.');
        router.push('/read');
        return { ok: true };
      } catch (cause) {
        if (cause instanceof PipelineHalt) {
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
