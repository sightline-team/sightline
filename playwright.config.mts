import { defineConfig, devices } from '@playwright/test';

/**
 * One project: Chromium.
 *
 * We deliberately do not declare webkit or firefox here. Sightline's target
 * platform is a phone with a screen reader, and a browser we cannot launch is a
 * browser we have not tested — claiming three desktop engines would be a false
 * coverage statement in the report. Device and screen-reader coverage is recorded
 * honestly in tests/a11y/manual-checklist.md and docs/ACCESSIBILITY_REPORT.md
 * (AGENTS.md §8: never claim a platform unless it was tested).
 */
const PORT = 3100;

// `localhost`, not `127.0.0.1`. Next 16 blocks a dev resource request whose origin host differs
// from the host the dev server was reached as, and that block stops the client bootstrap from
// running — the page renders server-side HTML but never hydrates. Measured on 2026-11-02: with a
// `127.0.0.1` baseURL, `#document-text` had no React props attached and clicking a demo button put
// nothing in the box. E2e that cannot click anything is not an accessibility or flow test.
// The alternative (`allowedDevOrigins` in next.config.ts) relaxes a dev-time security default,
// so the test points at the host the dev server actually answers on instead.
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Fixtures mode on purpose: e2e must run with no credentials and no key.
    command: `NEXT_PUBLIC_DEFAULT_MODE=fixtures RELAY_ENABLED=false NEAR_AI_API_KEY= npx next dev -p ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NODE_ENV: 'development' },
  },
});
