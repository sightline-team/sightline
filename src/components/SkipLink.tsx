/**
 * The skip link is the first focusable thing on every view (A-05, A-06). Native
 * anchor, no JavaScript: `main` is focusable via `tabIndex={-1}` in the layout.
 */
export function SkipLink() {
  return (
    <a className="skip-link" href="#main">
      Skip to main content
    </a>
  );
}
