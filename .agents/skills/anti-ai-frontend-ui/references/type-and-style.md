# Type and styling with a point of view

A page set in one neutral sans at three weights, with identical rounded cards, reads as generated even when every
other rule is followed. People feel it before they can say why: nothing on the page could only belong to this
product. This file is about giving the page a voice in type and in small drawn details.

It does **not** name a font to use. Any font that every generator reaches for is the wrong answer, and a font that
suited one product is not a template for the next. It gives a method for finding faces and details that are
unusual and still right for the product.

## The rule of precedence

1. If the brand already has typefaces, those are law. Use them everywhere the brand says to, and be distinctive
   with scale, weight, tracking and placement instead.
2. If the brand has none, or only a text face, add distinctive faces for display use only, and keep the text face
   quiet.
3. A reference site's custom lettering or artwork is never copied. If the reference uses a bespoke wordmark, find
   your own face and draw your own.

## Why the default fails

- One text family used for everything, headings at weight 600 and a size just above body. Nothing to remember.
- The same two or three display faces every template uses. Common faces are not wrong, they are invisible.
- Headings that are bold and tight. Real editorial and studio sites often do the opposite: very large, very light.

## Build a type system with three roles

| Role | Job | How to choose |
|---|---|---|
| Text face | Reading, UI, tables | Readable at 15 to 17 px on a phone, tabular numerals, several weights. Quiet on purpose. |
| Display face | A few big moments: section wordmarks, one statement, the footer name | The distinctive one. Test many. Used at 80 px and up, so a heavy or quirky shape is a feature. |
| Accent face (optional) | One designed card or one pull quote | Geometric or humanist, with a clearly different texture from the other two. Only where it carries meaning. |

Three families is the ceiling. Keep the display face to two or three places on the page so it stays special.

## How to find faces worth using

1. **Write down the product's character in words**: warm, technical, craft, institutional, playful, calm. Add where
   it lives (a city, a trade, a material). Choose faces that match those words, not faces that are fashionable.
2. **Collect 8 to 12 candidates** from a font library with a permissive licence. Include some you would not
   normally pick: chunky, condensed, high-contrast serif, soft slab, ultra-light, monoline, humanist with a
   quirk. At least half should look odd next to the text face.
3. **Build a specimen page in the real browser** (a throwaway HTML file, not a mock-up). Set the real words you
   will use ("Listen.", the real headline, a real number) at 90 px, then at 20 px, on the real background colour.
   Look at them on a phone-sized frame too.
4. **Judge in context**: does the shape survive at small sizes, do the figures look right, does the accent colour
   on a full stop still read, does it sit well beside the text face, do the accents and special characters the
   product needs exist (diacritics for Yoruba, Igbo or Vietnamese are a common failure).
5. **Pick one and reject the near-misses.** Write down why, so the next change does not drift back to the default.

## Moves that make type feel designed

- **Scale contrast.** Headlines at 56 to 170 px against 16 to 19 px body. Avoid the middle.
- **Weight contrast, in either direction.** Very light (200 to 300) at huge sizes with tight tracking, or a chunky
  display face for names. Not 600 everywhere.
- **Tracking by size.** About -0.045em from 60 px up, about -0.02em for subheads, 0 for body, +0.06em for small caps.
- **A wordmark per section.** A short name ("Listen.", "Voices.") in the display face, the full stop in the brand
  accent. It orients the reader and carries the voice.
- **A giant, very light product name in the footer**, clipped, at low opacity, over a dark photograph.
- **One designed card.** A single card set in a bold geometric face with a flat highlighter behind the key sentence
  and a hand-drawn arrow to the evidence. The rest of the page stays plain, which is why it works.
- **Numerals as content.** Large tabular figures in a results table are better than any icon.
- **Left-aligned long text, centred short statements.**

## Details that make styling feel specific

Look for what only this product's world has, and draw from it:

- **Pattern and artwork from the product's culture or subject**: textile, signage, architecture, instrument panels,
  maps, handwriting. Use licensed photographs of the real thing, cropped tall, as a band or a spine.
- **Hand-made marks**: a brush-drawn arrow (a filled shape that swells and tapers, never a thin stroke), an uneven
  highlighter, a hairline underline drawn once. Generate them from a curve and a width profile (see `patterns.md`).
- **Grain and photography instead of gradient.** Fine grain tinted with the brand hue, a grayscale photo multiplied
  into the brand colour.
- **A signature interaction, small and real.** A hover or touch that shows the photograph's true colours under the
  cursor or a finger; a slideshow with a prompt box that changes. One per page.
- **Alternating bands**: light, white, dark, grain. Rhythm comes from the bands, not from decoration.

## The test

Cover the logo and the product name. Could this be any product in the category? If yes, find the one face, one
drawn mark and one real photograph that only this product would have.

## Loading and performance

- Load display and accent faces with `preload: false` (or the equivalent) because they appear below the fold. Preload
  only what the first screen needs.
- `display: swap`, only the weights and subsets you use, no more than three families.
- Check the font actually loaded in the browser (`document.fonts.check`, or read the computed family and look at
  the screenshot) instead of trusting the CSS. A silent fallback to the system face is a common failure.
- Resist the urge to add a fourth face to fix a problem. Fix the scale or the weight.
