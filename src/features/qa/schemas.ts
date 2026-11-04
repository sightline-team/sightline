import { z } from 'zod';

/**
 * The answer shape a Q&A call must return (item **P-06**, `docs/ARCHITECTURE.md` §9).
 *
 * `notInDocument` is the model's own statement that the document does not answer the question;
 * it is *not* a guarantee, and the UI says "the document does not answer this", never "there is
 * no such information in the world". `sourceQuote` is optional in the shape and required by
 * honesty: when it is absent, or when its words are not in our transcript, `ask.ts` sets
 * `quoteFound: false` and the panel flags the answer (AGENTS.md §4 rule 8).
 *
 * No `confidence` field, here or anywhere: self-reported model confidence is not calibrated
 * and was cut (ADR-11).
 */
export const qaSchema = z.object({
  answer: z.string().min(1),
  notInDocument: z.boolean(),
  // `null` for "there is nothing to quote" is the same habit `features/analysis/schemas.ts` now
  // documents — measured on this service's replies to a `string?` field, and this prompt writes
  // `"sourceQuote": string?` too. Rejecting it would discard an answer the person was given.
  sourceQuote: z.string().min(1).nullish().transform((s) => s ?? undefined),
});

export type QaOutput = z.infer<typeof qaSchema>;
