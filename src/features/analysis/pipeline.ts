import type { NearClient } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { buildTrustRecord } from '@/features/trust/record';
import { readCompletion } from '@/lib/near-ai/completion';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { RunHalt, type AttestationGate, type SignatureVerifier } from '@/lib/near-ai/verification';
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema } from '@/features/analysis/schemas';
import { groundFacts } from '@/features/analysis/grounding';
import type { Analysis, AppError, Mode, Transcript, TrustRecord } from '@/types';

/**
 * The two-step pipeline (item **P-03**, flow `docs/ARCHITECTURE.md` §5).
 *
 * Order is a rule, not a preference: verify attestation → transcribe (one request per
 * page) → fetch and check that response's signature → structure the transcript → ground
 * the quotes → ready. Nothing document-derived is sent before the required checks pass
 * (AGENTS.md §4 rule 6), and every step appends a `TrustRecord`.
 *
 * This file is the **structure step** and only that — the fifth call in the order above, the one
 * that turns a transcript into a summary. It takes the transcript from its caller (**C-02**): on the
 * text path (§5.2) that is what the person pasted, on the photo path (§5.1) it is the document
 * `features/capture/assemble.ts` joined from the pages. Which of the two it receives is not decided
 * here — capture, image prep and the per-page transcription belong to the caller (`app/_flow/`), and
 * they have all run before this function is reached.
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
 * enclave (B-05), the page loop and the join (**C-03/C-05/C-11** — `features/capture/`), and
 * `numbersRechecked` (**T-11**, conditional on C-10).
 */

export interface PipelineDeps {
  /**
   * Not the whole session: the only thing the structure step asks the session for is this, and a
   * session also carries a `transcript`, which would be a second, possibly stale answer to the
   * question the field below already answers (**C-02**).
   */
  mode: Mode;
  /**
   * The exact words this reading is about to make a summary of.
   *
   * Passed in rather than read off the session (**C-02**), because there are now two honest answers to
   * "what is the transcript": the text a person pasted, and the document `features/capture/assemble.ts`
   * joined from several photographs (**C-11**, **ADR-27**) — offsets, `uncertain` spans and hole markers
   * included. Both belong to the *caller*, which is the only place that knows which one it has, and the
   * one object passed here is the object the UI shows, the object the quotes are grounded against and the
   * object inside the hashed request body. A pipeline that re-derived it would be a second copy of that
   * decision, and the second copy is what drifts.
   */
  transcript: Transcript;
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
  const transcript = deps.transcript;
  if (transcript.text.trim().length === 0) {
    // P-05 must not allow an empty submit, and `assembleDocument` says `usable: false` before a photo
    // run reaches here; this is the fail-closed backstop, not the message.
    throw new RunHalt(appError('unknown'));
  }

  deps.onTranscript(transcript);

  const reading = await readCompletion({
    purpose: 'analyse',
    mode: deps.mode,
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
