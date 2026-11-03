import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_EDGE,
  DEFAULT_QUALITY,
  GEOMETRY_STEPS,
  MAX_PAGE_BYTES,
  QUALITY_LADDER,
  prepareImage,
  qualityRungs,
  targetSize,
  type DecodedImage,
  type ImageIo,
} from '@/lib/image/prepare';

/**
 * The resize-and-budget logic of **C-01**, tested without a browser.
 *
 * `prepareImage` takes its decode/encode as an injectable seam for exactly this reason: the part that
 * can be wrong in a way that costs a user their document is the **arithmetic** — how big the page
 * comes out, which rung is tried next, when the run gives up, and whether the bitmap is released.
 * What a real `createImageBitmap` and a real canvas do with those numbers is proved in Chromium
 * (`tests/e2e/image-prepare.spec.ts`), where a GPS-tagged JPEG goes in and its metadata comes out gone.
 */

/** A Blob whose only property this module reads is `size`, so the fake is a size, not a JPEG. */
function jpegStub(size: number): Blob {
  return { size, type: 'image/jpeg' } as Blob;
}

interface FakeIo extends ImageIo {
  calls: { width: number; height: number; quality: number }[];
  decodes: number;
  closes: number;
}

function fakeIo(opts: { width?: number; height?: number; sizeOf?: (w: number, h: number, q: number) => number } = {}): FakeIo {
  const width = opts.width ?? 4000;
  const height = opts.height ?? 3000;
  const sizeOf = opts.sizeOf ?? ((w, _h, q) => Math.round(w * q * 10));
  const io: FakeIo = {
    calls: [],
    decodes: 0,
    closes: 0,
    async decode() {
      io.decodes += 1;
      return { width, height, pixels: { fake: true }, close: () => (io.closes += 1) } satisfies DecodedImage;
    },
    async encode(_image, w, h, q) {
      io.calls.push({ width: w, height: h, quality: q });
      return jpegStub(sizeOf(w, h, q));
    },
  };
  return io;
}

const over = MAX_PAGE_BYTES + 1;

describe('targetSize', () => {
  it('fits the long edge to the limit and keeps the aspect ratio', () => {
    expect(targetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales a small image', () => {
    expect(targetSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(1, 1, 1600)).toEqual({ width: 1, height: 1 });
  });

  it('rounds rather than truncating, and never returns a zero edge', () => {
    // 6000×1000 at 1600 is 1600×266.67 → 267. A 0 edge would make an unusable canvas.
    expect(targetSize(6000, 1000, 1600)).toEqual({ width: 1600, height: 267 });
    expect(targetSize(1000, 1, 16)).toEqual({ width: 16, height: 1 });
  });

  it('measures the long edge after orientation is applied, which is the decoder job it assumes', () => {
    // A sideways 4000×3000 frame reaches here already upright as 3000×4000 (`browserImageIo`), so the
    // limit binds the *tall* edge. If the decoder ever stops honouring orientation, this is the test
    // whose assumption broke — written as a named case rather than a comment.
    expect(targetSize(3000, 4000, 1600).height).toBe(1600);
  });
});

describe('qualityRungs', () => {
  it('starts at the default and walks down the ladder', () => {
    expect(qualityRungs(DEFAULT_QUALITY)).toEqual([...QUALITY_LADDER]);
  });

  it('treats a pinned quality as a ceiling, not a promise', () => {
    expect(qualityRungs(0.6)).toEqual([0.6, 0.55, 0.4]);
  });

  it('still has one rung when asked for something below the whole ladder', () => {
    expect(qualityRungs(0.1)).toEqual([0.1]);
  });
});

describe('prepareImage', () => {
  it('encodes once when the first attempt already fits, and returns that size', async () => {
    const io = fakeIo({ sizeOf: () => 1024 });
    const prepared = await prepareImage(new Blob(['x']), {}, io);
    expect(io.calls).toEqual([{ width: 1600, height: 1200, quality: DEFAULT_QUALITY }]);
    expect(prepared.width).toBe(1600);
    expect(prepared.height).toBe(1200);
    expect(prepared.blob).toEqual({ size: 1024, type: 'image/jpeg' });
  });

  it('descends the quality ladder before it shrinks the page', async () => {
    // Only the last rung fits at full geometry, so the first three are spent and no second geometry
    // is reached. The order is a product decision: a smaller page loses characters, a blurrier one
    // usually does not.
    const io = fakeIo({ sizeOf: (_w, _h, q) => (q <= 0.4 ? 500 : over) });
    await prepareImage(new Blob(['x']), {}, io);
    expect(io.calls.map((c) => c.quality)).toEqual([...QUALITY_LADDER]);
    expect(new Set(io.calls.map((c) => `${c.width}×${c.height}`))).toEqual(new Set(['1600×1200']));
  });

  it('shrinks the long edge only after every rung is spent, and restarts the ladder there', async () => {
    const io = fakeIo({ sizeOf: (w, _h, q) => (w <= 800 && q <= 0.7 ? 4096 : over) });
    const prepared = await prepareImage(new Blob(['x']), {}, io);
    expect(prepared.width).toBe(800);
    expect(prepared.height).toBe(600);
    const firstHalf = io.calls.findIndex((c) => c.width === 800);
    expect(io.calls.slice(0, firstHalf).every((c) => c.width > 800)).toBe(true);
    expect(io.calls.slice(0, 4).map((c) => c.width)).toEqual([1600, 1600, 1600, 1600]);
    // The ladder restarts at the requested ceiling rather than continuing where it stopped.
    expect(io.calls[firstHalf]).toEqual({ width: 800, height: 600, quality: DEFAULT_QUALITY });
  });

  it('tries exactly the geometries it declares, and then refuses', async () => {
    const io = fakeIo({ sizeOf: () => over });
    await expect(prepareImage(new Blob(['x']), {}, io)).rejects.toMatchObject({ code: 'image_too_large' });
    const edges = [...new Set(io.calls.map((c) => c.width))];
    expect(edges).toEqual(GEOMETRY_STEPS.map((s) => Math.round(DEFAULT_MAX_EDGE * s)));
    expect(io.calls.length).toBe(GEOMETRY_STEPS.length * QUALITY_LADDER.length);
  });

  it('refuses with the catalogue sentence, not with a bare throw', async () => {
    const io = fakeIo({ sizeOf: () => over });
    const caught = await prepareImage(new Blob(['x']), {}, io).catch((e: unknown) => e);
    expect(caught).toMatchObject({
      code: 'image_too_large',
      retryable: false,
      userMessage: 'That picture was too large to work with. Try retaking it, or paste the text instead.',
    });
  });

  it('honours a caller-supplied edge, budget and quality ceiling', async () => {
    // maxEdge 640 → geometries 640, 461, 320; quality 0.5 → rungs 0.5, 0.4. Nothing at 640 fits the
    // 2 KiB budget, so the run lands on the second geometry's first rung.
    const io = fakeIo({ sizeOf: (w) => (w <= 461 ? 1024 : over) });
    const prepared = await prepareImage(new Blob(['x']), { maxEdge: 640, maxBytes: 2048, quality: 0.5 }, io);
    expect(io.calls).toEqual([
      { width: 640, height: 480, quality: 0.5 },
      { width: 640, height: 480, quality: 0.4 },
      { width: 461, height: 346, quality: 0.5 },
    ]);
    expect(prepared.width).toBe(461);
    expect(prepared.blob).toEqual({ size: 1024, type: 'image/jpeg' });
  });

  it('closes the decoded bitmap once, on the way out, whatever happened inside', async () => {
    const ok = fakeIo({ sizeOf: () => 1024 });
    await prepareImage(new Blob(['x']), {}, ok);
    expect(ok.closes).toBe(1);

    const refusing = fakeIo({ sizeOf: () => over });
    await prepareImage(new Blob(['x']), {}, refusing).catch(() => undefined);
    expect(refusing.closes).toBe(1);

    // A throw from the encoder itself (a canvas that cannot be had) still closes the bitmap. Across
    // five pages that is the difference between working and crashing, which is why it is `finally`.
    const throwing = fakeIo();
    throwing.encode = async () => {
      throw new Error('no canvas');
    };
    await expect(prepareImage(new Blob(['x']), {}, throwing)).rejects.toThrow('no canvas');
    expect(throwing.closes).toBe(1);
  });

  it('decodes exactly once for a whole run, however many encodes follow', async () => {
    const io = fakeIo({ sizeOf: () => over });
    await prepareImage(new Blob(['x']), {}, io).catch(() => undefined);
    expect(io.decodes).toBe(1);
    expect(io.calls.length).toBeGreaterThan(1);
  });

  it('lets a decode failure through unchanged, because remapping it is a C-02 copy decision', async () => {
    const io = fakeIo();
    io.decode = async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
    };
    await expect(prepareImage(new Blob(['x']), {}, io)).rejects.toThrow(/could not be decoded/);
    // Nothing was decoded, so there is nothing to close — and no encode was spent trying.
    expect(io.closes).toBe(0);
    expect(io.calls).toEqual([]);
  });

  it('carries nothing of the source blob into the result', async () => {
    // The bytes the app keeps, and eventually sends, are the re-encoded JPEG only. If this ever
    // returned the input (a tempting "fast path" for a small image) the EXIF/GPS stripping would be
    // silently undone.
    const source = new Blob([new Uint8Array(64)], { type: 'image/jpeg' });
    const io = fakeIo({ width: 40, height: 20, sizeOf: () => 32 });
    const prepared = await prepareImage(source, {}, io);
    expect(prepared.blob).not.toBe(source);
    expect(prepared.blob.size).toBe(32);
    expect(io.calls[0]).toEqual({ width: 40, height: 20, quality: DEFAULT_QUALITY });
  });

  it('keeps the defaults the relay cap was reasoned against', () => {
    // 768 KiB of JPEG is ~1 MiB base64; one page per request stays clear of the 8 MiB body cap (F-05).
    expect(DEFAULT_MAX_EDGE).toBe(1600);
    expect(MAX_PAGE_BYTES).toBe(768 * 1024);
    expect(Math.round(MAX_PAGE_BYTES * (4 / 3)) * 5).toBeLessThan(8 * 1024 * 1024);
  });
});
