'use client';

import { useCallback } from 'react';
import { askAboutDocument } from '@/features/qa/ask';
import { RunHalt } from '@/lib/near-ai/verification';
import { DIRECT_MODE_QA_UNAVAILABLE } from '@/app/_flow/refused_steps';
import { collaboratorsFor, modelFor } from '@/app/_flow/collaborators';
import { liveWrites } from '@/app/_flow/live_writes';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { RunOutcome } from '@/app/_flow/useDocumentRun';
import type { QAEntry } from '@/types';

/**
 * The composition root for one question (item **P-06**), the sibling of `useDocumentRun`.
 *
 * Same shape on purpose: the collaborators are chosen from the session's mode in one place
 * (`_flow/collaborators.ts`), Mode A refuses at the door (`refused_steps.ts`), the run registers its
 * `AbortController` with the store so nothing keeps running after the user leaves, and every outcome
 * goes through the announcer — an answer a screen reader never hears is not an answer (§8: no silent
 * transitions).
 *
 * It reads the mode from the **session** rather than from `publicConfig` because the results
 * view is a client tree and the session already carries the mode the server chose (ADR-8).
 *
 * A question asked in Mode B is a document-derived call like the run that answered it, so it is gated
 * and signature-checked on the same rules (AGENTS.md §4 rule 4) — and on **its own** model row,
 * `STEP_PLANS.qa`. The session's trust session attests each model separately, which is what stops a
 * question answered by the page model being verified against the key of the model that summarised the
 * document.
 */
export function useAskAboutDocument(): (question: string) => Promise<RunOutcome> {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;

  return useCallback(
    async (question: string): Promise<RunOutcome> => {
      if (session.mode === 'direct') {
        dispatch({ type: 'failed', code: DIRECT_MODE_QA_UNAVAILABLE.code });
        announce(DIRECT_MODE_QA_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      const { transport, gate, verifySignature } = collaboratorsFor(session);
      const controller = beginRun();
      // P-12: the record the answer carries is dispatched while the run is still going, so it goes
      // through the signal too. The answer itself is guarded after the await below.
      const dispatchLive = liveWrites(controller.signal, dispatch);
      announce('Asking your question.');

      try {
        const entry = await askAboutDocument({
          session,
          model: modelFor(session.mode, 'qa'),
          transport,
          gate,
          verifySignature,
          question,
          signal: controller.signal,
          onTrustRecord: (record) => dispatchLive({ type: 'trust_recorded', record }),
        });

        // A reply that arrives after Forget belongs to a session that no longer exists.
        if (controller.signal.aborted) return { ok: false };
        dispatch({ type: 'question_answered', entry });
        announce(spokenAnswer(entry));
        return { ok: true };
      } catch (cause) {
        if (cause instanceof RunHalt) {
          // Forget (P-10) aborts the question too, and an answer or an error arriving after it
          // would be written into a session that has already been cleared — `useDocumentRun`
          // holds the same rule.
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
