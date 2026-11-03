/**
 * Prompt text for grounded question answering (item **P-06**, spec `docs/ARCHITECTURE.md` §9).
 *
 * This moved out of `features/analysis/prompts.ts` when Q&A became real: a question is asked
 * about the transcript, but it is the *qa* feature's request, and keeping it here means the qa
 * feature does not import the analysis feature for one string (AGENTS.md §7).
 *
 * The transcript is fenced for the same reason step 2's prompt fences it: a sentence inside the
 * document that reads like an instruction arrives as quoted text, not as a system message
 * (AGENTS.md §11).
 */
export const QA_SYSTEM_PROMPT = `Answer only from the document transcript you are given. If the answer is not in it, say so.
Every sourceQuote must be a literal excerpt of the transcript.
Reply with JSON only, matching exactly:
{"answer": string, "notInDocument": boolean, "sourceQuote": string?}`;

export function qaUserPrompt(transcript: string, question: string): string {
  return `Transcript:\n"""\n${transcript}\n"""\n\nQuestion: ${question}`;
}
