/**
 * Trust receipt — placeholder until item **T-09**.
 *
 * This is the page the project exists for: the exact claim that the code supports, the
 * list of every attestation check with `ran` and `passed`, and a plain statement of
 * which checks did **not** run. `partial` is never rendered as "verified" (AGENTS.md §4
 * rule 5), and every sentence here comes from `features/trust/claims.ts` (rule 1).
 *
 * Expected content once built (docs/ARCHITECTURE.md §10): what the checks establish,
 * what they do not, the model id, the endpoint used, whether the request was encrypted
 * to the attested key, and the response signature result.
 */
export default function TrustPage() {
  return (
    <>
      <h1>Verification</h1>
      <p>Nothing has been verified yet. This receipt is built by roadmap item T-09.</p>
      <p className="muted">
        When it exists, it will say exactly which checks ran, which did not, and what that does and
        does not prove about the document you sent.
      </p>
    </>
  );
}
