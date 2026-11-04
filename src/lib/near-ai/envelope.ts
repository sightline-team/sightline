import { z } from 'zod';

/**
 * The completion envelope (items **F-03**, **P-03**, **P-08**; shape from `docs/SPIKE_RESULTS.md` §1
 * and §2), and the one transport contract both document-derived calls depend on: the structure step
 * (P-03) and question answering (P-06) post to the same endpoint and get this back.
 *
 * It lives beside the client that produces those bytes rather than in a feature, so neither
 * feature has to import the other to check the shape of a response.
 *
 * This is the **transport** contract, not model-authored content, so it is validated before the
 * bytes are hashed and before `choices[0].message.content` is parsed as JSON. Only the fields
 * Sightline acts on are required: `id` is the key ADR-19 fetches the signature with, `model` is
 * what the receipt names, and `content` is the only thing that reaches the user.
 *
 * ### `finish_reason` and `refusal` are optional, and that is a decision, not an oversight
 *
 * SPIKE §1 records the openapi response properties at the **top level** — `choices`, `created`,
 * `id`, `model`, `object`, `usage` — and never enumerates what sits inside a choice. Both fields
 * below are what an OpenAI-compatible endpoint is expected to carry (`PRD.md` §"Error handling" and
 * `ARCHITECTURE.md` §13 both plan around `finish_reason: length`), so they were planned as
 * **[Unverified]**. **Partly closed by measurement on 2026-11-04** (`docs/SPIKE_RESULTS.md` §1, §4):
 * a live page request carried `finish_reason: "length"` and a `content` of `null`, and put the answer's
 * absence in a `reasoning_content` string — so `length` is now a value this repo has *seen*, and the
 * null is handled by `content` being nullable rather than by a second guess about the shape.
 * `refusal` has still never been observed, and the reading of all of this is unchanged:
 *
 *  - **they are optional**, so a response that omits them still parses and still gets verified;
 *  - **`finish_reason` is compared only against the one value a plan exists for** (`length`). Any
 *  other string is left alone rather than interpreted, because inventing a meaning for a value we
 *  have never seen is how a truncation bug becomes a wrong answer;
 *  - **absence never counts as a pass.** A missing `finish_reason` does not say "the answer is
 *  complete"; the content still has to parse, and if it does not, P-08's repair retry and
 *  transcript-only path run anyway. Detection is a faster, clearer route to the same behaviour, not
 *  a precondition for it.
 *
 * The value set beyond `length` is still owed (S-08, S-11); until then this file is the only place that
 * reads these fields, and `truncated`/`refusalOf` are the only way to ask.
 */
export const completionEnvelopeSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1).optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          /**
           * **Nullable, because the wire carries `null`** (measured 2026-11-04, item **P-13**,
           * `docs/SPIKE_RESULTS.md` §1, §4): a page request whose whole 256-token budget went to
           * reasoning answered `content: null` alongside a `reasoning_content` string, with
           * `finish_reason: "length"`. The field stays *required* — a message with no `content` key at
           * all is still a transport failure — and `contentOf` turns `null` into the empty string, so
           * the answer lands on the truncation path a person is told about instead of
           * `invalid_model_output`. `reasoning_content` is deliberately not in this schema: nothing in
           * Sightline reads a model's chain of thought aloud, and zod strips what it does not name.
           */
          content: z.string().nullable(),
          /** Present on a safety or capability refusal. Model-authored, so treated as data (§11). */
          refusal: z.string().nullable().optional(),
        }),
        /** OpenAI-compatible reason string. **[Measured]** on this endpoint: `"length"` is what a budget-
         * exhausted page returned (`docs/SPIKE_RESULTS.md` §1). Other values have still never been seen. */
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1, 'a completion with no choices has nothing to show the user'),
});

export type CompletionEnvelope = z.infer<typeof completionEnvelopeSchema>;

const choice = (envelope: CompletionEnvelope) => envelope.choices[0]!;

/**
 * True when the service said the answer was cut off at the token limit. Only `length` is claimed,
 * for the reason in the header comment: it is the one value `PRD.md` and ARCH §13 plan around.
 */
export function truncated(envelope: CompletionEnvelope): boolean {
  return choice(envelope).finish_reason === 'length';
}

/**
 * The content string this run should try to read — empty content is not an answer, and neither is
 * `null`, which is what a budget-exhausted reply carries (P-13). It is folded to `''` here so the one
 * place that decides "no answer" stays `content.length === 0` in the caller.
 */
export function contentOf(envelope: CompletionEnvelope): string {
  return choice(envelope).message.content ?? '';
}

/**
 * The service's own refusal, or `undefined`. Returned so a caller can decide *whether* to report a
 * refusal; nobody reads the prose aloud (see `features/analysis/pipeline.ts`, which reports
 * Sightline's sentence instead, because model output is untrusted data — AGENTS.md §11).
 */
export function refusalOf(envelope: CompletionEnvelope): string | undefined {
  const refusal = choice(envelope).message.refusal;
  return typeof refusal === 'string' && refusal.trim().length > 0 ? refusal : undefined;
}
