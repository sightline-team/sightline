# Studying a reference site in a real browser

Never design from memory of what a site "kind of looks like". Open it, scroll it, measure it. Use a real browser
tool (a browser extension, a browser pane, or a driver). If the user names a browser, use that one.

You are collecting **structure and rhythm**. You are not collecting words, images, icons or artwork. Those must be
yours.

## 1. Let the page finish building

Some sites build sections as you scroll. Load, wait a few seconds, scroll down in steps, scroll back up, and check
that the document height settles before you measure. A height equal to the viewport usually means it has not built
yet.

## 2. Inventory the sections

Run in the page console. It lists every section with its id, height and background.

```js
JSON.stringify([...document.querySelectorAll('header, section, footer')].map(s => ({
  tag: s.tagName.toLowerCase(),
  id: s.id || '-',
  h: Math.round(s.getBoundingClientRect().height),
  bg: getComputedStyle(s).backgroundColor,
  heading: (s.querySelector('h1,h2,h3') || {}).innerText?.replace(/\n/g, ' ').slice(0, 70) || ''
})), null, 1)
```

Write down the order, the alternation of backgrounds and how tall each band is. The rhythm (light, white, cream,
dark, grain) is a large part of the feel.

## 3. Read the type

```js
JSON.stringify([...document.querySelectorAll('h1,h2,h3')].map(h => {
  const c = getComputedStyle(h);
  return { tag: h.tagName, size: c.fontSize, weight: c.fontWeight, tracking: c.letterSpacing,
           lead: c.lineHeight, family: c.fontFamily.split(',')[0], text: h.innerText.slice(0, 50) };
}))
```

Typical finding: one neutral typeface, display weight 500 or 550, tracking about -0.045em, sizes from 38 px to
78 px. Record it. Then use your own brand's typeface at those proportions.

## 4. Read buttons and cards

Record radius, padding, border and shadow of the primary button, the secondary button and the card. Note how a
card is sectioned: header block, hairline, body, hairline, footer controls. Note which cards overlap and which are
cropped.

```js
[...document.querySelectorAll('a,button')].slice(0, 12).map(b => {
  const c = getComputedStyle(b);
  return [b.innerText.slice(0, 20), c.backgroundColor, c.color, c.borderRadius, c.padding];
})
```

## 5. Measure motion over time (do not guess)

Screenshots show one instant. To learn what moves, sample state on a timer and log only the changes.

```js
// Which slide is visible, and when does it change?
const root = document.querySelector('#some-section');
const log = []; let last = ''; const t0 = performance.now();
for (let i = 0; i < 110; i++) {
  const imgs = [...root.querySelectorAll('img')];
  const state = imgs.map(im => (im.currentSrc || im.src).split('/').pop().slice(0, 14) + ':' + (+getComputedStyle(im).opacity).toFixed(1)).join(' ');
  if (state !== last) { log.push(((performance.now() - t0) / 1000).toFixed(1) + 's ' + state); last = state; }
  await new Promise(r => setTimeout(r, 250));
}
log.join(' / ')
```

Extend it to log text that changes (a tag in a prompt box), the width of pagination dots, transforms, filters.
Keep the output short; long tool output gets truncated.

What a measured slideshow looked like: one slide at a time, about 8 seconds each, a crossfade under one second with
a very slight scale change, a tag in the prompt box that changed with every slide, pagination dots where the active
one stretched into a pill (about 28 px against 10 px).

## 6. Look at it the way a visitor does

Take screenshots at several scroll positions. Look at the hero at full size and zoom in on one card: what is in it,
how many sections, which icons, which text sizes. Real specific content (named documents, real logos, real time
slots) is what separates a designed card from a generated one. Note that, then fill your own cards with your own
real content.

## 7. Check its responsive behaviour

Test the reference at 390, 768 and about 1040 pixels (see `qa-checklist.md` for the iframe method). Note what the
header does, how cards stack, where the menu appears.

## 8. Write the inventory

Before any code, write a half-page inventory: section order and bands, type scale, button and card anatomy, motion
timings, imagery treatment, responsive behaviour, and a list of what you will borrow (structure, rhythm, timing)
and what you will not (words, images, artwork, logos).

## Notes

- Some sites block automation or serve different content to it. If a page does not load or an element is missing,
  say so and work from what you can see. Do not invent what you could not observe.
- If the browser extension shows a permission prompt, wait for the user to allow it.
- Close tabs you opened when you are done.
