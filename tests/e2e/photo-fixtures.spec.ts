import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * **C-13** — a photographed document read start to finish, with no key, in a real browser.
 *
 * This is the file `tests/e2e/capture.spec.ts` could not be: every image that one draws is the person's
 * own, so its run stops at the demo door. Here the photographs are the three the demo ships, the same
 * bytes **S-11** recorded, so the run goes all the way — page loop, join, structure step, results screen,
 * Ask section — and everything a reviewer sees about a photograph is something this app has actually
 * finished doing rather than a branch described in prose.
 *
 * What each test is for:
 *  - the full run, and the shape of what arrives: 1,200×1,600 prepared pages (C-01's cap, re-derived in
 *    Chromium rather than trusted from a Node harness), the recorded reading on screen, and the
 *    "quoted from the text" state on every fact because the enclave model grounded all of them;
 *  - **the two refusals, which are the part that keeps the first test honest.** A subset of the demo
 *    photographs is a different document, and one changed byte is a different photograph: both have to be
 *    refused rather than answered with the recording. That is F-09's rule restated over pixels, and
 *    **ADR-31**'s reason for a whole-file SHA-256 instead of anything that could near-miss.
 *  - one axe pass on the results screen reached *by the photo path*, which no other spec arrives at.
 *
 * Fixture mode is what `playwright.config.mts` starts (`NEAR_AI_API_KEY=` empty), so nothing here can
 * spend anything: the whole run is replayed, and it takes seconds rather than the ≈4 minutes a live one
 * does. No test in this file claims a live call happened — the receipts say demo data, and `trust-claim`
 * is asserted below to make sure they keep saying it.
 */

// `__dirname`, not `import.meta.dirname`: Playwright transpiles specs to CommonJS, where `import.meta`
// is a syntax error. Unit tests get ESM and use the other one.
const PHOTOS = [1, 2, 3].map((n) => resolve(__dirname, '..', '..', 'public', 'sample-docs', 'photographs', `page-${n}.jpg`));

/** The house filter (`tests/e2e/flow.spec.ts`): serious and critical block, moderate does not. */
function blocking(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`);
}

async function choosePhotographs(page: Page, files: readonly string[]) {
  await page.getByLabel('Add photographs').setInputFiles([...files]);
}

/** The shipped photographs, in capture order, and then the run. */
async function readTheDemoSet(page: Page) {
  await choosePhotographs(page, PHOTOS);
  await page.getByRole('button', { name: 'Read these photographs' }).click();
}

test.describe('the three photographs the demo ships (S-11 → C-13)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('each chosen file is prepared to the recorded geometry before anything is sent', async ({ page }) => {
    await choosePhotographs(page, PHOTOS);

    // The row reports the *prepared* page, so this is C-01's cap re-derived in Chromium on the shipped
    // bytes — the number the recording's `_provenance.prepared` carries (1200×1600 from 3024×4032). If a
    // browser ever prepares these differently the digest still matches (it is taken from the file the
    // person chose, **ADR-31**), but a reviewer would be shown a page the model never saw, and that is
    // what this catches.
    await expect(page.getByTestId('capture-count')).toHaveText('3 of 5 photographs added.');
    for (const index of [1, 2, 3]) {
      await expect(page.getByTestId(`capture-page-${index}`)).toHaveText(new RegExp(`Page ${index} — 1200 by 1600 pixels`));
    }
  });

  test('a photographed document runs to the end with no key, and the reading is the recorded one', async ({ page }) => {
    await readTheDemoSet(page);

    // The run routes to the reading screen and hands focus to its heading (§8: no silent navigation).
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await expect(page.getByTestId('announcer')).toHaveText('Done. Showing what Sightline read.');

    // Three pages really joined: the recorder's transcript ends on line 084, and every page header the
    // model read is in the full text the screen shows.
    const fullText = page.locator('section[aria-labelledby="full-text"]');
    await expect(fullText).toContainText('SYNTHETIC INVOICE - NOT A REAL DOCUMENT');
    await expect(fullText).toContainText('PAGE 1 OF 3');
    await expect(fullText).toContainText('PAGE 3 OF 3');
    await expect(fullText).toContainText('Line 084');

    // The recorded reading arrived, not an authored stand-in: this summary is what the attested
    // `Qwen/Qwen3.8-27B` said about these three pages, and the reference it named is on the paper.
    await expect(page.getByRole('heading', { name: 'Summary', level: 2 })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="summary-heading"]')).toContainText('reference NC-0000-SYN');
    await expect(page.locator('dt').filter({ hasText: 'Reference' }).first()).toBeVisible();

    // Grounding ran over the joined transcript and found every quote, so the flagged state stays absent —
    // the demo shows "sourced" as the normal case, and `tests/unit/recorded-fixtures.test.ts` is where the
    // count is pinned to the recording rather than to a hope.
    await expect(page.getByTestId('fact-flagged')).toHaveCount(0);
    await expect(page.getByTestId('ungrounded-count')).toHaveCount(0);

    // **P-16 on the very recording that made it an item.** Eighty-six facts arrive from the enclave, 84 of
    // them line items, and every one of them quotes the transcript, so grounding sees nothing. The screen
    // must say what it is listing before the list, keep the reference that a first-twelve cut would have
    // spent a slot on, and put the other 81 behind one native control.
    const factsSection = page.locator('section[aria-labelledby="facts-heading"]');
    await expect(page.getByTestId('fact-count')).toHaveText(
      'Sightline found 86 facts. That is too many to read one by one, so 5 are listed here and the other 81 are behind the “Show the other 81 facts” control at the end of this list.',
    );
    await expect(factsSection.locator('.fact-list').first().locator('dt')).toHaveCount(5);
    await expect(factsSection.locator('dt').filter({ hasText: 'Reference' })).toBeVisible();
    expect(await factsSection.locator('dt').count(), 'the 81 held facts are in the document, folded').toBe(86);

    // Rule 11: a demo that finishes is still a demo. The photo path leaves one receipt per replayed call —
    // three pages and the reading — so the claim is checked across all of them: none of them may say more
    // than the text the `TrustRecord`'s `fixtures` rung produces.
    await expect(page.getByTestId('trust-receipt')).toBeVisible();
    const claims = await page.getByTestId('trust-claim').allTextContents();

    expect(claims.length, 'a receipt per photographed page and one for the reading').toBeGreaterThanOrEqual(4);
    expect(new Set(claims)).toEqual(new Set(['Demo data. No real privacy guarantee.']));
  });

  /**
   * **P-16's second half: the held facts are reachable, and nothing about them is hidden in a way a
   * listener cannot undo.** The control is a native `<details>`, which is what AGENTS.md §8 asks for
   * before any JS disclosure, and the point of this test is the pair: the repetition is out of the
   * default reading, and one press puts all of it back — with its quotes, because a fact behind the
   * control is not a less-checked fact.
   */
  test('the rest of the 86-fact reading is one press away, with its quotes intact', async ({ page }) => {
    await readTheDemoSet(page);

    const lastLine = page.locator('dt').filter({ hasText: 'Line 084' });
    await expect(lastLine).toBeHidden();

    await page.getByTestId('more-facts').locator('summary').click();
    await expect(lastLine).toBeVisible();
    await expect(lastLine.locator('+ dd')).toContainText('Line 084');
    await expect(page.getByTestId('fact-flagged')).toHaveCount(0);

    // Pressing it does not ask the model anything: 86 facts in the document is still 86 facts, and no
    // new receipt appears, because a person expanding a list must not be charged for a second reading.
    expect(await page.locator('section[aria-labelledby="facts-heading"] dt').count()).toBe(86);
    await expect(page.getByTestId('announcer')).toHaveText('Done. Showing what Sightline read.');
  });

  test('the finished photograph answers the two questions that were asked of it', async ({ page }) => {
    await readTheDemoSet(page);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    // The wording is the recorder's, so these buttons only exist because Mode F can answer them (P-06).
    await page.getByRole('button', { name: 'What reference number is on these pages?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByTestId('announcer')).toHaveText('Answer: The reference number on the pages is NC-0000-SYN.');

    await page.getByRole('button', { name: 'Is there a payment deadline in this document?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    // The honest outcome, recorded rather than authored: the pages carry no deadline and the model said so.
    await expect(page.getByTestId('announcer')).toContainText('Answer: No. The document is a synthetic invoice');
    await expect(page.getByTestId('qa-answer').last()).toContainText('the document does not answer this.');
  });

  test('the reading screen reached by the photo path is still navigable by voice', async ({ page }) => {
    await readTheDemoSet(page);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();

    expect(blocking(results)).toEqual([]);
  });
});

test.describe('what the recording will not answer for', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('two of the three demo photographs are a different document, and are refused', async ({ page }) => {
    // The chain **ADR-31** builds on: a page is answered by its digest, and the reading is answered by the
    // exact transcript the pages joined to. Drop one page and the join is no longer the one that was
    // recorded, so the structure step must refuse rather than summarise a document nobody sent. This is the
    // assertion that makes the passing test above a chain rather than a coincidence.
    await choosePhotographs(page, PHOTOS.slice(0, 2));
    await page.getByRole('button', { name: 'Read these photographs' }).click();

    // The refusal is the *document* one, not the page one: both photographs were recognised.
    await expect(page.getByTestId('announcer')).toHaveText(
      'These are demo answers from demo documents. Your own text has no demo answer, so there is nothing to show for it.',
    );
    await expect(page.getByTestId('results-heading')).toHaveCount(0);
  });

  test('one changed byte at the end of a demo photograph is a different photograph', async ({ page }) => {
    // **ADR-31**'s rejected design, tested from the browser: the same picture with a byte appended is
    // visually identical, so a perceptual or "close enough" matcher would answer it with the recording.
    // A whole-file digest does not, and this is the demo's own file to prove it on.
    const altered = Buffer.concat([readFileSync(PHOTOS[0]!), Buffer.from([0x00])]);
    // All four as payloads, not paths: `setInputFiles` has no mixed array overload, and the altered file
    // has to be a payload anyway.
    const rest = PHOTOS.slice(1).map((file) => ({ name: file.split('/').pop()!, mimeType: 'image/jpeg', buffer: readFileSync(file) }));
    await page.getByLabel('Add photographs').setInputFiles([{ name: 'page-1.jpg', mimeType: 'image/jpeg', buffer: altered }, ...rest]);
    await page.getByRole('button', { name: 'Read these photographs' }).click();

    await expect(page.getByTestId('announcer')).toHaveText(
      'Demo mode answers for the three photographs it ships with. Your own photograph has no demo answer, so there is nothing to show for it.',
    );
    await expect(page.getByTestId('results-heading')).toHaveCount(0);
  });
});
