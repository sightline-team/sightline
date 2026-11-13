import 'server-only';

import { isIP } from 'node:net';
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

/**
 * A counter the whole deployment shares, over a REST key-value API (Upstash-compatible).
 *
 * `env.ts` has refused to enable a production relay without `RATE_LIMIT_STORE_URL` since **F-06**, and
 * until now nothing read it: `rateLimit` always fell back to the module-level map, so the "shared"
 * limit was per warm instance — 20 × N on a serverless host. This is the missing half, built on
 * `fetch` rather than a client library so it adds no dependency (`AGENTS.md` §5).
 *
 * Two commands, not a pipeline: `INCR` answers the count, and only the first call in a window pays for
 * the `EXPIRE` that stops the key living forever. A store that answers with a shape other than
 * `{ result: number }` is treated as unavailable, not as zero. What it cannot do is survive a store
 * that is down: the caller refuses the request (`rate_limit_unavailable`) rather than letting an
 * outage remove the only control on the key.
 */
export function createRestStore(deps: { url: string; token?: string; fetchImpl?: typeof fetch }): RateLimitStore {
  const doFetch = deps.fetchImpl ?? globalThis.fetch;
  const endpoint = deps.url.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(deps.token === undefined || deps.token.length === 0 ? {} : { authorization: `Bearer ${deps.token}` }),
  };

  async function command(args: (string | number)[]): Promise<unknown> {
    const response = await doFetch(endpoint, { method: 'POST', headers, body: JSON.stringify(args) });
    if (!response.ok) throw new Error(`rate limit store answered ${response.status}`);
    const body = (await response.json()) as { result?: unknown };
    return body.result;
  }

  return {
    async increment(key, windowStartMinute) {
      // The window is in the key, so a counter never needs to be read across a boundary: the next hour
      // starts at 1 under a new key and the old one expires on its own.
      const counted = await command(['INCR', `${key}:${windowStartMinute}`]);
      if (typeof counted !== 'number' || !Number.isFinite(counted)) throw new Error('rate limit store answered without a count');
      if (counted === 1) await command(['EXPIRE', `${key}:${windowStartMinute}`, WINDOW_MINUTES * 60 + 60]);
      return counted;
    },
  };
}

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
  return count(`ip:${ip}`, limitPerHour, store, nowMs);
}

/**
 * The process-wide (per instance) ceiling, on top of a client's own bucket.
 *
 * Its reason is address rotation: the per-IP bucket is bounded per address, so the budget a stranger
 * can spend is bounded only if something counts across addresses too. A fixed identifier keeps it
 * one bucket and no IP, which is also why it can be the one thing an operator sees filling.
 */
export async function globalRateLimit(
  limitPerHour: number,
  store: RateLimitStore = devStore,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  return count('relay:global', limitPerHour, store, nowMs);
}

async function count(identifier: string, limitPerHour: number, store: RateLimitStore, nowMs: number): Promise<RateLimitResult> {
  const windowStartMinute = Math.floor(nowMs / (WINDOW_MINUTES * 60_000)) * WINDOW_MINUTES;
  const key = bucketKey(identifier, windowStartMinute);
  const count_ = await store.increment(key, windowStartMinute);
  return {
    allowed: count_ <= limitPerHour,
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
 *
 * ### The last hop, not the first, and only an address
 *
 * `x-forwarded-for` is a list a proxy *appends* to, so its first entry is whatever the client claimed
 * and its last is the hop the trusted edge saw. Reading the first (as this did) let a caller choose
 * their own bucket anywhere the edge does not overwrite the header — measured safe on Vercel, which
 * sets `x-real-ip`, and unsound on any host that forwards the list verbatim. A value that is not an
 * IP literal is refused rather than hashed: `unknown` stands in for it, so one malformed header can
 * only put its sender in the shared bucket, never in somebody else's.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp !== undefined && isIP(realIp) !== 0) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const hops = forwarded.split(',').map((hop) => hop.trim()).filter((hop) => hop.length > 0);
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const hop = hops[i]!;
      // A hop may carry a port (`1.2.3.4:5678`) or brackets (`[::1]`); neither is part of the address.
      const bare = hop.replace(/^\[/, '').replace(/\](:\d+)?$/, '').replace(/:\d+$/, '');
      if (isIP(bare) !== 0) return bare;
    }
  }
  return 'unproxied';
}
