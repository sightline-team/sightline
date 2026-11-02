import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Native `<button>` with the project's sizing (AGENTS.md §8: at least 44×44 px,
 * visible focus, no gesture-only actions). No polymorphic `as` prop, no variants
 * nobody asked for.
 */
export function Button({ children, ...rest }: { children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest}>
      {children}
    </button>
  );
}
