import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The Mode F flow (items **F-09, P-05, P-04, T-09**).
 *
 * This is the file that answers the reviewer's first question: *does a clean checkout run the
 * whole flow with no key?* It drives the real dev server that `playwright.config.mts` starts with
 * `NEXT_PUBLIC_DEFAULT_MODE=fixtures`, `RELAY_ENABLED=false` and an empty API key, so a passing
 * run here is evidence that nothing below needed a credential.
 *
 * The demo text is taken **from the running app** (the demo buttons fill the text box from the
 * corpus) rather than retyped or imported here: Playwright does not resolve the `@/` alias, and an
 * import would need either an extra dependency or a second copy of the corpus that can drift.
 * `tests/unit/fixtures.test.ts` is what pins the corpus itself.
 *
 * What this file deliberately does **not** claim:
 *  - it is not screen-reader evidence (A-03/A-04 need a device and a person). It asserts the DOM
 *    contract a reader depends on — one live region that received the message, focus moves, the
 *    fixed section order — not what NVDA spoke;
 *  - the off-origin assertion covers this flow, not the platform (A-02 owns that);
 *  - no test here exercises a live mode. T-01/T-02 are unbuilt, so a relay run refuses at the
 *    door; that refusal is asserted as a refusal, never as a privacy guarantee.
 */

/** The section order AGENTS.md §8 fixes; the receipt must stay last, below the answer. */
const SECTION_ORDER = ['Summary', 'Key facts', 'What you may need to do', 'Warnings', 'Full text', 'Ask a question', 'Verification'];

const BOX = 'document-text';

/** The demo buttons are rendered in corpus order: 1 = bill, 2 = bank statement, 3 = GP letter. */
const DEMO = { bill: 0, statement: 1, gpLetter: 2 } as const;

/** Choose a demo document, returning the exact text it put in the box. */
async function chooseDemoDocument(page: Page, index: number): Promise<string> {
  await page.goto('/');
  await page.locator('.button-row button').nth(index).click();
  return page.getByLabel('Paste the text of your document').inputValue();
}

async function runText(page: Page, text: string) {
  await page.getByLabel('Paste the text of your document').fill(text);
  await page.getByRole('button', { name: 'Read this text' }).click();
}

/**
 * Tab from the top of the page until an element with this id has focus. Bounded on purpose: if
 * the tab order skips it or traps, the test fails with a reason instead of hanging.
 */
async function tabUntilFocused(page: Page, id: string) {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((want) => document.activeElement?.id === want, id)) return;
  }
  throw new Error(`Tab never reached #${id} — an unexpected tab order or a focus trap`);
}

test.describe('the demo flow, with no credentials (F-09 done-when)', () => {
  test('reads a demo document from paste to results, in the fixed section order', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await expect(page).toHaveURL(/\/read$/);
    const results = page.getByTestId('results-heading');
    await expect(results).toBeVisible();
    // §8: after navigation focus lands on the new view's heading, not back at the top of the page.
    await expect(results).toBeFocused();

    expect(await page.locator('main h2').allTextContents()).toEqual(SECTION_ORDER);

    await expect(page.locator('main')).toContainText('A care trust invoice for 840 pounds');
    await expect(page.getByText('Sightline thinks this is a bill or invoice.')).toBeVisible();

    // Every fact is quoted or flagged; here all four quotes are literal excerpts of the transcript.
    await expect(page.getByTestId('fact-flagged')).toHaveCount(0);
    await expect(page.locator('.fact-list dt', { hasText: 'Amount due' })).toBeVisible();
    await expect(page.locator('.fact-list dd').filter({ hasText: '£840' }).first()).toBeVisible();

    // The pasted words stay reachable, so the user can check the reading themselves.
    await expect(page.locator('.transcript')).toHaveText(text);

    // T-09: the receipt closes the page, and its sentence is the one claims.ts gives Mode F.
    const receipt = page.getByTestId('trust-receipt');
    await expect(receipt).toBeVisible();
    await expect(page.getByTestId('trust-claim')).toHaveText('Demo data. No real privacy guarantee.');
    await expect(receipt.getByRole('heading', { level: 3, name: 'Checks that ran' })).toBeVisible();
    await expect(receipt.getByRole('heading', { level: 3, name: 'Checks that did not run' })).toBeVisible();
    // Rule 5: nothing here is presented as a verdict of "verified".
    await expect(receipt.getByText('Verified', { exact: true })).toHaveCount(0);
    // P-06 is not built, and the section says so instead of showing a box that does nothing.
    await expect(page.getByRole('heading', { level: 2, name: 'Ask a question' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /question/i })).toHaveCount(0);

    // §8: the announcer carried the outcome, and it is the region the app owns.
    await expect(page.getByTestId('announcer')).toHaveText('Done. Showing what Sightline read.');
  });

  /**
   * Next.js adds a live region of its own the first time the app navigates on the client
   * (`#__next-route-announcer__`, role=alert, inside a `<next-route-announcer>` shadow host), and
   * fills it with `document.title`, falling back to the first `<h1>` when the title is empty.
   * AGENTS.md §8 allows one announcer, so the app's position is: **our region is the only one that
   * carries Sightline's sentences, and the route title never changes, so Next's region has nothing
   * to say.** Measured on a production build on 2026-11-03: it stayed empty across the whole flow.
   *
   * The honest caveat, recorded rather than hidden: in `next dev` the title is applied after the
   * announcer's first measurement, so there the fallback fires and the region does pick up the new
   * `<h1>` — a duplicate sentence that exists while developing and not while deployed. A-03/A-04
   * must re-check it with a real reader, and no route may be given its own `metadata.title`
   * without deciding that duplication deliberately.
   */
  test('the app speaks through one region, and every route shares one title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Sightline');

    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    // role=status is ours; Next's region is role=alert. One polite status region, no more.
    await expect(page.getByRole('status')).toHaveCount(1);
    await expect(page.getByRole('status')).toHaveText('Done. Showing what Sightline read.');
    // The condition that keeps Next's region silent where it counts: an unchanged title.
    await expect(page).toHaveTitle('Sightline');

    await page.getByRole('link', { name: 'Verification' }).click();
    await expect(page).toHaveTitle('Sightline');
    await expect(page.getByRole('status')).toHaveCount(1);
  });

  test('shows a fact as flagged when its words are not in the text it was given', async ({ page }) => {
    // Riverside carries one authored misquote: the answer's balance line is not a literal
    // excerpt, so grounding must refuse to present it as sourced (AGENTS.md §4 rule 8).
    const text = await chooseDemoDocument(page, DEMO.statement);
    await runText(page, text);

    const flagged = page.getByTestId('fact-flagged');
    await expect(flagged).toHaveCount(1);
    await expect(flagged).toHaveText('— Sightline could not find these words in the text it was given');
    await expect(page.getByTestId('ungrounded-count')).toHaveText(
      'One fact above could not be matched to the words Sightline was given. Treat those with care.',
    );
    // The flagged fact is kept and shown, never dropped: hiding it would hide a model problem.
    // Anchored regexes because "Balance" is a substring of "Closing balance" as well.
    await expect(page.locator('.fact-list dt', { hasText: /^Balance$/ })).toBeVisible();
    // The grounded twin of that fact still shows its quote, so the flag is per-fact not per-run.
    await expect(page.locator('.fact-list dt', { hasText: /^Closing balance$/ })).toBeVisible();
  });

  test('a demo document button fills the box and says what happened', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('.button-row button').nth(DEMO.gpLetter);
    const title = (await button.textContent()) ?? '';
    await button.click();

    const value = await page.getByLabel('Paste the text of your document').inputValue();
    expect(value).toContain('sertraline 50 mg tablets');
    await expect(page.getByTestId('announcer')).toHaveText(`${title} is in the text box. Choose Read this text to continue.`);

    await page.getByRole('button', { name: 'Read this text' }).click();
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await expect(page.getByText('Sightline thinks this is a letter about health.')).toBeVisible();
    // Two warnings arrive from the corpus; this version does not yet add its own safety notices.
    await expect(page.locator('#warnings-heading ~ ul li')).toHaveCount(2);
  });

  test('answering an arbitrary document is refused, not invented', async ({ page }) => {
    // The honesty edge of Mode F: a demo answer must never appear to describe the user's own
    // text. This is the assertion that proves the replay client matches on content, not on
    // "a request was made".
    await page.goto('/');
    await runText(page, 'My own rent agreement, signed last week. Rent is £900 due on the 1st.');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('results-heading')).toHaveCount(0);
    const summary = page.getByTestId('status-message');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(
      'These are demo answers from demo documents. Your own text has no demo answer, so there is nothing to show for it.',
    );
    // A-06: focus moves to the failure summary so a keyboard and screen-reader user finds it.
    await expect(summary).toBeFocused();
    await expect(page.getByTestId('announcer')).toContainText('demo answer');
    // The text is still the user's, unfed to anything: no analysis, no receipt.
    await expect(page.getByTestId('trust-receipt')).toHaveCount(0);
  });

  test('an empty text box is refused before anything runs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Read this text' }).click();
    await expect(page.getByTestId('announcer')).toHaveText('There is nothing in the text box yet.');
    await expect(page.getByTestId('status-message')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('the results page is reachable by navigation and honest when empty', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'What Sightline read' })).toBeVisible();
    await expect(page.getByText('Nothing has been read yet.')).toBeVisible();
    // No silent dead end: the empty view points at the way in.
    await expect(page.getByRole('link', { name: 'Add a document' })).toBeVisible();
  });

  test('the trust page shows the same receipt as the results page', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await page.getByRole('link', { name: 'Verification' }).click();

    await expect(page.getByTestId('trust-receipt')).toBeVisible();
    await expect(page.getByTestId('trust-claim')).toHaveText('Demo data. No real privacy guarantee.');
    await expect(page.getByRole('heading', { level: 3, name: 'What this does not tell you' })).toBeVisible();

    // §8: jargon stays behind a disclosure control, and opening it must not upgrade the claim.
    const technicals = page.locator('details');
    await expect(technicals.getByText('fixtures/demo-model')).toBeHidden();
    await technicals.getByText('Technical details').click();
    await expect(technicals.getByText('fixtures/demo-model')).toBeVisible();
    await expect(technicals.getByText('verified: false')).toBeVisible();
  });

  test('the session survives the navigation between views', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    // A second client-side navigation must not lose the document: there is no server storage,
    // so a full page load here would silently empty the session.
    await page.getByRole('link', { name: 'Document' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Add a document' })).toBeVisible();
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.locator('.transcript')).toHaveText(text);
  });

  test('nothing leaves the origin during the flow', async ({ page }) => {
    const external = new Set<string>();
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.add(url.origin);
      } catch {
        external.add(request.url());
      }
    });

    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await page.getByRole('link', { name: 'Verification' }).click();
    await page.getByRole('link', { name: 'Settings' }).click();

    expect([...external], 'Mode F must make no request outside its own origin').toEqual([]);
  });

  test('the keyboard path reaches the flow’s controls', async ({ page }) => {
    await page.goto('/');
    await tabUntilFocused(page, BOX);
    await expect(page.getByLabel('Paste the text of your document')).toBeFocused();

    await page.keyboard.type('NORTHGATE CARE NHS TRUST\nAmount due: £840\n');

    // One Tab from the text box is the submit control: nothing between them is a dead stop, and
    // Enter activates it. (Enter inside the textarea inserts a newline, which is correct.)
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Read this text' })).toBeFocused();
    await page.keyboard.press('Enter');

    // Typed text is not a demo document, so Mode F must refuse rather than answer.
    await expect(page.getByTestId('status-message')).toBeVisible();
    await expect(page.getByTestId('results-heading')).toHaveCount(0);
  });

  test('every button in the flow meets the 44px target minimum', async ({ page }) => {
    const tooSmall: string[] = [];
    for (const stage of ['input', 'results'] as const) {
      await page.goto('/');
      if (stage === 'results') {
        const text = await chooseDemoDocument(page, DEMO.bill);
        await runText(page, text);
        await expect(page.getByTestId('results-heading')).toBeVisible();
      }
      const boxes = await page
        .locator('main button')
        .evaluateAll((els) =>
          els.map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 40), h: Math.round(el.getBoundingClientRect().height) })),
        );
      for (const box of boxes) {
        if (box.h < 44) tooSmall.push(`${stage} → "${box.text}" is ${box.h}px tall`);
      }
    }
    expect(tooSmall, 'AGENTS.md §8: no touch target under 44px').toEqual([]);
  });
});

test.describe('accessibility with content (extends F-08)', () => {
  test('axe finds no serious or critical violation on the completed flow', async ({ page }) => {
    for (const index of [DEMO.bill, DEMO.statement, DEMO.gpLetter]) {
      const text = await chooseDemoDocument(page, index);
      await runText(page, text);
      await expect(page.getByTestId('results-heading')).toBeVisible();

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(
        blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`),
        `document ${index} on /read`,
      ).toEqual([]);
    }
  });

  test('the flag is not carried by colour alone', async ({ page }) => {
    // A greyscale or colour-blind reader must still see the qualifier: it is words inside the
    // node, which is why the text is the assertion and the class is not.
    await page.goto('/');
    const text = await chooseDemoDocument(page, DEMO.statement);
    await runText(page, text);

    await expect(page.getByTestId('fact-flagged')).toContainText('could not find these words');
    await expect(page.getByTestId('trust-claim')).not.toContainText('verified');
  });
});
