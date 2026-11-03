import { safetyNotices } from '@/features/safety/notices';
import type { Analysis } from '@/types';

/**
 * The words the read-aloud control speaks (item **P-09**), and its label.
 *
 * A module of its own rather than a function inside `ReadAloud.tsx` for the same reason
 * `lib/session/forget.ts` exists: vitest runs in Node (`environment: 'node'`, no JSX transform in
 * the test include pattern), so the half that can be asserted has to live in a `.ts` file. The
 * browser half — press, hear, stop — is `tests/e2e/flow.spec.ts`.
 *
 * ### What gets read aloud, and what does not
 *
 * The **summary** and **Sightline's own cautions** — nothing else, and each of those two comes from
 * the same field or the same function the screen renders, so the audio cannot drift from the page or
 * invent a second sentence nobody reviewed. The two lead-ins below are the only words added here, and
 * they name whose voice each part is in, which is the distinction `features/safety/notices.ts` exists
 * to keep. The model's own `warnings` array is deliberately **not** read: a listener would have no way
 * to tell it apart from ours, and the two can disagree about the same document.
 *
 * So this is not "read the whole screen". The key facts, the actions and the full text stay on the
 * page for the user's own screen reader or magnifier, and any one of them can be asked about (P-06).
 * One button that reads one thing reliably is what `docs/PRD.md` §12 Q1 row 9 left after the speech
 * feature was cut; a two-minute monologue of the entire DOM was not asked for and would talk over the
 * reader a blind user is already running.
 */
export const SPEAK_LABEL = 'Read the answer aloud';

/** The words one press will speak, in the order the screen shows them. */
export function spokenAnswer(analysis: Analysis): string {
  const parts = [`Summary. ${analysis.summary}`];
  const notices = safetyNotices(analysis);
  if (notices.length > 0) {
    parts.push(['Sightline’s cautions.', ...notices.map((notice) => notice.text)].join(' '));
  }
  return parts.join(' ');
}
