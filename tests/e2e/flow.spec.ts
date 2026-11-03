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

/** The demo buttons are rendered in corpus order: 1 = bill, 2 = bank statement, 3 = GP letter, 4 = the one whose answer cannot be read. */
const DEMO = { bill: 0, statement: 1, gpLetter: 2, unreadable: 3 } as const;

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

/* ---------------------------------------------------------------------------------------------
 * Shared speech recorder (P-09, reused by A-15's rate test).
 *
 * The device's own speech engine is replaced with a recorder before any app script runs, because
 * every claim in both groups is about a **call the app makes**: was anything spoken without a
 * press, at what rate, and did a second press — or Forget — stop it. A headless browser has no
 * voice to listen to, and hearing it would prove nothing a check cannot do; whether the speech is
 * *usable* on a real device is A-03/A-04's job and remains blocked on B-01.
 *
 * A-15 needs the same recorder for a different reason: the whole point of its rate control is that
 * the next reading honours it, so the proof is the rate on the utterance, seen from Settings.
 * ------------------------------------------------------------------------------------------- */

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

function installSpeechRecorder(): void {
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

function readSpeechState(): SpeechState {
  const speech = (window as unknown as { __speech: SpeechState }).__speech;
  return { spoken: speech.spoken, cancels: speech.cancels };
}

const spoken = (page: Page) => page.evaluate(readSpeechState);

async function endTheReading(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __speech: { finishLast(): void } }).__speech.finishLast();
  });
}

/** Run a demo document through the real flow and wait for the results screen. */
async function readABill(page: Page) {
  const text = await chooseDemoDocument(page, DEMO.bill);
  await runText(page, text);
  await expect(page.getByTestId('results-heading')).toBeVisible();
}

/**
 * Put a blob in the app's own settings slot, exactly as a hand-edited store or an older build
 * would. The key is a literal here on purpose: `page.evaluate` sends the *function* to the browser,
 * so a variable from this file's scope would arrive undefined. `tests/unit/settings-writer.test.ts`
 * pins the same constant, and Playwright does not resolve the `@/` alias (see the top of this file).
 */
async function storeSettingsRaw(page: Page, value: string) {
  await page.evaluate((stored) => window.localStorage.setItem('sightline.settings', stored), value);
}

/** What the app's own controls wrote, read back from the browser. */
async function storedSettings(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('sightline.settings'));
}

/** The theme attribute the way `globals.css` and `applyHighContrast` see it. */
async function contrastAttribute(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => document.documentElement.getAttribute('data-high-contrast'));
}

/**
 * The same look, retried. The theme is written by an effect after a control is used, so a single
 * immediate read could report the frame before it — a test that passes by timing rather than by
 * proof. `A-15`'s reload case genuinely does start unthemed (see `HighContrastTheme`), which is
 * exactly the kind of state a one-shot read would flake on.
 */
const seenContrast = (page: Page) => expect.poll(() => contrastAttribute(page));

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

/**
 * The transcript-only screen, in a browser, with no key (item **P-11**).
 *
 * P-08 built this state and could only prove it in a reducer, because every fixture reply was
 * authored JSON: Mode F had nothing to make unreadable. The fourth demo document now replies in prose
 * on both attempts, so the one repair retry, `run_degraded` and `ResultsView`'s no-reading branch all
 * run for real here — which is the whole point: the screen a person meets when the service fails them
 * is the screen that must not be untested.
 *
 * The literals below (`UNREADABLE_REPLY_PHRASES`, the letter's own reference) are written out rather
 * than imported because Playwright does not resolve the `@/` alias — see the top of this file. The
 * corpus itself, and the fact that this reply is genuinely not the JSON that was asked for, is pinned
 * by `tests/unit/fixtures.test.ts`.
 */
test.describe('the transcript-only screen (P-11)', () => {
  const UNREADABLE_REPLY_PHRASES = ['I cannot put that into the format', 'my advice would be'];

  /** Demo document 4, run to the end of the flow: the retry, then §13's fallback. */
  async function readTheLetterThatFails(page: Page) {
    const text = await chooseDemoDocument(page, DEMO.unreadable);
    await runText(page, text);
    await expect(page.getByTestId('degraded-notice')).toBeVisible();
    return text;
  }

  test.beforeEach(async ({ page }) => {
    // The recorder is installed for the no-control test below, which has to prove the engine heard
    // nothing on the screen where there is no answer to speak.
    await page.addInitScript(installSpeechRecorder);
  });

  test('a demo letter whose answer cannot be read reaches the transcript-only screen', async ({ page }) => {
    await readTheLetterThatFails(page);

    await expect(page.getByTestId('results-heading')).toHaveText('What Sightline read');
    await expect(page.getByRole('heading', { level: 2, name: 'No summary' })).toBeVisible();
    // The catalogue's own sentence, not a screen-written paraphrase — the announcer says the same
    // words, and two phrasings for one failure would be two things to keep in step.
    await expect(page.getByTestId('degraded-notice')).toContainText('The service returned something Sightline could not read. Try again.');
    await expect(page.getByTestId('degraded-notice')).toContainText('there is nothing to summarise yet');
    await expect(page.getByTestId('degraded-notice')).toContainText('You can try again.');
    await expect(page).toHaveURL(/\/read$/);
  });

  test('the sections that need a reading are absent, not empty', async ({ page }) => {
    await readTheLetterThatFails(page);

    // An empty "Key facts" heading would read as "this letter contains no facts" — a claim about the
    // document, drawn from a reading that did not happen (AGENTS.md §4 rule 10).
    expect(await page.locator('main h2').allTextContents()).toEqual(['No summary', 'Full text', 'Ask a question', 'Verification']);
    for (const id of ['summary-heading', 'facts-heading', 'actions-heading', 'warnings-heading']) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: 'Skip to full text' })).toHaveCount(0);
    await expect(page.getByTestId('ungrounded-count')).toHaveCount(0);
  });

  test('the words the person gave are still there, which is what makes the screen worth landing on', async ({ page }) => {
    const text = await readTheLetterThatFails(page);

    const fullText = page.locator('.transcript');
    await expect(fullText).toHaveText(text);
    await expect(fullText).toContainText('BP-2026-0188');
  });

  test('the reply that could not be read is nowhere on the screen', async ({ page }) => {
    await readTheLetterThatFails(page);

    // The service did answer — in prose, naming the letter's subject in words the letter never uses.
    // None of it may reach the page (P-08's rule for a refusal extends here): what is shown is the
    // transcript and Sightline's own sentences, and a paragraph of the model's unparsed prose would
    // be an ungrounded reading wearing the clothes of a failure notice.
    const body = await page.locator('main').innerText();
    for (const phrase of UNREADABLE_REPLY_PHRASES) {
      expect(body.toLowerCase(), `the screen leaked part of the unreadable reply: "${phrase}"`).not.toContain(phrase.toLowerCase());
    }
    expect(body).not.toContain('Sorry');
  });

  test('Sightline’s own limit is said on the screen with no reading (P-07’s debt)', async ({ page }) => {
    await readTheLetterThatFails(page);

    // Exactly one, and the one about Sightline. The content cautions stay off: they fire on fields of
    // a reading, and this run has none to fire on.
    await expect(page.getByTestId('safety-notices').locator('li')).toHaveText([
      'Sightline reads English documents only. It will not guess at words in another language.',
    ]);
  });

  test('there is no read-aloud control here, and the engine hears nothing', async ({ page }) => {
    await readTheLetterThatFails(page);

    // The decision P-11 was asked to make with this screen rendered: P-09 speaks the summary and our
    // cautions, and the only one of those here is the English-only line the page already shows two
    // lines above the button would sit. The rest of the screen is the full text, which P-09 rules out
    // on every screen because reading it is the person's own reader's job.
    await expect(page.getByRole('button', READ)).toHaveCount(0);
    expect((await spoken(page)).spoken).toEqual([]);
  });

  test('the receipt shows both attempts and still calls them demo data', async ({ page }) => {
    await readTheLetterThatFails(page);

    // Two, not one: the retry is a real second call, and a receipt that described only the last one
    // would understate what was sent. Both name the fixture (T-09).
    await expect(page.getByTestId('trust-record')).toHaveCount(2);
    await expect(page.getByTestId('trust-claim').first()).not.toContainText('verified');
  });

  test('the failure is announced and focus lands on the heading, not on a silent screen', async ({ page }) => {
    await readTheLetterThatFails(page);

    // §8 forbids the silent version of this transition, and the sentence must not claim a reading.
    await expect(page.getByTestId('announcer')).toHaveText(
      'The service returned something Sightline could not read. Try again. Showing the text you gave instead.',
    );
    await expect(page.getByTestId('results-heading')).toBeFocused();
  });

  test('a question asked here is refused by name, and no answer is written', async ({ page }) => {
    await readTheLetterThatFails(page);

    // The transcript-only screen keeps the question box because in a live mode it works: the answers
    // come from the text. Mode F has no prepared wording for this letter, so it says so rather than
    // inventing one — the same rule that keeps a demo answer off a pasted letter (P-06).
    await page.getByLabel('Your question').fill('When do I need to renew?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();

    await expect(page.getByTestId('status-message')).toBeVisible();
    await expect(page.getByTestId('status-message')).toContainText('no prepared answer');
    await expect(page.getByTestId('qa-entry')).toHaveCount(0);
    // A-06: focus lands on the failure summary, on this screen as on the one that worked.
    await expect(page.getByTestId('status-message')).toBeFocused();
  });

  test('Forget clears the degraded state too, so nothing survives on the way out', async ({ page }) => {
    await readTheLetterThatFails(page);
    await page.getByRole('button', { name: 'Forget this document' }).first().click();

    await expect(page.getByTestId('nothing-read')).toBeVisible();
    await expect(page.getByTestId('degraded-notice')).toHaveCount(0);
    await expect(page.locator('.transcript')).toHaveCount(0);
    await expect(page.getByTestId('trust-record')).toHaveCount(0);
  });

  test('axe finds nothing serious or critical on the screen a person meets when the service fails', async ({ page }) => {
    await readTheLetterThatFails(page);

    // A-01 was green on the screens that work. This markup only exists on the one that does not, so
    // it has never been swept — heading levels and the list of cautions are new here.
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(
      blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`),
      'axe on the transcript-only screen',
    ).toEqual([]);

    const heights = await page.locator('main button').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(heights.filter((h) => h < 44), 'AGENTS.md §8: no touch target under 44px').toEqual([]);
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

test.describe('the request that was still going (P-12)', () => {
  const FORGET = { name: 'Forget this document' };

  /**
   * P-10 proved `abort → revoke → clear` at the seam; this item asks for the browser, and the
   * obstacle is scheduling rather than code. `src/lib/fixtures/replay.ts:158`'s `post` is `async`
   * with a resolved value behind it and nothing else, so a Mode F run is a chain of **microtasks** —
   * and the microtask queue drains before the next task, so a second real click can never land
   * while a completion is owed. Live modes refuse at the door (F-04/F-05, **B-05**), so they have no
   * in-flight request either.
   *
   * The construction below reaches the state honestly: both presses are dispatched from inside
   * **one** `page.evaluate`, so when Forget's handler runs, the run's continuation is still queued
   * and its controller is still registered. That is exactly the state a person's two hands produce
   * in a mode that talks to a service. No latency was invented to get it — nothing in `src/` is
   * timed, paced or aware it is being raced, and `useForget`'s counted sentence is what proves the
   * controller really was still registered when the press landed.
   */
  async function pressBothInOneTask(page: Page, firstButton: string): Promise<void> {
    await page.evaluate((label) => {
      const buttons = [...document.querySelectorAll('button')];
      const find = (text: string) => buttons.find((b) => b.textContent?.trim() === text);
      const first = find(label);
      const forget = find('Forget this document');
      if (!first || !forget) throw new Error(`both ${label} and Forget must be buttons on this screen`);
      first.click();
      forget.click();
    }, firstButton);
  }

  test('Forget counts the run it stopped, because the completion was genuinely owed', async ({ page }) => {
    // The branch at `useForget.ts:33` has never executed in a browser before this test: every
    // earlier Forget found nothing in flight, so the sentence about stopped requests was unreachable.
    await chooseDemoDocument(page, DEMO.bill);
    await pressBothInOneTask(page, 'Read this text');

    await expect(page.getByTestId('announcer')).toHaveText(
      'Forgotten. Sightline has cleared the document and everything it read. Stopped the request that was still going.',
    );
  });

  test('a run that was forgotten writes nothing back, at any point in its chain', async ({ page }) => {
    // The guard P-10 left at the *end* of the hook is not enough on its own: the pipeline reports
    // through callbacks while it works, so a late trust record or a late reading would land in the
    // fresh session the person just emptied.
    const text = await chooseDemoDocument(page, DEMO.bill);
    // The letter is really in the box before the press, so the empty box below is a change rather
    // than the shape the screen had all along.
    expect(text).toContain('840');
    await pressBothInOneTask(page, 'Read this text');

    // The abandoned run does not move the person and does not refill the box it was started from.
    await expect(page.getByRole('heading', { name: 'Add a document' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByLabel('Paste the text of your document')).toHaveValue('');
    // Phrases from the letter itself, not 'care trust' — the demo picker's own button labels say
    // that, and a check that trips on the screen's furniture proves nothing.
    for (const phrase of ['840', 'nc-2026-0441', 'amount due']) {
      expect((await page.locator('body').innerText()).toLowerCase(), `“${phrase}” survived a Forget pressed mid-run`)
        .not.toContain(phrase);
    }

    // …and what arrives after the press has nowhere to show itself either: the reading it would
    // have written, and the record naming a document that no longer exists.
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByTestId('nothing-read')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('A care trust invoice for 840 pounds');
    await page.getByRole('link', { name: 'Verification' }).click();
    await expect(page.getByTestId('trust-empty')).toBeVisible();
    await expect(page.getByTestId('trust-record')).toHaveCount(0);
  });

  test('the same press during a question leaves no answer on the page', async ({ page }) => {
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    await page.getByLabel('Your question').fill('How much do I have to pay?');
    await pressBothInOneTask(page, 'Ask');

    await expect(page.getByTestId('announcer')).toContainText('Stopped the request that was still going.');
    await expect(page.getByTestId('qa-entry')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('840 pounds');
  });

  test('a Mode F run issues no request at all, so “cancelled” here means the app’s own controller', async ({ page }) => {
    // Kept honest about scope: what Forget cancels in this mode is the run's registration, not a
    // socket. Nothing was on the wire to cancel — asserted rather than stated, because the sentence
    // a person hears says a request was stopped.
    const outgoing: string[] = [];
    page.on('request', (request) => outgoing.push(request.url()));

    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();

    expect(outgoing.filter((url) => /\/api\/|cloud-api\.near\.ai|cloud\.near\.ai/.test(url))).toEqual([]);
  });
});

test.describe('Reading the answer aloud (P-09)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installSpeechRecorder);
  });

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
    await storeSettingsRaw(page, '{"speechRate":1.8}');
    await page.getByRole('button', READ).click();
    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.rate).toBe(1.8);
  });

  test('an unreadable stored rate falls back to normal speed rather than failing', async ({ page }) => {
    await readABill(page);
    await storeSettingsRaw(page, 'not json at all');
    await page.getByRole('button', READ).click();
    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.rate).toBe(1);

    await storeSettingsRaw(page, '{"speechRate":9}');
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

test.describe('Settings a person can change (A-15)', () => {
  /**
   * Two controls, proved where they actually work: in a browser, against real `localStorage`, and
   * with the speech engine replaced by a recorder so a rate claim can be read off the utterance
   * rather than listened for. The Node side (`tests/unit/settings-writer.test.ts`) covers the
   * writer's rules; this group covers the four things a unit test cannot see — that the page and
   * the storage agree, that the theme reaches `globals.css`, that the next reading honours the
   * speed, and that a screen reader is told about the colour change and not told twice about the
   * one it just announced itself.
   *
   * The mode switcher and the API key field are absent by decision, not by omission, and one test
   * below asserts their absence: a settings page that offers a mode the deployment cannot honour
   * would be offering a privacy claim nobody computed (AGENTS.md §4 rule 1).
   */
  const SPEEDS = ['Slow', 'Normal', 'Fast', 'Very fast'] as const;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installSpeechRecorder);
  });

  const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
  const contrastBox = (page: Page) => page.getByRole('checkbox', { name: 'High contrast' });

  /**
   * The speeds a reader would find selected, retried until it settles. The retry is not decoration:
   * this page is server-rendered from the defaults and only reads the store after hydration, so a
   * single immediate look can land between the two and report a speed nobody chose. `expect.poll`
   * waits for the app to agree with its own storage, which is the assertion worth making.
   */
  const speedNames = (page: Page) =>
    expect.poll(async () => {
      const names: string[] = [];
      for (const name of SPEEDS) {
        if (await radio(page, name).isChecked()) names.push(name);
      }
      return names;
    });

  test('the page holds the two controls, the mode readout, and no field a key could go into', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    for (const name of SPEEDS) await expect(radio(page, name)).toBeVisible();
    await expect(contrastBox(page)).toBeVisible();

    // The mode is reported, never chosen here.
    await expect(page.getByText('Running mode:')).toBeVisible();
    expect(await page.locator('main h2').allTextContents()).toEqual(['Reading aloud', 'Screen', 'Build state']);
    await expect(page.getByRole('radio', { name: /relay|fixtures|direct/i })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);

    // T-13 owns the key field, and nothing is built that would use one. A credential box on this
    // page would be a risk with no function, so its absence is asserted rather than assumed.
    await expect(page.locator('input[type="password"], input[type="text"], textarea')).toHaveCount(0);
    await expect(page.getByLabel(/key|token|secret/i)).toHaveCount(0);
  });

  test('nothing is chosen and nothing is themed before anyone asks', async ({ page }) => {
    // The default state, which is also the state after a Forget: the app must not pick a theme or a
    // speed nobody selected, and the controls must show the truth rather than a placeholder.
    await page.goto('/settings');
    await speedNames(page).toEqual(['Normal']);
    await expect(contrastBox(page)).not.toBeChecked();
    await seenContrast(page).toBeNull();
    expect(await storedSettings(page)).toBeNull();
  });

  test('choosing a speed writes the setting at once, names it on screen, and is not announced twice', async ({ page }) => {
    await page.goto('/settings');
    await radio(page, 'Fast').click();

    expect(await storedSettings(page)).toBe('{"speechRate":1.5,"highContrast":false}');
    await speedNames(page).toEqual(['Fast']);
    await expect(page.getByText('Current speed: Fast', { exact: false })).toBeVisible();
    // There is nothing pending, so there is nothing to save.
    await expect(page.getByRole('button', { name: /save|apply/i })).toHaveCount(0);
    // The screen reader already says "Fast, radio button, selected" from the real `<label>`; a
    // second sentence through the announcer would be the double speech P-09 refuses.
    await expect(page.getByTestId('announcer')).toHaveText('');
  });

  test('the speed chosen here is the speed the next reading uses, with no reload', async ({ page }) => {
    // A-15's whole purpose, and the half of P-09 that could only be proved once a writer existed:
    // the rate is read at press time from the same blob these controls write. Navigating away and
    // back is client-side, so the document is still in memory and the button is still there.
    await readABill(page);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await radio(page, 'Fast').click();
    expect(await storedSettings(page)).toContain('"speechRate":1.5');

    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await page.getByRole('button', READ).click();

    const pieces = (await spoken(page)).spoken;
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.rate).toBe(1.5);
  });

  test('the arrow keys change the speed, because it is a radio group and not a styled list', async ({ page }) => {
    await page.goto('/settings');
    await radio(page, 'Normal').focus();
    await page.keyboard.press('ArrowRight');

    await speedNames(page).toEqual(['Fast']);
    expect(await storedSettings(page)).toContain('"speechRate":1.5');
  });

  test('a stored speed the app does not offer is named by its number, with nothing selected', async ({ page }) => {
    // Reachable because the blob is writable by anything on the origin, and P-09's own tests write
    // 1.8. The honest page shows no false selection and says the number it will actually speak.
    //
    // `/` first: `localStorage` belongs to an origin, and a page that has not been there yet —
    // `about:blank` — refuses to read or write it. Then a fresh load, because a write made from
    // outside the app fires no `storage` event in this tab, so nothing would tell the page to look.
    await page.goto('/');
    await storeSettingsRaw(page, '{"speechRate":1.8,"highContrast":false}');
    await page.goto('/settings');

    await speedNames(page).toEqual([]);
    await expect(page.getByText('Current speed: 1.8 times normal speed', { exact: false })).toBeVisible();

    await storeSettingsRaw(page, '{"speechRate":1.8}');
    await page.goto('/settings');
    await expect(page.getByText('1.8 times normal speed', { exact: false })).toBeVisible();
    await expect(contrastBox(page)).not.toBeChecked();
  });

  test('high contrast themes the whole app, says so, and comes back after a reload', async ({ page }) => {
    await page.goto('/settings');
    await contrastBox(page).check();

    await seenContrast(page).toBe('true');
    expect(await storedSettings(page)).toBe('{"speechRate":1,"highContrast":true}');
    await expect(page.getByTestId('announcer')).toHaveText('High contrast is on.');
    // The theme is the CSS that exists for it, not a class the test only looked at.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');

    // Another route, still without a page load: the applier lives in the layout, not this page.
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await seenContrast(page).toBe('true');

    // A real reload, which discards the session and re-reads the store. This is the one-frame limit
    // `HighContrastTheme` documents, measured rather than asserted away: the server render carries
    // no theme, the first effect removes the attribute it did not set, the client read then puts it
    // back. Polling is the honest check — it proves the state settles, and a single look would only
    // prove that the test happened to be late.
    await page.reload();
    await seenContrast(page).toBe('true');
    await expect(contrastBox(page)).toBeChecked();
  });

  test('turning high contrast off takes the attribute away rather than writing “false”', async ({ page }) => {
    await page.goto('/settings');
    await contrastBox(page).check();
    await seenContrast(page).toBe('true');

    await contrastBox(page).uncheck();
    await seenContrast(page).toBeNull();
    expect(await storedSettings(page)).toBe('{"speechRate":1,"highContrast":false}');
    await expect(page.getByTestId('announcer')).toHaveText('High contrast is off.');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgb(0, 0, 0)');
  });

  test('changing the speed leaves the theme alone, and the other way round', async ({ page }) => {
    // The merge rule, seen through the UI: each control writes its own field and the writer reads
    // the blob first. The bug this is watching for is a rate control that switches someone's
    // contrast theme off every time they slow the voice down.
    await page.goto('/settings');
    await contrastBox(page).check();
    await radio(page, 'Slow').click();

    expect(await storedSettings(page)).toBe('{"speechRate":0.75,"highContrast":true}');
    await seenContrast(page).toBe('true');

    await contrastBox(page).uncheck();
    expect(await storedSettings(page)).toBe('{"speechRate":0.75,"highContrast":false}');
    await speedNames(page).toEqual(['Slow']);
  });

  test('Forgetting the document leaves the settings where they are', async ({ page }) => {
    // P-10's rule from the other side: Forget clears what the app holds *about a document*. A
    // reading speed and a theme are not somebody's invoice, so they must survive the press — and
    // the theme must not flicker off because the storage it reads was wiped.
    await page.goto('/settings');
    await radio(page, 'Fast').click();
    await contrastBox(page).check();

    await page.getByRole('link', { name: 'Document' }).click();
    const text = await chooseDemoDocument(page, DEMO.bill);
    await runText(page, text);
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await page.getByRole('button', { name: 'Forget this document' }).click();
    await expect(page.getByTestId('nothing-read')).toBeVisible();

    expect(await storedSettings(page)).toBe('{"speechRate":1.5,"highContrast":true}');
    await seenContrast(page).toBe('true');
  });

  test('the settings controls meet the 44px minimum and axe finds nothing among them, themed or not', async ({ page }) => {
    // The rows, not the 20px native controls inside them: the label is the target (AGENTS.md §8).
    await page.goto('/settings');
    const tooSmall: string[] = [];
    for (const label of await page.locator('.setting-options label, .setting-row label').all()) {
      const box = await label.evaluate((el) => Math.round(el.getBoundingClientRect().height));
      const text = (await label.textContent())?.trim() ?? '';
      if (box < 44) tooSmall.push(`"${text}" is ${box}px tall`);
    }
    expect(tooSmall, 'AGENTS.md §8: no touch target under 44px').toEqual([]);

    for (const theme of ['default', 'high contrast'] as const) {
      if (theme === 'high contrast') await contrastBox(page).check();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, `axe with the ${theme} theme`).toEqual([]);
    }
  });
});
