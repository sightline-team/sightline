import { appError } from '@/lib/errors';
import { newId } from '@/lib/session/reducer';
import { buildTrustRecord } from '@/features/trust/record';
import { quoteFound } from '@/features/analysis/grounding';
import { qaSchema, type QaOutput } from '@/features/qa/schemas';
import { QA_SYSTEM_PROMPT, qaUserPrompt } from '@/features/qa/prompts';
import { readCompletion } from '@/lib/near-ai/completion';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { RunHalt, type AttestationGate, type SignatureVerifier } from '@/lib/near-ai/verification';
import type { NearClient } from '@/lib/near-ai/client';
import type { QAEntry, Session, TrustRecord } from '@/types';

/**
 * Grounded Q&amp;A (item **P-06**, flow `docs/ARCHITECTURE.md` §5.3, prompt spec §9).
 *
 * The same checks the reading pipeline runs, in the same order, on the same rule: the document is
 * data, so a question about it is document-derived and goes nowhere until the attestation gate has
 * passed, and the answer is discarded if its signature cannot be proved (AGENTS.md §4 rules 4 and
 * 6). That sequence is `readCompletion` (**P-08**), shared with `pipeline.ts` so the two runs
 * cannot drift apart on it — including the one repair retry, which a question gets on exactly the
 * same terms as an analysis.
 *
 * What differs is the consequence, and it differs for a product reason: a reading that could not
 * be made still leaves the transcript to show, but a question with no answer leaves nothing. So
 * all three not-ok outcomes halt here with their own named code (§13), rather than degrading to a
 * screen that would have to say "no answer".
 *
 * The question is asked against the **transcript only**, never the image: an answer can then be
 * checked for having come from the document, which is the whole point of the two-step pipeline.
 * `quoteFound` is set by code against that transcript, never taken from the model (rule 8).
 */
export interface AskDeps {
  session: Session;
  /**
   * The allowlisted, TEE-hosted model the run settled on. Never a user-typed string.
   * `STEP_PLANS.qa.model` for a live run — **measured** there by **S-14** (SPIKE §4), which found both
   * planned models answering this request readably and picked the cheaper, faster one (ADR-26).
   */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  question: string;
  signal: AbortSignal;
  onTrustRecord: (record: TrustRecord) => void;
}

export async function askAboutDocument(deps: AskDeps): Promise<QAEntry> {
  const transcript = deps.session.transcript;
  if (transcript === undefined) {
    // There is nothing to ask about. The panel keeps the field hidden until there is, so this
    // is the fail-closed backstop rather than the message a user sees.
    throw new RunHalt(appError('unknown'));
  }

  const question = deps.question.trim();
  if (question.length === 0) {
    throw new RunHalt(appError('unknown'));
  }

  const reply = await readCompletion({
    purpose: 'qa',
    mode: deps.session.mode,
    model: deps.model,
    transport: deps.transport,
    gate: deps.gate,
    verifySignature: deps.verifySignature,
    signal: deps.signal,
    onTrustRecord: deps.onTrustRecord,
    buildRecord: buildTrustRecord,
    // The same budget rule as the structure step (ADR-24). This call's shape has never been put to the
    // live service — item **S-14** — so its number is inherited from the step it resembles, not measured.
    maxTokens: STEP_PLANS.qa.maxTokens,
    request: {
      system: QA_SYSTEM_PROMPT,
      // Question *and* transcript (§9). The transcript is fenced, so an instruction written
      // inside the document arrives as quoted data (AGENTS.md §11).
      user: qaUserPrompt(transcript.text, question),
    },
    parse: (content) => qaSchema.parse(JSON.parse(content) as unknown),
  });

  switch (reply.kind) {
    case 'ok':
      return groundAnswer(reply.value, question, transcript.text);
    case 'refused':
    case 'truncated':
    case 'unreadable':
      // No half-answer, and no invented one: a question the service would not answer, or answered
      // in words we could not read, is a question that has not been answered.
      throw new RunHalt(reply.error);
  }
}

/**
 * Turn validated model output into what the user is told. Three states, and the distinction is
 * the product: answered and matched, answered and **not** matched (flagged, never dropped), and
 * "the document does not answer this".
 *
 * A `notInDocument` reply carries no source and no flag: there is nothing to source it to. It is
 * the model's own statement about *this document*, not a claim about the world, and the panel
 * words it that way (`notInDocument` is what the view reads to decide which sentence to show).
 */
export function groundAnswer(output: QaOutput, question: string, transcriptText: string): QAEntry {
  const base = { id: newId(), question, askedAt: Date.now() };

  if (output.notInDocument) return { ...base, answer: output.answer, notInDocument: true };

  const sourceQuote = output.sourceQuote;
  return {
    ...base,
    answer: output.answer,
    notInDocument: false,
    ...(sourceQuote === undefined || sourceQuote.length === 0 ? {} : { sourceQuote }),
    // Absent source and unmatched source both land `false`; the panel says which of the two.
    quoteFound: sourceQuote === undefined ? false : quoteFound(transcriptText, sourceQuote),
  };
}
