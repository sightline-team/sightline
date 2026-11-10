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
  metadataBase: new URL('https://sightline-snowy-beta.vercel.app'),
  title: 'Sightline — Private AI for Sensitive Documents',
  description:
    'Understand a sensitive document with private AI, and see exactly what was verified.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Sightline — Private AI for Sensitive Documents',
    description:
      'Understand a sensitive document with private AI on NEAR AI Cloud hardware enclaves, and see exactly what was verified.',
    url: 'https://sightline-snowy-beta.vercel.app',
    siteName: 'Sightline',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/icons/icon.svg',
        width: 512,
        height: 512,
        alt: 'Sightline Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Sightline — Private AI for Sensitive Documents',
    description:
      'Understand a sensitive document with private AI on NEAR AI Cloud hardware enclaves, and see exactly what was verified.',
    images: ['/icons/icon.svg'],
  },
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

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Sightline',
  url: 'https://sightline-snowy-beta.vercel.app',
  description:
    'Understand a sensitive document with private AI on NEAR AI Cloud hardware enclaves, and see exactly what was verified.',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'All',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
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
              <div className="nav-inner">
                <div className="nav-brand-strip">
                  <Link href="/" className="brand-link">
                    <span className="brand-glyph" aria-hidden="true">Ⓝ</span>
                    <span className="brand-text">Sightline</span>
                    <span className="brand-tee">NEAR AI CLOUD TEE</span>
                  </Link>
                </div>
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
              </div>
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
            <footer className="near-footer" role="contentinfo">
              <div className="footer-inner">
                <div className="footer-col footer-col-brand">
                  <div className="footer-brand">
                    <span className="footer-near-glyph" aria-hidden="true">Ⓝ</span>
                    <span className="footer-brand-name">Sightline</span>
                    <span className="footer-badge">CONFIDENTIAL AI</span>
                  </div>
                  <p className="footer-desc">
                    Non-visual document intelligence powered by Intel TDX hardware enclaves on NEAR AI Cloud.
                  </p>
                  <div className="footer-hackathon-track">
                    <span className="track-tag">NEAR HACKATHON 2026</span>
                    <span className="track-name">Privacy &amp; Private AI Track</span>
                  </div>
                </div>

                <div className="footer-col">
                  <h3 className="footer-heading">NEAR Ecosystem</h3>
                  <ul className="footer-links">
                    <li>
                      <a href="https://www.near.org/developer-hub" target="_blank" rel="noopener noreferrer" tabIndex={-1}>
                        NEAR Developer Hub ↗
                      </a>
                    </li>
                    <li>
                      <a href="https://docs.near.org/web3-apps/what-is" target="_blank" rel="noopener noreferrer" tabIndex={-1}>
                        NEAR Protocol Docs ↗
                      </a>
                    </li>
                    <li>
                      <a href="https://cloud.near.ai" target="_blank" rel="noopener noreferrer" tabIndex={-1}>
                        NEAR AI Cloud ↗
                      </a>
                    </li>
                    <li>
                      <Link href="/architecture" tabIndex={-1}>
                        Architecture &amp; Comparison ↗
                      </Link>
                    </li>
                    <li>
                      <a href="https://github.com/sightline-team/sightline" target="_blank" rel="noopener noreferrer" tabIndex={-1}>
                        GitHub Source (MIT) ↗
                      </a>
                    </li>
                  </ul>
                </div>

                <div className="footer-col">
                  <h3 className="footer-heading">Cryptographic Proof</h3>
                  <ul className="footer-specs">
                    <li><span>Execution:</span> Intel TDX Enclaves</li>
                    <li><span>Signatures:</span> Ed25519 Hardware-Bound</li>
                    <li><span>Server Storage:</span> 0 KB (Zero Custody)</li>
                    <li><span>Client EXIF:</span> 100% Locally Purged</li>
                  </ul>
                </div>
              </div>
              <div className="footer-bottom">
                <p>© 2026 Sightline Team. Open Source MIT. Non-custodial confidential computing infrastructure.</p>
              </div>
            </footer>
          </SessionProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
