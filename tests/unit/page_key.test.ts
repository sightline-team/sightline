import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { pageFixtureKey } from '@/lib/fixtures/page_key';
import { RECORDED_PAGES } from '@/lib/fixtures/recorded';

/**
 * The digest a Mode F page is matched on (item **C-13**, decision **ADR-31**).
 *
 * Two properties, and the second is the reason this helper exists as its own file rather than an inline
 * `crypto.subtle` call:
 *  - it is **the** SHA-256 of the bytes, computed the same way however they are chunked. The recorder in
 *    `scripts/record-fixtures.ts` hashes the same file in Node, and the tab hashes it through
 *    `Blob.slice`, so if the two ever disagreed the demo would refuse its own photographs;
 *  - it is a **whole-file** digest. Nothing here strips metadata, resamples, or trims: the same bytes in,
 *    the same key out, and a different byte a different key. **ADR-31** rejects any near-match precisely
 *    because a fuzzy digest would let one person's page be answered with another document's transcript.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Deterministic bytes, so a failure here is reproducible rather than a coin flip. */
function filler(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) bytes[i] = (i * 31 + 7) % 251;
  return bytes;
}

describe('pageFixtureKey is SHA-256 of the whole file', () => {
  it('matches the one-shot digest of the same bytes', async () => {
    const bytes = filler(5_000);

    await expect(pageFixtureKey(new Blob([bytes]))).resolves.toBe(bytesToHex(sha256.create().update(bytes).digest()));
  });

  it('streams across its chunk boundary without changing the answer', async () => {
    // 300 KB is ~4.6 of the helper's 64 KB chunks. A join bug (a chunk dropped, a chunk fed twice, the
    // hash restarted) shows up here and nowhere else, because a single small blob never exercises the loop.
    const bytes = filler(300_000);
    const oneShot = bytesToHex(sha256.create().update(bytes).digest());

    await expect(pageFixtureKey(new Blob([bytes]))).resolves.toBe(oneShot);
  });

  it('is stable across calls and empty bytes hash as SHA-256 does', async () => {
    const bytes = filler(1_000);

    expect(await pageFixtureKey(new Blob([bytes]))).toBe(await pageFixtureKey(new Blob([bytes])));
    // The well-known digest of nothing. A zero-byte photograph would hash to this, and the recorder refuses
    // such a file before it can enter the corpus — see `scripts/record-fixtures.ts`.
    expect(await pageFixtureKey(new Blob([]))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('one byte differs, the key differs', async () => {
    // Stated as the negative of **ADR-31**'s rejected design: this is a matcher that cannot be near-missed.
    const a = filler(2_000);
    const b = new Uint8Array(a);
    b[1_500] = (b[1_500]! + 1) % 256;

    expect(await pageFixtureKey(new Blob([a]))).not.toBe(await pageFixtureKey(new Blob([b])));
  });

  it('the browser-free half of the demo chain: these helper calls land on the recorded keys', async () => {
    // The recorder hashed the files in Node; the tab hashes them with this function. That they agree on the
    // shipped JPEGs is what lets a keyless run answer, and it is checked here without launching a browser —
    // `tests/e2e/photo-fixtures.spec.ts` does it in one.
    const keys = await Promise.all(RECORDED_PAGES.map((page) => pageFixtureKey(new Blob([readFileSync(resolve(ROOT, page.imageFile))]))));

    expect(keys).toEqual(RECORDED_PAGES.map((page) => page.fixtureKey));
  });
});
