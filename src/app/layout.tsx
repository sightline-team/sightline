import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sightline',
  description:
    'Understand a sensitive document with private AI, and see exactly what was verified.',
  // No third-party scripts, fonts or analytics may be added here (AGENTS.md §7).
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Text must stay zoomable: maximumScale would break the 200% zoom requirement.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Skip link is first focusable content on every view (A-05, A-06). */}
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {/* F-08 mounts the single aria-live announcer and the fixtures banner here. */}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
