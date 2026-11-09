# ANTI-AI FRONTEND UI

An agent skill that helps an AI coding assistant build frontend UI that does not look AI-generated.

Generated interfaces share a look: a glowing badge over the headline, gradient washes, rows of identical rounded
cards, tilted floating cards, pill-shaped bar charts, slogan copy. This skill replaces those defaults with four
habits: **fidelity** to the product's real brand, **study** of a real reference in a real browser,
**specificity** (real content, licensed photos, real icons) and **restraint**.

It works in any frontend stack (plain HTML and CSS, React, Vue, Svelte, Angular, Astro, server templates): it detects the project's stack, or asks which one to use before it builds anything.

It was written from a live design session, where each rule came from a correction.

## What is inside

```
SKILL.md                       the skill: non-negotiables, workflow, fast replacements, section recipes
references/ai-tells.md         28 tells, why they read as generated, the fix
references/study-a-reference.md  how to measure a reference site in a real browser (with scripts)
references/patterns.md         brand-agnostic CSS and React for the replacement patterns
references/copywriting.md      plain-copy rules with before and after
references/imagery-and-icons.md  licensed photos, credits, app-style icons
references/qa-checklist.md     small-phone sweep, touch, accessibility, Lighthouse and release checks
references/type-and-style.md   distinctive type and product-specific detail, without copying a reference
references/stacks.md           detect or ask for the stack; how each pattern translates to other frameworks
LICENSE                        MIT
```

## Install

Copy the folder into your skills directory so it is named `anti-ai-frontend-ui`:

```bash
# Claude Code, all projects
cp -r anti-ai-frontend-ui ~/.claude/skills/

# Claude Code, one project
cp -r anti-ai-frontend-ui <your-project>/.claude/skills/
```

Other agents that read `SKILL.md` files can use the same folder. The skill loads when you ask for UI work, say a
design "looks AI", or ask to match a reference site.

## Use

Ask for UI work as usual. The skill makes the assistant:

1. find out your stack (or ask), then read your brand tokens from the code and keep them exactly;
2. study the reference you name in a real browser and write an inventory before coding;
3. plan sections that each show one real artifact;
4. use real content, licensed photos with credits, and real app-style icons;
5. write plain copy;
6. add only meaningful motion;
7. test real viewports (a 320 to 430 px sweep with touch sizes forced), touch and keyboard, run Lighthouse, then report what it checked and what it did not.
8. give the page a point of view in type and detail: a quiet text face, a distinctive display face used sparingly, hand-made marks.

You can also invoke it by name: `/anti-ai-frontend-ui`.

## Principles in one line each

- Brand tokens are law. Borrow a reference's structure, never its words or pictures.
- Every section shows one real thing. No fake proof.
- No gradients, glows, tilted cards, pill bars, tinted icon chips or identical card grids.
- Copy reads like a colleague explaining, not a poster.
- It must work under a thumb as well as under a mouse, at 320 px as well as 390.
- One neutral sans everywhere is a tell. Find distinctive type by testing, not by habit.

## Contributing

Open an issue or pull request with a new tell (a screenshot helps), a pattern that replaces it, or a correction.
Keep the skill under about 250 lines and push detail into `references/`.

## Licence

MIT. See `LICENSE`.
