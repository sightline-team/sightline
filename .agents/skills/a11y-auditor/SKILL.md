---
name: a11y-auditor
description: >-
  Audit and verify accessibility (WCAG 2.2 AA) for Sightline UI components and flows. Use when
  building or modifying screens, navigation, forms, buttons, announcer messages, themes, or
  testing with screen readers and Playwright axe.
---

# Sightline Accessibility Auditor

Use this skill when developing or reviewing frontend UI, screen-reader interactions, and visual styling.

## Core Accessibility Rules for Sightline

1. **Native HTML First**:
   - Use `<button>`, `<label>`, `<details>`, `<input>`, headings, and landmark regions.
   - Use ARIA only when native HTML cannot express the requirement.

2. **Single Announcer Coordination (`src/lib/a11y/announcer.tsx`)**:
   - Every status change must go through the single announcer.
   - Crucial: The live region holds one message. If multiple notices occur in one action (e.g. capture issues + missing page holes + label warnings), concatenate them into a single string. Never call `announce()` multiple times in the same tick.

3. **Focus Management**:
   - Move focus to the primary heading (`h1` or `h2`) of the newly loaded view upon navigation.
   - On error or validation refusal, move focus to the error summary container.

4. **Strict Results Screen Order**:
   - Follow exact heading sequence:
     1. Summary
     2. Key facts
     3. What you may need to do
     4. Warnings
     5. Full text
     6. Ask a question
     7. Verification (receipt link to `/trust`)

5. **Visual Standards & Tokens (`src/app/globals.css`)**:
   - Interactive touch targets must meet `--target: 44px` (44×44px minimum).
   - Minimum 4.5:1 contrast across all palettes (standard, high-contrast, dark mode).
   - Honor `prefers-reduced-motion` and `prefers-contrast`.

6. **Verification Tests**:
   - Run `npx playwright test tests/e2e/design.spec.ts` for automated axe contrast and geometry checks.
   - Run `npx playwright test tests/e2e/flow.spec.ts` for full navigation and focus flow.
