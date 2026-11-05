/**
 * The synthetic-page harness: draw a page in Chromium, prepare it with the app's own module
 * (item **S-11**, building on the drawing and the C-01 measurement from **S-09** and **C-03**).
 *
 * This file existed as the middle of `scripts/spike.ts` until S-11 needed the same two things for a
 * second job. `spike.ts` has no exports and calls `main()` when it is loaded, so a second consumer
 * could not have imported it — the code had to move rather than be duplicated. What it is now used
 * for:
 *
 *  - `npm run spike -- --stage=image|pages` — pricing a page and exercising ADR-27's hole path;
 *  - `npm run fixtures:record` — turning a drawn page into a **recorded** Mode F fixture (S-11).
 *
 * Both must draw the *same* page, or the fixture would be recorded against a raster the spike never
 * priced and the demo photograph would be a third, unknown thing. That shared-identity reason is the
 * whole existence of this file: it is not a refactor for tidiness.
 *
 * Everything drawn here is synthetic — a canvas with invented line items on it. AGENTS.md §5's "never
 * do" (real documents, photos or medical data) applies to a fixture as much as to a test, and a
 * recorded fixture is data that ships in this repository.
 */
import { buildSync } from 'esbuild';
import path from 'node:path';
import type { Page } from '@playwright/test';

const SRC = path.join(__dirname, '..', 'src');

/**
 * A photographed page at the resolution a phone gives when the page fills the frame: 3024×4032 is a
 * 4:3 sensor, portrait. This is the input C-02 gets from a camera, and it is synthetic — a canvas this
 * file draws, not anybody's letter (AGENTS.md §5, "never do" real documents and photos).
 */
export const PAGE_INPUT = { width: 3024, height: 4032 };

/** `prepare.ts` bundled for the page — the same method `tests/e2e/image-prepare.spec.ts` uses for C-01's proof. */
export const PREPARE_BUNDLE = buildSync({
  entryPoints: [path.join(SRC, 'lib', 'image', 'prepare.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'SightlinePrepare',
  platform: 'browser',
  target: 'esnext',
  alias: { '@': SRC },
}).outputFiles[0]!.text;

export interface PageSample {
  sourceB64: string;
  sourceBytes: number;
  preparedB64: string;
  /** The app's own `toDataUrl` output for the prepared page — the exact string C-03 puts in a body. */
  preparedDataUrl: string;
  preparedBytes: number;
  preparedWidth: number;
  preparedHeight: number;
  prepareMs: number;
}

/** Draws the page, then prepares it with C-01's real module inside the browser. */
export async function drawPage(page: Page, label?: { pageNumber: number; totalPages: number }): Promise<PageSample> {
  return page.evaluate(async ({ w, h, label }) => {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.011); // a slightly crooked page, because that is what a hand-held shot looks like
    ctx.fillStyle = '#f6f4ef';
    ctx.fillRect(-w * 0.47, -h * 0.485, w * 0.94, h * 0.97);
    // Real glyphs, not bars. A first run drew grey rectangles as "text", which is enough to count
    // lines and to price a page, but not enough to ask a vision model for a transcript: C-03's probe
    // needs the reply to be a *reading of something*, or `transcribeSchema` would be judged on a page
    // with no words in it. Everything here is synthetic — an invented reference, invented line items
    // (AGENTS.md §5: never a real document).
    ctx.fillStyle = '#1d1d1d';
    ctx.textBaseline = 'top';
    const left = -w * 0.47 + w * 0.09;
    const lineH = h * 0.011;
    let y = -h * 0.485 + h * 0.06;
    ctx.font = `${Math.round(lineH * 1.9)}px sans-serif`;
    ctx.fillText('SYNTHETIC INVOICE - NOT A REAL DOCUMENT', left, y);
    y += lineH * 3.2;
    ctx.font = `${Math.round(lineH * 1.5)}px sans-serif`;
    // Each page carries its own printed label and its own line numbers, because C-11's whole question is
    // whether an offset still points at the page it came from. Five identical pages would let a shifted
    // offset look correct: the string would be found in the joined transcript either way.
    const tag = label === undefined ? '' : `   PAGE ${label.pageNumber} OF ${label.totalPages}`;
    ctx.fillText(`Northgate Example Trust   Reference NC-0000-SYN${tag}`, left, y);
    y += lineH * 2.4;
    const first = label === undefined ? 1 : (label.pageNumber - 1) * 28 + 1;
    for (let i = 0; i < 28; i++) {
      const n = first + i;
      ctx.fillText(`Line ${n.toString().padStart(3, '0')}  example service ${(n % 4) + 1}  GBP ${String(100 + ((n * 7) % 900))}.${String((n * 13) % 100).padStart(2, '0')}`, left, y);
      y += lineH * 2.15;
    }
    ctx.restore();
    const source = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.93 });

    const api = (window as unknown as {
      SightlinePrepare: {
        prepareImage: (b: Blob, o?: object) => Promise<{ blob: Blob; width: number; height: number }>;
        toDataUrl: (b: Blob) => Promise<string>;
      };
    }).SightlinePrepare;
    const at = performance.now();
    const prepared = await api.prepareImage(source);
    return {
      // The two blobs cross the boundary as bytes and become base64 here, not in the page. That is not a
      // style choice: `page.evaluate` serialises this callback's own source, and tsx's esbuild transform
      // (keepNames) writes a `__name(toB64, "toB64")` call next to **any** named binding declared inside
      // it — a helper that only exists in the module, so the browser threw `ReferenceError: __name is not
      // defined`. Found while recording for S-11 on 2026-11-05, and it breaks `--stage=image` and
      // `--stage=pages` identically wherever the binding sits, which is why it lives in the shared file.
      //
      // A `Uint8Array`, not an `ArrayBuffer`: Playwright transfers typed arrays and hands back an empty
      // object for a bare buffer, which the first recording run proved by writing three zero-byte
      // photographs without complaining. The length check below is what stops that being silent again.
      sourceBytes: new Uint8Array(await source.arrayBuffer()),
      preparedBytes: new Uint8Array(await prepared.blob.arrayBuffer()),
      // The app's own helper, in the app's own browser, on the app's own prepared page — so the URL in
      // the probe's body is the string `transcribePage` would send, chunking and all.
      preparedDataUrl: await api.toDataUrl(prepared.blob),
      sourceSize: source.size,
      preparedSize: prepared.blob.size,
      preparedWidth: prepared.width,
      preparedHeight: prepared.height,
      prepareMs: Math.round(performance.now() - at),
    };
  }, { w: PAGE_INPUT.width, h: PAGE_INPUT.height, label }).then((page) => {
    // Checked against the sizes the browser reported, not just for emptiness: a transfer that silently
    // truncates would otherwise become a fixture whose key belongs to a file nobody was shown.
    if (page.preparedBytes.length !== page.preparedSize || page.sourceBytes.length !== page.sourceSize) {
      throw new Error(
        `page_sample: the bytes did not survive the trip out of the browser (prepared ${page.preparedBytes.length} of ${page.preparedSize}, source ${page.sourceBytes.length} of ${page.sourceSize})`,
      );
    }
    return {
      sourceB64: Buffer.from(page.sourceBytes).toString('base64'),
      sourceBytes: page.sourceSize,
      preparedB64: Buffer.from(page.preparedBytes).toString('base64'),
      preparedDataUrl: page.preparedDataUrl,
      preparedBytes: page.preparedSize,
      preparedWidth: page.preparedWidth,
      preparedHeight: page.preparedHeight,
      prepareMs: page.prepareMs,
    };
  });
}
