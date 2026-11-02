'use client';

import Link from 'next/link';
import { TrustReceipt } from '@/features/trust/TrustReceipt';
import { useSessionStore } from '@/lib/session/store';

/**
 * The `/trust` view (item **T-09**). Thin on purpose: it renders the same `TrustReceipt` that
 * ends the results view, so there is one implementation of the receipt and the two cannot drift
 * into telling different stories about the same run.
 */
export function TrustView() {
  const { session } = useSessionStore();

  return (
    <>
      <h1>Verification</h1>
      <p className="muted">
        {session.trust.length === 0
          ? 'This is where Sightline says exactly which checks ran on an answer and which did not.'
          : `This is the receipt for ${session.trust.length === 1 ? 'the answer Sightline gave' : `the ${session.trust.length} answers Sightline gave`} in this session.`}
      </p>
      {session.trust.length === 0 ? (
        <p>
          <Link href="/">Add a document</Link>
        </p>
      ) : null}

      <TrustReceipt records={session.trust} />
    </>
  );
}
