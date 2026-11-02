import { z } from 'zod';
import { NearError, type NearClient } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { notBuilt } from '@/lib/not_built';
import { newId } from '@/lib/session/reducer';
import { claimFor } from '@/features/trust/claims';
import { STRUCTURE_SYSTEM_PROMPT, structureUserPrompt } from '@/features/analysis/prompts';
import { analysisSchema, completionEnvelopeSchema } from '@/features/analysis/schemas';
import { groundFacts } from '@/features/analysis/grounding';
import type { Analysis, AppError, AttestationStatus, CheckResult, Session, Transcript, TrustRecord } from '@/types';

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

/** A stop the caller must show. One shape for every pipeline failure, so P-05 catches once. */
export class PipelineHalt extends Error {
  readonly error: AppError;

  constructor(error: AppError) {
    super(error.userMessage);
    this.name = 'PipelineHalt';
    this.error = error;
  }
}

/**
 * What the attestation gate found. `status: 'not_run'` is Mode F: there is no enclave to
 * attest, and calling that `failed` would be a claim about a check that never happened.
 * `claimFor` gives it no rung either way, and the demo-data banner is what the user sees.
 */
export interface GateOutcome {
  status: AttestationStatus;
  checks: CheckResult[];
  nonce: string;
  signingAlgo: 'ecdsa' | 'ed25519';
  /** When the report was fetched. `0` means never, which is only honest in Mode F. */
  fetchedAt: number;
}

export interface SignatureOutcome {
  algo: 'ecdsa' | 'ed25519';
  verified: boolean;
  checks: CheckResult[];
}

export type AttestationGate = (args: { model: string; signal: AbortSignal }) => Promise<GateOutcome>;

/**
 * ADR-19 in one signature: the verifier is handed the **exact** bytes (`sentBody`,
 * `rawText`) so it can rebuild `request_hash` and `response_hash`, plus the completion id
 * to fetch the signature with. F-03 keeps those bytes for no other reason.
 */
export type SignatureVerifier = (args: {
  chatId: string;
  model: string;
  sentBody: string;
  rawText: string;
  signal: AbortSignal;
}) => Promise<SignatureOutcome>;

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

/** The checks Mode F can honestly report: the only one that runs is the transcript consistency check. */
function fixtureChecks(): CheckResult[] {
  return [
    { name: 'attestation_report', ran: false, passed: false, detail: 'Fixture mode calls no service, so there is no report to check.' },
    { name: 'quote_consistency', ran: true, passed: true, detail: 'Quotes were matched against the transcript the user pasted.' },
  ];
}

function haltFrom(cause: unknown): never {
  if (cause instanceof PipelineHalt) throw cause;
  if (cause instanceof NearError) throw new PipelineHalt(cause.error);
  // `JSON.parse` throws a SyntaxError on prose. That is the same product fact as a schema
  // rejection — the answer did not arrive in the shape we asked for — and mapping it to
  // `unknown` would hide the reason from the error catalogue. P-08 splits this again into
  // `model_refused` vs truncated output; until then both are unusable, fail closed.
  if (cause instanceof z.ZodError || cause instanceof SyntaxError) throw new PipelineHalt(appError('invalid_model_output'));
  throw new PipelineHalt(appError('unknown'));
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
    throw new PipelineHalt(appError('unknown'));
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
    gate = { status: 'not_run', checks: fixtureChecks(), nonce: '', signingAlgo: 'ed25519', fetchedAt: 0 };
  } else {
    gate = await deps.gate({ model: deps.model, signal: deps.signal });
    // Rule 6, and the whole reason the gate is called before the body is built: a failed
    // check stops the run while there is still nothing document-derived to send.
    if (gate.status === 'failed') throw new PipelineHalt(appError('verification_failed'));
  }

  const completion = await structureStep(deps, transcript);

  const signature: SignatureOutcome = isFixture
    ? {
        algo: gate.signingAlgo,
        verified: false,
        checks: [{ name: 'response_signature', ran: false, passed: false, detail: 'Fixture data is not signed by an enclave.' }],
      }
    : await deps.verifySignature({
        chatId: completion.envelope.id,
        model: deps.model,
        sentBody: completion.sentBody,
        rawText: completion.rawText,
        signal: deps.signal,
      });

  const record: TrustRecord = buildRecord({ deps, gate, signature, completion });
  deps.onTrustRecord(record);

  // A response we cannot prove came from the attested key is discarded, not displayed
  // (rule 6). The record goes out first: the receipt must show that a completion was
  // fetched and rejected, rather than leaving the user with silence where a check ran.
  if (!isFixture && !signature.verified) throw new PipelineHalt(appError('signature_invalid'));

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
      { signal: deps.signal },
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

function buildRecord(args: {
  deps: PipelineDeps;
  gate: GateOutcome;
  signature: SignatureOutcome;
  completion: StructureCall;
}): TrustRecord {
  const { deps, gate, signature, completion } = args;
  const facts = {
    id: newId(),
    purpose: 'analyse' as const,
    model: completion.envelope.model ?? deps.model,
    endpoint: deps.session.mode,
    requestId: completion.envelope.id,
    // Never true until T-10 has encrypted something for real. `claimFor` also refuses to
    // reach the strong rung while E2EE_PROVEN_IN_BROWSER is false, so this cannot overclaim.
    e2ee: false,
    attestation: {
      nonce: gate.nonce,
      fetchedAt: gate.fetchedAt,
      checks: [...gate.checks, ...signature.checks],
      status: deps.session.mode === 'fixtures' ? 'not_run' : gate.status,
    },
    signature: { algo: signature.algo, verified: signature.verified },
  };

  // The claim is computed from the facts above and cannot be passed into `claimFor`, whose
  // parameter type omits `claim` — so no earlier step can decide the sentence.
  return { ...facts, claim: claimFor(facts) };
}
