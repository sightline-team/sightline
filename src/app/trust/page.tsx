import { TrustView } from '@/features/trust/TrustView';

/**
 * Trust receipt — the page the project exists for (item **T-09**).
 *
 * It is a thin route: the content is `features/trust/TrustReceipt.tsx`, the same component that
 * ends the results view, so there is exactly one implementation of "what was verified". Every
 * sentence on it is computed from a `TrustRecord` by `features/trust/claims.ts` (AGENTS.md §4
 * rules 1 and 5) — nothing is written in this file or in the view.
 */
export default function TrustPage() {
  return <TrustView />;
}
