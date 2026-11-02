/**
 * `POST /api/verify` — item **T-03**.
 *
 * Takes an attestation report plus our nonce and the model id and returns named
 * `CheckResult[]` with `ran` and `passed`. It receives **no user content** by
 * construction (docs/ARCHITECTURE.md §8), and running the heavy checks here means the
 * user trusts our server's verdict for those checks — which the receipt must disclose
 * (ARCH §10).
 *
 * Until T-03 exists this answers 501 rather than pretending to verify. A caller must
 * treat a non-2xx as a failed check and fail closed (AGENTS.md §4 rule 6), never as
 * "verification passed because nobody said otherwise".
 */
export const dynamic = 'force-dynamic';

const NOT_BUILT = {
  error: 'not_implemented',
  message: 'Attestation verification is not implemented yet. Owner: ROADMAP item T-03.',
  item: 'T-03',
};

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify(NOT_BUILT), {
    status: 501,
    headers: { 'content-type': 'application/json' },
  });
}
