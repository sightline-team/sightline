import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { isNearUpstreamHost } from '@/lib/near-ai/models';
import { resolveRequest } from '@/lib/server/allowlist';

/**
 * Item **A-02**: Network assertion: no requests outside self and NEAR AI Cloud hosts; CSP in next.config.ts.
 *
 * Requirements:
 *  1. CSP in `next.config.ts` enforces `connect-src 'self' https://cloud-api.near.ai https://*.completions.near.ai`.
 *  2. No third-party analytics, fonts, scripts or tracking services (AGENTS.md §7).
 *  3. In development, headers are empty to admit Next.js dev server WebSocket/eval requirements.
 *  4. In production, strict security headers (CSP, nosniff, no-referrer, same-origin, Permissions-Policy) are delivered.
 *  5. Upstream relay only connects to verified NEAR AI Cloud hosts.
 */

describe('network assertion and CSP (A-02)', () => {
  describe('production headers in next.config.ts', () => {
    it('returns strict security headers in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        const headersFn = nextConfig.headers;
        expect(headersFn).toBeDefined();
        const headerEntries = (await headersFn!()) as Array<{
          source: string;
          headers: Array<{ key: string; value: string }>;
        }>;

        expect(headerEntries.length).toBe(1);
        expect(headerEntries[0]?.source).toBe('/(.*)');

        const headers = headerEntries[0]?.headers ?? [];
        const headerMap = new Map(headers.map((h) => [h.key, h.value]));

        // CSP Header
        const csp = headerMap.get('Content-Security-Policy');
        expect(csp).toBeDefined();

        // Directives assertions
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self' 'unsafe-inline'");
        expect(csp).toContain("style-src 'self' 'unsafe-inline'");
        expect(csp).toContain("img-src 'self' data: blob:");
        expect(csp).toContain("font-src 'self'");
        expect(csp).toContain(
          "connect-src 'self' https://cloud-api.near.ai https://*.completions.near.ai"
        );
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("form-action 'self'");

        // No third-party domains permitted
        const bannedDomains = [
          'google',
          'analytics',
          'cloudflare',
          'segment',
          'sentry',
          'mixpanel',
          'facebook',
          'doubleclick',
          'twitter',
        ];
        for (const domain of bannedDomains) {
          expect(csp?.toLowerCase()).not.toContain(domain);
        }

        // Ancillary security headers
        expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
        expect(headerMap.get('Referrer-Policy')).toBe('no-referrer');
        expect(headerMap.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
        expect(headerMap.get('Permissions-Policy')).toBe(
          'camera=(), microphone=(), geolocation=()'
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      }
    });

    it('returns empty headers in development to permit dev server hot-reloading', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
        const headersFn = nextConfig.headers;
        expect(headersFn).toBeDefined();
        const headerEntries = await headersFn!();
        expect(headerEntries).toEqual([]);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      }
    });
  });

  describe('upstream host boundary', () => {
    it('isNearUpstreamHost permits only official .near.ai hosts', () => {
      expect(isNearUpstreamHost('https://cloud-api.near.ai')).toBe(true);
      expect(isNearUpstreamHost('https://cloud-api.near.ai/v1')).toBe(true);
      expect(isNearUpstreamHost('https://glm-5-3-flash-long.completions.near.ai')).toBe(true);
      expect(isNearUpstreamHost('')).toBe(true); // empty string means served directly, not forwarded

      // Foreign and spoofing hosts must be rejected
      expect(isNearUpstreamHost('https://openrouter.ai/api/v1')).toBe(false);
      expect(isNearUpstreamHost('https://near.ai.evil.example')).toBe(false);
      expect(isNearUpstreamHost('https://evil-near.ai')).toBe(false);
      expect(isNearUpstreamHost('not a url')).toBe(false);
    });

    it('relay resolveRequest permits only allowed paths and rejects arbitrary URLs', () => {
      const allowedPaths = [
        { method: 'GET', url: 'http://localhost:3000/api/relay/v1/attestation/report' },
        { method: 'POST', url: 'http://localhost:3000/api/relay/v1/chat/completions' },
        { method: 'GET', url: 'http://localhost:3000/api/relay/v1/signature/chat-12345' },
        { method: 'GET', url: 'http://localhost:3000/api/relay/v1/model/z-ai%2Fglm-5.3-flash' },
      ];

      for (const p of allowedPaths) {
        const res = resolveRequest(new URL(p.url), p.method);
        expect(res.ok).toBe(true);
      }

      // Reject non-allowlisted paths
      expect(resolveRequest(new URL('http://localhost:3000/api/relay/v1/models'), 'GET').ok).toBe(false);
      expect(resolveRequest(new URL('http://localhost:3000/api/relay/v1/model/list'), 'GET').ok).toBe(false);
      expect(resolveRequest(new URL('http://localhost:3000/api/relay/v1/other'), 'POST').ok).toBe(false);
      expect(resolveRequest(new URL('http://localhost:3000/api/relay/v1/chat/completions'), 'DELETE').ok).toBe(false);
    });
  });
});
