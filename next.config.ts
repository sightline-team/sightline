import type { NextConfig } from 'next';

/**
 * CSP is applied to production builds only. In development Next needs
 * 'unsafe-eval' and a websocket connect source for hot reloading, and a policy
 * loose enough to be useless is worse than none — A-02 asserts this header on a
 * production build, not on `next dev`.
 *
 * No third-party scripts, analytics or fonts are permitted (AGENTS.md §7).
 * `blob:` and `data:` for img-src are required by the browser-side image preview
 * path, which uses object URLs of JPEG re-encodes (ARCH §5.1).
 *
 * Known limitation, must stay in the README: script-src carries 'unsafe-inline'
 * because Next emits an inline bootstrap script. The control that actually
 * matters for our threat model (document data leaving the device) is connect-src,
 * which is pinned to self and the NEAR AI Cloud hosts and is asserted by A-02.
 */
const NEAR_AI_HOSTS = ['https://cloud-api.near.ai', 'https://*.completions.near.ai'];

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${NEAR_AI_HOSTS.join(' ')}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
