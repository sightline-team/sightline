import { handleRelay, type RelayDeps } from '@/lib/server/relay';

/**
 * `/api/relay/[...path]` — Mode B, item **F-05**.
 *
 * Five lines, deliberately: every rule this route has to hold (fixed upstream host, the four-path
 * exact allowlist, the model allowlist and its live TEE check, the size cap, the one-page rule, the
 * no-`stream` rule from **ADR-22**, the per-IP rate limit from **F-06**, and the byte-for-byte
 * passthrough **ADR-19** needs for the signature check to be possible at all) lives in
 * `lib/server/relay.ts` with its collaborators injectable, so the tests in `tests/relay/` can point it
 * at a fetch double rather than at the service holding our key. AGENTS.md §4 rule 9 is enforced there,
 * server-side, and none of it relies on the client asking nicely.
 *
 * Two facts a reader of this file used to need from a comment, now recorded where the code states them:
 *
 * - The relay forwards exactly the four paths in `NEAR_PATHS`. `GET /v1/models` is out (the browser
 *   reads that catalog itself) and so is `GET /v1/model/list` — measured 2026-11-03 to carry every
 *   model's TEE flags in one call, which made it tempting, but adding a path to the allowlist is a
 *   human decision (AGENTS.md §5) and the relay ships without it.
 * - If ADR-16's browser E2EE ever lands, the bytes forwarded here are ciphertext, which is what removes
 *   "the relay sees the document" from the threat model. Until then it does see them, in transit,
 *   unstored, and the claims ladder says so.
 */
export const dynamic = 'force-dynamic';
// Sized for TEE inference latency (SPIKE_RESULTS §4: page transcription ≈26–32 s, analysis ≈45–60 s, multi-page up to 118.6 s).
// Vercel serverless functions default to 15 s without this, which cuts off enclave responses with 504.
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  return handleRelay(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleRelay(request);
}
