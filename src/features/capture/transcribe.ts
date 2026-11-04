import { buildTrustRecord } from '@/features/trust/record';
import { TRANSCRIBE_SYSTEM_PROMPT, TRANSCRIBE_USER_PROMPT } from '@/features/capture/prompts';
import { transcribeSchema, type TranscribeOutput } from '@/features/capture/schemas';
import { readCompletion, type CompletionResult } from '@/lib/near-ai/completion';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { toDataUrl } from '@/lib/image/prepare';
import type { NearClient } from '@/lib/near-ai/client';
import type { AttestationGate, SignatureVerifier } from '@/lib/near-ai/verification';
import type { Mode, TrustRecord } from '@/types';

/**
 * One page, one request, one transcript (item **C-03**; spec: `docs/ARCHITECTURE.md` §9 step 1).
 *
 * This is the photo path's first call, and the second half of what C-01 started: a camera file is
 * stripped and resized in the tab, and only the resulting JPEG is ever encoded into a request. The
 * sequence that keeps the privacy claim true — gate, body, send, signature, receipt, and only then
 * read the answer — is `readCompletion`'s (**P-08**), shared with the two text calls so the three of
 * them cannot drift apart on the order. What is decided *here* is only what a page request contains
 * and what its reply has to look like.
 *
 * ### One page at a time is the whole design
 *
 * `transcribePage` takes one blob and returns one result. Assembling several into a `Transcript`
 * with `pageOffsets`, deciding what a `captureIssues` answer costs the run (`needs_retake`, C-04),
 * and the page-label sanity check (C-05) are all above this function, because they need more than one
 * page to exist. Keeping this file to a single page is what makes the per-page budget in ADR-23 the
 * only size question asked here, and keeps a five-page document from becoming one request that
 * crosses the relay's body cap (F-05, `MAX_BODY_BYTES`).
 *
 * ### What comes back is not a decision
 *
 * A `CompletionResult`, not a transcript or a throw: `truncated` and `unreadable` are the two
 * outcomes a photograph actually produces (a page of tiny handwriting is the common case, PRD §10
 * risk 6), and the caller is the place that knows whether the person has other pages to work with.
 * A failed gate or an unverifiable signature still throws `RunHalt` from inside the helper — those
 * are not degraded readings, they are the run stopping (AGENTS.md §4 rules 5 and 6).
 *
 * ### Measured, not just written
 *
 * This request was sent to the live service on 2026-11-04 with a synthetic page in it
 * (`npm run spike -- --stage=image`, `docs/SPIKE_RESULTS.md` §4): HTTP 200 in 25.8 s, `finish_reason:
 * stop`, and **`transcribeSchema` accepted the reply** — 1,181 characters of text, no uncertain spans,
 * no page label, and one capture problem reported: `rotated`, for a page drawn 0.63° crooked. Its
 * `provider_tee` signature verified over the exact bytes this function builds. Two things that finding
 * leaves for other items, recorded here so they are not lost: **C-04** has to decide what a reported
 * tilt *costs*, because a model that calls 0.6° "rotated" would put nearly every hand-held photograph
 * into a retake loop; and **25.8 s per page** is what §12's progress announcements and any per-page
 * timeout are actually sized against, not the 1.83 s a 1×1 probe answered in.
 */

/**
 * The reply budget for one page (ADR-23).
 *
 * Chosen from three measured facts in `docs/SPIKE_RESULTS.md`, not from a round number, and then
 * confirmed against the live service with this exact request on 2026-11-04 (§4, "C-03's own request"):
 *  - **§1, 2026-11-04:** a probe with `max_tokens: 256` returned `content: null` because all 256 went
 *    to reasoning, twice. For a reasoning model the budget has to cover the thinking *and* the
 *    answer, or the page reads as a broken service (**P-13**) — so this is a correctness number.
 *  - **§4:** a page's input half is 2,494 image tokens, and this prompt adds ~316 of instruction,
 *    against a 1,048,576-token window. 8,192 out is 6% of it, so a request can never be rejected for
 *    being impossible; the measured page answered in **1,492 completion tokens (1,008 of them
 *    reasoning)**, which is 18% of this ceiling.
 *  - **§4:** the fallback `Qwen/Qwen3.8-27B` takes 65,536 output tokens, so the number sits inside
 *    both allowlisted models and the prompt never has to know which one the run settled on.
 *
 * And a ceiling is what makes the cost predictable: output bills at 500 nano-USD against 80 for input,
 * so the measured page cost $0.00097 and a page that filled 8,192 would cost $0.0041. If a page
 * genuinely needs more than 8,192 tokens to transcribe, the honest answer is that it is not one page —
 * which is §13's "split by page, retry once", and C-11's to detect.
 *
 * The number itself is `ADR-24`'s per-step plan (`STEP_PLANS.transcribe`), so a page, a structure step
 * and a question each carry their own budget from one place instead of three constants that can drift.
 */
export const TRANSCRIBE_MAX_TOKENS = STEP_PLANS.transcribe.maxTokens;

export interface TranscribeDeps {
  /** The session's mode. Mode F has no authored page reply, and says so (F-09, S-11). */
  mode: Mode;
  /** An allowlisted, image-capable model chosen by F-04. Never a user-typed string. */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  signal: AbortSignal;
  onTrustRecord: (record: TrustRecord) => void;
}

export async function transcribePage(deps: TranscribeDeps, jpeg: Blob): Promise<CompletionResult<TranscribeOutput>> {
  // Memoized, not because `send` calls it twice — it calls it once per attempt — but because a
  // repair retry must not re-run a ~1 MB canvas-to-base64 pass on the person's page while the first
  // attempt's string is still in memory. C-07's question is exactly how many copies of a page the
  // tab is holding.
  let encoding: Promise<string> | undefined;
  const imageDataUrl = (): Promise<string> => (encoding ??= toDataUrl(jpeg));

  return readCompletion<TranscribeOutput>({
    purpose: 'transcribe',
    mode: deps.mode,
    model: deps.model,
    transport: deps.transport,
    gate: deps.gate,
    verifySignature: deps.verifySignature,
    signal: deps.signal,
    onTrustRecord: deps.onTrustRecord,
    buildRecord: buildTrustRecord,
    maxTokens: TRANSCRIBE_MAX_TOKENS,
    request: {
      system: TRANSCRIBE_SYSTEM_PROMPT,
      // Not "page 1 of 3": the label has to come from the paper for C-05's gap check to be a check.
      user: TRANSCRIBE_USER_PROMPT,
      image: imageDataUrl,
    },
    parse: (content) => transcribeSchema.parse(JSON.parse(content) as unknown),
  });
}
