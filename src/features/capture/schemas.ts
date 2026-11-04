import { z } from 'zod';

/**
 * The transcription response contract (items **P-01**, **C-03**; spec:
 * `docs/ARCHITECTURE.md` §9 step 1: "strict JSON `{ text, uncertain[], captureIssues[], pageLabel? }`").
 *
 * It moved out of `features/analysis/schemas.ts` with the transcription prompt, for the same P-06
 * reason: the feature that sends a request owns what it asks back. `features/analysis` runs on the
 * transcript, never on the page.
 *
 * Model JSON is untrusted input (AGENTS.md §7), so every field here is a boundary: unknown keys are
 * **stripped, not rejected** (zod's default) because a helpful extra field must not cost the person
 * their transcript, while a missing or malformed required field is exactly what P-08's repair retry
 * and transcript-only path are for.
 *
 * `text` is `min(1)` and `uncertain` spans must run forward, and neither is decoration:
 *  - an empty `text` is "nothing was read", which must not become an empty transcript presented as a
 *    finished one (AGENTS.md §4 rule 10 — never guess unreadable text, surface it);
 *  - a span that does not run forward cannot be cut out of the transcript, so it would silently drop
 *    the "this part is uncertain" notice the person relies on.
 *
 * **No `confidence` field is accepted** — self-reported model confidence is not calibrated and was cut
 * (ADR-11), and a page that reads `{"confidence": 0.98}` must not have that number reach a screen.
 */

/** What the model is allowed to say is wrong with the *photograph*, as opposed to the writing. */
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

export type TranscribeOutput = z.infer<typeof transcribeSchema>;
