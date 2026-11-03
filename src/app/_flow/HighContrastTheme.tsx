'use client';

import { useEffect } from 'react';
import { applyHighContrast } from '@/lib/settings';
import { useStoredSettings } from './useStoredSettings';

/**
 * Applies the high-contrast theme from **A-15** to the document root, where `globals.css` defines
 * it (`:root[data-high-contrast='true']`). Rendered by `layout.tsx` rather than the settings page,
 * because the theme is a property of the whole app: it must survive the move to the results view
 * and come back after a reload, and one control cannot be trusted to repaint a screen it is not on.
 *
 * It renders nothing. The change it makes is to `document.documentElement`, so it is a DOM write in
 * an effect rather than a state set — which is the form the lint rule allows, and the only form that
 * can touch an element outside React's tree (`<html>`).
 *
 * **The limit worth knowing:** this runs after the first paint, so a reload with the theme on shows
 * the default colours for one frame before the black-and-yellow ones arrive. The fix would be an
 * inline script in the document head; `next.config.ts`'s CSP does allow `'unsafe-inline'` for
 * scripts, but AGENTS.md §7 keeps scripts out of the shell and a one-frame flash is the smaller
 * problem than a bootstrap an auditor has to reason about. **A-08** is the item that looks at the
 * theme on a real screen.
 */
export function HighContrastTheme() {
  const { highContrast } = useStoredSettings();

  useEffect(() => {
    applyHighContrast(highContrast);
  }, [highContrast]);

  return null;
}
