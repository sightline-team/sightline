# Patterns that replace the AI tells

Brand-agnostic and stack-agnostic. The CSS works as it is in any stack. The TSX snippets are one example of each
behaviour, written in React; translate them to the project's own stack using `stacks.md` (the browser APIs underneath
are the same in plain JS, Vue, Svelte, Angular and Astro). Names are prefixed `x-`; rename freely. Colours are variables; fill them from the
product's real tokens, never from this file.

```css
:root {
  --ink: /* brand dark */;      --deep: /* darker brand dark, for dark bands */;
  --soft: /* brand muted text */; --faint: /* brand quiet text */;
  --mist: /* brand light tint */; --cream: /* slightly stronger tint */;
  --line: /* hairline */;       --accent: /* brand accent, used sparingly */;
}
```

## A card sectioned by hairlines (the hero card)

Header block, hairline, body, hairline, footer controls. Square-on. No rotation, no animation.

```css
.x-card { background:#fff; border-radius:28px; overflow:hidden; text-align:left; color:var(--ink);
  box-shadow:0 0 0 1px rgb(0 0 0 / .06), 0 2px 4px rgb(0 0 0 / .04), 0 28px 56px -24px rgb(0 0 0 / .32); }
.x-card-head { display:flex; align-items:center; gap:16px; padding:22px 26px; }
.x-card-head b { display:block; font-size:22px; font-weight:550; letter-spacing:-.03em; }
.x-card-head small { color:var(--soft); font-size:15px; }
.x-card-sec { padding:20px 26px; border-top:1px solid var(--line); }
```

Fill the sections with real content: a player that plays a real clip, a real list, real controls (selected state
dark, others white with a hairline), a composer box (2 px dark border, a plus, a microphone, a round send button).
Position hero cards absolutely on desktop with fixed offsets so they overlap on purpose; make them a single
column (max about 520 px) below about 1020 px.

## App-style icon tile

```css
.x-tile { display:grid; place-items:center; width:50px; height:50px; border-radius:15px; color:#fff; }
```
```tsx
<span className="x-tile" style={{ background: "var(--ink)" }}><BrandMark /></span>  {/* brand card */}
<span className="x-tile" style={{ background: "#2fb457" }}><PhoneGlyph /></span>       {/* phone */}
```
Use the brand mark for brand cards; familiar app colours only for things that really are that app-like object
(phone, recorder, clock). A plain tick in a disc is fine for "passed".

## Feature row: a headline and one real artifact, alternating sides

```css
.x-feature { display:grid; grid-template-columns:1fr 1fr; gap:96px; align-items:center; margin-top:104px; }
.x-feature.is-flip .x-feature-text { order:2; }
.x-feature h3 { font-size:clamp(30px,3.6vw,46px); font-weight:500; letter-spacing:-.045em; line-height:1.05; }
.x-feature p { margin-top:22px; font-size:19px; color:var(--soft); max-width:34ch; }
@media (max-width:1020px) { .x-feature { grid-template-columns:1fr; gap:40px; } .x-feature.is-flip .x-feature-text { order:0; } }
```
Artifacts that work: a sectioned card of real checks, a small frequency or timeline diagram drawn as SVG with
hairlines and one flat accent rectangle, two big numbers compared ("4 to 5 s" greyed, "0.8 s" in ink).

## Results as a plain table

```css
.x-rrow { display:grid; grid-template-columns:1.4fr .9fr 1.3fr 1fr; align-items:baseline; gap:16px; padding:26px 0; border-top:1px solid rgb(255 255 255 / .14); }
.x-num  { font-size:clamp(34px,4.4vw,56px); font-weight:500; letter-spacing:-.05em; line-height:1; font-variant-numeric:tabular-nums; }
.x-num.other { color:rgb(255 255 255 / .42); white-space:nowrap; }
@media (max-width:820px) { .x-rrow { grid-template-columns:minmax(0,.8fr) minmax(0,1.25fr) minmax(0,1fr); } }
```
Columns: name, ours, theirs, difference in words. Keep rows where you lose, and say so ("6 behind").

## Flat highlighter and hand-drawn arrow (the "problem" card)

```css
mark { background:none; color:inherit; box-shadow:inset 0 -.42em 0 rgb(200 80 192 / .3); padding:0 .06em; } /* accent at low alpha */
```
An inline SVG arrow with a 4 px round-capped stroke, hand-curved, pointing at the evidence. Hide it on phones.

## Grainy photo hero

```css
.x-hero { position:relative; background:var(--tint); overflow:hidden; }
.x-hero::before { content:""; position:absolute; inset:0; opacity:.5; mix-blend-mode:multiply; pointer-events:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .4  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.x-hero-photo { position:absolute; inset:0; opacity:.4; mix-blend-mode:multiply; }
.x-hero-photo img { object-fit:cover; filter:grayscale(1) contrast(1.2) brightness(1.05); }
```
Tint the grain with the brand hue. Do not put a face behind the headline; a landscape or cityscape reads cleanly.

## Slideshow with a prompt box (React)

Measured values: hold 8 s, crossfade 0.9 s, slight zoom 1.03 to 1, tag and dots change with the slide.

```tsx
const hold = paused || reducedMotion || audioPlayingFromThisSlide;
useEffect(() => {
  if (hold) return;
  const t = setTimeout(() => setIndex(i => (i + 1) % slides.length), 8000);
  return () => clearTimeout(t);
}, [index, hold]);

// Only a mouse pauses on hover; a tap must not pause for good.
onPointerEnter={e => e.pointerType === "mouse" && setPaused(true)}
onPointerLeave={e => e.pointerType === "mouse" && setPaused(false)}
// Swipe: touchstart stores x,y; touchend with |dx| > 40 and |dx| > |dy| moves one slide.
// Dots: role="tablist", roving tabindex, ArrowLeft/ArrowRight move and focus.
```
```css
.x-slide { position:absolute; inset:0; opacity:0; transform:scale(1.03); transition:opacity .9s ease, transform 1.4s ease; }
.x-slide.is-on { opacity:1; transform:none; }
.x-dots button { width:10px; height:10px; border-radius:99px; transition:width .35s; position:relative; }
.x-dots button[aria-selected="true"] { width:30px; }
.x-dots button::before { content:""; position:absolute; inset:-14px -4px; }   /* touch target */
.x-stage { touch-action:pan-y; }
```
The prompt box overlaps the photo's bottom edge by about 80 px (negative top margin) with a 2 px dark border.

## Scroll reveal that never hides content

Hide only what starts below the fold; do nothing when reduced motion is on or scripts fail.

```tsx
useEffect(() => {
  const el = ref.current;
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (el.getBoundingClientRect().top < innerHeight * .9) return;
  el.dataset.reveal = "armed";
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { el.dataset.reveal = "in"; io.disconnect(); } });
  io.observe(el);
  return () => io.disconnect();
}, []);
```
```css
.x-reveal { transition:opacity .8s ease, transform .8s cubic-bezier(.2,.7,.2,1); }
.x-reveal[data-reveal="armed"] { opacity:0; transform:translateY(20px); }
.x-reveal[data-reveal="in"] { opacity:1; transform:none; }
```

## Header menu for narrow screens

Hide the link row at about 1020 px (a five-link nav stops fitting well before 820). Show a 44 px menu button that
opens a full-width panel under the sticky header with large links (19 px, 16 px padding, hairline between). Close on
Escape, on an outside tap, on link tap and when the window grows. `aria-expanded`, `aria-controls`.

## Modal as a bottom sheet on phones

```css
.x-scrim { position:fixed; inset:0; display:grid; place-items:center; background:rgb(0 0 0 / .55); padding:16px; }
.x-sheet { width:100%; max-width:520px; max-height:92vh; overflow:auto; background:#fff; border-radius:28px; }
@supports (height:100dvh) { .x-sheet { max-height:92dvh; } }
@media (max-width:520px) { .x-scrim { place-items:end center; padding:0; } .x-sheet { max-width:none; border-radius:26px 26px 0 0; padding-bottom:env(safe-area-inset-bottom); } }
```
Trap Tab inside, restore focus to the opener on close, lock body scroll, Escape closes, step counter plus segmented
progress bars, Back / Skip / Next where the step is optional (Next only when the step is done).

## Anchors under a sticky header, and touch sizes

```css
html { scroll-behavior:smooth; } @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } }
[id] { scroll-margin-top:76px; }
@media (pointer:coarse) { .x-small-play { width:42px; height:42px; } .x-chip { min-height:42px; } }
@media (hover:none) { .x-btn:hover { transform:none; } }
```

## A brush-drawn arrow (instead of a thin wire)

A thin stroked arrow reads as a diagram. A designed one is a *filled* shape: thin at the start, heavy in the belly,
tapering toward a bold head. Generate it from a Bezier centre line with a width profile, then paste the two path strings
into an inline SVG (`fill="currentColor"`). Draw your own; never trace another site's artwork.

```python
# centre line: leaves the highlighted sentence, swings out, comes back to point at the evidence
S, P1, P2, E = (250, 12), (34, 0), (-4, 262), (314, 286)
width = lambda t: 2.2 + 14.5 * math.sin(math.pi * min(t / 0.92, 1)) ** 0.75 + 0.9 * math.sin(t * 41)  # swell + wobble
# sample the curve, offset each point by +/- width/2 along the normal, join into one polygon (the body);
# the head is a kite: tip ahead of E, a long wing, a short wing, a notch behind.
```
Attach it to the thing it points from, not to the card: wrap the highlighted sentence in `position: relative;
display: inline-block` and place the arrow with `right: calc(100% - 80px); top: calc(50% - 12px)`. It then stays attached
at every width. Hide it on phones.

## Section wordmarks

A chunky display face used once per section, as a name ("Listen.", "Voices.", "Ears.", "Results."), with the full stop in
the brand accent, set at 11vw or so. Check specimens in the real browser before choosing (a throwaway HTML page with the
candidates at 90 px). Keep one display face, one geometric face for a single designed card, and one text face. Load the
extra faces with `preload: false`: they are used below the fold and must not compete with the hero.

## A footer with a giant, very light wordmark

A dark photograph under a flat shade, the links in a quiet column, then the product name at about 15vw in weight 200,
white at about 27 % opacity, `white-space: nowrap`, `overflow: hidden`, `aria-hidden`.

## Prepare effects ahead of time, not per frame

If a photo is always shown grayscale, tinted and faded, do that once at build time (a small script with an image library)
and ship the result as an ordinary image. Live `filter`, `mix-blend-mode`, `opacity` and animated `mask-image` on a
full-width photo are expensive, and they make hover effects stutter. For a hover spotlight, move a small clipped box
with `transform` and move the picture inside it the opposite way; never rewrite a full-size mask on every frame.

## Reveal on scroll without layout thrash

Measuring each element with `getBoundingClientRect` and then changing it forces the browser to lay the page out again
for every element. Use one shared `IntersectionObserver`: its first report says who is already on screen (leave those
alone) and who is below the fold (hide them until they scroll in).
