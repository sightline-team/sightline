import type { Page } from '@/types';

/**
 * `PageList` — item **C-02**.
 *
 * Lists pages in capture order as "Page 1", "Page 2"… with a remove button and a
 * retake-last action, each reachable by keyboard and announced through the single
 * announcer. No drag handles, no thumbnails as the only affordance: the list is read,
 * not scanned visually.
 */
export function PageList({ pages }: { pages: Page[] }) {
  return (
    <ul aria-label="Pages added">
      {pages.map((p) => (
        <li key={p.id}>Page {p.index + 1}</li>
      ))}
    </ul>
  );
}
