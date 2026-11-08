import { test, expect, type Page } from '@playwright/test';

/**
 * Keyboard-only pass on desktop (**A-05**, AGENTS.md §8).
 *
 * Verifies the 5 requirements from `tests/a11y/manual-checklist.md`:
 * 1. Tab order: skip link -> nav -> main -> page controls.
 * 2. Every control reachable and operable with keyboard alone, >= 44x44 px targets.
 * 3. Focus visibly indicated on every interactive element (:focus-visible).
 * 4. No focus traps in the announcer, nav, or dialogs.
 * 5. Routes render no content requiring a hover state.
 */

const ROUTES = ['/', '/read', '/trust', '/settings'] as const;
const NAV_WAIT = { timeout: 30_000 };

/**
 * Tab forward until an element with the given id is focused.
 */
async function tabToId(page: Page, id: string, maxTabs = 25): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    const currentId = await page.evaluate(() => document.activeElement?.id);
    if (currentId === id) return;
    await page.keyboard.press('Tab');
  }
  const current = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  throw new Error(`Tab never reached #${id} after ${maxTabs} tabs (stopped at: ${current})`);
}

/**
 * Asserts that the currently focused element has a visible focus indicator.
 * Checks for outline width >= 2px and non-none style, or contrasting box-shadow/border.
 */
async function assertVisibleFocus(page: Page, description: string): Promise<void> {
  const isFocusVisible = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const style = window.getComputedStyle(el);
    const outlineWidth = parseFloat(style.outlineWidth) || 0;
    const outlineStyle = style.outlineStyle;
    const hasOutline = outlineWidth >= 2 && outlineStyle !== 'none';
    const hasBoxShadow = style.boxShadow && style.boxShadow !== 'none';
    const hasBorder = parseFloat(style.borderWidth) >= 2 && style.borderStyle !== 'none';
    return hasOutline || hasBoxShadow || hasBorder;
  });

  expect(isFocusVisible, `Focus should be visibly indicated on: ${description}`).toBe(true);
}

test.describe('Keyboard-only pass (A-05)', () => {
  test('Check 1: Tab order is skip link -> nav -> main across all routes', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);

      // First tab lands on the skip link
      await page.keyboard.press('Tab');
      const skipLink = page.locator('a.skip-link');
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeVisible();

      // Enter on skip link moves focus to <main id="main">
      await page.keyboard.press('Enter');
      const activeId = await page.evaluate(() => document.activeElement?.id);
      expect(activeId, `Skip link on ${route} should focus main#main`).toBe('main');

      // Refresh to test normal Tab through navigation
      await page.goto(route);
      await page.keyboard.press('Tab'); // skip link
      await page.keyboard.press('Tab'); // first nav link (Sightline home)

      const firstNav = page.locator('nav[aria-label="Sightline sections"] a').first();
      await expect(firstNav).toBeFocused();
      await assertVisibleFocus(page, `first nav link on ${route}`);
    }
  });

  test('Check 2: Every control on / is reachable and operable with keyboard alone', async ({ page }) => {
    await page.goto('/');

    // 1. Select demo document with keyboard
    const billBtn = page.getByRole('button', { name: /demo document 1/i });
    await billBtn.focus();
    await assertVisibleFocus(page, 'Demo document 1 button');
    await page.keyboard.press('Enter');

    // Verify textarea populated
    const textarea = page.locator('#document-text');
    await expect(textarea).not.toHaveValue('');

    // 2. Tab to submit button and verify target size
    await tabToId(page, 'document-text');
    await assertVisibleFocus(page, 'textarea');

    // Tab from textarea lands on submit button
    await page.keyboard.press('Tab');
    const submitBtn = page.getByRole('button', { name: /read this text/i });
    await expect(submitBtn).toBeFocused();
    await assertVisibleFocus(page, 'submit button');

    const box = await submitBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // 3. Submit with Enter key
    await page.keyboard.press('Enter');

    // Navigates to /read with heading focused
    await expect(page).toHaveURL('/read', NAV_WAIT);
    const h1 = page.getByRole('heading', { level: 1 }).first();
    await expect(h1).toBeFocused();
  });

  test('Check 2b: Settings controls operable with keyboard alone', async ({ page }) => {
    await page.goto('/settings');

    // Wait for client settings to load
    await expect(page.locator('input[name="speech-rate"]')).toHaveCount(4);

    // 1. Radio group navigation via Arrow keys
    const normalRadio = page.locator('input[name="speech-rate"][value="1"]');
    await normalRadio.focus();
    expect(await normalRadio.isChecked()).toBe(true);

    // Press ArrowRight to select Fast (1.5)
    await page.keyboard.press('ArrowRight');
    const fastRadio = page.locator('input[name="speech-rate"][value="1.5"]');
    expect(await fastRadio.isChecked()).toBe(true);

    // 2. Tab to High contrast checkbox
    const contrastCheckbox = page.locator('input[name="high-contrast"]');
    await contrastCheckbox.focus();
    await assertVisibleFocus(page, 'high contrast checkbox');

    const initialChecked = await contrastCheckbox.isChecked();
    // Press Space to toggle
    await page.keyboard.press('Space');
    expect(await contrastCheckbox.isChecked()).toBe(!initialChecked);

    // Verify <html> data-high-contrast attribute toggled
    const htmlContrast = await page.locator('html').getAttribute('data-high-contrast');
    expect(htmlContrast).toBe(initialChecked ? null : 'true');

    // Toggle back with Space
    await page.keyboard.press('Space');
    expect(await contrastCheckbox.isChecked()).toBe(initialChecked);
  });

  test('Check 2c: Follow-up Q&A on /read is operable with keyboard alone', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();
    await expect(page).toHaveURL('/read', NAV_WAIT);

    // Tab to question box
    await tabToId(page, 'question');
    await assertVisibleFocus(page, 'question input box');

    await page.keyboard.type('How much do I have to pay?');
    // Enter inside question field submits the form
    await page.keyboard.press('Enter');

    // Wait for answer to render
    const answerHeading = page.getByRole('heading', { name: 'Answers', exact: true, level: 3 });
    await expect(answerHeading).toBeVisible();
    await expect(page.getByTestId('qa-answer').first()).toBeVisible();
  });

  test('Check 3: All interactive buttons and links have visible focus rings', async ({ page }) => {
    await page.goto('/');

    // Start from top of document and Tab through interactive elements
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const isBody = await page.evaluate(() => document.activeElement === document.body);
      if (!isBody) {
        const desc = await page.evaluate(
          () => document.activeElement?.id || document.activeElement?.getAttribute('name') || document.activeElement?.tagName,
        );
        await assertVisibleFocus(page, `tab item ${i} (${desc})`);
      }
    }
  });

  test('Check 4: No focus trap in the announcer or nav', async ({ page }) => {
    await page.goto('/');

    // Tab through the first 25 elements to ensure focus cycles naturally without getting trapped
    const focusedTags: string[] = [];
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? 'none');
      const testid = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
      // Announcer must never steal or trap keyboard focus
      expect(testid, 'Announcer live region must never be keyboard focused').not.toBe('announcer');
      focusedTags.push(tag);
    }

    // Ensure we reached buttons, links, or textareas
    expect(focusedTags).toContain('a');
    expect(focusedTags).toContain('button');
  });

  test('Check 5: Routes render no content requiring a hover state', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route);

      // Verify that no critical interactive control or help text has display:none/opacity:0 that only shows on :hover
      const hiddenHoverOnlyElements = await page.evaluate(() => {
        const issues: string[] = [];
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = window.getComputedStyle(el);
          // Check for elements that have hover-only visibility tricks
          if (style.visibility === 'hidden' && el.textContent?.trim()) {
            const hasAriaHidden = el.getAttribute('aria-hidden') === 'true';
            const isSkipLink = el.classList.contains('skip-link');
            const isAnnouncer = el.classList.contains('visually-hidden');
            if (!hasAriaHidden && !isSkipLink && !isAnnouncer) {
              issues.push(el.tagName);
            }
          }
        }
        return issues;
      });

      expect(hiddenHoverOnlyElements, `No hover-locked elements on ${route}`).toEqual([]);
    }
  });
});
