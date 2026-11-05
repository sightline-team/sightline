import 'server-only';

import { sha256 } from '@noble/hashes/sha2.js';

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
 *
 * ### What the bucket key is, and what it is not
 *
 * The store never sees an IP address. It sees `sha256(ip + hour)` as hex, which means the
 * thing that counts requests is also the thing that would have to be subpoenaed — and it
 * holds no address in it. `RateLimitResult.bucket` reports the same hash prefix plus the
 * window, so an operator can debug "is this bucket filling?" without this module keeping a
 * map from hash back to client.
 */

/** One hour, in the unit the store's window argument uses (minutes since the epoch). */
const WINDOW_MINUTES = 60;

export interface RateLimitStore {
  /** Increment this key's counter for the window and return the count *including* this call. */
  increment(key: string, windowStartMinute: number): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Never a document-derived value, and never an API key or an IP. Just the bucket shape. */
  bucket: string;
  /** Seconds until this window rolls over — the value of the 429's `Retry-After`. */
  retryAfterSeconds: number;
}

/** The process-wide counter development runs on. Never the production control (see `env.ts`). */
const devStore = createInMemoryStore();

export function createInMemoryStore(): RateLimitStore {
  const buckets = new Map<string, Map<number, number>>();
  return {
    async increment(key, windowStartMinute) {
      // Drop every window but the one being counted: an hour bucket that has passed is not
      // coming back, and a map keyed by client is exactly how a "counter" becomes a memory leak.
      const windows = buckets.get(key);
      if (windows === undefined || !windows.has(windowStartMinute)) {
        buckets.set(key, new Map([[windowStartMinute, 1]]));
        return 1;
      }
      const next = (windows.get(windowStartMinute) ?? 0) + 1;
      windows.set(windowStartMinute, next);
      return next;
    },
  };
}

/**
 * May this client make this request?
 *
 * `store` is injected so the same function serves the in-memory counter in development and a
 * hosted store in production; with none it uses the process-wide one, which `env.ts` only allows
 * outside production (a production relay without `RATE_LIMIT_STORE_URL` is disabled, so it never
 * reaches this line).
 */
export async function rateLimit(
  ip: string,
  limitPerHour: number,
  store: RateLimitStore = devStore,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const windowStartMinute = Math.floor(nowMs / (WINDOW_MINUTES * 60_000)) * WINDOW_MINUTES;
  const key = bucketKey(ip, windowStartMinute);
  const count = await store.increment(key, windowStartMinute);
  return {
    allowed: count <= limitPerHour,
    bucket: `hour:${windowStartMinute}/${key.slice(0, 12)}`,
    retryAfterSeconds: Math.max(1, Math.ceil(((windowStartMinute + WINDOW_MINUTES) * 60_000 - nowMs) / 1000)),
  };
}

/** A hash, not the address. Two calls in the same window for the same client agree. */
function bucketKey(ip: string, windowStartMinute: number): string {
  return [...sha256(new TextEncoder().encode(`${ip}|${windowStartMinute}`))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The client's address, from the header a proxy sets.
 *
 * With no proxy in front (local development) there is no address to read, and every request shares
 * one bucket. That is the honest fallback: refusing to count at all would mean the limit silently
 * does nothing, and inventing an address would mean the limit silently does something wrong.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded.trim().length > 0) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip')?.trim() ?? 'unproxied';
}
