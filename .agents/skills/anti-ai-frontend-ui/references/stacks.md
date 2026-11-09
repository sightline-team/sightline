# Any frontend stack: ask first, then build in it

The skill is about how a page looks and behaves, not about a framework. The same design is built in plain HTML, React,
Vue, Svelte, Angular, Astro, a server-rendered template or a web component. What changes is the syntax. The tokens,
the markup structure, the CSS, the copy and the QA do not.

## Step 1: find out the stack, and ask when it is not obvious

Look before asking. Read, in this order:

1. `package.json` (dependencies and scripts), `composer.json`, `Gemfile`, `pyproject.toml`, `go.mod`.
2. Framework config: `next.config.*`, `nuxt.config.*`, `svelte.config.*`, `astro.config.*`, `angular.json`,
   `vite.config.*`, `tailwind.config.*`, `postcss.config.*`.
3. File extensions in the source folder: `.tsx`, `.vue`, `.svelte`, `.astro`, `.html`, `.erb`, `.blade.php`, `.njk`.
4. How styles are written: one global stylesheet, CSS modules, SCSS, Tailwind classes, styled components, a component
   library.

If the project already has a stack, use it and say which one in one line ("Building in Next.js with plain CSS").
Never introduce a second framework or a new styling system into an existing project.

**If it is a new project, or the stack is unclear, ask before writing code.** Ask once, as a short list the person can
answer in a line:

> Which stack should I build this in?
> 1. Framework or language (for example plain HTML/CSS/JS, React or Next.js, Vue or Nuxt, Svelte or SvelteKit, Angular,
>    Astro, a server template such as Rails, Django, Laravel or Express, something else).
> 2. How styles are written (plain CSS, SCSS, CSS modules, Tailwind, a component library).
> 3. Is it one static page, a multi-page site or part of an app? Where will it be hosted?

If the person says "whatever is best", recommend one with a single sentence of reasoning (a static marketing page: plain
HTML and CSS or Astro; an app with state: the framework the team already knows) and proceed.

## Step 2: keep these identical in every stack

- **Tokens as CSS custom properties** on `:root`, with the brand values read from the product. Tailwind: put the same
  values in the theme (`theme.extend.colors`, `fontFamily`) and reference them; do not invent new colours.
- **Semantic markup.** `header`, `nav`, `main`, `section`, `footer`, `h1` once, native `details` for FAQs, real
  `button` and `a` elements.
- **The CSS patterns** in `patterns.md` are plain CSS and work everywhere. In CSS-in-JS, CSS modules or Tailwind, copy the
  declarations, not the class names.
- **Behaviour rules**: pointer events, touch sizes, reduced motion, focus handling, the touch version of hover effects.
- **QA**: the small-phone sweep, Lighthouse, the overflow audit and the rest of `qa-checklist.md`.

## Step 3: translate the behaviours

Each interactive pattern is a small state machine plus a few browser APIs. Write it in the idiom of the stack.

| Pattern | Browser API underneath | Plain JS | React | Vue | Svelte | Angular |
|---|---|---|---|---|---|---|
| Scroll reveal | one shared `IntersectionObserver` | module-level observer, `data-reveal` attribute | `useEffect` + ref, observer outside the component | `onMounted` + template ref (or a directive) | an `action` (`use:reveal`) | a directive with `ngAfterViewInit` |
| Slideshow | timer, pointer events, swipe | `setTimeout` loop and listeners | `useEffect` with cleanup | `watch` + `onUnmounted` | `$effect` / `onDestroy` | component with RxJS `timer` or `setTimeout` |
| Mobile menu, modal, bottom sheet | focus trap, Escape, `aria-*` | a small module, or the native `<dialog>` | state + effect, portal for the modal | `Teleport` | `<dialog>` or portal action | CDK overlay or native `<dialog>` |
| Hover or touch spotlight | `pointermove`, `requestAnimationFrame`, `transform` | listeners on the hero | ref + effect | ref + `onMounted` | action | directive |
| Audio player | one shared audio element or store | module state | a small external store or context | `provide/inject` or a store | a store | a service |

Rules that hold in every stack:

- Create observers, timers and listeners in the mount hook and remove them in the unmount hook.
- Do the per-frame work with `transform` and `opacity` outside the framework's render cycle (write to the element
  directly); do not set reactive state on every pointer move.
- Content must exist in the server-rendered or static HTML. Reveal classes are added after load, so the page is
  readable with scripts off.
- Prefer the platform: `<dialog>`, `<details>`, CSS `scroll-snap`, `:has()`, `@container`, `prefers-reduced-motion`
  before a library.

## Step 4: fonts, images and builds per stack

| Concern | Plain HTML | Next.js | Nuxt | SvelteKit / Astro / Vite |
|---|---|---|---|---|
| Fonts | `<link>` to the font host with `display=swap` and a `preconnect`, or self-host with `@font-face` | `next/font` (set `preload: false` for below-the-fold faces) | `@nuxt/fonts` or `@font-face` | `@fontsource/*` packages or `@font-face` with `font-display: swap` |
| Responsive images | `<img srcset sizes width height loading="lazy">`, `<picture>` | `next/image` with an honest `sizes` | `<NuxtImg>` / `@nuxt/image` | Astro `<Image>`, `vite-imagetools`, or `srcset` by hand |
| Hero image | `fetchpriority="high"`, no lazy loading | `priority` | `preload` | `fetchpriority="high"` |
| Build + test | open the file or a static server | `next build` then `next start` | `nuxt build` then preview | `vite build` / `astro build` then preview |

Always test the production build, not only the dev server: image sizes, font loading and some CSS ordering differ.

For server-rendered templates (Rails, Django, Laravel, Express with a template engine), keep behaviour in one small
JavaScript file and the design in one stylesheet, and use the template engine only for content.

## Step 5: say what you chose

Open the report with the stack, the styling approach and how to run it. If you used a library the project did not
have, say why and how to remove it. If something in `patterns.md` was written for React and you translated it, say
so, so the next person knows the original shape.
