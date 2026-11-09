# Imagery and icons

Real pictures and real icons are the second fastest way to move a page away from "generated". Salad-style
sites use physical, textured photographs and recognisable product icons; thin line icons in tinted chips and
glowing abstract art are the opposite.

## Photography

### Choosing

- Pick photographs that belong to the product's place and subject: the city, the materials, the people on the
  phone, the textiles, the tools. Specific beats generic. Avoid laptops, handshakes and glowing networks.
- Textured, high-detail photographs make good artwork: folded cloth, rolled fabric, a street from above. A tall
  textured photo in the middle of a dark band is a strong, simple composition.
- Landscape cityscapes work as a grayscale hero texture. Do not put a face behind the headline.
- Do not pair a photo with a claim about the people or place in it that you cannot support. A stock photo of a
  person is atmosphere, not evidence; do not caption it as a customer.

### Sourcing and licences (do this in a real browser)

1. Search a free-licence library (Unsplash, Pexels) in the browser tool.
2. Open **each chosen photo's own page** and confirm it says it is free to use under the library's licence. Skip
   anything marked premium or with a plus badge (for example Unsplash+): those are paid.
3. Record, for each photo: page URL, title, photographer name and handle, the date checked.
4. Ask the user before downloading: list filename, source and approximate size.
5. If the shell blocks the download, download through the browser (fetch the image and trigger a save from a
   button the user's click or yours activates), then copy the file from the Downloads folder into the project.
   Browsers block several automatic downloads in a row; use a real click per file.
6. Resize to the largest size you need (about 1400 to 1800 px wide), JPEG or WebP, quality about 75.
7. Write `public/images/CREDITS.md` with the table from step 3 and the licence wording. Put a one-line credit in
   the footer.
8. Photos that show identifiable people: the library licence does not always cover a person's likeness in every
   use. Note that in the credits file and get a model release before using them in paid advertising.

### Using them

- Use the framework's image component with real `width`, `height` and `sizes`. Preload only the hero image.
- Content images get real alt text. Decorative ones get `alt=""`.
- Crop with CSS (`object-fit: cover`, `aspect-ratio`); keep the original uncropped.
- Treat photos consistently: either all natural colour or all grayscale-and-multiply on a tinted band, per place.

## Icons

### What to avoid

Thin outline icons from a popular icon set inside a rounded square tinted with the brand colour. That chip is the
most common generated-UI icon treatment.

### What to use

- **The brand's own mark** for brand cards (white mark on a flat brand-colour tile).
- **App-style flat tiles** for objects that are really that thing: a green phone tile with a white handset, a red
  recorder tile, an orange clock tile. Flat colour square, white glyph, radius about 15 px on a 50 px tile.
- **Real logos** of tools and providers where it is truthful and permitted (comparisons and integrations), using
  the provider's official asset and respecting its brand rules. Do not use a logo to imply a partnership.
- **Document-type icons** (audio file, PDF, spreadsheet) in lists of files, as real products do.
- **Round badges with codes** (EN, YO) for languages or categories, or a real flag where a country is meant.
- **A tick in a disc** for passed checks. Green is acceptable here because the meaning is "passed".
- **No icon at all** is better than a decorative one.

### Rules

- One style per page. Same tile size, same radius.
- Icons never carry meaning alone: pair with text or an `aria-label`.
- Decorative icons get `aria-hidden`.
- Inline SVG, `currentColor` for strokes; keep the path data short and cleaned.
