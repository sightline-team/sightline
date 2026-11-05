import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The visual system, asserted (item **A-17**).
 *
 * A-01/A-02 already sweep axe over these routes, and axe is the right tool for what it checks. What
 * axe does **not** check is the half of a stylesheet that is a *decision* rather than a rule: that
 * the header, the demo-data warning and the content are on one column; that a heading is never
 * smaller than the text it heads; that the primary action of a form is visibly the primary action in
 * every palette the app can render; that a hovered control answers at all. Those are the things a
 * design pass either does or does not do, and until this file nothing here proved which.
 *
 * Scope, stated exactly (the same discipline as A-01):
 *  - **Chromium only**, because that is the only engine this repo can launch — `playwright.config.mts`
 *    says so, and a colour pair measured in one engine is not measured in three;
 *  - contrast here is computed from the **computed styles of the elements themselves**, not from the
 *    token table, so a rule that stops applying is a failing test rather than a stale assertion, and
 *    every such read waits until the element has **stopped transitioning** (see `colours`);
 *  - this is **not** screen-reader evidence (A-03/A-04) and not a real-device pass (A-08): it is the
 *    machine-checkable half, which is what an automated suite can honestly settle before a person
 *    with a phone and a reader is found.
 *
 * The palettes are the three the app can actually show: the OS light scheme, the OS dark scheme, and
 * the opt-in high-contrast theme A-15 writes onto `<html>` from Settings.
 */

const DEMO = { bill: 0 } as const;

async function runDemoDocument(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.button-row button').nth(DEMO.bill).click();
  const text = await page.getByLabel('Paste the text of your document').inputValue();
  await page.getByLabel('Paste the text of your document').fill(text);
  await page.getByRole('button', { name: 'Read this text' }).click();
  await expect(page.getByTestId('results-heading')).toBeVisible();
}

/** What the app has actually stored for the theme, or `false` when nothing is stored yet. */
async function storedHighContrast(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('sightline.settings');
    if (raw === null) return false;
    try {
      return (JSON.parse(raw) as { highContrast?: unknown }).highContrast === true;
    } catch {
      return false;
    }
  });
}

/**
 * Turn the theme on **through the Settings control**, and do not press it until the app is listening.
 *
 * The page is server-rendered from the defaults (`useStoredSettings`' server snapshot is `null`), so
 * for a moment after navigation the checkbox shows `false` with no React handler attached yet. Measured
 * on `next dev`: a click 0, 100, 200 or 400 ms after the navigation commits writes nothing to
 * `sightline.settings`, leaves `data-high-contrast` absent and announces nothing — and leaves the DOM
 * checkbox at `checked: true`, which is the part that matters, because the control then reports a
 * state the app does not have. The same click at 800 ms is heard. Playwright's own actionability
 * checks (visible, enabled, stable) pass the whole window straight through and report `Clicking the
 * checkbox did not change its state`; `flow.spec.ts` polls for the same reason on the rate radios.
 * So: wait until the control agrees with the store, then press only if it is still off. **The app-side
 * question is item A-18, not something this helper should paper over.**
 */
async function enableHighContrast(page: Page): Promise<void> {
  await page.goto('/settings');
  const box = page.getByRole('checkbox', { name: 'High contrast' });
  await expect
    .poll(async () => (await box.isChecked()) === (await storedHighContrast(page)), {
      message: 'the control must first show what the app has stored, or a press races hydration',
    })
    .toBe(true);
  if (!(await box.isChecked())) await box.check();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.highContrast))
    .toBe('true');
}

/** `rgb(r g b)` / `rgba(r, g, b, a)` → the three channels. Throws rather than defaulting: an
 *  unparseable colour means the pair this test exists to check cannot be checked. */
function parseRgb(value: string): [number, number, number] {
  const inner = /rgba?\(([^)]+)\)/.exec(value)?.[1];
  if (inner === undefined) throw new Error(`not an rgb colour: "${value}"`);
  const parts = inner
    .split(/[\s,/]+/)
    .filter((p) => p.length > 0)
    .map(Number)
    .slice(0, 3);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) throw new Error(`not an rgb colour: "${value}"`);
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** WCAG 2.x relative luminance, so the threshold is the one AGENTS.md §8 names (4.5:1). */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const a = luminance(parseRgb(fg));
  const b = luminance(parseRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The computed colours of one element, as the browser resolved them for the current palette. */
const readColours = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el === null) throw new Error(`nothing matches "${sel}" — this assertion is not testing the page`);
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, border: s.borderColor };
  }, selector);

/**
 * The same, but only once the element has **stopped moving between two palettes**.
 *
 * `--motion` gives a button a 120 ms background transition, and `getComputedStyle` inside that window
 * returns the *interpolated* colour rather than the final one. Every palette test in this file reads
 * styles moments after `data-high-contrast` lands or after navigation, so without this the measured
 * pair is a frame of a cross-fade: the failure this replaced reported "1.29:1" for a label that is
 * black on yellow. Two animation frames apart agreeing on all three channels is the settled palette,
 * which is a property of the page rather than of the machine's load.
 */
async function colours(page: Page, selector: string): Promise<{ color: string; background: string; border: string }> {
  let previous = await readColours(page, selector);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    const next = await readColours(page, selector);
    if (next.color === previous.color && next.background === previous.background && next.border === previous.border) return next;
    previous = next;
  }
  return previous;
}

const PALETTES = ['light', 'dark', 'high-contrast'] as const;
type Palette = (typeof PALETTES)[number];

/**
 * Open a route in one of the three palettes, and **do not measure before the theme has landed**.
 *
 * `light`/`dark` are an OS preference, so `emulateMedia` settles them before first paint. The
 * high-contrast theme is not: `layout.tsx` renders no theme attribute (server render carries the
 * defaults, A-15), and `HighContrastTheme` writes `data-high-contrast` onto `<html>` from
 * `localStorage` in an effect after the client boots. Measuring between the two reads one page in
 * two palettes — which is exactly what the first run of this file did, and why it reported
 * "2.4:1" for a label that is white on black. The poll is the fix, and the reason it belongs here
 * rather than in a helper nobody has to remember. The transition is settled per element by `colours`.
 */
async function openInPalette(page: Page, palette: Palette, route = '/'): Promise<void> {
  if (palette === 'high-contrast') {
    await enableHighContrast(page);
    await page.goto(route);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.highContrast), { message: 'the theme must be on the page being measured' })
      .toBe('true');
    return;
  }
  await page.emulateMedia({ colorScheme: palette });
  await page.goto(route);
}

test.describe('one column: the shell lines up', () => {
  test('nav, the demo-data banner and the content share both edges', async ({ page }) => {
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const boxes = await page.evaluate(() => {
        const rect = (sel: string) => {
          const el = document.querySelector(sel);
          if (el === null) throw new Error(`nothing matches "${sel}"`);
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
        };
        return { nav: rect('nav'), banner: rect('.banner'), main: rect('main') };
      });
      const label = `at ${width}px`;
      expect(boxes.nav.left, `${label}: the header must start where the content starts`).toBe(boxes.main.left);
      expect(boxes.banner.left, `${label}: the demo-data warning must start where the content starts`).toBe(boxes.main.left);
      expect(boxes.nav.right, `${label}: and end there too`).toBe(boxes.main.right);
      expect(boxes.banner.right, `${label}: and end there too`).toBe(boxes.main.right);
      // The measure is a reading measure, not a viewport one: 44rem at the base font size.
      expect(boxes.main.width, `${label}: the text column is capped, so a line stays short`).toBeLessThanOrEqual(704);
    }
  });

  test('every header link is a 44px target, not just the Forget button', async ({ page }) => {
    await page.goto('/');
    const tooSmall: string[] = [];
    for (const link of await page.locator('nav a').all()) {
      const height = await link.evaluate((el) => Math.round(el.getBoundingClientRect().height));
      const text = (await link.textContent())?.trim() ?? '';
      if (height < 44) tooSmall.push(`"${text}" is ${height}px tall`);
    }
    expect(tooSmall, 'AGENTS.md §8: no touch target under 44px').toEqual([]);
  });
});

test.describe('one scale: headings and body', () => {
  test('no heading on the results screen is smaller than the text it heads', async ({ page }) => {
    await runDemoDocument(page);
    const sizes = await page.evaluate(() => {
      const px = (sel: string) => parseFloat(getComputedStyle(document.querySelector(sel) as Element).fontSize);
      return {
        body: px('main p'),
        h1: px('h1'),
        h2s: Array.from(document.querySelectorAll('main h2')).map((el) => parseFloat(getComputedStyle(el).fontSize)),
        h3s: Array.from(document.querySelectorAll('main h3')).map((el) => parseFloat(getComputedStyle(el).fontSize)),
        h4s: Array.from(document.querySelectorAll('main h4')).map((el) => parseFloat(getComputedStyle(el).fontSize)),
      };
    });
    // An unstyled `h4` is 1rem and the body here is 1.125rem: the receipt's own headings used to sit
    // *below* the sentences they introduced. That is the regression this pins shut.
    expect(sizes.h1).toBeGreaterThan(sizes.body);
    for (const [level, list] of [
      ['h2', sizes.h2s],
      ['h3', sizes.h3s],
      ['h4', sizes.h4s],
    ] as const) {
      expect(list.length, `the results screen is expected to carry at least one ${level}`).toBeGreaterThan(0);
      for (const size of list) expect(size, `${level} below body size`).toBeGreaterThanOrEqual(sizes.body);
    }
  });
});

test.describe('one button pair, in every palette', () => {
  for (const palette of PALETTES) {
    test(`the form's submit button is the primary action in the ${palette} palette`, async ({ page }) => {
      await openInPalette(page, palette, '/');

      const primary = await colours(page, 'form button[type="submit"]');
      const secondary = await colours(page, '.button-row button');
      const disabled = await colours(page, 'form button[type="submit"][disabled]');

      // The pair must be *distinguishable*, which is the whole point of having one.
      expect(primary.background, `${palette}: primary and secondary cannot render the same fill`).not.toBe(secondary.background);
      // And each label must clear 4.5:1 against its own fill, whatever the palette resolved to.
      expect(contrastRatio(primary.color, primary.background), `${palette}: primary label on primary fill`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(secondary.color, secondary.background), `${palette}: secondary label on secondary fill`).toBeGreaterThanOrEqual(4.5);

      // A disabled action reads as disabled by its fill, not by a faded label — fading the label is
      // how a disabled control quietly becomes a contrast failure.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(disabled.background, `${palette}: a disabled primary must not still wear the accent`).not.toBe(primary.background);
      expect(contrastRatio(disabled.color, bg), `${palette}: disabled label on the page`).toBeGreaterThanOrEqual(4.5);
    });

    test(`the text colours on the shell clear 4.5:1 in the ${palette} palette`, async ({ page }) => {
      await openInPalette(page, palette, '/');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const pairs = {
        body: await colours(page, 'main p'),
        link: await colours(page, 'nav a'),
        muted: await colours(page, '.muted'),
        banner: await colours(page, '.banner'),
      };
      expect(contrastRatio(pairs.body.color, bg), `${palette}: body text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(pairs.link.color, bg), `${palette}: nav link`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(pairs.muted.color, bg), `${palette}: muted text`).toBeGreaterThanOrEqual(4.5);
      // The demo-data warning is the one sentence on the page that must not be readable by accident.
      expect(contrastRatio(pairs.banner.color, pairs.banner.background), `${palette}: warning text on its panel`).toBeGreaterThanOrEqual(4.5);
    });

    test(`a hovered control answers, and the answer survives reduced motion (${palette})`, async ({ page }) => {
      await openInPalette(page, palette, '/');
      const button = page.getByRole('button', { name: 'Read this text' });
      const before = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
      await button.hover();
      await expect
        .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor), { message: 'hover must change the fill' })
        .not.toBe(before);
      const lifted = await button.evaluate((el) => getComputedStyle(el).transform);
      expect(lifted, 'a hovered button steps up').not.toBe('none');

      // AGENTS.md §8: honour `prefers-reduced-motion`. The lift goes; the colour step stays, so the
      // control is still visibly hovered.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.mouse.move(5, 5);
      await button.hover();
      await expect
        .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe(before);
      expect(await button.evaluate((el) => getComputedStyle(el).transform), 'reduced motion must not move the control').toBe('none');
    });

    test(`the native radio and checkbox stay visible on a dark page (${palette})`, async ({ page }) => {
      await openInPalette(page, palette, '/settings');
      // `color-scheme: dark` makes the browser draw an unselected radio as a dark disc, which on a
      // near-black page is under the 3:1 WCAG 1.4.11 asks of a control's indicator. The stylesheet
      // asks for the light rendering of the widget itself; this pins that ask in place.
      const schemes = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.setting-options input[type="radio"], .setting-row input[type="checkbox"]')).map(
          (el) => getComputedStyle(el).colorScheme,
        ),
      );
      expect(schemes.length, 'the settings page is expected to carry native controls').toBeGreaterThan(0);
      expect(schemes, 'every native control must render its light variant').toEqual(schemes.map(() => 'light'));
    });
  }
});

test.describe('at phone width', () => {
  test('a fact label sits above its value at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await runDemoDocument(page);

    const stacked = await page.evaluate(() => {
      const list = document.querySelector('.fact-list') as HTMLElement;
      return getComputedStyle(list).gridTemplateColumns.split(' ').length;
    });
    expect(stacked, 'at phone width a fact label sits above its value, not beside it').toBe(1);

    const dt = page.locator('.fact-list dt').first();
    const dd = page.locator('.fact-list dd').first();
    expect(await dt.evaluate((el) => el.getBoundingClientRect().left), 'the label is on the left edge').toBe(
      await dd.evaluate((el) => el.getBoundingClientRect().left),
    );
  });

  // One test per palette rather than one test with twelve axe injections in it. Twelve injections
  // plus three demo runs shared one 30 s limit, which passed or timed out depending on the machine;
  // four injections per test is the honest unit, and a failure now names the palette that produced
  // it. The timeout goes with it: axe alone costs 10 s per route on an idle machine and 18-24 s when
  // the suite is running its workers in parallel, so the default 30 s would fail on load, not on
  // colour.
  for (const palette of PALETTES) {
    test(`axe finds nothing serious or critical at phone width (${palette})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height: 844 });
      for (const route of ['/', '/read', '/trust', '/settings']) {
        if (route === '/read') {
          // The results screen is the one state this app has that only exists after an action, and
          // it is the screen with the most colour pairs on it.
          await openInPalette(page, palette, '/');
          await runDemoDocument(page);
        } else {
          await openInPalette(page, palette, route);
        }
        const results = await new AxeBuilder({ page }).analyze();
        const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(
          blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html).join(' | ')}`),
          `${route} at 390px in the ${palette} palette`,
        ).toEqual([]);
      }
    });
  }
});
