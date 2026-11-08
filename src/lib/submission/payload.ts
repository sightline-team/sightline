import { z } from 'zod';

/**
 * Hackathon submission payload validator and builder (item **X-04**).
 * Follows the official contract in `HACKATHON.md` §Submission API and §What the human decides.
 *
 * Requirements:
 * - Fixed contract fields only; extra fields rejected (especially the `website` spam trap).
 * - Maximum serialized payload size is 12,000 bytes.
 * - Never commits real personal data (personal data is kept outside the git tree).
 */

export const VALID_TRACKS = [
  'defi',
  'thesis',
  'privacy',
  'business',
  'swarms',
  'security',
  'agents',
  'realworld',
  'games',
  'nfts',
  'memecoins',
  'social',
  'open',
] as const;

export type HackathonTrack = (typeof VALID_TRACKS)[number];

export const VALID_TEAM_SIZES = ['1', '2 - 4', '4 - 6', '6 - 8', '8+'] as const;
export type TeamSize = (typeof VALID_TEAM_SIZES)[number];

/** NEAR account regex from HACKATHON.md: lowercase, 2-64 chars, named or implicit */
export const NEAR_ADDRESS_REGEX = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const MAX_PAYLOAD_BYTES = 12_000;

export const submissionPayloadSchema = z
  .object({
    requestId: z
      .string()
      .uuid({ message: 'requestId must be a valid lowercase UUID v4' }),
    projectName: z
      .string()
      .min(2, { message: 'projectName must be at least 2 characters' })
      .max(80, { message: 'projectName must be at most 80 characters' }),
    leadName: z
      .string()
      .min(2, { message: 'leadName must be at least 2 characters' })
      .max(80, { message: 'leadName must be at most 80 characters' }),
    email: z
      .string()
      .email({ message: 'email must be a valid email address' })
      .max(160, { message: 'email must be at most 160 characters' }),
    size: z.enum(VALID_TEAM_SIZES, {
      message: "size must be one of '1', '2 - 4', '4 - 6', '6 - 8', '8+'",
    }),
    tracks: z
      .array(z.enum(VALID_TRACKS))
      .min(1, { message: 'at least one track must be selected' })
      .refine(
        (tracks) => new Set(tracks).size === tracks.length,
        { message: 'each track in tracks array must be unique' },
      ),
    nearAddress: z
      .string()
      .min(2, { message: 'nearAddress must be at least 2 characters' })
      .max(64, { message: 'nearAddress must be at most 64 characters' })
      .refine(
        (addr) => addr === addr.toLowerCase(),
        { message: 'nearAddress must be lowercase' },
      )
      .refine(
        (addr) => NEAR_ADDRESS_REGEX.test(addr),
        { message: 'nearAddress must match the official NEAR account regex' },
      ),
    projectUrl: z
      .string()
      .url({ message: 'projectUrl must be a valid URL' })
      .max(300, { message: 'projectUrl must be at most 300 characters' }),
    demoUrl: z
      .string()
      .url({ message: 'demoUrl must be a valid URL' })
      .max(300, { message: 'demoUrl must be at most 300 characters' }),
    idea: z
      .string()
      .min(20, { message: 'idea must be at least 20 characters' })
      .max(2000, { message: 'idea must be at most 2000 characters' }),
    consent: z.literal(true, {
      message: 'consent must be true, confirmed after hearing the contact notice verbatim',
    }),
  })
  .strict();

export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  payload?: SubmissionPayload;
  byteLength?: number;
}

/**
 * Validate and serialize a submission payload.
 * Verifies all field contracts and ensures total UTF-8 byte length <= 12,000 bytes.
 */
export function validateSubmissionPayload(data: unknown): ValidationResult {
  const parsed = submissionPayloadSchema.safeParse(data);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const json = JSON.stringify(parsed.data);
  const byteLength = new TextEncoder().encode(json).length;

  if (byteLength > MAX_PAYLOAD_BYTES) {
    return {
      valid: false,
      errors: [`payload byte length (${byteLength} bytes) exceeds limit of ${MAX_PAYLOAD_BYTES} bytes`],
      byteLength,
    };
  }

  return {
    valid: true,
    payload: parsed.data,
    byteLength,
  };
}

/**
 * Standard Sightline hackathon metadata template (non-personal fields).
 */
export const SIGHTLINE_PROJECT_SUBMISSION_META = {
  projectName: 'Sightline',
  tracks: ['privacy'] as HackathonTrack[],
  projectUrl: 'https://github.com/sightline-team/sightline',
  idea: 'Sightline explains sensitive documents (medical records, benefits letters, tax bills) for blind and low-vision people using attested, confidential AI on NEAR AI Cloud. Zero server-side document custody, client-side TDX quote verification, and honest, transcript-grounded reading.',
};
