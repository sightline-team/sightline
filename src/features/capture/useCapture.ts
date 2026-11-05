'use client';

import { useCallback, useRef } from 'react';
import { prepareImage } from '@/lib/image/prepare';
import { pageFixtureKey } from '@/lib/fixtures/page_key';
import { appError } from '@/lib/errors';
import { MAX_PAGES, newId } from '@/lib/session/reducer';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { ID, Page } from '@/types';

/**
 * Capture state (item **C-02**). The screen's hands: add photographs, remove one, retake the last,
 * remove them all. Every decision ends as a session dispatch plus one announcement.
 *
 * Three rules hold this file together that are not obvious from its size:
 *
 * - **A file is never kept as it arrived.** Every photograph goes through `prepareImage` (**C-01**)
 * before it joins the session, so what sits in memory is the re-encoded JPEG — EXIF and GPS gone, pixels
 * already upright — and the preview the person sees is the *same blob* `transcribePage` will send. A
 * screen that previewed the original `File` and sent the prepared blob would show one thing and read
 * another, which is the opposite of what a preview is for.
 * - **One batch, one announcement.** `announce()` is React `useState` holding a single message, so four
 * sentences written inside the loop would collapse into whichever one React rendered last (measured in
 * **C-12**'s work). Everything learned about a batch is composed and spoken once, after the loop.
 * - **The cap refuses out loud.** `page_added` does refuse a sixth page by putting `too_many_pages` on the
 * session, but that drops the *file* quietly and shows an error summary about a page nobody can see. The
 * count is checked here first and the catalogue's sentence is spoken instead — **C-12** does the same for
 * paste length, and §4 rule 10 forbids losing an answer in silence.
 *
 * There is no reorder interaction on purpose (`docs/PROJECT_STRUCTURE.md` §8): capture order *is* the
 * order, so **C-05**'s label check warns about gaps rather than silently fixing them. This feature touches
 * no network — the only egress for image bytes is the `data:` URL built in `lib/image/prepare.ts`, sent by
 * the one client path in `lib/near-ai/client.ts`.
 */
export interface CaptureApi {
  /** Prepare and add every photograph in a chosen batch, in the order the person chose them. */
  addFiles(files: readonly File[]): Promise<void>;
  removePage(id: ID): void;
  /** Mark the last page as the one to replace; the next photograph chosen takes its place. */
  retakeLast(): void;
  clearAll(): void;
}

/**
 * A file named `image/*` that this browser will not decode. `prepareImage` deliberately does not remap a
 * decode failure (`lib/image/prepare.ts`): there is no `ErrorCode` for "not a picture" and inventing one
 * inside a utility is a copy decision. This is the caller that owns the sentence.
 */
const NOT_A_PICTURE = 'Sightline could not open that file as a photograph. Choose a picture taken with your camera, or paste the text instead.';

/** The catalogue's own sentence for whatever the preparation step raised, rather than a paraphrase. */
function sentenceFrom(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'userMessage' in cause && typeof cause.userMessage === 'string') {
    return cause.userMessage;
  }
  return NOT_A_PICTURE;
}

/** Revoking an already-revoked URL does nothing, so the session's tracked set may still hold this string. */
function revokeUrl(url: string | undefined): void {
  if (url !== undefined) URL.revokeObjectURL(url);
}

export function useCapture(): CaptureApi {
  const { session, dispatch, trackObjectUrl } = useSessionStore();
  const announce = useAnnouncer().announce;

  /**
   * Which page the next chosen photograph replaces, set by `retakeLast()`.
   *
   * A ref rather than state: it is read inside `addFiles`, which runs after a render, and putting it in
   * the session would need an action the reducer has no business owning.
   */
  const retakeOf = useRef<ID | null>(null);

  const addFiles = useCallback(
    async (files: readonly File[]): Promise<void> => {
      // Read once and cleared: a second page cannot also be the retake target, and whatever happens to
      // the rest of the batch must not leave a pending retake waiting for the next time.
      let slot = retakeOf.current;
      retakeOf.current = null;

      // `session.pages` is the snapshot from the render that started this call and does not change while
      // the loop runs, so the running total is kept here rather than re-read from the store.
      let count = session.pages.length;
      const addedAt: number[] = [];
      let replaced: number | undefined;
      let skipped = 0;
      let overCap = false;
      const failures: string[] = [];

      for (const file of files) {
        // An OS picker hands over anything the person dragged into it.
        if (!file.type.startsWith('image/')) {
          skipped += 1;
          continue;
        }

        const target = slot === null ? undefined : session.pages.find((p) => p.id === slot);

        // The cap is checked here — **before the bytes are decoded** — so a sixth page is refused for
        // being a sixth page whatever else is wrong with it, and a retake at five pages is not caught by
        // a limit it does not hit.
        if (target === undefined && count >= MAX_PAGES) {
          overCap = true;
          continue;
        }

        const prepared = await prepareImage(file).catch((cause: unknown) => {
          failures.push(sentenceFrom(cause));
          return null;
        });
        if (prepared === null) continue;

        const url = URL.createObjectURL(prepared.blob);
        trackObjectUrl(url);
        const page: Page = {
          id: newId(),
          index: 0,
          blob: prepared.blob,
          width: prepared.width,
          height: prepared.height,
          previewUrl: url,
          // Of the file as it was chosen, not of `prepared.blob`: see **ADR-31** for why the demo's
          // identity has to be the bytes we ship and not the bytes this browser re-encodes.
          fixtureKey: await pageFixtureKey(file),
        };

        if (target !== undefined) {
          // The pending retake takes its slot, and the page keeps the index it had (`page_retaken`
          // restores it), so the list and the spoken "Page n" stay put.
          dispatch({ type: 'page_retaken', id: target.id, page });
          revokeUrl(target.previewUrl);
          replaced = target.index + 1;
          slot = null;
          continue;
        }

        dispatch({ type: 'page_added', page });
        addedAt.push(count);
        count += 1;
      }

      // One announcement for the whole batch, in the order the person would ask about it: what changed,
      // then what was refused, then what could not be opened. Duplicated by nothing: two files that both
      // failed to decode are one sentence, not two.
      const notices: string[] = [];
      if (replaced !== undefined) notices.push(`Page ${replaced} replaced with a new photograph.`);
      if (addedAt.length === 1) notices.push(`Page ${addedAt[0]! + 1} added.`);
      else if (addedAt.length > 1)
        notices.push(
          `${addedAt.length} photographs added, as Page ${addedAt[0]! + 1} to Page ${addedAt[addedAt.length - 1]! + 1}.`,
        );
      if (skipped > 0)
        notices.push(`Sightline only reads photographs, so ${skipped === 1 ? 'one file was' : `${skipped} files were`} skipped.`);
      if (overCap) notices.push(appError('too_many_pages').userMessage);
      for (const failure of new Set(failures)) notices.push(failure);
      if (notices.length > 0) announce(notices.join(' '));
    },
    [announce, dispatch, session.pages, trackObjectUrl],
  );

  const removePage = useCallback(
    (id: ID) => {
      const page = session.pages.find((p) => p.id === id);
      if (page === undefined) return;
      // A retake aimed at a page that is no longer here must not silently retarget whichever page the
      // next chosen photograph happens to land on.
      if (retakeOf.current === id) retakeOf.current = null;
      dispatch({ type: 'page_removed', id });
      revokeUrl(page.previewUrl);
      announce(`Page ${page.index + 1} removed.${session.pages.length === 1 ? ' There are no photographs yet.' : ''}`);
    },
    [announce, dispatch, session.pages],
  );

  const retakeLast = useCallback(() => {
    const last = session.pages[session.pages.length - 1];
    if (last === undefined) {
      announce('There are no photographs to retake yet.');
      return;
    }
    retakeOf.current = last.id;
    announce(`Choose the replacement photograph for Page ${last.index + 1}.`);
  }, [announce, session.pages]);

  const clearAll = useCallback(() => {
    if (session.pages.length === 0) {
      announce('There are no photographs to remove.');
      return;
    }
    retakeOf.current = null;
    // Dispatch first, revoke after: the reducer's job is to stop the page existing, and the revoke is the
    // browser letting go of the bytes. Reversed, a re-render can still hold a URL that no longer resolves.
    for (const page of session.pages) dispatch({ type: 'page_removed', id: page.id });
    for (const page of session.pages) revokeUrl(page.previewUrl);
    announce('Every photograph removed.');
  }, [announce, dispatch, session.pages]);

  return { addFiles, removePage, retakeLast, clearAll };
}
