import { expect, test } from '@playwright/test';

/**
 * **C-12** — the paste screen's own limit, proved from the screen.
 *
 * `MAX_PAGES` bounds photographs; until this item the pasted half of the product bounded nothing, so a
 * long document reached the service, was billed for its input, and came back as a transport-shaped
 * error about its own length. The unit tests in `tests/unit/session-reducer.test.ts` hold the boundary
 * arithmetic; what only a browser can show is the three things the person actually meets: the limit is
 * stated before they type, the refusal is the catalogue's sentence rather than a code, and a document
 * just *under* the limit is not refused by this guard.
 *
 * Fixture mode is the honest place to test this: the guard sits **before** any transport decision, so
 * the refusal happens for the same reason and with the same words whichever mode the app runs in.
 */

const BOX = 'document-text';
const LIMIT = 20_000;

/** The catalogue's sentence, copied here so a screen-written paraphrase cannot pass for it. */
const TOO_LONG_SENTENCE =
  'That text is longer than Sightline reads at one time. Copy part of the document — one page, or the section you need answered — and read that on its own.';

/** Just over the cap, and just under it, in characters rather than in words a test would have to count. */
const TOO_LONG = 'a'.repeat(LIMIT + 1);
const JUST_FITS = 'Invoice 42. Amount due £840.\n\n' + 'b'.repeat(LIMIT - 'Invoice 42. Amount due £840.\n\n'.length);

async function paste(page: import('@playwright/test').Page, text: string) {
  await page.goto('/');
  await page.getByLabel('Paste the text of your document').fill(text);
  await page.getByRole('button', { name: 'Read this text' }).click();
}

test.describe('a paste that is too long (C-12, ADR-29)', () => {
  test('the screen states the limit before the person types', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`#${BOX}`)).toBeVisible();
    await expect(page.locator('#paste-hint')).toContainText(`${LIMIT.toLocaleString('en-GB')} characters`);
  });

  test('one character over the limit is refused on the spot, in plain language, with focus on the summary', async ({
    page,
  }) => {
    await paste(page, TOO_LONG);

    // The catalogue's sentence, not a paraphrase written for the screen (AGENTS.md §4).
    await expect(page.getByTestId('announcer')).toHaveText(TOO_LONG_SENTENCE);
    // A-06: the failure is reachable by keyboard, not just audible.
    await expect(page.locator('#paste-error')).toBeFocused();
    // Nothing ran, so nothing navigated and the button is not stuck on "Reading…".
    expect(page.url()).toMatch(/\/$/);
    await expect(page.getByRole('button', { name: 'Read this text' })).toBeEnabled();
  });

  test('the refused paste leaves nothing behind: the reading screen still has no transcript', async ({ page }) => {
    await paste(page, TOO_LONG);
    await expect(page.getByTestId('announcer')).toHaveText(TOO_LONG_SENTENCE);

    // The claim this makes is the one the guard exists for: the person's text never became a
    // transcript, so the screen that shows readings still holds none. A guard that ran after the
    // pipeline had already written its first step would leave a half-document here.
    //
    // Navigated by the nav link, not by URL: the session is memory-only, so a page load loses the
    // document whatever the run did and the assertion would pass for the wrong reason.
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByTestId('nothing-read')).toBeVisible();
  });

  /*
   * What this file deliberately does **not** claim, because a mutation check said it cannot: an earlier
   * version asserted that the announcer never says "Reading the demo text." *before* the refusal, to
   * prove the guard runs first. Moving the guard below that announcement left the test green — because
   * `announce()` is React state and both writes land in one batch, so the live region never holds the
   * intermediate sentence at all. The order is therefore not observable from the region, and what these
   * tests assert instead is what a person can actually meet: the refusal's own sentence, and nothing
   * written into the session.
   */

  test('a document one character under the limit is not refused for its length — and reaches the run', async ({ page }) => {
    await paste(page, JUST_FITS);
    await expect(page.getByTestId('announcer')).not.toContainText('longer than Sightline reads');
    // It still gets nowhere near an analysis, because it is not a demo document — that is the *other*
    // refusal, and the two must stay distinguishable (a guard that swallowed both would tell a person
    // their long document was too long *and* unknown).
    await expect(page.getByTestId('announcer')).toContainText('demo answer');

    // The control for the test above, and the reason it is not vacuous: a paste that clears the cap
    // *does* reach the pipeline, which stores the transcript as its first step. So the same navigation
    // finds a reading here and no reading there — the difference is the guard, not the nav link.
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByTestId('nothing-read')).not.toBeVisible();
  });
});
