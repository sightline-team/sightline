import { z } from 'zod';
import type { Mode } from '@/types';

/**
 * Client-safe configuration. This module may be imported from a client
 * component, so it reads only NEXT_PUBLIC_ values. Server values live in
 * `lib/server/env.ts`, which is guarded by the `server-only` package.
 */

// The union itself is owned by `src/types/index.ts` so the session state and the
// configuration cannot drift apart.
export const MODES = ['fixtures', 'relay', 'direct'] as const satisfies readonly Mode[];

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', ''])
  .default('')
  .transform((v) => v === 'true' || v === '1');

const publicEnvSchema = z.object({
  NEXT_PUBLIC_NEAR_AI_BASE_URL: z.url().default('https://cloud-api.near.ai/v1'),
  NEXT_PUBLIC_DEFAULT_MODE: z.enum(MODES).default('fixtures'),
  // Mode A (browser calls NEAR AI Cloud directly) stays off until the S-06 CORS
  // spike proves it works; a browser cannot be relied on to report the failure
  // politely (docs/ARCHITECTURE.md §14 item 6).
  NEXT_PUBLIC_ALLOW_DIRECT: booleanFromEnv,
});

/** Shape of the values a server component passes down about what the deployment allows. */
export interface Availability {
  relayEnabled: boolean;
  directEnabled: boolean;
}

export interface PublicConfig {
  baseUrl: string;
  /** The mode the app actually runs in, after availability is taken into account. */
  mode: Mode;
  /** What the operator asked for, before it was downgraded. Surfaced so the UI can say so. */
  requestedMode: Mode;
  downgraded: boolean;
  downgradeReason?: 'relay' | 'direct';
  allowDirect: boolean;
}

const ALL_UNAVAILABLE: Availability = { relayEnabled: false, directEnabled: false };

/**
 * Fail closed to fixtures. A requested mode that the deployment cannot honour
 * must never be silently replaced by something with a different privacy story —
 * the claim shown to the user depends on the mode (AGENTS.md §4 rule 1).
 */
export function resolveMode(requested: Mode, availability: Availability = ALL_UNAVAILABLE): PublicConfig['mode'] {
  if (requested === 'fixtures') return 'fixtures';
  if (requested === 'relay' && availability.relayEnabled) return 'relay';
  if (requested === 'direct' && availability.directEnabled) return 'direct';
  return 'fixtures';
}

export function publicConfig(
  env: Record<string, string | undefined> = process.env,
  availability: Availability = ALL_UNAVAILABLE,
): PublicConfig {
  const parsed = publicEnvSchema.parse(env);
  const mode = resolveMode(parsed.NEXT_PUBLIC_DEFAULT_MODE, availability);
  const requestedMode = parsed.NEXT_PUBLIC_DEFAULT_MODE;
  const downgraded = mode !== requestedMode;

  return {
    baseUrl: parsed.NEXT_PUBLIC_NEAR_AI_BASE_URL,
    mode,
    requestedMode,
    downgraded,
    downgradeReason: downgraded && requestedMode !== 'fixtures' ? requestedMode : undefined,
    allowDirect: parsed.NEXT_PUBLIC_ALLOW_DIRECT,
  };
}
