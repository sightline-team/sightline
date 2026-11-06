import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * **C-02** — the photograph screen, in a real browser.
 *
 * The run itself is proved as a pure function in `tests/unit/read-pages.test.ts`; what only a browser
 * can show is the screen in front of it: that a chosen file really becomes a page of the session, that
 * the refusal of a sixth page happens *before* the bytes are decoded, that a preview URL the screen made
 * is a URL the app can no longer read after Forget, and that pressing the primary control reaches the
 * page loop rather than dying on the way.
 *
 * Fixture mode is what `playwright.config.mts` starts, with no key and no relay, so every test below runs
 * against the same deployment a reviewer gets. **No test here claims a photographed document was read**:
 * every image these tests draw is the person's own, and demo mode answers only for the three photographs it
 * ships (**S-11**, **C-13**), so a run started from here stops at the first page — that stop is what the last
 * test asserts, and `tests/e2e/photo-fixtures.spec.ts` is where the shipped files are read all the way.
 *
 * The images are drawn on a `<canvas>` in the page and handed back as bytes: they are synthetic
 * rectangles, not documents (AGENTS.md §5, "never do" real documents and photos).
 */

const PICKER = 'Add photographs';
const MAX_PAGES = 5;

/** A JPEG of the given size, made in the browser so the test needs no image files on disk. */
async function jpegBytes(page: Page, width: number, height: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.font = `${Math.max(10, Math.round(height / 10))}px sans-serif`;
    ctx.fillText(`Synthetic page ${width} by ${height}`, Math.round(width / 20), Math.round(height / 2));
    return canvas.toDataURL('image/jpeg', 0.85);
  }, { width, height });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/** A file payload of the given size, named so a test can tell which choice it was. */
async function photo(page: Page, name: string, width = 300, height = 400) {
  return { name, mimeType: 'image/jpeg', buffer: await jpegBytes(page, width, height) };
}

/** `true` if the browser can still read that object URL. Revoked URLs reject, which is the whole point. */
async function blobIsReadable(page: Page, url: string): Promise<boolean> {
  return page.evaluate(
    (u) =>
      new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = u;
      }),
    url,
  );
}

async function addPhotographs(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByLabel(PICKER).setInputFiles(files);
}

function pageRows(page: Page) {
  return page.getByTestId('page-list').locator('li');
}

/** The house filter (`tests/e2e/flow.spec.ts`): serious and critical block, moderate does not. */
function blocking(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`);
}

/**
 * Wait until no colour fade is in flight, so an axe run measures a state rather than a frame of a
 * transition (**A-19**).
 *
 * axe reads `getComputedStyle` the instant it is called. Adding a photograph enables the primary
 * control, and A-17's hover/press layer has `background-color` and `color` on a 120 ms transition,
 * so the button spends that window crossing white/`#4A4A5A` → `#0B5CAD`/white through frames like
 * `rgb(83,140,197)` under `rgb(202,202,205)` — about 1.9:1. Measuring there reports a contrast
 * violation the app does not have: **AGENTS.md §8** asks for 4.5:1 in the states a person reads, and
 * a fade is not a state. Waiting for the fade instead of sleeping a fixed number of milliseconds
 * keeps the check deterministic under load, which is when it was failing.
 *
 * Transitions only, deliberately: an infinite looping animation reports `running` for the whole life
 * of the page, so filtering on it would hang the suite. `CSSTransition` is what a colour fade is.
 */
async function nothingIsFading(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState === 'finished'),
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('adding photographs to a session (C-02)', () => {
  test('one photograph becomes one named page, and the screen says which', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'front-page.jpg', 300, 400)]);

    await expect(page.getByTestId('announcer')).toHaveText('Page 1 added.');
    await expect(page.getByTestId('capture-count')).toHaveText('1 of 5 photographs added.');
    // The dimensions on the row are the *prepared* JPEG's, not the file's, which is the number that
    // matters: it is what the model will be shown.
    await expect(page.getByTestId('capture-page-1')).toHaveText(/Page 1 — 300 by 400 pixels/);

    const src = await page.locator('.page-preview').first().getAttribute('src');
    expect(src, 'the preview is an object URL of the prepared blob').toMatch(/^blob:/);
  });

  test('three photographs chosen at once are added in the order they came', async ({ page }) => {
    await addPhotographs(page, [
      await photo(page, 'a.jpg'),
      await photo(page, 'b.jpg'),
      await photo(page, 'c.jpg'),
    ]);

    // One announcement for the batch: the announcer holds a single message, so three writes in one
    // React batch would leave the person hearing only the last (the C-12 finding).
    await expect(page.getByTestId('announcer')).toHaveText('3 photographs added, as Page 1 to Page 3.');
    await expect(pageRows(page)).toHaveCount(3);
    await expect(page.getByTestId('capture-page-3')).toHaveText(/Page 3/);
  });

  test('a file that is not a picture is skipped out loud, and the pictures still go in', async ({ page }) => {
    await addPhotographs(page, [
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('a text file, not a page') },
      await photo(page, 'real.jpg'),
    ]);

    await expect(page.getByTestId('announcer')).toContainText('Sightline only reads photographs, so one file was skipped.');
    await expect(pageRows(page)).toHaveCount(1);
  });

  test('a file that claims to be a picture and is not gets its own sentence', async ({ page }) => {
    await addPhotographs(page, [{ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('%PDF-1.4 not a jpeg') }]);

    await expect(page.getByTestId('announcer')).toContainText('Sightline could not open that file as a photograph.');
    await expect(pageRows(page)).toHaveCount(0);
    await expect(page.getByTestId('capture-empty')).toBeVisible();
  });
});

test.describe('the five-page limit (C-02, MAX_PAGES)', () => {
  test('a sixth page is refused before its bytes are opened, and the five stay', async ({ page }) => {
    await addPhotographs(page, [
      await photo(page, 'one.jpg'),
      await photo(page, 'two.jpg'),
      await photo(page, 'three.jpg'),
      await photo(page, 'four.jpg'),
      await photo(page, 'five.jpg'),
    ]);
    await expect(pageRows(page)).toHaveCount(MAX_PAGES);

    // Undecodable bytes on purpose. If the limit were checked *after* `prepareImage`, this file would
    // be refused for being broken and the announcement would say so; the name of the refusal proves
    // which check ran (C-12 draws the same line for paste length).
    await addPhotographs(page, [{ name: 'sixth.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a jpeg') }]);

    await expect(page.getByTestId('announcer')).toContainText('up to five pages at a time');
    await expect(pageRows(page)).toHaveCount(MAX_PAGES);
    // Refusing a page must not fail the run or the session: the five good pages are still there to read.
    await expect(page.getByTestId('capture-count')).toHaveText('5 of 5 photographs added.');
  });

  test('removing one page makes room again, and takes its number back', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg'), await photo(page, 'two.jpg')]);
    await page.getByRole('button', { name: 'Remove page 1' }).click();

    await expect(page.getByTestId('announcer')).toHaveText('Page 1 removed.');
    // Reindexed: what was Page 2 is now Page 1, because the labels are capture positions and the
    // assembler joins them in that order (ADR-28).
    await expect(page.getByTestId('capture-page-1')).toHaveCount(1);
    await expect(pageRows(page)).toHaveCount(1);

    await addPhotographs(page, [await photo(page, 'three.jpg')]);
    await expect(page.getByTestId('announcer')).toHaveText('Page 2 added.');
    await expect(pageRows(page)).toHaveCount(2);
  });

  test('removing the last photograph says the list is empty rather than going quiet', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'only.jpg')]);
    await page.getByRole('button', { name: 'Remove page 1' }).click();

    await expect(page.getByTestId('announcer')).toHaveText('Page 1 removed. There are no photographs yet.');
    await expect(page.getByTestId('capture-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read these photographs' })).toBeDisabled();
  });
});

test.describe('retaking the last page (C-02, C-04 owns the offer)', () => {
  test('a retake replaces the last page and keeps the count where it was', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg', 300, 400), await photo(page, 'two.jpg', 300, 400)]);
    await page.getByRole('button', { name: 'Retake page 2' }).click();
    await expect(page.getByTestId('announcer')).toHaveText('Choose the replacement photograph for Page 2.');

    await addPhotographs(page, [await photo(page, 'two-again.jpg', 200, 500)]);

    await expect(page.getByTestId('announcer')).toHaveText('Page 2 replaced with a new photograph.');
    await expect(pageRows(page)).toHaveCount(2);
    // A different shape proves it is a different JPEG, not the same row re-labelled.
    await expect(page.getByTestId('capture-page-2')).toHaveText(/Page 2 — 200 by 500 pixels/);
  });

  test('only the last page offers a retake', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg'), await photo(page, 'two.jpg'), await photo(page, 'three.jpg')]);

    await expect(page.getByRole('button', { name: /^Retake/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Retake page 3' })).toBeVisible();
    // Every page can still leave: remove is not limited to the end.
    await expect(page.getByRole('button', { name: 'Remove page 1' })).toBeVisible();
  });

  test('removing every photograph clears the list and says so once', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg'), await photo(page, 'two.jpg')]);
    await page.getByRole('button', { name: 'Remove all photographs' }).click();

    await expect(page.getByTestId('announcer')).toHaveText('Every photograph removed.');
    await expect(pageRows(page)).toHaveCount(0);
    await expect(page.getByTestId('capture-empty')).toBeVisible();
  });
});

test.describe('what Forget owes the previews (P-10, proved from the screen)', () => {
  test('Forget revokes the preview URL the capture screen made', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'bill.jpg')]);
    const src = (await page.locator('.page-preview').first().getAttribute('src'))!;
    expect(src).toMatch(/^blob:/);
    expect(await blobIsReadable(page, src), 'the preview loads while the page is in the session').toBe(true);

    await page.getByRole('button', { name: 'Forget this document' }).click();

    // The point of `trackObjectUrl`: the session can name this URL, so it can destroy it. Before this,
    // Forget's report could not have counted a preview because no screen had ever made one.
    await expect.poll(() => blobIsReadable(page, src), { message: 'the revoked preview is unreadable' }).toBe(false);
    await expect(pageRows(page)).toHaveCount(0);
  });

  test('removing one page revokes that page and leaves the others', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg'), await photo(page, 'two.jpg')]);
    const first = (await page.getByTestId('capture-page-1').locator('img').getAttribute('src'))!;
    const second = (await page.getByTestId('capture-page-2').locator('img').getAttribute('src'))!;

    await page.getByRole('button', { name: 'Remove page 1' }).click();

    await expect.poll(() => blobIsReadable(page, first)).toBe(false);
    expect(await blobIsReadable(page, second), 'the page still in the session still previews').toBe(true);
  });
});

test.describe('the run from the screen (C-02 → C-03, in demo mode)', () => {
  test('reading photographs reaches the page loop and stops at the demo door, writing nothing back', async ({ page }) => {
    await addPhotographs(page, [await photo(page, 'one.jpg')]);
    await page.getByRole('button', { name: 'Read these photographs' }).click();

    // Not a stub: the run got as far as `transcribePage`, which is where demo mode says it has no
    // recorded answer for *this* photograph — a canvas rectangle the demo never shipped. The message is the
    // catalogue's, copied here so a paraphrase written for the screen cannot pass for it, and it is the
    // page-specific one (**ADR-31**): a person who just photographed a letter must not be told about text.
    await expect(page.getByTestId('announcer')).toHaveText(
      'Demo mode answers for the three photographs it ships with. Your own photograph has no demo answer, so there is nothing to show for it.',
    );
    // A-06: the failure is moved to, and it is the capture screen's own summary.
    await expect(page.locator('#capture-error')).toBeFocused();
    // The screen has exactly one failure summary, in the section that ran. Both forms are on `/`, so an
    // error rendered by each would be one live region too many and two components pulling at the same
    // focus target — the rule `session.input` enforces, and the rule this assertion keeps.
    await expect(page.getByTestId('status-message')).toHaveCount(1);
    // The run ended rather than hung: the control is pressable again with its own label.
    await expect(page.getByRole('button', { name: 'Read these photographs' })).toBeEnabled();
    // A stopped run writes no transcript, so the reading screen is still empty. Navigated by the nav
    // link, not by URL: the session is memory-only and a page load would empty it whatever ran.
    await page.getByRole('link', { name: 'What Sightline read' }).click();
    await expect(page.getByTestId('nothing-read')).toBeVisible();
  });

  test('a text failure belongs to the text section even when photographs are sitting in the list', async ({ page }) => {
    // The other half of the one-summary rule: adding photographs and then reading *text* must not leave
    // the photograph section claiming the error. The summary follows the input the run selected, not
    // whatever the page happens to hold.
    await addPhotographs(page, [await photo(page, 'one.jpg')]);
    await page.getByLabel('Paste the text of your document').fill('My own rent agreement, signed last week.');
    await page.getByRole('button', { name: 'Read this text' }).click();

    await expect(page.locator('#paste-error')).toBeFocused();
    await expect(page.getByTestId('status-message')).toHaveCount(1);
    await expect(page.locator('#capture-error')).toHaveCount(0);
    await expect(page.getByTestId('page-list')).toHaveCount(1);
  });

  test('with no photographs added the screen says there is nothing to read', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Read these photographs' })).toBeDisabled();
    await page.getByLabel(PICKER).setInputFiles([]);
    await expect(page.getByTestId('announcer')).toBeEmpty();
  });
});

test.describe('the screen is reachable and honest (AGENTS.md §8)', () => {
  test('the photograph section is on the document screen, and the paste hint points at it', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Add a document' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Photograph a document' })).toBeVisible();
    await expect(page.locator('#capture-hint')).toContainText('Up to 5 photographs, read in the order you add them.');
    // The paste screen used to say there was no camera control to look for. It no longer may.
    await expect(page.locator('#paste-hint')).toContainText('use Photograph a document below');
    await expect(page.getByText('no camera button')).toHaveCount(0);
  });

  test('the file control is reachable with the keyboard alone, from the paste box', async ({ page }) => {
    await page.locator('#document-text').focus();
    // Polled rather than counted: how many tab stops sit between the text box and the picker is the
    // demo corpus's business, and this assertion should not break when a fifth letter is added.
    await expect
      .poll(async () => {
        await page.keyboard.press('Tab');
        return page.evaluate(() => document.activeElement?.getAttribute('id') ?? '');
      })
      .toBe('capture-files');
  });

  test('axe finds no serious or critical violation, empty-handed or with pages and previews on it', async ({ page }) => {
    expect(blocking(await new AxeBuilder({ page }).analyze()), 'axe on the empty capture screen').toEqual([]);

    await addPhotographs(page, [await photo(page, 'one.jpg'), await photo(page, 'two.jpg')]);
    await nothingIsFading(page);
    expect(blocking(await new AxeBuilder({ page }).analyze()), 'axe with two pages, previews and controls').toEqual([]);
  });

  test('the photograph control is a real file input that takes several files and only pictures', async ({ page }) => {
    const input = page.getByLabel(PICKER);
    expect(await input.getAttribute('type')).toBe('file');
    expect(await input.getAttribute('accept')).toBe('image/*');
    expect(await input.getAttribute('multiple')).not.toBeNull();
    // The hint the input points at is the one that states the limit, so the constraint is announced with
    // the control rather than only appearing after a refusal.
    expect(await input.getAttribute('aria-describedby')).toBe('capture-hint');
  });
});
