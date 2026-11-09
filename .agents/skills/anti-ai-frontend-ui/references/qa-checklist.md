# QA checklist: responsive, touch, accessibility, release

Run this before reporting any UI work as done. Tick only what you actually observed. Say what you could not check.

## 1. Test real viewports

Some browser tools resize a window without changing the page's CSS viewport (the page still reports its old
`innerWidth`). Do not trust a resize. Check `innerWidth` in the page console. If it did not change, use an
iframe test page, which applies true media queries at any width.

Create a temporary file in the dev server's static folder (delete it afterwards):

```html
<!-- public/responsive-test.html -->
<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#777;display:flex;justify-content:center">
<iframe id="f" style="border:0;background:#fff"></iframe>
<script>
  const q = new URLSearchParams(location.search), f = document.getElementById('f');
  f.style.width = (q.get('w') || 390) + 'px'; f.style.height = (q.get('h') || 780) + 'px';
  f.src = q.get('p') || '/';
</script>
```

Open `/responsive-test.html?w=390`, then `?w=768`, then `?w=1040`, and the real window for desktop. Same-origin,
so the console can reach `document.getElementById('f').contentWindow` to scroll and measure.

Check at each width: `contentWindow.document.documentElement.scrollWidth` is not larger than the viewport
(no sideways scroll), nothing is clipped, text does not wrap into a column of six one-word lines, cards do not
squeeze side by side, the header does not overflow.

Widths that catch bugs: **390** (phone), **768** (tablet portrait), **about 1040** (just above the usual
tablet breakpoint), **1440** and a very wide screen.

A frequent bug: an old media-query rule survives a rewrite and fights the new one (for example a two-column grid
left from before). `grep` every selector you change across the whole stylesheet.

## 1b. The small-phone sweep (do not stop at 390)

A page that passes at one width with a mouse can still break on a real phone. A shipped page once showed
"FEMALEMALE" on a phone because it was checked at 390 px with mouse-sized buttons. Always do this sweep:

- **Widths:** 320, 340, 360, 375, 390, 414, 430, then 600 and 820. 320 and 360 are where things break first.
- **Force the touch sizes.** Touch screens usually enlarge controls (`@media (pointer: coarse)`), and a desktop
  browser never applies that. Inject the touch rules while testing, for example a style tag that sets the
  small buttons to their 42 px size, then measure again.
- **Labels and controls share a column.** A label with a fixed width (32 px) over a control whose size changes
  (32 px on desktop, 42 px on touch) will overlap. Put both in the same grid track, wide enough for the longest
  label, and centre them. Labels such as "Female" are wider than they look at 11 px with letter spacing.
- **Rows of equal controls shrink instead of overflowing.** Use `flex: 1 1 0; min-width: 0; max-width: 44px;
  aspect-ratio: 1` so five round buttons share a 265 px card and never run past it.
- **Minimums in `clamp()` must fit 320.** A display size of `clamp(64px, 15.5vw, 240px)` is clipped on a 320 px
  phone because the 64 px floor is wider than the box. Lower the floor (36 to 54 px) and test the longest word.
- **Run an overflow audit at every width** in the page console (it works through an iframe test page too):

```js
const bad = [];
document.querySelectorAll('main *, footer *').forEach(e => {
  if (e.closest('svg') || e.tagName === 'BUTTON') return;
  const cs = getComputedStyle(e);
  if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.display !== 'inline' && cs.overflowX === 'visible')
    bad.push(e.className || e.tagName);            // text spilling out of its box
});
const sideways = document.documentElement.scrollWidth > document.documentElement.clientWidth;
```

  Elements clipped on purpose (a huge footer wordmark with `overflow: hidden`) need a separate check: compare
  `scrollWidth` with `clientWidth` and make sure nothing is cut. Zero findings at every width is the bar.
- **Look at it.** Take a screenshot of each dense card (lists, tables, badge rows, the footer) at 360. Numbers can
  pass while a label still sits wrongly.
- **A mouse-only effect needs a touch version.** If hovering reveals something (a spotlight, a tooltip), give touch a
  deliberate equivalent (touch and hold or drag shows it, then it fades). Or decide, in writing, that touch keeps the
  plain version. Do not leave it silently missing. Keep `touch-action: pan-y` so scrolling still works.
- **Simulated touch is not a phone.** Say so in the report, and ask the person to try a real device.

## 2. Touch

- Tap targets at least 44 px (invisible hit area is fine: a pseudo-element with negative inset).
- Hover-only behaviour removed or guarded with `@media (hover: hover)`.
- Pointer events, not mouse events, so a tap does not leave something paused.
- Swipe on carousels, with `touch-action: pan-y` so vertical scrolling still works.
- No fixed element covers content at the bottom of a phone; respect `env(safe-area-inset-*)`.
- Modals become bottom sheets on phones; use `dvh` so the browser toolbar does not push them off screen.
- Inputs at 16 px or larger to stop iOS zooming.

## 3. Keyboard and screen readers

- Tab through the whole page: visible focus ring on every control, logical order, a "Skip to content" link first.
- Modal: focus moves in, Tab is trapped, Escape closes, focus returns to the opener.
- Menus: `aria-expanded`, `aria-controls`, Escape closes.
- Tabs and carousels: `role="tablist"` with roving `tabindex` and arrow keys.
- One `h1`; headings descend without skipping levels.
- Images: meaningful alt text, or `alt=""` when decorative.
- Audio and video never autoplay with sound. A play button names what it plays.
- Text contrast at least 4.5:1 (3:1 for large text). Check muted text on tinted bands and text over photos.
- `prefers-reduced-motion`: no autoplay carousels, no reveal animations, no smooth scroll.

## 4. Behaviour

- Every link and anchor works; sections are not hidden under the sticky header (`scroll-margin-top`).
- Interactive demos actually work: play a clip, switch tabs, open and walk the modal to the end.
- Slideshow: advances on its own, holds for a mouse, does not hold for a tap, holds while its audio plays, dots track.
- Reveal animations: content is visible with scripts off and with reduced motion on.
- No console errors or warnings you introduced.

## 4b. Images look sharp

A photo that looks soft is almost always a size problem, not a quality problem. Check these:

- **The source is big enough.** Needed width = the width the image is actually *drawn* at (not the viewport) times the
  device pixel ratio. A 1,800 px source in a full-width hero is soft on a high-density screen. Download the largest
  licensed size (for example 3,200 px), keep a copy at 85 to 90 quality.
- **`object-fit: cover` can blow a picture up.** A wide landscape photo covering a tall box is scaled by the *height*.
  On narrow screens a stacked hero can be 1,700 px tall, so a 16:9 photo is drawn about 3,000 px wide. Cap the photo's
  height on narrow screens and let it fade into the band below, or use a taller crop for those widths.
- **The page requests the right size.** With the framework's image component, set `sizes` to the width the picture
  is really drawn at (for a covering background: about the cover width, not `100vw`). Check what the browser got:
  `fetch('/_next/image?url=...&w=3840&q=90')` and decode it with `createImageBitmap` to read its real pixels.
- **Filters and blends cost sharpness.** Heavy contrast, blur or low opacity make a photo look soft. Prefer a clean
  grayscale plus multiply, at moderate opacity.
- Compare before and after with the same zoom region at 100 % and at the device's pixel ratio.

## 5. Performance and release

- Production build passes (`build`, not just the dev server).
- **Run Lighthouse** on the production build (or the deployed URL), mobile and desktop: performance, accessibility, best practices, SEO. Fix real findings (image size, layout shift, contrast, missing names), not the score for its own sake. Do not run heavy browser work while it runs, it skews the timings. Note the scores and what you left unfixed in the report.
- Only the hero image is preloaded; the rest lazy-load. Images are sized with `sizes`.
- Fonts load with `display: swap`.
- Page metadata: title, description, Open Graph and Twitter card, favicon, `lang` on `<html>`.
- Stop dev servers you started. A stopped background task can leave its child process holding the port; find it
  with `netstat -ano | findstr :PORT` and end that process, then restart.
- Delete temporary files (the responsive test page, scratch images).
- Licence and credits file present for third-party images.

## 6. Report

Write a short plain report: what changed, what you tested at which widths, what you could not test (for example
live services, real devices), and any rule you set aside at the user's request.

## Lighthouse findings that came up, and the fixes

- **Contrast.** A quiet grey (#9c90a9) on white measured 3.0:1 and failed. Keep two greys: a lighter one for
  decoration and a darker one (about 4.5:1) for any readable small text. Check text on tinted bands and over photos too.
- **Heading order.** A card title coded as an `h3` straight after the page `h1` skipped a level. If it is not a
  real section heading, make it a styled `<b>` or `<p>`.
- **Blocking time from scroll reveals.** Measuring each element and then changing it forced the page to lay out again
  for every element (26 times, over a second on a slow machine). Use one shared `IntersectionObserver`.
- **Heavy effects.** Live filters, blend modes and animated masks on a full-width photo cost frames. Bake the effect
  into the image file at build time (see `patterns.md`).
- **Fonts and images.** Preload only the hero image and the first-screen font. Give below-the-fold display faces
  `preload: false`. Set image `sizes` honestly.
- On one slow laptop these fixes moved accessibility from 95 to 100, performance from 52 to 61 on desktop and from
  39 to 51 on mobile. Report your own numbers, not these.

## Reading a Lighthouse result honestly

- A headless run on a busy machine inflates blocking time (check `environment.benchmarkIndex` in the JSON: about 1000
  is a normal laptop). Cross-check in a real browser with `performance.getEntriesByType('long-animation-frame')`.
- Save the trace (`--save-assets`) and read the main thread: if one JavaScript call and a few huge `Layout` events dominate,
  look for loops that measure and then change the DOM.
- Report the numbers as measured, with what was left unfixed, not a rounded-up story.
- When lab numbers (a slow headless run) and a real browser disagree, report both and say which you trust and why. In the case above a real Chrome showed about 350 ms of blocking while the lab run showed 1 to 4 s.
