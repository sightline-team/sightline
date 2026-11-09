# The AI tells, and what to do instead

Each entry says what it looks like, why people read it as generated, and the fix. Check a finished page against
the whole list.

## Decoration

**1. The glowing-dot announcement pill.** A white pill above the headline with a coloured dot and a ring around
the dot: "● 10 voices across 5 languages". It is on thousands of generated landing pages. *Fix:* delete it. If you
need a line above the headline use a small-caps eyebrow in plain text. Use a badge only when it is a real
third-party recognition you can name.

**2. Gradients.** Radial glows behind the hero, gradient text, gradient buttons, gradient borders, gradient bars.
*Fix:* flat brand colours. Get depth from a photograph, from fine film grain, from hairlines and from one soft
shadow recipe.

**3. Tilted, bobbing floating cards.** Cards rotated a couple of degrees with a slow up-and-down animation and a
large blurred shadow. *Fix:* square-on cards, no animation, a soft layered shadow, and overlap that looks designed
(fixed positions, one card on top of another's corner).

**4. Tinted icon chips.** A thin line icon from a popular icon set inside a rounded square tinted with the brand
colour. *Fix:* real app-style tiles (flat colour square, white glyph; the brand's own mark for brand cards), real
logos where truthful, or no icon.

**5. Blobs, orbs and abstract hero art.** A glowing sphere, a mesh gradient, floating shapes. *Fix:* a real
photograph or a real product card.

**6. Glass and blur.** Frosted translucent cards on colourful backgrounds. *Fix:* opaque white cards on a tinted
band.

**7. Heavy or mixed rounding.** Radii of 12, 16, 24, 32 and 44 px used together. *Fix:* two or three radii for the
whole site (for example card 28, control 999, image 20).

**8. Hover lift on everything.** Every card and button rising on hover. *Fix:* change colour or border on hover;
lift only the primary button, and not on touch screens.

## Structure

**9. The identical card trio.** Three equal rounded cards with a number or icon, a title and two lines. *Fix:*
alternating feature rows with one real artifact each (see `patterns.md`).

**10. Everything centred.** Centred headline, centred paragraph, centred cards, repeated down the page. *Fix:* mix
big left-aligned headlines against an image or card with short centred statements.

**11. Pill-shaped progress bars with legend dots** for comparing numbers. *Fix:* a plain table with large numerals,
hairline rules and a "difference" column in words ("1 ahead", "6 behind"). Square-ended thin rules if you need a
visual at all.

**12. Sections with nothing to show.** A heading and a paragraph with no artifact. *Fix:* every section shows one
real thing.

**13. Fake social proof.** Invented testimonials, a "trusted by" strip of logos, made-up user counts, placeholder
avatars. *Fix:* leave the section out until it is true. Real, named, permitted quotes only.

## Colour and type

**14. Neutralising the brand.** Swapping the brand's colours for black, grey or white because the reference site
uses them. *Fix:* keep the tokens. Only structure is borrowed.

**15. Off-brand semantic colours.** A pale green "Ready" pill, a blue "New" tag. *Fix:* quiet plain text, or the
brand's own accent. A tick can be green if it means "passed"; a decorative pill cannot.

**16. Too many typefaces or a quirky display face.** *Fix:* one neutral grotesque, display weight 500, tracking
about -0.045em at 60 px and up, body 400. Secondary text in the brand's muted colour, not a generic grey.

**17. Purple and blue everywhere** when the brand is not purple or blue. *Fix:* the brand palette, with the accent
used sparingly (highlighter marks, selected states, a few dots).

## Content

**18. Slogan copy.** See `copywriting.md`.

**19. Emoji as icons or bullets.** *Fix:* real icons, or plain list rules.

**20. Lorem ipsum, "Feature one", "Your text here".** Never ship them, not even temporarily.

**21. Generic stock photography** of laptops, handshakes and glowing networks. *Fix:* photographs that belong to
the place and the product, with credits (see `imagery-and-icons.md`).

## Motion and behaviour

**22. Looping decorative animation.** Pulsing dots, shimmering borders, endlessly drifting shapes. *Fix:* motion
only when it carries meaning (content entering, a slideshow changing, a state changing).

**23. Carousels that ignore touch, reduced motion or sound.** *Fix:* pause for a mouse (never for a tap), stop while
audio from the slide plays, swipe on touch, arrow keys on the dots, no autoplay under `prefers-reduced-motion`.

**24. Scroll reveals that hide content.** *Fix:* only hide what is below the fold, and never when scripts fail or
reduced motion is on.

## Type, detail and fit

**25. One neutral sans for everything.** Headings at weight 600, body at 400, nothing else. *Fix:* give the page
a type system with a point of view: a quiet text face, one distinctive display face used in a few big moments, very
large or very light headlines, a wordmark per section. See `type-and-style.md`.

**26. The same fashionable display font every template uses.** Common choices are invisible. *Fix:* test eight or
more candidates in a real browser on the real words, pick the one that fits the product's character, and check that
its glyphs cover the languages the product needs.

**27. Fixed-width labels over variable-size controls.** A header label sized for a desktop button overlaps when touch
sizes enlarge the buttons. *Fix:* label and control in the same grid column; test with touch sizes forced.

**28. Checked at one width.** A page tested only at 390 px with a mouse. *Fix:* sweep 320 to 430 px plus 600 and 820,
force touch sizes, run the overflow audit, then ask for a check on a real phone.

## A last check

Squint at a screenshot. If you could swap the logo and the copy and it would fit any other product, it still
reads as generated. Add something only this product has.
