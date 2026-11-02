import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Shell smoke test — the automated half of **F-08** ("axe clean on the empty shell") and the
 * first slice of A-01/A-02.
 *
 * Scope discipline: this file tests the *structure that exists*. It does not test a flow, because
 * no flow exists yet — the capture, analysis and trust screens are stubs with their own items. When
 * those land, A-01 extends the axe sweep to them and A-02 owns the full network assertion; the
 * request-host check here is the seed of that, not a substitute for it.
 *
 * Everything asserted below is a real behaviour of the current shell. Nothing is asserted about
 * screen readers: axe checks machine-verifiable rules, and the human half (A-03, A-04) is still
 * blocked on a device and a user. `docs/ACCESSIBILITY_REPORT.md` records that gap.
 */
const ROUTES = ['/', '/read', '/trust', '/settings'] as const;

test.describe('shell structure', () => {
  test('declares a language and keeps text zoomable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport, 'viewport meta must exist for mobile text sizing').toContain('width=device-width');
    // A locked scale is a WCAG 1.4.4 failure and it is easy to add by copy-pasting a template.
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
  });

  test('has exactly one live region, polite, and it is the announcer', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[aria-live]')).toHaveCount(1);
    const live = page.locator('[aria-live]').first();
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toHaveAttribute('role', 'status');
    // Scope note: this is the *server-rendered* shell. The first client-side navigation makes
    // Next.js inject a second region of its own; `flow.spec.ts` owns the assertion that it stays
    // silent, because a screen-reader user hearing the same change twice is an AGENTS.md §8 defect.
  });

  test('gives landmarks to navigation and content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Sightline sections' })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    // tabIndex -1 is what lets the skip link and post-navigation focus moves land on <main>.
    await expect(page.locator('main#main')).toHaveAttribute('tabindex', '-1');
  });

  test('the skip link is the first thing on the page and reaches the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('a.skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toContainText(/skip to main content/i);

    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('main');
  });

  test('every route renders a heading a screen reader lands on', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole('heading').first(), `${route} must lead with a heading`).toBeVisible();
    }
  });

  /**
   * AGENTS.md §4 rule 11: Mode F must say it is demo data. The webServer command in
   * playwright.config.mts pins NEXT_PUBLIC_DEFAULT_MODE=fixtures with no key, so the banner is
   * owed on every route here — and it must be *seen* before the main content, not buried in a
   * footer a screen reader reaches after the user has already believed the demo.
   */
  test('fixture mode shows the demo-data banner on every route', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);
      const banner = page.getByTestId('fixtures-banner');
      await expect(banner, `${route} must show the fixtures banner`).toHaveText('Demo data. No real privacy guarantee.');
      await expect(banner).toBeVisible();
      await expect(banner).toHaveCount(1);
    }
  });

  test('the banner is before the main content in the reading order', async ({ page }) => {
    await page.goto('/');
    const comesFirst = await page.evaluate(() => {
      const banner = document.querySelector('[data-testid="fixtures-banner"]');
      const main = document.querySelector('main');
      if (!banner || !main) return null;
      return Boolean(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(comesFirst, 'the demo-data warning must precede the content it qualifies').toBe(true);
  });
});

test.describe('automated accessibility on the empty shell (F-08 done-when)', () => {
  for (const route of ROUTES) {
    test(`axe finds no serious or critical violation on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      // Names the rule and the offending markup, so a failure is actionable instead of a number.
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`),
        `${route} axe violations`,
      ).toEqual([]);
    });
  }
});

test.describe('no third-party contact from the shell (seed of A-02)', () => {
  test('the shell requests nothing outside its own origin', async ({ page }) => {
    const external = new Set<string>();
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.add(url.origin);
      } catch {
        external.add(request.url());
      }
    });

    for (const route of ROUTES) await page.goto(route);
    expect([...external], 'the shell must not load anything off-origin (AGENTS.md §7)').toEqual([]);
  });
});
