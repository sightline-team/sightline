'use client';

import { Button } from '@/components/Button';
import type { ID, Page } from '@/types';

/**
 * `PageList` — item **C-02**.
 *
 * An `<ol>`, because "third of five" is a fact the list already knows and a screen reader says it for
 * free. Each entry is read, not scanned: the capture position, the pixel size of the JPEG that will be
 * sent, and the two controls that act on it.
 *
 * - The number is the **capture position** (`index`), never a number off the paper. **ADR-28** keeps the
 *   two apart, and `lib/transcript/holes.ts` names the same positions in its announcement, so the sentence
 *   a person hears and the row they are standing on say the same thing.
 * - The size line is `prepareImage`'s output (**C-01**), which is the useful number: the phone's 4000×3000
 *   original is not what gets read, and a page resized down the ladder is a page with fewer legible
 *   characters. A blind user cannot check a photograph; a sighted helper can read this aloud.
 * - The preview `<img>` is the prepared blob, so what is shown and what is sent are one object. Its `alt`
 *   names which page it is, because an unlabelled image in a document list is noise.
 * - **Retake is offered on the last page only**: `useCapture`'s pending-retake replaces the last page.
 *   Offering it on every page would promise a thing the item does not do (PRD §4 has no reorder UI, and no
 *   retake-the-third-page flow either).
 */
export function PageList({
  pages,
  busy,
  onRemove,
  onRetakeLast,
}: {
  pages: readonly Page[];
  /** A run is reading these pages, so the list cannot change underneath it. */
  busy: boolean;
  onRemove: (id: ID) => void;
  onRetakeLast: () => void;
}) {
  const lastIndex = pages.length - 1;
  return (
    <ol className="page-list" data-testid="page-list">
      {pages.map((page) => (
        <li key={page.id} data-testid={`capture-page-${page.index + 1}`}>
          <p className="page-line">
            Page {page.index + 1} — {page.width} by {page.height} pixels
          </p>
          {/* `next/image` is wrong here and not just inconvenient: its loader would re-request and
              re-optimise the picture through a route that must not exist (§4 rule 7 — no document bytes
              through a server), and a `blob:` URL is not something it can optimise. The preview has to be
              the exact prepared JPEG, so it is one plain `<img>`. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {page.previewUrl !== undefined ? <img className="page-preview" src={page.previewUrl} alt={`Page ${page.index + 1} as Sightline will read it`} /> : null}
          <p className="page-actions">
            {page.index === lastIndex ? (
              <Button onClick={onRetakeLast} disabled={busy}>
                Retake page {page.index + 1}
              </Button>
            ) : null}{' '}
            <Button onClick={() => onRemove(page.id)} disabled={busy}>
              Remove page {page.index + 1}
            </Button>
          </p>
        </li>
      ))}
    </ol>
  );
}
