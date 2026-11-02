import { serverConfig } from '@/lib/server/env';

/**
 * `/api/relay/[...path]` — Mode B, item **F-05**.
 *
 * This stub forwards **nothing**, and that is the point of writing it early: a relay
 * route that exists before its allowlist exists is an open proxy. When F-05 builds the
 * real handler, every one of these rules is enforced server-side and none of them may
 * rely on the client asking nicely (AGENTS.md §4 rule 9):
 *
 * - upstream host is fixed in code; the client can never supply a URL;
 * - **exact-path** allowlist, and nothing wider: `POST /v1/chat/completions`,
 *   `GET /v1/attestation/report`, `GET /v1/signature/{chat_id}` (the set ROADMAP F-05 names),
 *   plus `GET /v1/model/{model_name}` — which ADR-18 makes necessary because the TEE flags are
 *   only on the per-model call, so the allowlist cannot be built from `/v1/models`. That fifth
 *   path is recorded as a follow-up on F-05 rather than silently widened here.
 *   `GET /v1/models` itself is **not** allowed through the relay: it is public metadata the
 *   browser can read directly, and a path with no document in it is still a path.
 *   Two constraints F-03 has already fixed (see `docs/ARCHITECTURE.md` §8): the client's relay
 *   base is the same-origin path `/api/relay/v1`, so this handler sees `v1/<endpoint>` and must
 *   map it to the identical upstream path; and a model name arrives **percent-encoded inside one
 *   segment** (`model/Qwen%2FQwen3-VL-30B-A3B-Instruct`), so the allowlist matches the encoded
 *   form. Whether Next decodes `%2F` before handing segments to `params.path` has not been
 *   observed and needs the live check (B-05) — do not assume it either way.
 * - model allowlist, TEE-hosted entries only (ADR-18);
 * - request size cap, one page per request;
 * - per-IP rate limit through a shared store — and `lib/server/env.ts` already keeps the
 *   relay off in production without one (`relayDisabledReason: 'no_rate_limit_store'`);
 * - never log bodies, key-bearing headers or document-derived values;
 * - stream responses (slow vision calls against a serverless time limit).
 *
 * If ADR-16's browser E2EE ever lands, the bytes this handler forwards are ciphertext,
 * which is what removes "the relay sees the document" from the threat model. Until then
 * it does see them, in transit, unstored, and the claims ladder says so.
 */
export const dynamic = 'force-dynamic';

const NOT_BUILT = {
  error: 'not_implemented',
  message: 'The relay is not implemented yet. Owner: ROADMAP item F-05. Nothing is forwarded.',
  item: 'F-05',
};

function refuse(): Response {
  const config = serverConfig();
  return new Response(
    JSON.stringify({ ...NOT_BUILT, relay_enabled: config.relayEnabled, reason: config.relayDisabledReason }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
}

export async function GET(): Promise<Response> {
  return refuse();
}

export async function POST(): Promise<Response> {
  return refuse();
}
