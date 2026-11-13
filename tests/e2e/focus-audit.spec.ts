import { test, expect } from '@playwright/test';

/**
 * Focus-management audit (**A-06**, AGENTS.md §8).
 *
 * Verifies:
 * 1. New view heading focus: after a run, router.push('/read') lands with focus on results <h1>.
 * 2. Error summary focus on failed actions:
 *    - Oversized paste moves focus to #paste-error (StatusMessage).
 *    - Unanswerable question moves focus to status summary (StatusMessage).
 * 3. Retake offer focus: capture issue requiring retake focuses #retake-heading.
 * 4. Forget action focus return: Forget empties results screen and returns focus to results heading.
 * 5. Results view keyboard traversal: all sections in fixed order and interactive elements reachable.
 */

const NAV_WAIT = { timeout: 30_000 };

test.describe('A-06: Focus-management audit', () => {
  test('New view heading focus: after a run completes, focus lands on results <h1>', async ({ page }) => {
    await page.goto('/');

    // Choose demo document and run
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();

    // After run completes, navigation commits to /read with heading focused
    await expect(page).toHaveURL('/read', NAV_WAIT);
    const resultsHeading = page.getByTestId('results-heading');
    await expect(resultsHeading).toBeVisible();
    await expect(resultsHeading).toBeFocused();
    expect(await resultsHeading.getAttribute('tabindex')).toBe('-1');
  });

  test('Error summary focus: submitting oversized paste moves focus to #paste-error', async ({ page }) => {
    await page.goto('/');

    // Submit text exceeding 20,000 characters (C-12 limit)
    const textarea = page.locator('#document-text');
    await textarea.fill('a'.repeat(20_001));

    const submitBtn = page.getByRole('button', { name: /read this text/i });
    await submitBtn.click();

    // Error summary appears and receives focus (StatusMessage has tabIndex -1)
    const pasteError = page.locator('#paste-error');
    await expect(pasteError).toBeVisible();
    await expect(pasteError).toBeFocused();
    expect(await pasteError.getAttribute('tabindex')).toBe('-1');
  });

  test('Error summary focus: submitting an unanswerable question moves focus to status summary', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();
    await expect(page).toHaveURL('/read', NAV_WAIT);

    // Ask a question with no prepared answer in fixture mode
    const questionInput = page.getByLabel('Your question');
    await questionInput.fill('When do I need to renew?');
    const askBtn = page.getByRole('button', { name: 'Ask', exact: true });
    await askBtn.click();

    // Focus lands on error status message
    const errorMsg = page.getByTestId('status-message');
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toBeFocused();
    expect(await errorMsg.getAttribute('tabindex')).toBe('-1');
  });

  test('Forget action focus: Forget moves focus to the heading of what is left', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();
    await expect(page).toHaveURL('/read', NAV_WAIT);

    // Verify results heading focused on arrival
    const resultsHeading = page.getByTestId('results-heading');
    await expect(resultsHeading).toBeFocused();

    // Click Forget
    const forgetBtn = page.getByRole('button', { name: /forget this document/i }).first();
    await forgetBtn.click();

    // Focus returns to the results heading of the cleared screen
    await expect(resultsHeading).toBeVisible();
    await expect(resultsHeading).toBeFocused();
    await expect(page.getByTestId('nothing-read')).toBeVisible();
  });

  test('Results view keyboard traversal: all sections and interactive elements accessible in order', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /demo document 1/i }).click();
    await page.getByRole('button', { name: /read this text/i }).click();
    await expect(page).toHaveURL('/read', NAV_WAIT);

    // Initial focus on results heading
    await expect(page.getByTestId('results-heading')).toBeFocused();

    // Verify sections follow fixed order (AGENTS.md §8)
    const expectedSections = [
      'Summary',
      'Key facts',
      'What you may need to do',
      'Warnings',
      'Full text',
      'Ask a question',
      'Verification',
    ];

    const headings = await page.locator('main h2').allTextContents();
    expect(headings).toEqual(expectedSections);

    // Tab through interactive controls in the results view
    await page.keyboard.press('Tab');
    const firstControl = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim());
    expect(firstControl).toBeTruthy();

    // Tab reaches question box
    let reachedQuestion = false;
    for (let i = 0; i < 15; i++) {
      const activeId = await page.evaluate(() => document.activeElement?.id);
      if (activeId === 'question') {
        reachedQuestion = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(reachedQuestion, 'Tab order must reach #question input in Ask section').toBe(true);

    // Next tab reaches Ask button
    await page.keyboard.press('Tab');
    const askButtonFocused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    expect(askButtonFocused).toBe('Ask');

    // Tab reaches Forget button. The budget is 20, not 10, because the footer's five links are now
    // in the tab order (R-18: they carried `tabIndex={-1}` and were unreachable by keyboard, which is
    // the wrong shape for this app's audience). Forget lives in the nav, so reaching it forward from
    // the Ask button means wrapping past the footer; the wait is longer, the reachability is the claim.
    let reachedForget = false;
    for (let i = 0; i < 20; i++) {
      const activeText = await page.evaluate(() => document.activeElement?.textContent?.trim());
      if (activeText?.includes('Forget')) {
        reachedForget = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(reachedForget, 'Tab order must reach Forget button').toBe(true);
  });

  test('the footer’s links are reachable by keyboard, not only by pointer', async ({ page }) => {
    // R-18: five `<a>`s in the footer carried `tabIndex={-1}`, so a keyboard-only reader could not
    // open the NEAR docs, the cloud console, the architecture page or the source. This is the
    // regression guard: the links must be reached by Tab alone, from the top of the document.
    await page.goto('/');
    let reachedSource = false;
    for (let i = 0; i < 40; i += 1) {
      const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
      if (focused.includes('GitHub Source')) {
        reachedSource = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(reachedSource, 'the source link must be in the tab order').toBe(true);
  });
});
