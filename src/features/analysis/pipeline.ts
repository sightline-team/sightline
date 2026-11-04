import type { NearClient } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { notBuilt } from '@/lib/not_built';
import { buildTrustRecord } from '@/features/trust/record';
import { readCompletion } from '@/lib/near-ai/completion';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { RunHalt, type AttestationGate, type SignatureVerifier } from '@/lib/near-ai/verification';
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema } from '@/features/analysis/schemas';
import { groundFacts } from '@/features/analysis/grounding';
import type { Analysis, AppError, Session, Transcript, TrustRecord } from '@/types';

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
 * The call itself — gate, body, signature, receipt, one repair retry — is `readCompletion`
 * (**P-08**), shared with question answering so the two runs cannot drift apart on the order.
 * What is decided *here* is what each outcome costs the user, because that is feature-specific:
 *  - an unreadable or cut-off reading becomes the transcript-only screen §13 promises, never a
 *    partial summary and never a guess (rules 6 and 10);
 *  - a refusal halts — the service declined to read this document, so there is no half-answer;
 *  - a failed gate or an unverifiable signature halts inside the helper, before any of this.
 *
 * Still deliberately *not* here: the attestation and signature checks themselves (**T-01/T-02/
 * T-03**), injected as `gate` and `verifySignature` so the ordering is testable without a live
 * enclave (B-05), page-splitting a truncated *photo* run (**C-03/C-05** — there is one page on
 * this path and nothing to split), and `numbersRechecked` (**T-11**, conditional on C-10).
 */

export interface PipelineDeps {
  session: Session;
  /**
   * The allowlisted, TEE-hosted model chosen by F-04/C-02. Never a user-typed string.
   *
   * For a live run this is `STEP_PLANS.analyse.model`, not the model that transcribed the pages:
   * **ADR-24** separates the two because `docs/SPIKE_RESULTS.md` §4 measured `z-ai/glm-5.3-flash`
   * answering this request in a readable shape 0 of 6 times while `Qwen/Qwen3.8-27B` answered 4 of 4.
   * Mode F names its own model and never reaches a service.
   */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  signal: AbortSignal;
  onTranscript: (transcript: Transcript) => void;
  onAnalysis: (analysis: Analysis) => void;
  /** The run ended with nothing readable to show, so the transcript is shown alone (P-08). */
  onDegraded: (error: AppError) => void;
  onTrustRecord: (record: TrustRecord) => void;
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

  const reading = await readCompletion({
    purpose: 'analyse',
    mode: deps.session.mode,
    model: deps.model,
    transport: deps.transport,
    gate: deps.gate,
    verifySignature: deps.verifySignature,
    signal: deps.signal,
    onTrustRecord: deps.onTrustRecord,
    buildRecord: buildTrustRecord,
    // ADR-24: the text steps send a budget too. Without one the service default caps nothing, and a
    // reasoning model that runs past it answers with `content: null` — P-13's misread-as-broken case.
    maxTokens: STEP_PLANS.analyse.maxTokens,
    request: {
      system: STRUCTURE_SYSTEM_PROMPT,
      // Transcript only (§9): the structure step never sees an image, so it cannot invent a
      // number it liked the look of. The document's words stay inside the fence, and the retry
      // note belongs to the user message so the system prompt never changes (§11).
      user: structureUserPrompt(transcript.text),
    },
    parse: (content) => analysisSchema.parse(JSON.parse(content) as unknown),
  });

  switch (reading.kind) {
    case 'ok': {
      const output = reading.value;
      deps.onAnalysis({
        docType: output.docType,
        ...(output.sender === undefined ? {} : { sender: output.sender }),
        summary: output.summary,
        // `quoteFound` is set by code against our transcript, never taken from the model
        // (rule 8, ADR-11). Ungrounded facts are kept and flagged, not dropped.
        facts: groundFacts(transcript.text, output.facts),
        actions: groundFacts(transcript.text, output.actions),
        warnings: output.warnings,
        // The service names the model it answered with; the request only says what we asked for.
        model: reading.model,
      });
      return;
    }
    case 'truncated':
    case 'unreadable':
      // §13's "then show transcript only", after the one retry. Showing half a reading would be
      // guessing at the rest of it, and guessing is the one thing this product may not do.
      deps.onDegraded(reading.error);
      return;
    case 'refused':
      // A refusal is the service declining to read *this* document, so there is no reading to
      // fall back to. The catalogue's sentence offers the paste-text path (§13).
      throw new RunHalt(reading.error);
  }
}
