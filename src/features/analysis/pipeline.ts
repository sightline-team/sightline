import { z } from 'zod';
import type { NearClient } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { notBuilt } from '@/lib/not_built';
import { buildTrustRecord } from '@/features/trust/record';
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
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema } from '@/features/analysis/schemas';
import { completionEnvelopeSchema } from '@/lib/near-ai/envelope';
import { groundFacts } from '@/features/analysis/grounding';
import type { Analysis, Session, Transcript, TrustRecord } from '@/types';

/**
 * The two-step pipeline (item **P-03**, flow `docs/ARCHITECTURE.md` §5).
 *
 * Order is a rule, not a preference: verify attestation → transcribe (one request per
 * page) → fetch and check that response's signature → structure the transcript → ground
 * the quotes → ready. Nothing document-derived is sent before the required checks pass
 * (AGENTS.md §4 rule 6), and every step appends a `TrustRecord`.
 *
 * This file implements the **text path** (§5.2): the transcript is what the user pasted,
 * so capture, image prep and transcription are skipped and the structure step is the only
 * call. The image path is C-05 and refuses here rather than pretending.
 *
 * What is deliberately *not* here, because a stub may not fake it:
 *  - the repair retry for unreadable output, `finish_reason: length` and refusals — **P-08**;
 *    this file fails closed with the named code instead of silently degrading;
 *  - the attestation and signature checks themselves — **T-01/T-02/T-03**, injected as
 *    `gate` and `verifySignature`. The pipeline owns the *ordering* and the fail-closed
 *    consequence, which is exactly what makes it testable without a live enclave (B-05);
 *  - `numbersRechecked` — **T-11**, conditional on C-10.
 */

/**
 * The verification contracts this run depends on — `GateOutcome`, `SignatureOutcome`,
 * `AttestationGate`, `SignatureVerifier` and the `RunHalt` failure shape — live in
 * `lib/near-ai/verification.ts`, because question answering (P-06) makes the same two checks
 * in the same order and must not be handed a second copy of the rule to drift from.
 */
export interface PipelineDeps {
  session: Session;
  /** The allowlisted, TEE-hosted model chosen by F-04/C-02. Never a user-typed string. */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  signal: AbortSignal;
  onTranscript: (transcript: Transcript) => void;
  onAnalysis: (analysis: Analysis) => void;
  onTrustRecord: (record: TrustRecord) => void;
}

interface StructureCall {
  envelope: z.infer<typeof completionEnvelopeSchema>;
  rawText: string;
  sentBody: string;
}

export async function runPipeline(deps: PipelineDeps): Promise<void> {
  if (deps.session.input !== 'text') {
    // The photo path needs image prep (C-01), one request per page (C-03/C-05) and a vision
    // model that has not been shown to exist (S-02). Faking it here would put a transcript on
    // the screen that nobody transcribed.
    return notBuilt('C-05', 'The image transcription path') as never;
  }

  const pasted = deps.session.transcript;
  if (pasted === undefined || pasted.text.trim().length === 0) {
    // P-05 must not allow an empty submit; this is the fail-closed backstop, not the message.
    throw new RunHalt(appError('unknown'));
  }

  // Normalised once, here: the transcript the UI shows, the one the quotes are grounded
  // against, and the one that ends up inside the hashed request body must be one object.
  const transcript: Transcript = {
    text: pasted.text,
    pageOffsets: [0],
    uncertain: pasted.uncertain,
    captureIssues: pasted.captureIssues,
    ...(pasted.pageNumbersSeen === undefined ? {} : { pageNumbersSeen: pasted.pageNumbersSeen }),
  };
  deps.onTranscript(transcript);

  const isFixture = deps.session.mode === 'fixtures';

  let gate: GateOutcome;
  if (isFixture) {
    gate = fixtureGate();
  } else {
    gate = await deps.gate({ model: deps.model, signal: deps.signal });
    // Rule 6, and the whole reason the gate is called before the body is built: a failed
    // check stops the run while there is still nothing document-derived to send.
    if (gate.status === 'failed') throw new RunHalt(appError('verification_failed'));
  }

  const completion = await structureStep(deps, transcript);

  const signature: SignatureOutcome = isFixture ? fixtureSignature() : await deps.verifySignature({
    chatId: completion.envelope.id,
    model: deps.model,
    sentBody: completion.sentBody,
    rawText: completion.rawText,
    signal: deps.signal,
  });

  const record: TrustRecord = buildTrustRecord({
    purpose: 'analyse',
    // The service names the model it answered with; the request only says what we asked for.
    model: completion.envelope.model ?? deps.model,
    endpoint: deps.session.mode,
    requestId: completion.envelope.id,
    gate,
    signature,
  });
  deps.onTrustRecord(record);

  // A response we cannot prove came from the attested key is discarded, not displayed
  // (rule 6). The record goes out first: the receipt must show that a completion was
  // fetched and rejected, rather than leaving the user with silence where a check ran.
  if (!isFixture && !signature.verified) throw new RunHalt(appError('signature_invalid'));

  let analysis: Analysis;
  try {
    const parsed: unknown = JSON.parse(completion.envelope.choices[0]!.message.content);
    const output = analysisSchema.parse(parsed);
    analysis = {
      docType: output.docType,
      ...(output.sender === undefined ? {} : { sender: output.sender }),
      summary: output.summary,
      // `quoteFound` is set by code against our transcript, never taken from the model
      // (rule 8, ADR-11). Ungrounded facts are kept and flagged, not dropped.
      facts: groundFacts(transcript.text, output.facts),
      actions: groundFacts(transcript.text, output.actions),
      warnings: output.warnings,
      model: record.model,
    };
  } catch (cause) {
    return haltFrom(cause);
  }

  deps.onAnalysis(analysis);
}

/**
 * The one call this path makes. Split out so a schema rejection and a transport failure
 * both leave through the same door, and so the request body is built **after** the gate.
 */
async function structureStep(deps: PipelineDeps, transcript: Transcript): Promise<StructureCall> {
  try {
    const response = await deps.transport.post(
      'chat/completions',
      {
        // No `stream`, no `response_format`, no sampling fields: SPIKE §1 documents the
        // response shape only, and a request field we cannot point at a source for is a
        // field nobody can explain when it misbehaves.
        model: deps.model,
        messages: [
          { role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
          // Transcript only (§9): the structure step never sees an image, so it cannot
          // invent a number it liked the look of.
          { role: 'user', content: structureUserPrompt(transcript.text) },
        ],
      },
      // `purpose` is local metadata for the Mode F replay client (F-09), which has to know
      // which of the two document-derived calls it is answering. It is never put in the body,
      // so the bytes a live mode signs are unchanged.
      { signal: deps.signal, purpose: 'analyse' },
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
