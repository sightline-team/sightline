import 'server-only';

import { notBuilt } from '@/lib/not_built';

/**
 * Rate limiting (item **F-06**).
 *
 * An in-memory counter is worthless on serverless — instances do not share memory
 * (PRD §12 Q1 row 7) — so this takes a store interface that a hosted KV can satisfy,
 * and the deployment refuses to enable the relay without one
 * (`lib/server/env.ts` → `relayDisabledReason: 'no_rate_limit_store'`).
 *
 * The per-key `spendLimit` PATCH is confirmed to exist (`docs/SPIKE_RESULTS.md` §8) and
 * is the backstop, but it is not the primary control: it caps total spend, not request
 * rate, and whether it is reachable on our account is still open (S-10).
 */
export interface RateLimitStore {
  increment(key: string, windowStartMinute: number): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Never a document-derived value, and never an API key. Just the bucket shape. */
  bucket: string;
}

export function rateLimit(_ip: string, _limitPerHour: number, _store?: RateLimitStore): Promise<RateLimitResult> {
  return notBuilt('F-06', 'Rate limiting') as never;
}
