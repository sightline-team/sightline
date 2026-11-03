import { z } from 'zod';

/**
 * The completion envelope (items **F-03**, **P-03**, shape from `docs/SPIKE_RESULTS.md` §1
 * and §2), and the one transport contract both document-derived calls depend on: the structure
 * step (P-03) and question answering (P-06) post to the same endpoint and get this back.
 *
 * It lives beside the client that produces those bytes rather than in a feature, so neither
 * feature has to import the other to check the shape of a response.
 *
 * This is the **transport** contract, not model-authored content, so it is validated before the
 * bytes are hashed and before `choices[0].message.content` is parsed as JSON. Only the fields
 * Sightline acts on are required: `id` is the key ADR-19 fetches the signature with, `model` is
 * what the receipt names, and `content` is the only thing that reaches the user.
 *
 * `finish_reason` is deliberately not parsed here — P-08 owns truncation, and reading a field
 * without acting on it is how a bug hides.
 */
export const completionEnvelopeSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1).optional(),
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1, 'a completion with no choices has nothing to show the user'),
});

export type CompletionEnvelope = z.infer<typeof completionEnvelopeSchema>;
