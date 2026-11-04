import { z } from 'zod';

/**
 * Schemas for model output (item **P-01**). Model JSON is untrusted input
 * (AGENTS.md §7): every field that reaches the UI or a `TrustRecord` passes through
 * here first.
 *
 * Two shapes have left this file, and a third went with them, because the feature that sends the
 * prompt owns what it asks back: the answer shape is in `features/qa/schemas.ts` (P-06), the
 * completion envelope — a transport contract rather than model-authored content — is in
 * `lib/near-ai/envelope.ts`, and the transcription contract went to `features/capture/schemas.ts`
 * with the C-03 prompt.
 *
 * Unknown keys are **stripped, not rejected** (zod's default). A model that adds a
 * helpful extra field must not cost the user the whole transcript — the hard failure
 * path is P-08 (one repair retry, then show the transcript only), and it should trigger
 * on missing or malformed required fields, not on noise.
 *
 * No `confidence` field is accepted anywhere: self-reported model confidence is not
 * calibrated and was cut (ADR-11).
 */

/**
 * An optional string the model may answer with `null` instead of leaving out, where `null` means
 * the same thing as absent.
 *
 * Measured 2026-11-04, not feared: `npm run spike -- --stage=document` had **every** reply that
 * reached a JSON object — on both planned models, on the first request and on the repair retry —
 * write a deadline-less action as `"deadline": null`. Six attempts, six rejections, one reason
 * each. The prompt says "Omit fields that are absent"; a schema that rejects the model's way of
 * omitting one is the bug P-01 closed for `kind` wearing a different field, and it costs the
 * person the reading of a document the app had summarised correctly.
 */
const optionalString = z.string().min(1).nullish().transform((s) => s ?? undefined);

export const factKindSchema = z.enum([
  'date',
  'amount',
  'phone',
  'reference',
  'medication',
  'dose',
  'address',
  'other',
]);

export const analysisSchema = z.object({
  docType: z.enum(['bill', 'bank', 'medical', 'prescription', 'legal', 'government', 'other']),
  sender: optionalString,
  summary: z.string().min(1),
  facts: z
    .array(z.object({ kind: factKindSchema, label: z.string().min(1), value: z.string().min(1), sourceQuote: z.string().min(1) }))
    .default([]),
  actions: z
    .array(
      z.object({
        text: z.string().min(1),
        deadline: optionalString,
        sourceQuote: z.string().min(1),
      }),
    )
    .default([]),
  warnings: z
    .array(
      z.object({
        kind: z.enum(['medical', 'legal', 'financial', 'unreadable', 'urgency']),
        text: z.string().min(1),
      }),
    )
    .default([]),
});

export type AnalysisOutput = z.infer<typeof analysisSchema>;
