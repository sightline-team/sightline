import { appError } from '@/lib/errors';
import { newId } from '@/lib/session/reducer';
import { buildTrustRecord } from '@/features/trust/record';
import { quoteFound } from '@/features/analysis/grounding';
import { qaSchema } from '@/features/qa/schemas';
import { QA_SYSTEM_PROMPT, qaUserPrompt } from '@/features/qa/prompts';
import { completionEnvelopeSchema, type CompletionEnvelope } from '@/lib/near-ai/envelope';
import {
  RunHalt,
  fixtureGate,
  fixtureSignature,
  haltFrom,
  type AttestationGate,
  type GateOutcome,
  type SignatureOutcome,
  type SignatureVerifier,
} from '@/lib/near-ai/verification';
import type { NearClient, NearResponse } from '@/lib/near-ai/client';
import type { QAEntry, Session, TrustRecord } from '@/types';

/**
 * Grounded Q&amp;A (item **P-06**, flow `docs/ARCHITECTURE.md` §5.3, prompt spec §9).
 *
 * The same two checks the reading pipeline runs, in the same order, on the same rule: the
 * document is data, so a question about it is document-derived and goes nowhere until the
 * attestation gate has passed, and the answer is discarded if its signature cannot be proved
 * (AGENTS.md §4 rules 4 and 6). Order is why `gate` and `verifySignature` are injected rather
 * than called here directly — the checks themselves are T-01/T-02, and this file owns the
 * sequencing, which is the part that can be tested without a live enclave (B-05).
 *
 * The question is asked against the **transcript only**, never the image: an answer can then be
 * checked for having come from the document, which is the whole point of the two-step pipeline.
 * `quoteFound` is set by code against that transcript, never taken from the model (rule 8).
 */
export interface AskDeps {
  session: Session;
  /** The allowlisted, TEE-hosted model the run settled on. Never a user-typed string. */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  question: string;
  signal: AbortSignal;
  onTrustRecord: (record: TrustRecord) => void;
}

interface QuestionCall {
  envelope: CompletionEnvelope;
  rawText: string;
  sentBody: string;
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

  const isFixture = deps.session.mode === 'fixtures';

  let gate: GateOutcome;
  if (isFixture) {
    gate = fixtureGate();
  } else {
    gate = await deps.gate({ model: deps.model, signal: deps.signal });
    // Rule 6 again: a failed check stops the run while the only document-derived bytes in
    // existence are still on the user's screen.
    if (gate.status === 'failed') throw new RunHalt(appError('verification_failed'));
  }

  const call = await questionStep(deps, transcript.text, question);

  const signature: SignatureOutcome = isFixture
    ? fixtureSignature()
    : await deps.verifySignature({
        chatId: call.envelope.id,
        model: deps.model,
        sentBody: call.sentBody,
        rawText: call.rawText,
        signal: deps.signal,
      });

  const record = buildTrustRecord({
    purpose: 'qa',
    model: call.envelope.model ?? deps.model,
    endpoint: deps.session.mode,
    requestId: call.envelope.id,
    gate,
    signature,
  });
  deps.onTrustRecord(record);

  // Same shape as the analysis run: the receipt goes out first, then the answer is thrown away.
  // A question answered by a key we cannot prove is not an answer the user may be shown.
  if (!isFixture && !signature.verified) throw new RunHalt(appError('signature_invalid'));

  try {
    const parsed: unknown = JSON.parse(call.envelope.choices[0]!.message.content);
    return groundAnswer(parsed, question, transcript.text);
  } catch (cause) {
    return haltFrom(cause);
  }
}

/**
 * The one call this path makes. Split out so a schema rejection and a transport failure both
 * leave through the same door, and so the body is built **after** the gate.
 */
async function questionStep(deps: AskDeps, transcriptText: string, question: string): Promise<QuestionCall> {
  try {
    const response: NearResponse = await deps.transport.post(
      'chat/completions',
      {
        // No `stream`, no `response_format`, no sampling fields — the same restraint as the
        // structure step: nothing in the request that SPIKE §1 does not document.
        model: deps.model,
        messages: [
          { role: 'system', content: QA_SYSTEM_PROMPT },
          // Question *and* transcript (§9). The transcript is fenced, so an instruction written
          // inside the document arrives as quoted data (AGENTS.md §11).
          { role: 'user', content: qaUserPrompt(transcriptText, question) },
        ],
      },
      // `purpose` is local metadata for Mode F's replay client; it never enters the body, so
      // the bytes a live mode hashes are exactly the bytes it sent (ADR-19).
      { signal: deps.signal, purpose: 'qa' },
    );

    return {
      envelope: completionEnvelopeSchema.parse(response.json),
      rawText: response.rawText,
      sentBody: response.sentBody ?? '',
    };
  } catch (cause) {
    return haltFrom(cause);
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
function groundAnswer(parsed: unknown, question: string, transcriptText: string): QAEntry {
  const output = qaSchema.parse(parsed);
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
