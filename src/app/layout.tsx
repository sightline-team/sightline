import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { SkipLink } from '@/components/SkipLink';
import { ForgetButton } from '@/components/ForgetButton';
import { HighContrastTheme } from '@/app/_flow/HighContrastTheme';
import { FIXTURES_BANNER } from '@/features/trust/claims';
import { publicConfig } from '@/lib/config';
import { serverConfig } from '@/lib/server/env';
import { AnnouncerProvider } from '@/lib/a11y/announcer';
import { SessionProvider } from '@/lib/session/store';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sightline',
  description:
    'Understand a sensitive document with private AI, and see exactly what was verified.',
  // No third-party scripts, fonts or analytics may be added here (AGENTS.md §7).
  // PRD §7 asks for an installable manifest with icons and no offline mode; the manifest is
  // static JSON in `public/`, so it cannot carry a privacy sentence.
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Text must stay zoomable: maximumScale would break the 200% zoom requirement.
};

/**
 * Structural shell: skip link, landmarks, one announcer, one session store, and the fixtures banner.
 *
 * The banner is AGENTS.md §4 rule 11 — Mode F must always say it is demo data with no real
 * privacy guarantee — and its sentence is imported from `features/trust/claims.ts` rather than
 * written here, because a privacy claim typed into a component is a claim nobody recomputes when
 * the mode changes. A user-supplied key only exists in the browser, so server render can never
 * claim direct mode; that is why `directEnabled` is false here and in every other route read.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const availability = { relayEnabled: serverConfig().relayEnabled, directEnabled: false };
  const cfg = publicConfig(process.env, availability);
  const isFixtures = cfg.mode === 'fixtures';

  return (
    <html lang="en">
      <body>
        <SkipLink />
        {/* Renders nothing of its own: it puts A-15's stored theme onto `<html>`, which sits outside
            React's tree, so the choice holds on every route and updates the moment it is made. */}
        <HighContrastTheme />
        <AnnouncerProvider>
          {/* One session store for the whole tree (ADR-8: memory only). It sits under the
              announcer because a run both writes state and speaks; it sits over the nav as well
              as `main` because Forget (P-10) is a shell control — it has to be reachable on
              every route, including while a run is still going on the paste view. The document
              itself survives the move from the paste view to the results view, which is
              client-side navigation over an unmounted route, not a page load. */}
          <SessionProvider mode={cfg.mode}>
            {/* Client-side navigation, not a bare `<a>`: session state lives in memory only (no
                server storage, AGENTS.md §4 rule 7), so a full page load would discard the user's
                document mid-flow. `next/link` still renders an `<a>` element. */}
            <nav aria-label="Sightline sections">
              <ul>
                <li>
                  <Link href="/">Document</Link>
                </li>
                <li>
                  <Link href="/read">What Sightline read</Link>
                </li>
                <li>
                  <Link href="/trust">Verification</Link>
                </li>
                <li>
                  <Link href="/settings">Settings</Link>
                </li>
                <ForgetButton />
              </ul>
            </nav>
            {/* Static text, deliberately not a second live region: the announcer is the only one. */}
            {isFixtures ? (
              <p className="banner" data-testid="fixtures-banner">
                {FIXTURES_BANNER}
              </p>
            ) : null}
            <main id="main" tabIndex={-1}>
              {children}
            </main>
          </SessionProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
