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
    await expect(receipt.getByRole('heading', { level: 4, name: 'Checks that ran' })).toBeVisible();
    await expect(receipt.getByRole('heading', { level: 4, name: 'Checks that did not run' })).toBeVisible();
    // Rule 5: nothing here is presented as a verdict of "verified".
    await expect(receipt.getByText('Verified', { exact: true })).toHaveCount(0);
    // P-06 lives in this position in the order: a question box exists, above the receipt.
    await expect(page.getByRole('heading', { level: 2, name: 'Ask a question' })).toBeVisible();
    await expect(page.getByLabel('Your question')).toBeVisible();

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

  /**
   * P-06 in the browser. The prepared-question buttons exist so a reviewer (and the demo video)
   * asks a wording that demo mode actually has an answer for — the alternative is a person
   * typing a question, getting a refusal, and concluding the feature does not work.
   */
  test('a prepared question is answered from the text, quoted and grounded', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await page.getByRole('button', { name: 'How much do I have to pay?' }).click();
    await expect(page.getByLabel('Your question')).toHaveValue('How much do I have to pay?');
    await expect(page.getByTestId('announcer')).toHaveText(
      'How much do I have to pay? is in the question box. Choose Ask to continue.',
    );

    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    const answer = page.getByTestId('qa-answer');
    await expect(answer).toHaveText('You have to pay 840 pounds. — quoted from the text: “Amount due: £840”');
    // The box is emptied for the next question; the question itself stays on screen with its answer.
    await expect(page.getByLabel('Your question')).toHaveValue('');
    await expect(page.getByTestId('announcer')).toHaveText('Answer: You have to pay 840 pounds.');
    // No flag on a grounded answer: rule 8 cuts both ways.
    await expect(page.getByTestId('answer-flagged')).toHaveCount(0);
  });

  test('a near-miss quote is flagged in the browser and the flag is spoken after the answer', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await page.getByRole('button', { name: 'What is the invoice reference?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    // The letter says "Invoice NC-2026-0441"; the reply quoted "Invoice number NC-2026-0441", so
    // the words are not a literal excerpt and the answer must not read as sourced (rule 8).
    await expect(page.getByTestId('answer-flagged')).toHaveText('— Sightline could not find these words in the text it was given.');
    await expect(page.getByTestId('announcer')).toHaveText(
      'Answer: The invoice reference is NC-2026-0441. Sightline could not match what it quoted to the text it was given.',
    );
    // The answer is still shown: a flag qualifies it, it does not hide it.
    await expect(page.getByTestId('qa-answer')).toContainText('The invoice reference is NC-2026-0441.');
  });

  test('a question the letter does not answer says so, and does not invent a quote', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await page.getByRole('button', { name: 'Does it offer a payment plan?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByTestId('qa-answer')).toContainText('the document does not answer this.');
    await expect(page.getByTestId('answer-flagged')).toHaveCount(0);
    await expect(page.getByTestId('answer-unsourced')).toHaveCount(0);
    // A "not in the document" answer needs no warning spoken twice: the lead sentence already is
    // the qualifier, so the announcer carries the answer alone.
    await expect(page.getByTestId('announcer')).toContainText('Answer: Nothing in the letter offers a payment plan.');
  });

  test('an unprepared question is refused, and the answers already given stay on screen', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await page.getByRole('button', { name: 'How much do I have to pay?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByTestId('qa-entry')).toHaveCount(1);

    await page.getByLabel('Your question').fill('What is my date of birth?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    const summary = page.getByTestId('status-message');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(
      'Demo letters answer the questions written for them. That question has no prepared answer, so there is nothing to show.',
    );
    // A-06: focus lands on the failure summary rather than staying in the field.
    await expect(summary).toBeFocused();
    // Refused, not improvised: no second answer appeared, and the first is still where it was.
    await expect(page.getByTestId('qa-entry')).toHaveCount(1);
    await expect(page.getByTestId('qa-answer')).toContainText('You have to pay 840 pounds.');

    // The next successful answer clears the stale failure box off the page (AGENTS.md §8).
    await page.getByLabel('Your question').fill('Who do I call if I cannot pay by the deadline?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(summary).toHaveCount(0);
    await expect(page.getByTestId('qa-entry')).toHaveCount(2);
  });

  test('every question is a separate call and gets its own receipt block (T-09)', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('trust-record')).toHaveCount(1);

    await page.getByRole('button', { name: 'How much do I have to pay?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByTestId('trust-record')).toHaveCount(2);

    // The receipt names what each block is, so a question cannot rewrite the document's record.
    await expect(page.getByTestId('record-count')).toHaveText(
      'Each answer below comes from a separate call, and each is checked on its own.',
    );
    await expect(page.getByText('Reading the document')).toBeVisible();
    await expect(page.getByText('Answering a question')).toBeVisible();
    // Mode F earns no rung on either block, and neither is presented as verified (rule 5).
    await expect(page.getByTestId('trust-claim')).toHaveText(['Demo data. No real privacy guarantee.', 'Demo data. No real privacy guarantee.']);
  });

  test('the question field works with the keyboard alone', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);

    await tabUntilFocused(page, 'question');
    // A wording the demo letter actually has a prepared answer for; typing any other question
    // here would land on the refusal, which the test above already covers.
    await page.keyboard.type('How much do I have to pay?');
    // Enter inside a form field submits it: no mouse needed to reach the Ask button.
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('qa-answer')).toContainText('You have to pay 840 pounds.');
    await expect(page.getByTestId('announcer')).toContainText('Answer:');
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
    // Two warnings arrive from the corpus; Sightline's own notices are a separate list (P-07).
    await expect(page.getByTestId('model-warnings').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('safety-notices').locator('li')).toHaveCount(3);
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

test.describe("Sightline's own safety notices (P-07)", () => {
  /**
   * The notices are computed from the reading's own fields, so each demo letter must show exactly
   * the cautions its analysis justifies — no more. A notice that fired on the wrong document would
   * be Sightline talking about a letter it had not read, which is the failure the flagged-fact
   * markup exists to prevent, and `tests/unit/safety-notices.test.ts` holds the same rule in code.
   */
  const NOTICES = {
    [DEMO.bill]: [
      'This seems to mention money. Sightline reads every letter the same way, so it cannot tell you whether this one is genuine. Before you pay anything, check the amount with the sender using contact details you already have.',
      'This seems to set a date to act by. A date can be misread, so check it with the sender before you rely on it.',
      'Sightline reads English documents only. It will not guess at words in another language.',
    ],
    [DEMO.statement]: [
      'This seems to mention money. Sightline reads every letter the same way, so it cannot tell you whether this one is genuine. Before you pay anything, check the amount with the sender using contact details you already have.',
      'Sightline reads English documents only. It will not guess at words in another language.',
    ],
    [DEMO.gpLetter]: [
      'This seems to mention a medicine or a dose. Sightline is not a medical professional and does not give medical advice. Check with your doctor, a pharmacist or the surgery before you change anything.',
      'This seems to set a date to act by. A date can be misread, so check it with the sender before you rely on it.',
      'Sightline reads English documents only. It will not guess at words in another language.',
    ],
  } as const;

  for (const [index, expected] of Object.entries(NOTICES)) {
    test(`the notices on demo document ${Number(index) + 1} are exactly the ones its reading justifies`, async ({ page }) => {
      const text = await chooseDemoDocument(page, Number(index));
      await runText(page, text);

      await expect(page.getByTestId('results-heading')).toBeVisible();
      await expect(page.getByTestId('safety-notices').locator('li')).toHaveText(expected);
    });
  }

  test('the notices live inside Warnings, so the fixed section order does not move', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.gpLetter);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    // AGENTS.md §8 fixes the order a reader navigates by. P-07 adds content, not a section, so
    // the heading array a returning user has learned is unchanged.
    expect(await page.locator('main h2').allTextContents()).toEqual(SECTION_ORDER);

    const warnings = page.locator('section[aria-labelledby="warnings-heading"]');
    await expect(warnings.getByTestId('safety-notices')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'What the reading flagged' })).toBeVisible();
  });

  test('our caution and the reading’s own warning stay two separate lists', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.gpLetter);
    await runText(page, text);

    // Two voices, named as such: the model's sentence must not be absorbed into ours, because
    // "the app says check with the surgery" and "the model said check with the surgery" are
    // different claims about who told the person what.
    const model = page.getByTestId('model-warnings').locator('li');
    await expect(model).toHaveText([
      'This letter describes a medicine and a dose. Confirm any change with the surgery.',
      'The letter gives a number to call straight away if things get worse.',
    ]);
    const ours = page.getByTestId('safety-notices');
    await expect(ours).not.toContainText('This letter describes a medicine');
    await expect(ours).not.toContainText('The letter gives a number');
  });

  test('the notices never speak a fake-letter claim, and never a dose', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.gpLetter);
    await runText(page, text);

    const words = (await page.getByTestId('safety-notices').innerText()).toLowerCase();
    // PRD §12: no detection claim. PRD §6 R7: the notice sends the person to a professional.
    expect(words).not.toMatch(/scam|fraud|detect/);
    expect(words).not.toContain('sertraline');
    expect(words).toContain('does not give medical advice');
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

  test('axe finds no serious or critical violation once answers are on the page (extends A-01)', async ({ page }) => {
    // A-01 was green before Q&A existed. The answer list, the form and the per-call receipt blocks
    // are new markup, so the sweep has to include them — a heading-level or label problem here
    // would be invisible to every assertion above.
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    for (const question of ['How much do I have to pay?', 'What is the invoice reference?', 'Does it offer a payment plan?']) {
      await page.getByRole('button', { name: question }).click();
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
    }
    await expect(page.getByTestId('qa-entry')).toHaveCount(3);
    await expect(page.getByTestId('trust-record')).toHaveCount(4);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`),
      'axe on /read with three answers',
    ).toEqual([]);
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

test.describe('Forgetting the document (P-10)', () => {
  /** What the announcer says. Built from what `forgetSession` counted, so it is one sentence here. */
  const FORGOT = 'Forgotten. Sightline has cleared the document and everything it read.';
  const FORGET = { name: 'Forget this document' };

  test('the control is on every route, because a run is stoppable from the screen it started on', async ({ page }) => {
    // The item's own reasoning: the two moments Forget exists for are bailing out of a run that
    // is still going (the user is on the paste view) and clearing a reading already on screen.
    for (const route of ['/', '/read', '/trust', '/settings']) {
      await page.goto(route);
      await expect(page.getByRole('button', FORGET), `Forget on ${route}`).toBeVisible();
    }
  });

  test('pressing Forget clears the screen, says so, and leaves focus on the heading it emptied', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    await page.getByRole('button', FORGET).click();

    await expect(page.getByTestId('announcer')).toHaveText(FORGOT);
    await expect(page.getByTestId('nothing-read')).toBeVisible();
    // §8: the view changed underneath the user, so focus goes to its heading rather than staying
    // on a control they have just pressed and a page that no longer says what it said.
    await expect(page.getByTestId('results-heading')).toBeFocused();
    // The button is not a back arrow. Being told the document is gone while being sent somewhere
    // else is two changes from one press.
    await expect(page).toHaveURL(/\/read$/);
  });

  test('the document’s words are nowhere on the page afterwards', async ({ page }) => {
    // The done-when for this item, asserted where it matters: not in the reducer but in the DOM.
    // The transcript section, the summary, the facts, the answers and the receipt are all gone,
    // so a person checking the page with a find-bar or a braille display finds nothing.
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await page.getByRole('button', { name: 'How much do I have to pay?' }).click();
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByTestId('qa-answer')).toBeVisible();

    await page.getByRole('button', FORGET).click();

    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const phrase of ['840', 'nc-2026-0441', 'care trust', 'amount due', 'invoice']) {
      expect(body, `“${phrase}” survived Forget`).not.toContain(phrase);
    }
  });

  test('Forget from the paste view takes the typed words out of the box as well', async ({ page }) => {
    // The obvious miss: the box is component state, not session state, so clearing the session
    // alone would leave the document sitting in the very field it was typed into.
    await page.goto('/');
    await page.getByLabel('Paste the text of your document').fill('My own rent agreement. Rent is £900 due on the 1st.');
    await page.getByRole('button', FORGET).click();

    await expect(page.getByTestId('announcer')).toHaveText(FORGOT);
    await expect(page.getByLabel('Paste the text of your document')).toHaveValue('');
  });

  test('the receipt goes back to “nothing has been verified”, so the records went too', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('trust-record')).toHaveCount(1);

    await page.getByRole('button', FORGET).click();
    await page.getByRole('link', { name: 'Verification' }).click();

    await expect(page.getByTestId('trust-empty')).toBeVisible();
    await expect(page.getByTestId('trust-record')).toHaveCount(0);
  });

  test('the announcement claims nothing about where the bytes went', async ({ page }) => {
    // Rule 1, checked as a sentence rather than as a review note: the app may say what *this tab*
    // cleared. What may be said about the document's journey comes from `claims.ts` and a
    // `TrustRecord` — and Forget leaves no record behind to compute one from.
    for (const route of ['/', '/read', '/trust', '/settings']) {
      await page.goto(route);
      await page.getByRole('button', FORGET).click();

      const spoken = (await page.getByTestId('announcer').innerText()).toLowerCase();
      expect(spoken, `the Forget sentence on ${route}`).toMatch(/^forgotten\./);
      expect(spoken, `the Forget sentence on ${route}`).not.toMatch(/enclave|encrypt|private|attest|verif|stored|sent|delete|remov|destroy/);
    }
  });

  test('it clears this app’s own storage keys and leaves anyone else’s alone', async ({ page }) => {
    // The seam `tests/unit/forget.test.ts` cannot reach: the unit test proves the prefix rule
    // against a `Storage` double, and this proves `store.forget()` really hands it the browser's
    // own store. The second key is the point — a control that wiped the origin's other data
    // would be a worse bug than one that cleared too little.
    await page.goto('/');
    await page.evaluate(() => {
      window.sessionStorage.setItem('sightline.e2eKey', 'a value nobody else owns');
      window.sessionStorage.setItem('other-tab.e2eKey', 'must survive');
    });

    await page.getByRole('button', FORGET).click();
    await expect(page.getByTestId('announcer')).toHaveText(FORGOT);

    const kept = await page.evaluate(() => ({
      ours: window.sessionStorage.getItem('sightline.e2eKey'),
      foreign: window.sessionStorage.getItem('other-tab.e2eKey'),
    }));
    expect(kept.ours).toBeNull();
    expect(kept.foreign).toBe('must survive');
  });

  test('the nav control meets the same 44px minimum as the flow buttons', async ({ page }) => {
    await page.goto('/');
    const box = await page.getByRole('button', FORGET).boundingBox();
    // `boundingBox()` is null when the element is not in the layout, so it is checked rather than
    // asserted away: a missing box is this test failing, not a pass.
    if (box === null) throw new Error('the Forget control is not laid out, so its size cannot be measured');
    expect(box.height, 'AGENTS.md §8: no touch target under 44px').toBeGreaterThanOrEqual(44);
  });
});

test.describe('Reading the answer aloud (P-09)', () => {
  /**
   * The device's own speech engine is replaced with a recorder before any app script runs, because
   * every claim in this group is about a **call the app makes**: was anything spoken without a
   * press, at what rate, and did a second press — or Forget — stop it. A headless browser has no
   * voice to listen to, and hearing it would prove nothing a check cannot do; whether the speech is
   * *usable* on a real device is A-03/A-04's job and remains blocked on B-01.
   *
   * `sightline.settings` is spelled out here rather than imported: Playwright does not resolve the
   * `@/` alias (see the top of this file). A duplicated key name is a much smaller drift risk than
   * the duplicated corpus was, and `tests/unit/speech.test.ts` pins the same constant.
   */
  const READ = { name: 'Read the answer aloud' };
  const STOP = { name: 'Stop reading' };

  interface SpokenUtterance {
    text: string;
    rate: number;
  }

  interface SpeechState {
    spoken: SpokenUtterance[];
    cancels: number;
  }

  function install(): void {
    const speech = {
      spoken: [] as SpokenUtterance[],
      cancels: 0,
      pending: [] as { onend?: (() => void) | null }[],
      finishLast() {
        const last = speech.pending.pop();
        if (last?.onend) last.onend();
      },
    };
    function Utterance(this: { text: string; rate: number; onend: (() => void) | null }, text: string) {
      this.text = text;
      this.rate = 1;
      this.onend = null;
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, writable: true, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      configurable: true,
      value: {
        speak(utterance: { text: string; rate: number; onend?: (() => void) | null }) {
          speech.spoken.push({ text: utterance.text, rate: utterance.rate });
          speech.pending.push(utterance);
        },
        cancel() {
          speech.cancels += 1;
          speech.pending = [];
        },
        getVoices() {
          return [];
        },
      },
    });
    (window as unknown as { __speech: typeof speech }).__speech = speech;
  }

  function readState(): SpeechState {
    const speech = (window as unknown as { __speech: SpeechState }).__speech;
    return { spoken: speech.spoken, cancels: speech.cancels };
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(install);
  });

  /** Run a demo document through the real flow and wait for the results screen. */
  async function readABill(page: Page) {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();
  }

  const spoken = (page: Page) => page.evaluate(readState);

  async function endTheReading(page: Page) {
    await page.evaluate(() => {
      (window as unknown as { __speech: { finishLast(): void } }).__speech.finishLast();
    });
  }

  async function storeTheRate(page: Page, value: string) {
    // The key is a literal here on purpose: `page.evaluate` sends the *function* to the browser, so
    // a variable from this file's scope would arrive undefined.
    await page.evaluate((stored) => window.localStorage.setItem('sightline.settings', stored), value);
  }

  test('nothing is read until the button is pressed', async ({ page }) => {
    // The done-when for this item, in its first half: no auto-play, and off by default. The run,
    // the navigation to /read and the focus move all happen without one utterance reaching the
    // engine, and a second route change does not start one either.
    await readABill(page);
    await expect(page.getByTestId('announcer')).not.toHaveText('');
    expect(await spoken(page)).toEqual({ spoken: [], cancels: 0 });

    await page.getByRole('link', { name: 'Verification' }).click();
    await expect(page).toHaveURL(/\/trust$/);
    expect((await spoken(page)).spoken).toEqual([]);
  });

  test('one press reads the summary the screen shows, with Sightline’s cautions, in pieces the engine will finish', async ({ page }) => {
    await readABill(page);
    await page.getByRole('button', READ).click();

    const said = (await spoken(page)).spoken.map((utterance) => utterance.text).join(' ');
    expect(said).toContain('Summary. A care trust invoice for 840 pounds, issued 2 February 2026');
    expect(said).toContain('Sightline’s cautions.');
    expect(said).toContain('Before you pay anything, check the amount with the sender');
    expect(said).toContain('Sightline reads English documents only.');
    // Chunking (the engine stops part-way through a long single utterance in some browsers): no
    // piece the app hands over is longer than the cap, and the summary did not arrive as one blob.
    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.text.length).toBeLessThanOrEqual(200);

    await expect(page.getByRole('button', STOP)).toHaveAccessibleName(STOP.name);
    await expect(page.getByRole('button', STOP)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the reading is the screen’s own sentences: not the model’s warnings, not the receipt', async ({ page }) => {
    await readABill(page);
    await page.getByRole('button', READ).click();
    const said = (await spoken(page)).spoken.map((utterance) => utterance.text).join(' ');
    // Nothing about where the bytes went — that claim belongs to `claims.ts`, computed from a
    // TrustRecord, and the spoken text is not allowed to paraphrase it (AGENTS.md §4 rule 1).
    expect(said).not.toMatch(/enclave|encrypt|attest|verif|private|stored|sent/i);
    // The trust receipt is on the screen; it is not folded into the answer being read.
    expect(said).not.toContain('Verification');
  });

  test('a second press stops the reading and the label says so', async ({ page }) => {
    await readABill(page);
    const button = page.getByRole('button', READ);
    await button.click();
    expect((await spoken(page)).cancels).toBe(0);

    await page.getByRole('button', STOP).click();
    expect((await spoken(page)).cancels).toBe(1);
    await expect(page.getByRole('button', READ)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the button goes back on its own when the engine finishes', async ({ page }) => {
    // Without this the control would sit claiming to be a Stop button after the voice had already
    // stopped — a toggle that lies about its own state, on the one screen this feature exists for.
    await readABill(page);
    await page.getByRole('button', READ).click();
    await expect(page.getByRole('button', STOP)).toBeVisible();
    await endTheReading(page);
    await expect(page.getByRole('button', READ)).toBeVisible();
    await expect(page.getByRole('button', READ)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the rate comes from Settings, read when the button is pressed', async ({ page }) => {
    await readABill(page);
    await storeTheRate(page, '{"speechRate":1.8}');
    await page.getByRole('button', READ).click();
    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.rate).toBe(1.8);
  });

  test('an unreadable stored rate falls back to normal speed rather than failing', async ({ page }) => {
    await readABill(page);
    await storeTheRate(page, 'not json at all');
    await page.getByRole('button', READ).click();
    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.rate).toBe(1);

    await storeTheRate(page, '{"speechRate":9}');
    await page.getByRole('button', STOP).click();
    await page.getByRole('button', READ).click();
    for (const piece of (await spoken(page)).spoken) expect(piece.rate).toBe(1);
  });

  test('Forget stops the reading (P-10 hands this rule to the speech feature)', async ({ page }) => {
    // The second half of this item’s done-when, and the half P-10 wired: `useForget` calls
    // `stopSpeaking()` before it says anything about what it cleared.
    await readABill(page);
    await page.getByRole('button', READ).click();
    expect((await spoken(page)).spoken.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Forget this document' }).click();
    await expect(page.getByTestId('nothing-read')).toBeVisible();
    // At least one `cancel()` — `useForget` stops the voice, and the control's own unmount cleanup
    // runs when the answer it was reading disappears. Counting them exactly would be testing React's
    // development double-mount, not a promise made to a user.
    expect((await spoken(page)).cancels).toBeGreaterThanOrEqual(1);
  });

  test('there is no control where there is no answer to read', async ({ page }) => {
    await page.goto('/read');
    await expect(page.getByTestId('nothing-read')).toBeVisible();
    await expect(page.getByRole('button', READ)).toHaveCount(0);

    await readABill(page);
    await page.getByRole('button', { name: 'Forget this document' }).click();
    await expect(page.getByRole('button', READ)).toHaveCount(0);
  });

  test('a browser with no speech engine gets no button rather than a button that says nothing', async ({ page }) => {
    // Installed after the recorder, so it wins: this is the shape of a browser where
    // `speechSynthesis` exists but carries no engine.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, writable: true, configurable: true });
    });
    await readABill(page);
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible();
    await expect(page.getByRole('button', READ)).toHaveCount(0);
    // The rest of the screen is unaffected, and nothing was spoken into a missing engine.
    expect((await spoken(page)).spoken).toEqual([]);
  });

  test('the control is inside the fixed section order, above it', async ({ page }) => {
    // §8 fixes the order of the *sections*; the read-aloud control is an action on the screen and
    // must not become an eighth heading or push the receipt anywhere.
    await readABill(page);
    expect(await page.locator('main h2').allTextContents()).toEqual(SECTION_ORDER);
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('main > *')].map((el) => el.tagName.toLowerCase() + ':' + (el.getAttribute('aria-labelledby') ?? el.textContent ?? '').trim().slice(0, 24)),
    );
    const speakIndex = order.findIndex((entry) => entry.includes('Read the answer aloud'));
    const summaryIndex = order.findIndex((entry) => entry.includes('summary-heading'));
    expect(speakIndex).toBeGreaterThanOrEqual(0);
    expect(speakIndex).toBeLessThan(summaryIndex);
  });
});
