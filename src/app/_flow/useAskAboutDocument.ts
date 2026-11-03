'use client';

import { useCallback } from 'react';
import { createFixtureClient, transportFor, FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { RunHalt } from '@/lib/near-ai/verification';
import { askAboutDocument } from '@/features/qa/ask';
import { LIVE_MODE_QA_UNAVAILABLE, refusedGate, refusedSignatureVerifier } from '@/app/_flow/refused_steps';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { RunOutcome } from '@/app/_flow/useDocumentRun';
import type { QAEntry } from '@/types';

/**
 * The composition root for one question (item **P-06**), the sibling of `useDocumentRun`.
 *
 * Same shape on purpose: the transport is chosen from the session's mode, live modes refuse at
 * the door (`refused_steps.ts`), the run registers its `AbortController` with the store so
 * nothing keeps running after the user leaves, and every outcome goes through the announcer —
 * an answer a screen reader never hears is not an answer (§8: no silent transitions).
 *
 * It reads the mode from the **session** rather than from `publicConfig` because the results
 * view is a client tree and the session already carries the mode the server chose (ADR-8).
 */
export function useAskAboutDocument(): (question: string) => Promise<RunOutcome> {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;

  return useCallback(
    async (question: string): Promise<RunOutcome> => {
      if (transportFor(session.mode) === 'network') {
        dispatch({ type: 'failed', code: LIVE_MODE_QA_UNAVAILABLE.code });
        announce(LIVE_MODE_QA_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      const controller = beginRun();
      announce('Asking your question.');

      try {
        const entry = await askAboutDocument({
          session,
          model: FIXTURE_MODEL,
          transport: createFixtureClient(),
          gate: refusedGate,
          verifySignature: refusedSignatureVerifier,
          question,
          signal: controller.signal,
          onTrustRecord: (record) => dispatch({ type: 'trust_recorded', record }),
        });

        dispatch({ type: 'question_answered', entry });
        announce(spokenAnswer(entry));
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
    [announce, beginRun, dispatch, endRun, session],
  );
}

/**
 * The answer, in the order a listener gets it: what was said, then whether it can be traced to
 * the text. The flag sentence is spoken *after* the answer because the answer is what was asked
 * for, and a screen reader must not have to hold the whole sentence in memory to learn that the
 * warning applies to it (AGENTS.md §4 rule 8).
 */
function spokenAnswer(entry: QAEntry): string {
  const lead = `Answer: ${entry.answer}`;
  if (entry.notInDocument || entry.quoteFound) return lead;
  return `${lead} Sightline could not match what it quoted to the text it was given.`;
}
