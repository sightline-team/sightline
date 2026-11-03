import { expect, test, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import path from 'node:path';

/**
 * **C-01**'s real-browser proof: a GPS-tagged JPEG goes into `lib/image/prepare.ts` and its metadata
 * comes out gone.
 *
 * Why this half cannot be a unit test: the stripping is done by a decoder and an encoder we do not own
 * — Chromium's `createImageBitmap` (which applies EXIF orientation) and `OffscreenCanvas` (which writes
 * a fresh JPEG). The resize ladder, the byte budget and the bitmap release are tested in
 * `tests/unit/image-prepare.test.ts` against an injected seam; what is proved here is that the browser
 * implementation of that seam really removes the tags and really bakes the rotation into the pixels.
 *
 * The module runs **as its own source**: bundled at import time with the `esbuild` Vite already
 * installs (a build tool, not a new runtime dependency), injected as a script tag, called from the
 * page. Nothing here reimplements `prepareImage`, so a change in the module moves this test rather
 * than drifting from it.
 *
 * Everything is synthetic. The picture is a two-tone canvas this file draws; the coordinates are a
 * string in a test, not a location (AGENTS.md §5, "never do" real documents and photos).
 *
 * **Both halves of the proof were checked by breaking them** (2026-11-03, same method as P-11/P-12):
 *  - returning the *source* blob instead of the re-encoded one fails the metadata test, and leaves the
 *    pixel test green — which is exactly why both are needed, and why the file says so below.
 *  - `imageOrientation: 'none'` does **not** break the pixel test. Chromium's decoder rotates an
 *    EXIF-6 JPEG whatever the option says, so the claim this file makes is "the output is upright and
 *    carries no tag", not "our option caused the rotation". The comment in `prepare.ts` records it.
 */

const SRC = path.join(__dirname, '..', '..', 'src');

const PREPARE_BUNDLE = buildSync({
  entryPoints: [path.join(SRC, 'lib', 'image', 'prepare.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'SightlinePrepare',
  platform: 'browser',
  target: 'esnext',
  alias: { '@': SRC },
}).outputFiles[0]!.text;

/** The sentinel is searched for in the output bytes; if it survives, the GPS block survived. */
const GPS_SENTINEL = '51.5074N000.1278W';

interface PrepareResult {
  width: number;
  height: number;
  size: number;
  bytes: number[];
}

/** The page-side handle on the bundled module, typed once instead of at every call. */
async function prepare(page: Page, bytes: Uint8Array, mime = 'image/jpeg', options: Record<string, number> = {}): Promise<PrepareResult> {
  return page.evaluate(
    async ({ bytes, mime, options }) => {
      const api = (window as unknown as { SightlinePrepare: { prepareImage: (b: Blob, o?: object) => Promise<{ blob: Blob; width: number; height: number }> } }).SightlinePrepare;
      const prepared = await api.prepareImage(new Blob([Uint8Array.from(bytes)], { type: mime }), options);
      return {
        width: prepared.width,
        height: prepared.height,
        size: prepared.blob.size,
        bytes: Array.from(new Uint8Array(await prepared.blob.arrayBuffer())),
      };
    },
    { bytes: Array.from(bytes), mime, options },
  );
}

/**
 * Draw a two-tone page and return it as a clean canvas JPEG.
 *
 * The stored image is `width` × `height` with the **top** half white. With EXIF orientation 6
 * ("rotate 90° clockwise to display") the upright page is `height` × `width` with that band on its
 * **right** half — which is what the pixel assertions below look for.
 */
async function drawJpeg(page: Page, width = 40, height = 20): Promise<Uint8Array> {
  const bytes = await page.evaluate(async ({ w, h }) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, Math.floor(h / 2));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, Math.floor(h / 2), w, Math.ceil(h / 2));
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { w: width, h: height });
  return Uint8Array.from(bytes);
}

// --- A JPEG that really carries EXIF + GPS, written byte by byte -----------------------------------

const ORIENTATION_TAG = 0x0112;
const EXIF_IFD_TAG = 0x8769;
const GPS_IFD_TAG = 0x8825;
/** The APP1 payload prefix that says "what follows is TIFF". Six bytes, counted rather than trusted. */
const EXIF_MARKER = 'Exif\0\0';

interface Entry {
  tag: number;
  type: number; // 1 BYTE, 2 ASCII, 3 SHORT, 4 LONG
  count: number;
  /** The 4 value bytes: inline data, or a little-endian offset filled in by the caller. */
  value: Uint8Array;
}

function ifdSize(entries: number): number {
  return 2 + entries * 12 + 4;
}

function writeIfd(view: DataView, at: number, entries: Entry[]): void {
  // Sorted by tag, because a parser is entitled to reject an out-of-order IFD.
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  view.setUint16(at, sorted.length, true);
  let o = at + 2;
  for (const e of sorted) {
    view.setUint16(o, e.tag, true);
    view.setUint16(o + 2, e.type, true);
    view.setUint32(o + 4, e.count, true);
    view.setUint8(o + 8, e.value[0]!);
    view.setUint8(o + 9, e.value[1] ?? 0);
    view.setUint8(o + 10, e.value[2] ?? 0);
    view.setUint8(o + 11, e.value[3] ?? 0);
    o += 12;
  }
  view.setUint32(o, 0, true); // no third IFD
}

function u32le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

/**
 * A TIFF block: IFD0 (orientation + two sub-IFD pointers) → Exif IFD → GPS IFD → the GPS string.
 *
 * Offsets are computed from the entry counts rather than hard-coded, because the only way this test
 * stays honest as it grows is for the bytes to be *derived*, not memorised.
 */
function buildTiff(orientation: number, gpsText: string): Uint8Array {
  const ascii = new TextEncoder().encode(`${gpsText}\0`);
  const header = 8;
  const ifd0At = header;
  const exifAt = ifd0At + ifdSize(3);
  const gpsAt = exifAt + ifdSize(1);
  const dataAt = gpsAt + ifdSize(3);

  const out = new Uint8Array(dataAt + ascii.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0x4949, true); // "II" — little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd0At, true);

  writeIfd(view, ifd0At, [
    { tag: ORIENTATION_TAG, type: 3, count: 1, value: new Uint8Array([orientation, 0, 0, 0]) },
    { tag: EXIF_IFD_TAG, type: 4, count: 1, value: u32le(exifAt) },
    { tag: GPS_IFD_TAG, type: 4, count: 1, value: u32le(gpsAt) },
  ]);
  writeIfd(view, exifAt, [{ tag: 0xa002, type: 4, count: 1, value: u32le(40) }]);
  writeIfd(view, gpsAt, [
    { tag: 0x0000, type: 1, count: 4, value: new Uint8Array([2, 3, 0, 0]) }, // GPSVersionID
    { tag: 0x0001, type: 2, count: 2, value: new TextEncoder().encode('N\0') }, // GPSLatitudeRef
    { tag: 0x001b, type: 2, count: ascii.length, value: u32le(dataAt) }, // GPSProcessingMethod
  ]);
  out.set(ascii, dataAt);
  return out;
}

/** Splice an APP1 EXIF segment in where a camera puts it: directly after SOI. */
function withApp1(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const marker = new TextEncoder().encode(EXIF_MARKER);
  const payload = new Uint8Array(marker.length + tiff.length);
  payload.set(marker, 0);
  payload.set(tiff, marker.length);
  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (payload.length + 2) >> 8;
  segment[3] = (payload.length + 2) & 0xff;
  segment.set(payload, 4);

  const out = new Uint8Array(2 + segment.length + jpeg.length - 2);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/**
 * The JPEG's segments, walked from SOI: `marker` is the low byte (`0xe1` for APP1) and `payload` is
 * everything after the two-byte length. A walk rather than a search, because "the file contains the
 * bytes E1" is not evidence that a segment is there — and this test's whole claim is about segments.
 */
function segments(bytes: Uint8Array): { marker: number; payload: Uint8Array }[] {
  const found: { marker: number; payload: Uint8Array }[] = [];
  let i = 2; // past SOI
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    found.push({ marker, payload: bytes.subarray(i + 4, i + 2 + len) });
    i += 2 + len;
  }
  return found;
}

const markerIds = (bytes: Uint8Array) => segments(bytes).map((s) => s.marker.toString(16).padStart(2, '0'));

/** Where each half of the decoded output lands, as mean luma — measured in the page, not assumed. */
async function halves(page: Page, blobBytes: Uint8Array): Promise<{ decodedWidth: number; decodedHeight: number; left: number; right: number; top: number; bottom: number }> {
  return page.evaluate(async (bytes) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const x = Math.floor(bitmap.width / 2);
    const y = Math.floor(bitmap.height / 2);
    const mean = (d: Uint8ClampedArray) => (d[0]! + d[1]! + d[2]!) / 3;
    const out = {
      decodedWidth: bitmap.width,
      decodedHeight: bitmap.height,
      left: mean(ctx.getImageData(1, y, 3, 3).data),
      right: mean(ctx.getImageData(bitmap.width - 4, y, 3, 3).data),
      top: mean(ctx.getImageData(x, 1, 3, 3).data),
      bottom: mean(ctx.getImageData(x, bitmap.height - 4, 3, 3).data),
    };
    bitmap.close();
    return out;
  }, Array.from(blobBytes));
}

test.describe('C-01 image preparation, in a browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ content: PREPARE_BUNDLE });
  });

  test('the input this test builds really is a GPS-tagged rotated JPEG — so nothing below can pass vacuously', async ({ page }) => {
    const clean = await drawJpeg(page);
    // A canvas JPEG carries no APP1 before we splice one in, so the marker found below is ours.
    expect(markerIds(clean)).not.toContain('e1');

    const tagged = withApp1(clean, buildTiff(6, GPS_SENTINEL));
    expect(markerIds(tagged)).toContain('e1');
    expect(Buffer.from(tagged).toString('latin1')).toContain(GPS_SENTINEL);
    // The orientation tag is exactly where the written layout says: payload = "Exif\0\0" + an
    // 8-byte TIFF header + a 2-byte entry count, then the tag itself, little-endian.
    const app1 = segments(tagged).find((x) => x.marker === 0xe1)!;
    expect(Buffer.from(app1.payload).subarray(0, 6).toString('latin1')).toBe(EXIF_MARKER);
    const tiff = new DataView(app1.payload.buffer, app1.payload.byteOffset + 6);
    expect(tiff.getUint16(0, true)).toBe(0x4949); // "II"
    expect(tiff.getUint32(4, true)).toBe(8); // IFD0 offset
    expect(tiff.getUint16(8 + 2, true)).toBe(ORIENTATION_TAG);
    expect(tiff.getUint16(8 + 2 + 2, true)).toBe(3); // type SHORT
    expect(tiff.getUint8(8 + 2 + 8)).toBe(6); // orientation 6 = rotate 90° clockwise
  });

  test('a GPS-tagged JPEG comes back with no EXIF, no GPS, and no orientation tag', async ({ page }) => {
    const tagged = withApp1(await drawJpeg(page), buildTiff(6, GPS_SENTINEL));
    const prepared = await prepare(page, tagged);

    const out = Uint8Array.from(prepared.bytes);
    // SOI first: if the encoder ever hands back something that is not a JPEG, this fails before the
    // metadata assertions can pass by accident.
    expect(out.subarray(0, 2)).toEqual(Uint8Array.from([0xff, 0xd8]));
    const ms = markerIds(out);
    expect(ms).not.toContain('e1');
    // Measured, not assumed: Chromium's encoder writes an APP2 **ICC profile** (sRGB) into its JPEGs.
    // That is the encoder's own colour description, not the camera's metadata — but "no APPn survived"
    // would be a false claim, so each application segment is checked for what it actually is: EXIF and
    // GeoTIFF are the two markers that can carry a position, and neither identifier appears.
    for (const s of segments(out).filter((x) => x.marker >= 0xe0 && x.marker <= 0xef)) {
      const head = Buffer.from(s.payload).subarray(0, 16).toString('latin1');
      expect(head).not.toContain('Exif');
      expect(head).not.toMatch(/^GeoTiff|^GeoTIFF/i);
      if (s.marker === 0xe2) expect(head).toContain('ICC_PROFILE');
    }
    const text = Buffer.from(out).toString('latin1');
    expect(text).not.toContain('Exif');
    expect(text).not.toContain(GPS_SENTINEL);
    expect(prepared.size).toBeGreaterThan(0);
    expect(prepared.size).toBeLessThanOrEqual(768 * 1024);
  });

  test('the rotation is baked into the pixels before the tag that described it is thrown away', async ({ page }) => {
    // 40×20 stored, top half white, orientation 6 → upright is 20×40 with the light band on the RIGHT.
    // If the decoder ignored orientation the band would still be top/bottom; if the encoder kept the
    // tag the pixel test would pass while the marker test above failed. Both are needed.
    const tagged = withApp1(await drawJpeg(page), buildTiff(6, GPS_SENTINEL));
    const prepared = await prepare(page, tagged);
    expect(prepared.width).toBe(20);
    expect(prepared.height).toBe(40);

    const measured = await halves(page, Uint8Array.from(prepared.bytes));
    expect(measured.decodedWidth).toBe(20);
    expect(measured.decodedHeight).toBe(40);
    expect(measured.right).toBeGreaterThan(180);
    expect(measured.left).toBeLessThan(70);
  });

  test('a large page is downscaled to the long-edge limit and still decodes', async ({ page }) => {
    const prepared = await prepare(page, await drawJpeg(page, 2000, 1200));
    expect(prepared.width).toBe(1600);
    expect(prepared.height).toBe(960);

    const measured = await halves(page, Uint8Array.from(prepared.bytes));
    expect(measured.decodedWidth).toBe(1600);
    expect(measured.decodedHeight).toBe(960);
    expect(prepared.size).toBeLessThanOrEqual(768 * 1024);
  });

  test('a PNG with transparency becomes a JPEG on white, not on black', async ({ page }) => {
    const source = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(30, 30);
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 30, 30);
      ctx.fillStyle = 'rgb(200,0,0)';
      ctx.fillRect(0, 0, 30, 10);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const prepared = await prepare(page, Uint8Array.from(source), 'image/png');
    expect(prepared.width).toBe(30);

    const pixel = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      // A transparent area mid-image. JPEG cannot hold alpha, so whatever shows is what was composited.
      const d = ctx.getImageData(15, 20, 1, 1).data;
      bitmap.close();
      return [d[0], d[1], d[2]];
    }, prepared.bytes);

    // A document screenshot with a transparent background must not come out inverted.
    expect(pixel[0]).toBeGreaterThan(230);
    expect(pixel[1]).toBeGreaterThan(230);
    expect(pixel[2]).toBeGreaterThan(230);
  });

  test('the module lets a file that is not a picture fail as the browser said, without remapping it', async ({ page }) => {
    const outcome = await page.evaluate(async () => {
      const api = (window as unknown as { SightlinePrepare: { prepareImage: (b: Blob) => Promise<unknown> } }).SightlinePrepare;
      try {
        await api.prepareImage(new Blob(['not an image at all'], { type: 'image/jpeg' }));
        return { threw: false as const, hasCode: false, name: '' };
      } catch (e) {
        const err = e as { name?: string; code?: string };
        return { threw: true as const, hasCode: typeof err.code === 'string' && err.code.length > 0, name: err.name ?? '' };
      }
    });
    expect(outcome.threw).toBe(true);
    // The point is what is *absent*: no `AppError.code`. "this file is not a picture" has no code in
    // `docs/ARCHITECTURE.md` §13, and inventing one in a utility file would be writing a user-facing
    // sentence without a human reviewing it. C-02 owns that copy.
    expect(outcome.hasCode).toBe(false); // a true here means the decode error was remapped
    expect(outcome.name).toBeTruthy();
  });
});
