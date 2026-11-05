import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * The demo page's identity (item **C-13**, decision **ADR-31**).
 *
 * Mode F answers a *page* only for a photograph the demo itself shipped (`lib/fixtures/replay.ts`,
 * rule 1: a demo answer is only ever given for a demo document). For pasted text the document's own
 * words are the identity, and content matching works. A page image cannot be matched that way: its
 * bytes arrive inside an `image_url` part, so the existing corpus lookup — "does this body contain that
 * document?" — has nothing to read. This is the handle that replaces it.
 *
 * **What is hashed is the file as the person chose it**, not the JPEG the app then sends. Three
 * reasons, and the second one is the one that decides it:
 *
 *  1. *It is the thing the demo controls.* The three files under `public/sample-docs/photographs/` are
 *     ours, so their digests are known when the fixtures are recorded, and a visitor who chooses one of
 *     them is recognised in every browser on every machine.
 *  2. *The prepared bytes are not stable.* A page goes through `lib/image/prepare.ts`, which decodes and
 *     re-encodes with a canvas encoder — and Chrome, Firefox and Safari do not produce the same bytes
 *     for the same picture. Keying the fixture on the *request* bytes would therefore give a demo that
 *     works on the machine that recorded it and refuses on the reviewer's, which is worse than the
 *     problem it solves: `npm run dev:fixtures` exists so that anyone can run the flow at all.
 *  3. *A near-miss is not acceptable.* A perceptual or fuzzy hash would match a mostly-white page of
 *     somebody's own letter to a mostly-white demo page, and Mode F would then put an authored reading
 *     on screen as though it described *their* document. That is the exact dishonesty F-09 was built to
 *     prevent, so the match here is exact-digest or nothing.
 *
 * The consequence of 2 is written down rather than hidden: the reply was recorded against the bytes
 * `prepare.ts` made in Chromium on the day of recording, and a different browser's re-encode of the same
 * file is a different JPEG of the same page. The reading is of the page's printed words, which survive
 * re-encoding; and `tests/e2e/photo-fixtures.spec.ts` re-runs the app's own preparation on the shipped
 * files and asserts the geometry still matches what was recorded, so a change to C-01 that would make
 * the recorded answer describe a different picture fails a test instead of quietly misleading somebody.
 *
 * Two implementation notes that are both load-bearing:
 *  - **Streamed, in 64 KiB slices.** `file.arrayBuffer()` would hold a second full copy of every
 *    photograph the person adds, which is the question **C-07** is still asking about this tab.
 *  - **`@noble/hashes`, not `crypto.subtle`.** SubtleCrypto is unavailable in a non-secure context, and
 *    a phone reached over a LAN IP (`http://192.168.x.x`, the normal way to test this app on a real
 *    camera) is exactly that. A demo that only works on `localhost` is not a demo.
 *
 * The digest is **local to Mode F's routing**: it is `CallInit` metadata, it never enters a request
 * body, and it is never logged or stored beyond the in-memory session (AGENTS.md §4 rule 7). Live modes
 * do not read it at all.
 */

/** Read in 64 KiB pieces, so the whole page is never held twice. */
const CHUNK_BYTES = 64 * 1024;

/**
 * The key a photographed page is recognised by: the lower-case hex SHA-256 of the file's bytes, read in
 * slices so a five-page set never sits in memory twice. An empty file has a digest (of nothing) and is
 * not a photograph; `features/capture/useCapture.ts` only calls this on a file it has already accepted
 * as one, so that case cannot arrive from the screen.
 */
export function pageFixtureKey(file: Blob): Promise<string> {
  return (async () => {
    const hash = sha256.create();
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      hash.update(new Uint8Array(await file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size)).arrayBuffer()));
    }
    return bytesToHex(hash.digest());
  })();
}
