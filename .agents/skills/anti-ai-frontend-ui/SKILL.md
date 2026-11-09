---
name: anti-ai-frontend-ui
description: Build or redesign frontend UI so it does not look AI-generated. Use for any landing page, marketing site, dashboard, component or full-page design, and especially when the user says the UI "looks AI", "AI slop", "generic" or "template-like", wants to match a reference site, asks for a redesign, a polish pass, a responsive or UX pass, or says "make it perfect". Works in any frontend stack (plain HTML, React, Vue, Svelte, Angular, Astro, server templates): it detects the stack or asks which one to use before building. Enforces keeping the brand tokens exactly, studying the reference in a real browser, real content, licensed photography, real app-style icons, plain human copy, restrained motion, flat sectioned cards, mobile and touch quality, and a verified QA pass. Apply it before writing any UI code and again before reporting the work done.
---

# ANTI-AI FRONTEND UI

A UI looks AI-generated when it is assembled from the most common defaults and says nothing specific:
the glowing badge above the headline, the gradient wash, the row of identical rounded cards, the tilted
floating cards, the pill-shaped bar chart, the slogan with a comma in it. People notice within seconds, and
once they do they stop trusting the product.

The cure is not a style. It is four habits:

1. **Fidelity.** Use the product's real brand tokens, exactly.
2. **Study.** Look at a real reference in a real browser and measure it. Copy structure and rhythm, never words or artwork.
3. **Specificity.** Put real things on the page: real numbers, real clips and screenshots, real photos, real icons.
4. **Restraint.** Fewer effects, fewer radii, fewer colours, fewer words. Every element earns its place by carrying information.

## Non-negotiables

Read these before anything else. Each one comes from a real correction.

1. **Brand tokens are law.** Read colours, fonts and the logo from the product's own code (design tokens, CSS variables, logo file). Never "improve", neutralise or swap them. If the reference site is grey and black and the brand is plum and magenta, the brand wins and only the layout is borrowed. Swapping a brand's dark plum for neutral black was called out immediately: "why did you change our brand color?"
2. **Study before you build.** Open the reference in a real browser, scroll it, measure it (see `references/study-a-reference.md`). Do not design from memory of what "that kind of site" looks like.
3. **Do not copy a reference's text, images or artwork.** Borrow the section order, type scale, spacing, colour rhythm, card anatomy and motion timing. The words and pictures must be yours.
4. **Everything on the page is real.** No invented testimonials, "trusted by" logos, statistics, customer counts or screenshots. If there is no real proof yet, leave that section out.
5. **Plain human copy.** Facts in plain sentences. No slogans. See `references/copywriting.md`.
6. **None of the AI tells** in `references/ai-tells.md`: no glowing-dot badge, no gradients or glows, no tilted or bobbing cards, no pill progress bars, no tinted icon chips, no identical card grids, no off-brand status pills.
7. **Verify, then report.** Test every viewport (including the 320 to 430 px sweep with touch sizes forced), touch, keyboard, the console, a production build and Lighthouse (`references/qa-checklist.md`). Say what you did not verify.
8. **Ask before downloading files.** State filename, source and size. Check each licence. Credit the authors.
9. **Any stack, asked first.** The skill never assumes a framework. Detect or ask (`references/stacks.md`), then build in the project's own idiom; the design, tokens, markup and QA stay the same in every stack.
10. **A point of view in type and detail.** One neutral sans everywhere is itself a tell. Test many faces in a real browser, use a distinctive display face sparingly beside a quiet text face, and add hand-made, product-specific details (not a particular font, and never a reference's own lettering). See `references/type-and-style.md`.

## Workflow

Work through the phases in order. Do not skip Phase 1.

### Phase 0: Brief, stack and brand extraction
- **Stack first.** Detect it from the project (`package.json`, framework config, file extensions, how styles are written). If there is a project stack, use it and say so. If it is a new project or unclear, **ask which stack and styling approach before writing any code** (plain HTML/CSS/JS, React or Next.js, Vue or Nuxt, Svelte or SvelteKit, Angular, Astro, a server template, Tailwind or not). Never assume React, and never add a second framework to an existing project. See `references/stacks.md`.
- Find the brand tokens in the code: colour variables, font families, the logo or mark, radius and spacing habits. Write them down in a small table and treat it as read-only.
- Find the real facts the page may state (results docs, README, changelog). Copy numbers exactly; keep their caveats.
- Find what must stay private (keys, internal URLs, unreleased names, customer data). Keep it out of public copy.
- Note the audience and the one action you want them to take.

### Phase 1: Study the reference
Follow `references/study-a-reference.md`. Produce a short written inventory before writing code:
section order and heights, background colours per band, headline sizes and tracking, button anatomy, card anatomy, what moves and how (durations, delays, easings measured over time), and what the imagery is doing.

### Phase 2: Plan the page
Write a section table: purpose, headline, the one real artifact it shows (photo, mock card, table, player, diagram), the background band. Aim for alternating bands (light, white, dark, grain). Every section needs a real artifact; a section with only text and three cards is the tell.

### Phase 3: Build tokens, then layout, then content
- Put brand tokens in CSS variables first. Use no colour that is not derived from them (plus one semantic exception at most, with a reason).
- Type: follow the brand's faces if it has them. Otherwise a quiet text face plus one distinctive display face chosen from a specimen test (`references/type-and-style.md`). Tight tracking (about -0.045em at 60px and up), body 400, big scale contrast. Never more than three families.
- Two or three radii in total. One shadow recipe. Hairline borders for structure.
- Build the layout with real content from the start. Never ship placeholder text, even temporarily.

### Phase 4: Imagery and icons
Follow `references/imagery-and-icons.md`. Licensed photography with credits. Real app-style icons and the brand mark, not thin line icons in tinted chips. Give every content image real alt text and every decorative one an empty alt.

### Phase 5: Copy pass
Follow `references/copywriting.md`. Read every heading aloud. If it sounds like a poster, rewrite it as a sentence a colleague would say.

### Phase 6: Motion
Only motion that carries meaning: content revealing as it enters, a slideshow changing, a state changing. Measure a reference's timing instead of guessing (a typical slideshow: about 8 s hold, under 1 s crossfade with a slight zoom, a prompt tag and pagination dots that change with it). Respect `prefers-reduced-motion`. Never loop motion for decoration. Never tilt or bob cards.

### Phase 7: Responsive, touch and accessibility
Design behaviour for a thumb as well as a mouse: a menu when the nav no longer fits, 44 px touch targets, swipe on carousels, hover effects only where hover exists (and a deliberate touch version of any hover reveal), a bottom sheet for modals on phones, anchor offsets under sticky headers, safe areas. Sweep 320, 360, 390, 430, 600 and 820 px with the touch sizes forced and run the overflow audit; a single-width check is not a responsive check. Details in `references/qa-checklist.md` section 1b.

### Phase 8: QA and report
Run the checklist. Test in real viewports (the iframe method works in any browser), run Lighthouse on the production build and read it honestly. Then report plainly: what changed, what was checked, what was not (for example a real phone).

## Fast replacements

| The tell | Do this instead |
|---|---|
| Glowing-dot pill above the H1 ("● New: ...") | Nothing, or a small plain-text eyebrow. A badge only if it is a real third-party award. |
| Pill progress bars with legend dots | A plain table: big numerals, hairline rules, a "difference" column in words. |
| Gradient wash, glow, gradient text | Flat brand colours. Texture comes from a photograph or fine grain. |
| Thin line icons in tinted rounded squares | App-style flat tiles (brand mark, recognisable glyphs) or real logos. |
| Tilted, bobbing floating cards | Flat, square-on cards sectioned by hairlines, overlapping by design. |
| Three identical rounded cards with 01 / 02 / 03 | Alternating rows: a headline and one real card or photo, sides swapping. |
| Everything centred | Big left-aligned headlines against an image or card, centre only for short statements. |
| Green or blue "status" pills that are not in the brand | Plain quiet text, or a brand-coloured label. |
| Slogan headlines | A plain statement of what it is or does. |
| Brand colours replaced by neutrals to look like the reference | Keep the brand. Borrow only structure. |

## Section recipes

- **Hero:** eyebrow in small caps, one H1 that states what the product is, one plain sentence, two buttons. Behind it a high-contrast grayscale photo with visible grain (multiplied onto the brand's tinted background), not a gradient. Two or three flat product cards below, square-on, overlapping the photo, containing real content (a player with a real clip, a real list, a composer box). Details in `references/patterns.md`.
- **Problem:** one large rounded tinted card, bold headline, one highlighted sentence (flat marker, not a gradient), a hand-drawn arrow to the real evidence (a table of real measurements).
- **Feature rows:** headline plus one real artifact, alternating sides. Artifacts can be a sectioned product card, a small diagram, a photo, a timeline of two big numbers.
- **Wordmarks, arrows, footer:** a chunky display wordmark per section with the accent on its full stop, a brush-drawn tapered arrow attached to the highlighted sentence, and a footer with a dark photo behind a giant, very light product name. Patterns in `references/patterns.md`.
- **Dark band with artwork:** headline right-aligned on the left, a tall textured photograph in the middle, a short line on the right, the real interactive demo underneath.
- **Results:** a plain table on a dark band, large numerals, differences in words, the method in one small line, the unflattering rows left in.
- **Slideshow:** photo, a prompt box overlapping its bottom edge, a tag that changes with the slide, dots where the active one stretches. Pauses for a mouse, never for a tap; pauses while its audio plays; swipeable; keyboard arrows.
- **FAQ:** native `details` elements, plain answers, real numbers.
- **Footer:** columns, one real contact, image credits.

## Reporting back

State facts: what was built, what was measured, what is still unverified. No superlatives. If a rule here conflicts with an explicit instruction from the user, the user wins; say which rule you set aside.

## References

- `references/ai-tells.md`: the full list of tells, why each reads as generated, and the fix.
- `references/study-a-reference.md`: how to study a site in a real browser, with scripts.
- `references/patterns.md`: brand-agnostic code for the patterns above.
- `references/copywriting.md`: plain-copy rules with before and after.
- `references/imagery-and-icons.md`: sourcing licensed photos, credits, icons.
- `references/qa-checklist.md`: responsive sweep, touch, accessibility, Lighthouse and release checks.
- `references/stacks.md`: how to detect or ask for the stack, and how each pattern translates to plain JS, React, Vue, Svelte, Angular, Astro and server templates.
- `references/type-and-style.md`: how to find distinctive type and product-specific details without copying a reference.
