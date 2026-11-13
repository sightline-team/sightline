import { attestationReportSchema } from '@/lib/near-ai/attestation';
import type { SigningAlgo } from '@/lib/near-ai/attestation';
import { verifyReportInput } from '@/lib/server/verify';
import { clientIp, globalRateLimit, rateLimit } from '@/lib/server/rateLimit';
import { z } from 'zod';

/**
 * `POST /api/verify` — item **T-03**, decided in ADR-33.
 *
 * Takes an attestation report plus the nonce the page minted and returns named `CheckResult[]` with
 * `ran` and `passed`. It receives **no user content** by construction (docs/ARCHITECTURE.md §8) and
 * it makes **no upstream call**, so it costs nothing and needs no key; that is also why it is safe to
 * answer at all.
 *
 * Read `lib/server/verify.ts` for what the answer means: every check this handler can run is a check
 * the browser already ran, so its verdict is a second opinion on the same bytes and its receipt line
 * says so. It is not yet a verifier in the sense ARCH §10 means — the four checks that need Intel's
 * certificate service, NVIDIA's service, or signed validity windows are still unanswered (**B-12**),
 * which is why the reachable status here is `partial` and never `verified` (AGENTS.md §4 rule 5).
 *
 * Before this route existed it answered 501, and a 501 is read as a **failed** check, not as silence
 * (rule 6) — which is what held every live-mode gate at `failed`. That behaviour stays: the only ways
 * to get a non-2xx out of here are a body this handler cannot read or one that is too big, and both
 * still halt a run. A caller must never be able to talk its way into a pass, so nothing in the
 * request can ask for a status; the status is computed from the bytes.
 */
export const dynamic = 'force-dynamic';

/**
 * A full live report measured 318,885 bytes (`fixtures/attestation/`, **T-08**) and the un-redacted
 * one is under a megabyte, so 1 MiB is triple the largest thing the service has ever answered here and
 * a quarter of the 4 MiB this used to accept. Over it the handler replies 413 rather than parsing,
 * because the report is attacker-shaped input and an unbounded JSON parse on a public route is a free
 * way to spend the machine's time.
 */
const MAX_REPORT_BODY_BYTES = 1024 * 1024;

/**
 * How many times one address may ask per hour, and the process-wide ceiling behind it.
 *
 * This route makes no upstream call and spends nothing, but it parses up to a megabyte of JSON and
 * walks it through two schemas, so it is a CPU surface rather than a spend one. The limits are the
 * same shape the relay uses (`lib/server/rateLimit.ts`, one hour bucket, hashed client) and are
 * deliberately generous: a single run asks once per model, and a retried page asks again.
 */
const VERIFY_PER_IP_PER_HOUR = 120;
const VERIFY_GLOBAL_PER_HOUR = 600;

const requestSchema = z.object({
  report: attestationReportSchema,
  /** 32 random bytes as hex. Uppercase is accepted because `decodeHex` reads it; nothing else is. */
  nonce: z.string().regex(/^[0-9a-fA-F]{64}$/),
  signing_algo: z.enum(['ecdsa', 'ed25519']).default('ed25519'),
});

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  // `no-store` on every answer, including the verdict: an attestation report names the machine and
  // the key it asserted, and a cached verdict would be a claim about a machine nobody just asked about.
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

/** The failure shapes, all of them readable as a failed check by the client and none of them quoting back what it sent. */
function refuse(status: number, reason: string): Response {
  return json({ error: reason, item: 'T-03' }, status);
}

export async function POST(request: Request): Promise<Response> {
  // Before the body is touched: an unauthenticated route that parses first and counts later spends
  // its CPU on the traffic it was meant to refuse.
  let bucket;
  let global;
  try {
    bucket = await rateLimit(`verify:${clientIp(request.headers)}`, VERIFY_PER_IP_PER_HOUR);
    global = await globalRateLimit(VERIFY_GLOBAL_PER_HOUR);
  } catch {
    return refuse(503, 'rate_limit_unavailable');
  }
  if (!bucket.allowed || !global.allowed) {
    return json({ error: 'rate_limited', item: 'T-03', retry_after_seconds: bucket.retryAfterSeconds }, 429, {
      'retry-after': String(bucket.retryAfterSeconds),
    });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_REPORT_BODY_BYTES) return refuse(413, 'body_too_large');

  const raw = await request.text();
  // Bytes, not characters: a body of multi-byte text is longer on the wire than `raw.length` claims,
  // and a cap that a caller can negotiate is not a cap.
  if (new TextEncoder().encode(raw).length > MAX_REPORT_BODY_BYTES) return refuse(413, 'body_too_large');

  // A body that is not JSON is a *finding*, not a crash: letting `JSON.parse` throw would answer 500
  // with a stack trace, and 400 with the reason is the same fail-closed outcome in plainer words.
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return refuse(400, 'invalid_request');
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return refuse(400, 'invalid_request');

  const outcome = verifyReportInput({
    report: parsed.data.report,
    nonce: parsed.data.nonce,
    signingAlgo: parsed.data.signing_algo as SigningAlgo,
  });

  return json({ status: outcome.status, checks: outcome.checks }, 200);
}
