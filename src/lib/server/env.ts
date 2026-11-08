import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment configuration.
 *
 * Nothing here may reach a client bundle: `NEAR_AI_API_KEY` is the demo key that
 * lets the relay spend real credits. The `server-only` import makes an accidental
 * client-side import a build error rather than a leak (docs/PROJECT_STRUCTURE.md §2).
 *
 * Logging rule (AGENTS.md §4 rule 7): never log these values. `redactedSummary()`
 * is the only form that may be printed, and it reports booleans and counts.
 */

const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', ''])
  .default('')
  .transform((v) => v === 'true' || v === '1');

const csvList = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

const serverEnvSchema = z.object({
  NEAR_AI_API_KEY: z.string().default(''),
  RELAY_ENABLED: booleanFromEnv,
  ALLOWED_MODELS: csvList,
  // An unset or empty value keeps the documented default rather than crashing the
  // app on startup; a non-numeric value is a real configuration error and throws.
  RATE_LIMIT_PER_IP_PER_HOUR: z.preprocess(
    (v) => (v === undefined || v === '' ? 20 : Number(v)),
    z.number().int().positive(),
  ),
  RATE_LIMIT_STORE_URL: z.string().default(''),
  ALLOW_IN_MEMORY_RATE_LIMIT: booleanFromEnv,
  NODE_ENV: z.string().default('development'),
});

export interface ServerConfig {
  relayEnabled: boolean;
  /** Why the relay is off, in a form safe to show an operator. Never the key. */
  relayDisabledReason: RelayDisabledReason | null;
  allowedModels: string[];
  rateLimitPerIpPerHour: number;
  hasSharedStore: boolean;
  /** True only when a key exists; the key itself is never exposed on this object. */
  hasApiKey: boolean;
}

export type RelayDisabledReason = 'no_key' | 'not_requested' | 'no_allowed_models' | 'no_rate_limit_store';

function interpret(env: z.infer<typeof serverEnvSchema>): ServerConfig {
  const isProduction = env.NODE_ENV === 'production';
  const hasSharedStore = env.RATE_LIMIT_STORE_URL.length > 0 && env.RATE_LIMIT_STORE_URL !== 'memory';
  const allowInMemory = env.ALLOW_IN_MEMORY_RATE_LIMIT || env.RATE_LIMIT_STORE_URL === 'memory';

  let relayDisabledReason: RelayDisabledReason | null = null;
  if (!env.RELAY_ENABLED) relayDisabledReason = 'not_requested';
  else if (env.NEAR_AI_API_KEY.length === 0) relayDisabledReason = 'no_key';
  else if (env.ALLOWED_MODELS.length === 0) relayDisabledReason = 'no_allowed_models';
  // An in-memory counter does not survive across serverless instances, so in
  // production it is no limit at all. Fail closed instead of running unprotected
  // (docs/PRD.md §12 Q1 risk 7). In development the operator may accept that.
  // In serverless production, the operator may explicitly accept in-memory rate
  // limiting backed by a prepaid key cap budget control (blocker B-15).
  else if (isProduction && !hasSharedStore && !allowInMemory) relayDisabledReason = 'no_rate_limit_store';

  return {
    relayEnabled: relayDisabledReason === null,
    relayDisabledReason,
    allowedModels: env.ALLOWED_MODELS,
    rateLimitPerIpPerHour: env.RATE_LIMIT_PER_IP_PER_HOUR,
    hasSharedStore,
    hasApiKey: env.NEAR_AI_API_KEY.length > 0,
  };
}

export function serverConfig(raw: Record<string, string | undefined> = process.env): ServerConfig {
  return interpret(serverEnvSchema.parse(raw));
}

/** The secret, for the relay's Authorization header only. Never log or return it to a client. */
export function relayApiKey(raw: Record<string, string | undefined> = process.env): string {
  return raw.NEAR_AI_API_KEY ?? '';
}
