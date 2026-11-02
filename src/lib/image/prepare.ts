import { notBuilt } from '@/lib/not_built';

/**
 * Browser-side image preparation (item **C-01**).
 *
 * The whole point is what it removes: EXIF (including GPS) disappears because the
 * image is re-encoded to JPEG through a canvas, orientation is applied before
 * resizing, and the pixel count drops so a photographed page fits inside serverless
 * body limits (PRD §12 Q1 row 5). Downscale first via `createImageBitmap` options
 * rather than decoding a full-resolution camera image into memory (PRD §12 Q2).
 *
 * Local blur/brightness scoring does **not** live here — it was cut (ADR-10) because
 * those metrics misfire on text pages. The model reports capture issues instead.
 */
export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface PrepareOptions {
  /** Longest edge in pixels. Chosen to keep a page well under the relay size cap. */
  maxEdge?: number;
  quality?: number;
}

export function prepareImage(_source: Blob | File, _options?: PrepareOptions): Promise<PreparedImage> {
  return notBuilt('C-01', 'Image resizing, orientation and EXIF stripping') as never;
}
