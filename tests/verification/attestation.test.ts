import { describe, expect, it } from 'vitest';
import { NotBuilt } from '@/lib/not_built';
import { fetchReport, verifyWithServer } from '@/lib/near-ai/attestation';
import { checkSignature, fetchSignature } from '@/lib/near-ai/signatures';
import { decryptResponseContent, encryptRequest, E2EE_PROVEN_IN_BROWSER } from '@/lib/near-ai/e2ee';
import { CLAIM_COPY, FIXTURES_BANNER } from '@/features/trust/claims';

/**
 * Verification tests at scaffold time.
 *
 * T-01, T-02, T-03, T-05 and T-08 own the real assertions, and none of them can be written
 * honestly today: they need live report bytes (B-05) or an implementation that does not exist.
 * What this file *can* pin down is the two failure modes that would make the finished product a
 * lie — a stub quietly returning something plausible, and the strong privacy rung being reached
 * without proof. Everything else is listed as `it.todo` so the gap is in the test report, not
 * only in a document.
 */

/** A refusal may be synchronous (a stub) or a rejected promise (a real async implementation). */
async function expectRefusal(fn: () => unknown, item: string): Promise<void> {
  let result: unknown;
  try {
    result = fn();
  } catch (error) {
    expect(error, `${item}: wrong error type`).toBeInstanceOf(NotBuilt);
    expect((error as NotBuilt).item).toBe(item);
    return;
  }
  if (result instanceof Promise) {
    await expect(result, `${item}: resolved instead of refusing`).rejects.toThrow(NotBuilt);
    return;
  }
  throw new Error(`${item}: returned a value instead of refusing — a stub that fakes a result is worse than one that throws`);
}

describe('trust-path stubs refuse rather than invent an answer', () => {
  const cases: [string, () => unknown][] = [
    ['T-01', () => fetchReport({ model: 'x', nonce: 'n', signingAlgo: 'ed25519' })],
    ['T-01', () => verifyWithServer({ gateway_attestation: {}, model_attestations: [] }, 'n')],
    ['T-02', () => fetchSignature('chat-id', { algo: 'ed25519' })],
    [
      'T-02',
      () =>
        checkSignature(
          { text: 't', signature: 's', signing_address: 'a', signing_algo: 'ed25519' },
          { requestBytes: 'r', responseBytes: 'p', modelId: 'm', attestedKeyOrAddress: 'a' },
        ),
    ],
    ['T-10', () => encryptRequest('{"a":1}', 'aa'.repeat(32))],
    ['T-10', () => decryptResponseContent('beef', new Uint8Array(32), 'aa'.repeat(32))],
  ];

  it.each(cases)('a call owned by %s throws NotBuilt naming that item', (_item, fn) => expectRefusal(fn, _item));

  it('names the item in the message, so a user-visible failure tells us where to go', () => {
    try {
      encryptRequest('{}', 'aa'.repeat(32));
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('ROADMAP item T-10');
    }
  });
});

describe('the strong claim is unreachable without proof', () => {
  it('E2EE has not been proven from a browser, so no TrustRecord may claim it (AGENTS.md §4 rule 2)', () => {
    // Promoting this constant to true requires: a live enclave decrypting a browser-built
    // payload, the evidence line in ROADMAP T-10, and a §10 log entry. Not a code edit alone.
    expect(E2EE_PROVEN_IN_BROWSER).toBe(false);
  });

  it('the fixtures banner is exactly the promised sentence (AGENTS.md §4 rule 11)', () => {
    expect(FIXTURES_BANNER).toBe('Demo data. No real privacy guarantee.');
  });

  it('the weaker rung never says only the enclave can read the upload', () => {
    // The whole ladder is one rung apart on this phrase; if the fallback copy grows that claim
    // the privacy story silently upgrades itself.
    expect(CLAIM_COPY.attested_model_signed_responses).not.toMatch(/only the (verified )?enclave can read/i);
    expect(CLAIM_COPY.fixtures).not.toMatch(/enclave|encrypt|private/i);
  });

  it('every rung states what it does not cover, or is the fixtures warning', () => {
    expect(CLAIM_COPY.attested_model_signed_responses).toMatch(/standard secure web connections/);
  });
});

describe('decided verification set (ARCH §10) — written when the code exists', () => {
  it.todo('nonce binding: a report whose request_nonce differs from ours fails (T-01, needs B-05)');
  it.todo('NRAS GPU verdict: an unattested device fingerprint fails the check (T-01)');
  it.todo('TDX quote: valid passes, tampered tcb fails, expired fails — fixtures from T-08 (gated on B-05)');
  it.todo('partial status is rendered as the ran/passed list and never as "verified" (T-05, needs T-04 claimFor)');
  it.todo('a signature over changed bytes fails and the response is discarded (T-02, T-12)');
  it.todo('the signed text is rebuilt with the exact wire bytes, trailing newlines included (ADR-19, T-02)');
  it.todo('a 501 from /api/verify is treated as failure, not as silence (T-03, fail closed)');
  it.todo('attestation changed mid-session: re-fetch once, then stop with attestation_changed (T-07)');
  it.todo('e2ee_enclave is selected only when TrustRecord.e2ee is true and the flag is proven (T-04)');
});
