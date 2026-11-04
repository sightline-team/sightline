import { z } from 'zod';
import { appError } from '@/lib/errors';
import { completionEnvelopeSchema, contentOf, refusalOf, truncated, type CompletionEnvelope } from '@/lib/near-ai/envelope';
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
import type { CallPurpose, NearClient, NearResponse } from '@/lib/near-ai/client';
import type { AppError, Mode, TrustPurpose, TrustRecord } from '@/types';

/**
 * What one document-derived call costs, and gets back (item **P-08**).
 *
 * Both calls that carry document data — the structure step (P-03) and a question (P-06) — make
 * the same four moves in the same order, and the order is the privacy guarantee: attestation
 * gate, then build the body, then send, then prove the signature, then *only then* read what the
 * model said. Before this file, that sequence was written out twice (`pipeline.ts` and
 * `ask.ts`), and the two copies had already started to differ in what they did with an answer
 * they could not read: one mapped it to `invalid_model_output` and stopped, and so did the other,
 * because neither had a truncation or refusal path yet.
 *
 * So the sequence lives here once, and each feature supplies only what is genuinely its own:
 * its prompt, its schema, and what to do with the outcome.
 *
 * ### The one repair retry
 *
 * `docs/ARCHITECTURE.md` §13 gives "Invalid JSON" one repair retry and then transcript-only. One
 * is the limit, structurally: `attemptOnce` runs, and if the content could not be read a second
 * `attemptOnce` runs, and its outcome is returned whatever it is. There is no loop to grow.
 *
 * The retry is asked for in the *user* message, leaving the system prompt byte-identical across
 * both attempts — the property `tests/unit/pipeline.test.ts` asserts for the instruction-bearing
 * message, and the reason a document's own words cannot leak into it (`AGENTS.md` §11).
 *
 * ### What the retry is *not* used for
 *
 * A `finish_reason: length` answer is not retried. §13's answer to truncation is "split by page,
 * retry once", and splitting is the image path's job (C-03/C-11); the text path has one page and
 * nothing to split. Re-sending the same oversized request after a note about JSON would spend a
 * second completion to produce the same cut-off answer, so a truncation is reported instead.
 * A transport failure is likewise never retried here — F-03's client already owns transient
 * retries, and a verification failure must never be retried at all (rule 6).
 *
 * ### Trust records
 *
 * One per call, so a run that repairs emits two, each naming its own completion id. `buildRecord`
 * is injected rather than imported: `features/trust/record.ts` is a feature, and `src/lib/`
 * importing one would point the layering the wrong way (`AGENTS.md` §7). The record is emitted
 * **before** the signature verdict is acted on, so a discarded answer still shows on the receipt
 * as "a completion was fetched and rejected" — silence where a check ran would read as though
 * nothing had been checked.
 */

/**
 * The instruction the single repair retry adds. Byte-stable, and the same words for both calls.
 *
 * It names the **code fence** as well as the prose, because `docs/SPIKE_RESULTS.md` §4 found a model
 * answering twice with valid JSON wrapped in ``` — which has no sentence before it or after it, so the
 * old wording did not describe the failure being repaired. A plain `JSON.parse` rejects it either way.
 */
export const REPAIR_NOTE =
  'Your previous reply could not be read as the JSON object this request asked for. Reply again with only that JSON object — no sentence before it or after it, and not inside a code fence.';

/**
 * What a read ended as. The three not-ok kinds carry the `AppError` their own code describes,
 * because the two runs disagree about the *consequence* and must not disagree about the reason:
 * a truncated analysis is a transcript-only screen (`P-08`), while a truncated answer is a
 * refusal to guess at a question. Neither invents its own wording — both take the catalogue's.
 */
export type CompletionResult<T> =
  | { kind: 'ok'; value: T; model: string }
  | { kind: 'truncated'; error: AppError }
  | { kind: 'refused'; error: AppError }
  | { kind: 'unreadable'; error: AppError };

/** `buildTrustRecord`'s shape, named so `lib/` can depend on a contract instead of a feature. */
export type TrustRecordBuilder = (args: {
  purpose: TrustPurpose;
  model: string;
  endpoint: TrustRecord['endpoint'];
  requestId: string;
  gate: GateOutcome;
  signature: SignatureOutcome;
}) => TrustRecord;

export interface ReadCompletionDeps<T> {
  /** Which document-derived call this is. Local metadata for Mode F, never in the body. */
  purpose: CallPurpose;
  /** The session's mode: it decides whether a check can be claimed at all. */
  mode: Mode;
  /** The allowlisted, TEE-hosted model the run settled on. Never a user-typed string. */
  model: string;
  /**
   * The instruction pair. `image` is set only by the photo path (**C-03**): a thunk that returns the
   * `data:` URL of the JPEG `lib/image/prepare.ts` produced, sent as an `image_url` part alongside
   * the text. Nothing else may appear there — the byte shape SPIKE §4 measured is the shape this
   * builds, and an *unprepared* image is exactly the thing that carries EXIF and GPS (AGENTS.md §4
   * rule 1).
   *
   * It is a **thunk, not a string**, for one reason: rule 6 says nothing document-derived is built
   * before the required checks pass, and the page is the most document-derived thing in the request.
   * A string would mean `transcribePage` had already encoded ~1 MB of the person's photograph by the
   * time the gate said `failed` and threw it away. Here the encoding happens inside `send`, after the
   * gate, and `transcribePage` memoizes it so a repair retry sends the same page rather than
   * re-encoding the photograph a second time.
   */
  request: { system: string; user: string; image?: () => Promise<string> };
  /**
   * The reply budget, in tokens. ADR-23 records why a *page* has one; ADR-24 put the same number on
   * the two text calls, for the same measured reason — a reasoning model that spends its whole budget
   * before answering returns `content: null` (§1, P-13), and a request with **no** budget caps nothing,
   * so §4's largest text completion (4,480 tokens) was unpriced rather than bounded. Each call site
   * reads its own row of `STEP_PLANS`; the number is never typed at a call.
   */
  maxTokens?: number;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  signal: AbortSignal;
  onTrustRecord: (record: TrustRecord) => void;
  buildRecord: TrustRecordBuilder;
  /** JSON.parse plus the feature's zod schema. Throwing is how "unreadable" is reported. */
  parse: (content: string) => T;
}

export async function readCompletion<T>(deps: ReadCompletionDeps<T>): Promise<CompletionResult<T>> {
  // `undefined` means "the content was unreadable and the retry has not been spent". Exactly one
  // second attempt is reachable from here, which is what makes "one repair retry" a structure
  // rather than a comment.
  const first = await attemptOnce(deps, false);
  if (first !== undefined) return first;
  // With `repair` true an unreadable answer returns `unreadable`, never `undefined`; the fallback
  // exists because the type cannot see that, and reports the same fact the branch would.
  return (await attemptOnce(deps, true)) ?? { kind: 'unreadable', error: appError('invalid_model_output') };
}

interface Attempt {
  envelope: CompletionEnvelope;
  rawText: string;
  sentBody: string;
}

async function attemptOnce<T>(deps: ReadCompletionDeps<T>, repair: boolean): Promise<CompletionResult<T> | undefined> {
  const isFixture = deps.mode === 'fixtures';

  // Before the body exists, for either attempt: the retry sends document data too, so it is
  // gated like the first. Mode F has no enclave to ask, and `fixtureGate` calls that `not_run`
  // rather than borrowing a pass from somewhere else.
  const gate = isFixture ? fixtureGate() : await deps.gate({ model: deps.model, signal: deps.signal });
  if (gate.status === 'failed') throw new RunHalt(appError('verification_failed'));

  const call = await send(deps, repair);

  const signature = isFixture
    ? fixtureSignature()
    : await deps.verifySignature({
        chatId: call.envelope.id,
        model: deps.model,
        sentBody: call.sentBody,
        rawText: call.rawText,
        signal: deps.signal,
      });

  deps.onTrustRecord(
    deps.buildRecord({
      purpose: deps.purpose,
      // The service names the model it answered with; the request only says what we asked for.
      model: call.envelope.model ?? deps.model,
      endpoint: deps.mode,
      requestId: call.envelope.id,
      gate,
      signature,
    }),
  );

  // A response we cannot prove came from the attested key is thrown away before anything in it
  // is read — including a refusal or a truncation, which are claims about the answer.
  if (!isFixture && !signature.verified) throw new RunHalt(appError('signature_invalid'));

  const refusal = refusalOf(call.envelope);
  if (refusal !== undefined) return { kind: 'refused', error: appError('model_refused') };
  if (truncated(call.envelope)) return { kind: 'truncated', error: appError('output_truncated') };

  try {
    return { kind: 'ok', value: deps.parse(contentOf(call.envelope)), model: call.envelope.model ?? deps.model };
  } catch (cause) {
    if (!repair) return undefined;
    // Prose and a shape we did not ask for are the same product fact: the answer did not arrive
    // readable. Anything else (an abort, an unexpected throw) still leaves through the halt door.
    if (cause instanceof z.ZodError || cause instanceof SyntaxError) return { kind: 'unreadable', error: appError('invalid_model_output') };
    return haltFrom(cause);
  }
}

/**
 * The request itself. The body is built **after** the gate returns, and carries nothing §1 of
 * `docs/SPIKE_RESULTS.md` does not document: no `stream`, no `response_format`, no sampling fields —
 * a request field nobody can point a source at is a field nobody can explain when it misbehaves.
 * The two exceptions are both measured there: the `image_url` part (S-02, §4) and `max_tokens`
 * (§1's 256-token probe), and both arrive only from a caller that asked for them.
 */
async function send<T>(deps: ReadCompletionDeps<T>, repair: boolean): Promise<Attempt> {
  try {
    // The instruction-bearing user message, text-only or text-plus-page. The repair note joins the
    // *text*, so the system prompt stays byte-identical across both attempts and the document's own
    // words stay inside the user message (AGENTS.md §11).
    const userText = repair ? `${deps.request.user}\n\n${REPAIR_NOTE}` : deps.request.user;
    const image = deps.request.image;
    const user =
      image === undefined
        ? userText
        : [
            { type: 'text', text: userText },
            // Awaited here, inside `send`, and therefore after the gate: this is the call's only
            // route out, so a page's bytes cannot be encoded before the run is allowed to have them.
            { type: 'image_url', image_url: { url: await image() } },
          ];
    const body: Record<string, unknown> = {
      model: deps.model,
      messages: [
        { role: 'system', content: deps.request.system },
        { role: 'user', content: user },
      ],
    };
    if (deps.maxTokens !== undefined) body.max_tokens = deps.maxTokens;

    const response: NearResponse = await deps.transport.post('chat/completions', body, {
      signal: deps.signal,
      purpose: deps.purpose,
    });

    return {
      // A response that does not match the transport contract is not "unreadable model output":
      // there is no completion id to fetch a signature with and nothing to repair, so this halts.
      envelope: completionEnvelopeSchema.parse(response.json),
      rawText: response.rawText,
      sentBody: response.sentBody ?? '',
    };
  } catch (cause) {
    return haltFrom(cause);
  }
}
