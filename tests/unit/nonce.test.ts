import { afterEach, describe, expect, it, vi } from 'vitest';
import { NONCE_BYTES, newNonce } from '@/lib/near-ai/attestation';

/**
 * The nonce is the one cryptographic primitive that exists at scaffold time, because everything
 * else in the trust path depends on its shape and it has no external dependency (T-01 builds the
 * fetch and the checks on top of it).
 *
 * What it must be: 32 random bytes, hex-encoded to 64 lowercase characters, **fresh per session**
 * (AGENTS.md §4 rule 4). What it must not be: predictable, reused, shorter, or derived from the
 * document. The service documents the nonce as the thing binding a report to *this* request, so a
 * reused or guessable nonce silently turns every attestation check into a check of an old answer.
 */
const HEX64 = /^[0-9a-f]{64}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newNonce', () => {
  it('produces exactly 64 lowercase hex characters (32 bytes)', () => {
    const nonce = newNonce();
    expect(nonce).toHaveLength(NONCE_BYTES * 2);
    expect(nonce).toMatch(HEX64);
  });

  it('reads from the CSPRNG, not Math.random', () => {
    // The stub also proves the bytes are copied out of the buffer: it fills every byte with 0xaf.
    const seen: Uint8Array[] = [];
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: Uint8Array) => {
        seen.push(buf);
        buf.fill(0xaf);
        return buf;
      },
    });
    expect(newNonce()).toBe('af'.repeat(NONCE_BYTES));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.length).toBe(NONCE_BYTES);
  });

  it('never repeats across a session worth of calls', () => {
    const nonces = new Set(Array.from({ length: 500 }, () => newNonce()));
    expect(nonces.size).toBe(500);
  });

  it('contains no uppercase hex, which the report endpoint charset would reject', () => {
    for (let i = 0; i < 50; i += 1) expect(newNonce()).not.toMatch(/[A-F]/);
  });

  it('takes no arguments, so a nonce cannot be derived from the request it protects', () => {
    // Structural guard: a "deterministic for tests" refactor that seeds the nonce from caller
    // data would stop it being a challenge. Arity is checked because the behaviour is already
    // covered by the uniqueness test above.
    expect(newNonce.length).toBe(0);
  });
});

describe('NONCE_BYTES', () => {
  it('is the documented 32 bytes', () => {
    // `docs/SPIKE_RESULTS.md` §3: the report endpoint takes a 64-hex nonce. If this constant
    // changes, every attestation fixture and the check in T-01 has to change with it.
    expect(NONCE_BYTES).toBe(32);
  });
});
