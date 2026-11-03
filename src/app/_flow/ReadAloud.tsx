'use client';

import { SPEAK_LABEL, spokenAnswer } from '@/app/_flow/spoken_answer';
import { SpeakButton } from '@/features/speech/SpeakButton';
import { useSessionStore } from '@/lib/session/store';

/**
 * The read-aloud control on the results screen (item **P-09**), composed here because what it says
 * comes from two features — the reading itself and Sightline's own cautions — and
 * `src/features/` may not import each other (AGENTS.md §7). So the joining happens in the one place
 * allowed to know both: a composition root, the same shape as `useDocumentRun` and `useForget`.
 * The text rule itself is `spoken_answer.ts`; this file only decides *whether* there is a control.
 *
 * With no reading to speak — before the first run, after Forget (P-10), on the transcript-only
 * screen (P-08) — there is no control rather than a control that says nothing.
 */
export function ReadAloud() {
  const { session } = useSessionStore();
  const analysis = session.analysis;
  if (analysis === undefined) return null;
  return <SpeakButton text={spokenAnswer(analysis)} label={SPEAK_LABEL} />;
}
