import { appError } from '@/lib/errors';

/**
 * Browser-side image preparation (item **C-01**).
 *
 * The whole point is what it removes: EXIF (including GPS) disappears because the image is
 * **re-encoded** to JPEG through a canvas, not edited. A decoder that honours `imageOrientation:
 * 'from-image'` hands back upright pixels, the canvas draws those pixels, and `convertToBlob` writes
 * a fresh JPEG whose only metadata is what the encoder emits — so the camera's make, model,
 * timestamp, thumbnail and coordinates are gone by construction rather than by a tag-stripping list
 * that would have to know every marker name (PRD §6 R1).
 *
 * The pixel count drops in the same pass so a photographed page fits under the relay's body cap
 * (`MAX_BODY_BYTES` in `lib/server/allowlist.ts`, F-05) once base64 adds a third.
 *
 * Two things this file deliberately does **not** do:
 *  - **No local blur or brightness scoring.** Cut in ADR-10 because those metrics misfire on
 *    mostly-white text pages; the model reports `captureIssues` instead (C-03/C-06).
 *  - **No network and no state.** It returns bytes to its caller. Which pages exist, and that only a
 *    prepared JPEG may leave the tab, is `features/capture` (C-02) and the session store's job.
 *
 * Memory: the decode is one full-resolution bitmap at a time, closed as soon as the encodes are done.
 * Whether that is survivable on a mid-range phone across five pages is **C-07**'s question, measured
 * on a device — `docs/PRD.md` §12 Q2 asks for downscale-during-decode, and this implementation
 * downscales at draw time instead. That difference is recorded here rather than claimed away.
 */

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface PrepareOptions {
  /** Longest edge in pixels. Chosen to keep a page well under the relay size cap. */
  maxEdge?: number;
  /** Byte budget for the encoded JPEG. */
  maxBytes?: number;
  /** First quality rung. Lower rungs are still tried if this one is over budget. */
  quality?: number;
}

/** ~200 dpi across an A4 page, and comfortably legible to the vision model C-03 asks. */
export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_QUALITY = 0.85;
/**
 * A page must be small enough that base64 (`×4/3`) plus the prompt JSON stays clear of the relay's
 * 8 MiB body cap. 768 KiB of JPEG is about 1 MiB on the wire, one request per page.
 */
export const MAX_PAGE_BYTES = 768 * 1024;

/** Tried in order. The last rung is where a scanned-page JPEG still reads clearly. */
export const QUALITY_LADDER = [0.85, 0.7, 0.55, 0.4] as const;
/** Long-edge factors tried when every quality rung is still over budget. */
export const GEOMETRY_STEPS = [1, 0.72, 0.5] as const;

/**
 * What `prepareImage` needs from a browser, as one injectable seam.
 *
 * `pixels` is `unknown` on purpose: the unit tests for the resize and budget logic never produce a
 * real bitmap, and the logic must be testable without one. The browser implementation puts the
 * `ImageBitmap` there and the canvas draw reads it back.
 */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: unknown;
  close(): void;
}

export interface ImageIo {
  decode(source: Blob | File): Promise<DecodedImage>;
  encode(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob>;
}

/**
 * Destination size for a source, honouring two rules: never upscale, never distort.
 *
 * Orientation is already applied by the decoder, so `width`/`height` here are the *upright*
 * dimensions — a portrait phone photo arrives with its edges already swapped, and a sideways
 * 4000×3000 frame is resized as the 3000×4000 image the user actually has.
 */
export function targetSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The requested quality first, then only the rungs below it — a pinned quality is a ceiling, not a promise. */
export function qualityRungs(quality: number): number[] {
  return [quality, ...QUALITY_LADDER.filter((q) => q < quality)];
}

/**
 * Decode, resize, re-encode. Returns the first (largest, then best-quality) result that fits the
 * budget, or halts with `image_too_large` when nothing does.
 *
 * A decode failure is **not** caught and remapped here. There is no `ErrorCode` for "this file is
 * not a picture", and inventing one in a utility file is a copy decision, not a plumbing one — the
 * caller that shows the sentence (C-02) is where that message belongs.
 */
export async function prepareImage(
  source: Blob | File,
  options: PrepareOptions = {},
  io: ImageIo = browserImageIo,
): Promise<PreparedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options.maxBytes ?? MAX_PAGE_BYTES;
  const rungs = qualityRungs(options.quality ?? DEFAULT_QUALITY);

  const decoded = await io.decode(source);
  try {
    for (const step of GEOMETRY_STEPS) {
      const edge = Math.max(1, Math.round(maxEdge * step));
      const size = targetSize(decoded.width, decoded.height, edge);
      for (const quality of rungs) {
        const blob = await io.encode(decoded, size.width, size.height, quality);
        if (blob.size <= maxBytes) return { blob, width: size.width, height: size.height };
      }
    }
    throw appError('image_too_large');
  } finally {
    decoded.close();
  }
}

/** The browser's own decode/encode, and the default `io`. */
export const browserImageIo: ImageIo = {
  async decode(source) {
    // The pixels come back upright. Measured 2026-11-03 in Chromium: an EXIF-orientation-6 40×20 JPEG
    // decodes as 20×40 with its light band moved to the right half — and passing
    // `imageOrientation: 'none'` changes nothing, so the rotation is the decoder's default behaviour
    // rather than this option's doing. The option is kept because it is the request the code means,
    // and the test is the fact.
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image', resizeQuality: 'high' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: bitmap,
      close: () => bitmap.close(),
    };
  },
  async encode(image, width, height, quality) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw appError('unknown');
    // JPEG has no alpha, and an encoder paints a transparent source black rather than white. A
    // screenshot of a document with a transparent background would otherwise come out inverted.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image.pixels as CanvasImageSource, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  },
};
