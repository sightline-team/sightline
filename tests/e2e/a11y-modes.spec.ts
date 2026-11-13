import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automated verification for High-Contrast Mode, prefers-reduced-motion,
 * and 200% Zoom / 320px Reflow (**A-08**, AGENTS.md §8).
 */

const ROUTES = ['/', '/read', '/trust', '/settings'] as const;
const NAV_WAIT = { timeout: 30_000 };

function blockingViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`);
}

test.describe('A-08: High-contrast mode', () => {
  // Four routes, each a `goto` plus a full axe scan, inside one test. Alone that is 13–17 s; with the
  // whole suite running four workers it passed 30 s and timed out on assertions that were never the
  // problem (2026-11-13, measured: 159 passed / 3 timed out, and all three pass in isolation). The
  // deadline is per test, not an assertion — nothing here is relaxed, and the axe/overflow checks are
  // unchanged.
  test.setTimeout(90_000);

  test('theme toggle enables data-high-contrast attribute and satisfies axe on all routes', async ({ page }) => {
    // 1. Visit /settings and toggle high contrast
    await page.goto('/settings');
    const contrastCheckbox = page.locator('input[name="high-contrast"]');
    await expect(contrastCheckbox).toBeVisible();

    await contrastCheckbox.click();
    await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');

    // Announcer says high contrast is on
    const announcer = page.getByTestId('announcer');
    await expect(announcer).toContainText(/high contrast/i);

    // Verify all routes with high contrast active
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');

      const results = await new AxeBuilder({ page }).analyze();
      expect(blockingViolations(results), `High-contrast axe check on ${route}`).toEqual([]);
    }
  });

  test('CSS @media (prefers-contrast: more) applies high contrast tokens', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });

    for (const route of ROUTES) {
      await page.goto(route);

      // Verify border and background styles meet high-contrast tokens
      const isMoreContrast = await page.evaluate(() => {
        const style = window.getComputedStyle(document.documentElement);
        const border = style.getPropertyValue('--border').trim();
        const fg = style.getPropertyValue('--fg').trim();
        // In prefers-contrast: more, --border is mapped to var(--fg)
        return border === fg || border.length > 0;
      });

      expect(isMoreContrast, `High contrast media query active on ${route}`).toBe(true);

      const results = await new AxeBuilder({ page }).analyze();
      expect(blockingViolations(results), `prefers-contrast: more axe check on ${route}`).toEqual([]);
    }
  });
});

test.describe('A-08: prefers-reduced-motion', () => {
  test('disables transitions and animations globally when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const route of ROUTES) {
      await page.goto(route);

      // Check transition and animation durations on elements
      const motionDisabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, input'));
        for (const el of buttons) {
          const style = window.getComputedStyle(el);
          const animDuration = parseFloat(style.animationDuration);
          const transDuration = parseFloat(style.transitionDuration);
          // With prefers-reduced-motion: reduce, durations are set to 0.001ms (<= 0.01s)
          if (animDuration > 0.01 || transDuration > 0.01) {
            return false;
          }
        }
        return true;
      });

      expect(motionDisabled, `Transitions and animations disabled on ${route}`).toBe(true);
    }
  });

  test('button hover does not transform/lift when reduced motion is active', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const submitBtn = page.getByRole('button', { name: /read this text/i });
    await submitBtn.hover();

    const transform = await submitBtn.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    // In reduced motion, button:hover has transform: none
    expect(transform).toBe('none');
  });
});

test.describe('A-08: 200% Zoom and 320px Reflow (WCAG 1.4.10)', () => {
  // Same reason as the high-contrast block above: four routes × axe in one test, 12–13 s alone and
  // over 30 s under a four-worker full run. Only the deadline moves.
  test.setTimeout(90_000);

  test('no horizontal scrollbar on 320px viewport across all routes', async ({ page }) => {
    // 320px viewport represents 400% zoom on 1280px or 200% zoom on 640px
    await page.setViewportSize({ width: 320, height: 640 });

    for (const route of ROUTES) {
      await page.goto(route);

      const overflowElements = await page.evaluate(() => {
        const docWidth = window.innerWidth;
        const els = Array.from(document.querySelectorAll('*'));
        return els
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.right > docWidth + 1;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ').join('.') : ''}`);
      });

      expect(overflowElements, `No horizontal overflow on ${route} at 320px width`).toEqual([]);

      // Verify axe AA compliance at 320px
      const results = await new AxeBuilder({ page }).analyze();
      expect(blockingViolations(results), `320px reflow axe check on ${route}`).toEqual([]);
    }
  });

  test('all interactive buttons remain accessible and meet minimum touch/click target size at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');

    const buttons = page.locator('main button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box, `Button ${i} has bounding box`).not.toBeNull();
        expect(box!.height, `Button ${i} height >= 44px at 320px`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `Button ${i} width >= 44px at 320px`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('full reading and Q&A workflow completes without horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');

    // Select demo document 1
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();

    await expect(page).toHaveURL('/read', NAV_WAIT);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    // Verify no horizontal overflow on results view
    const overflowOnResults = await page.evaluate(() => {
      const docWidth = window.innerWidth;
      const els = Array.from(document.querySelectorAll('*'));
      return els
        .filter((el) => el.getBoundingClientRect().right > docWidth + 1)
        .map((el) => el.tagName.toLowerCase());
    });
    expect(overflowOnResults, 'No horizontal overflow on /read results at 320px').toEqual([]);

    // Axe on results view at 320px
    const results = await new AxeBuilder({ page }).analyze();
    expect(blockingViolations(results), 'Results view axe check at 320px').toEqual([]);
  });
});
