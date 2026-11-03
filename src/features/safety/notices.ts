import type { Analysis, DocType } from '@/types';

/**
 * Sightline's own safety notices (item **P-07**, requirement `docs/PRD.md` §6 R7).
 *
 * These sentences are **written by us and computed by code**, which is the opposite of the
 * `warnings` array on the analysis: those are the model's own words about the document, and they
 * are shown separately and labelled as such. The split matters because the two can disagree — a
 * model that noticed no medicine is not a model that read none — and a person hearing the list
 * needs to know whose voice each line is in.
 *
 * ### What each notice is allowed to say
 *
 * `docs/PRD.md` §6 R7 and §12 set the ceiling, and every sentence below sits under it:
 *  - a medicine, dose, money or deadline reading gets a short instruction to confirm with a
 *    pharmacist, doctor or the sender (R7's own words);
 *  - the app does **not** claim to detect scams, and says plainly that a fake letter reads the
 *    same as a genuine one (§12 "Read faithfully; **do not** claim detection"; R7);
 *  - English only is stated as a limit rather than a guess about the document (§12 "Say English
 *    only is supported; do not guess").
 *
 * Nothing here is a privacy or data-flow sentence — those come only from `features/trust/claims.ts`
 * (`AGENTS.md` §4 rule 1), and `tests/unit/claims.test.ts` scans every source file for the seven
 * phrases that belong there.
 *
 * ### Why the triggers look at the analysis, not the text
 *
 * A notice fires on validated fields of the reading — `docType`, a fact's `kind`, an action's
 * `deadline` — never on a keyword hunt through the transcript. Two reasons. Searching the text for
 * "tablet" or "£" would invent a second, unvalidated reader inside the app whose misses nobody
 * sees; and a notice fired that way would be a claim about a document based on words Sightline
 * matched by pattern rather than read. The cost of the choice is honest and stated: if the model
 * filed a medicine as `other`, the medicine notice does not fire. `tests/unit/safety-notices.test.ts`
 * pins that behaviour rather than leaving it a rumour, and the `language` notice is unconditional
 * for exactly that reason — it is about Sightline, so it does not need the document's permission.
 */

/** The four notices this feature can produce. The order in the list is fixed by `NOTICE_ORDER`. */
export type SafetyNoticeId = 'medicine' | 'money' | 'deadline' | 'language';

export interface SafetyNotice {
  id: SafetyNoticeId;
  /** Plain language, read aloud as written. Never the model's words. */
  text: string;
}

/**
 * The copy itself. Each entry is two or three short sentences: no clause a screen reader has to
 * hold across a comma, no clinical or legal vocabulary, and no promise about what Sightline can
 * tell. Changing one of these is changing a safety statement, so it belongs in a commit that says
 * so (AGENTS.md §5 "ask a human before changing a privacy statement" applies to this neighbour).
 */
const NOTICE_COPY: Record<SafetyNoticeId, string> = {
  medicine:
    'This seems to mention a medicine or a dose. Sightline is not a medical professional and does not give medical advice. Check with your doctor, a pharmacist or the surgery before you change anything.',
  money:
    'This seems to mention money. Sightline reads every letter the same way, so it cannot tell you whether this one is genuine. Before you pay anything, check the amount with the sender using contact details you already have.',
  deadline:
    'This seems to set a date to act by. A date can be misread, so check it with the sender before you rely on it.',
  language: 'Sightline reads English documents only. It will not guess at words in another language.',
};

/** Fixed order: content cautions first, then the statement about Sightline's own limits. */
const NOTICE_ORDER: SafetyNoticeId[] = ['medicine', 'money', 'deadline', 'language'];

const MEDICINE_DOC_TYPES: DocType[] = ['medical', 'prescription'];
const MONEY_DOC_TYPES: DocType[] = ['bill', 'bank'];
/** A legal or government letter often carries a date without the action listing one. */
const DEADLINE_DOC_TYPES: DocType[] = ['legal', 'government'];

/**
 * Which notices apply to this reading, in the fixed order. Deterministic and content-only: no
 * clock, no mode, no randomness, so the same analysis always produces the same list.
 */
export function safetyNotices(analysis: Analysis): SafetyNotice[] {
  const factKinds = new Set(analysis.facts.map((fact) => fact.kind));
  const fired: Record<SafetyNoticeId, boolean> = {
    medicine: MEDICINE_DOC_TYPES.includes(analysis.docType) || factKinds.has('medication') || factKinds.has('dose'),
    money: MONEY_DOC_TYPES.includes(analysis.docType) || factKinds.has('amount'),
    deadline:
      analysis.actions.some((action) => action.deadline !== undefined) ||
      (DEADLINE_DOC_TYPES.includes(analysis.docType) && factKinds.has('date')),
    // About Sightline, not about the document, so it is always said when there is a reading.
    language: true,
  };

  return NOTICE_ORDER.filter((id) => fired[id]).map((id) => ({ id, text: NOTICE_COPY[id] }));
}

/** The ids in display order, exported so a test can assert the order rather than assume it. */
export const SAFETY_NOTICE_IDS = NOTICE_ORDER;
