import { notBuilt } from '@/lib/not_built';
import type { QAEntry } from '@/types';

/**
 * Grounded Q&amp;A (item **P-06**, prompt spec `docs/ARCHITECTURE.md` §9).
 *
 * The question is asked against the **transcript only**, so an answer can be checked
 * for having come from the document. `{ answer, notInDocument, sourceQuote }` is
 * schema-validated and the quote goes through the same substring check as the facts.
 *
 * Two honesty points that live here, not in the UI copy:
 * - a typed question never leaves as audio; if the user dictates with the OS, the OS
 *   vendor's speech service may see it, and the UI discloses that (P-06);
 * - the question is far less sensitive than the document, which is why this is a text
 *   field and not our own recording + TEE transcription pipeline (ADR-6).
 */
export function ask(_input: { transcript: string; question: string; model: string }): Promise<QAEntry> {
  return notBuilt('P-06', 'Question answering') as never;
}
