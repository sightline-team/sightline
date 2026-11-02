import { z } from 'zod';

/**
 * Schemas for model output (item **P-01**). Model JSON is untrusted input
 * (AGENTS.md §7): every field that reaches the UI or a `TrustRecord` passes through
 * here first.
 *
 * Unknown keys are **stripped, not rejected** (zod's default). A model that adds a
 * helpful extra field must not cost the user the whole transcript — the hard failure
 * path is P-08 (one repair retry, then show the transcript only), and it should trigger
 * on missing or malformed required fields, not on noise.
 *
 * No `confidence` field is accepted anywhere: self-reported model confidence is not
 * calibrated and was cut (ADR-11).
 */

export const captureIssueSchema = z.enum([
  'cut_off_top',
  'cut_off_bottom',
  'cut_off_left',
  'cut_off_right',
  'rotated',
  'glare',
  'too_small_text',
  'blurry',
  'not_a_document',
  'handwriting_present',
]);

export const transcribeSchema = z.object({
  text: z.string().min(1),
  uncertain: z
    .array(
      z
        .object({ start: z.int().min(0), end: z.int().min(0), reason: z.enum(['illegible', 'low_contrast', 'cropped']) })
        .refine((u) => u.end > u.start, { message: 'uncertain span must run forward' }),
    )
    .default([]),
  captureIssues: z.array(captureIssueSchema).default([]),
  pageLabel: z.string().optional(),
});

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
  sender: z.string().optional(),
  summary: z.string().min(1),
  facts: z
    .array(z.object({ kind: factKindSchema, label: z.string().min(1), value: z.string().min(1), sourceQuote: z.string().min(1) }))
    .default([]),
  actions: z
    .array(
      z.object({
        text: z.string().min(1),
        deadline: z.string().optional(),
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

export const qaSchema = z.object({
  answer: z.string().min(1),
  notInDocument: z.boolean(),
  sourceQuote: z.string().optional(),
});

/**
 * The completion envelope (item **P-03**, shape from `docs/SPIKE_RESULTS.md` §1 and §2).
 *
 * This is the **transport** contract, not model-authored content, so it is validated before
 * the bytes are hashed and before `choices[0].message.content` is parsed as JSON. Only the
 * fields Sightline acts on are required: `id` is the key ADR-19 fetches the signature with,
 * `model` is what the receipt names, and `content` is the only thing that reaches the user.
 *
 * `finish_reason` is deliberately not parsed here — P-08 owns truncation, and reading a
 * field without acting on it is how a bug hides.
 */
export const completionEnvelopeSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1).optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1, 'a completion with no choices has nothing to show the user'),
});

export type TranscribeOutput = z.infer<typeof transcribeSchema>;
export type AnalysisOutput = z.infer<typeof analysisSchema>;
export type QaOutput = z.infer<typeof qaSchema>;
export type CompletionEnvelope = z.infer<typeof completionEnvelopeSchema>;
