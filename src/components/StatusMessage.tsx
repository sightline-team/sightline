import type { Ref } from 'react';
import type { AppError } from '@/types';

/**
 * A static failure summary. After one of these appears, focus moves to it (A-06).
 *
 * It is deliberately **not** an `aria-live` region: the single announcer (F-08) is the
 * only live region in the app, and a second one makes a screen reader say the same
 * sentence twice — a listed edge case in `docs/PRD.md` §12 Q2.
 *
 * `ref` is a prop (React 19) rather than a `forwardRef` wrapper so the caller can move focus
 * to the one focusable element here instead of adding a second focusable container around it.
 */
export function StatusMessage({
  error,
  id = 'error-summary',
  ref,
}: {
  error?: AppError;
  id?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  if (!error) return null;
  return (
    <div id={id} tabIndex={-1} ref={ref} data-testid="status-message">
      <h2>Something stopped</h2>
      <p>{error.userMessage}</p>
      {error.retryable ? <p className="muted">You can try again.</p> : null}
    </div>
  );
}
