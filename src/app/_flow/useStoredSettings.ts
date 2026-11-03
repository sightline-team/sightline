'use client';

import { useSyncExternalStore } from 'react';
import { parseStoredSettings, readSettingsRaw, subscribeToSettings, type StoredSettings } from '@/lib/settings';

/**
 * The stored settings, kept in step with every write — from this tab or another.
 *
 * `useSyncExternalStore` rather than an effect that calls `setState`, for the reason P-10 recorded
 * in `src/features/paste/PasteView.tsx`: `react-hooks/set-state-in-effect` rejects the effect form,
 * and its argument is right here too — the render between the effect and the state update shows the
 * old value. The snapshot is the **raw string** because React compares snapshots by identity, and a
 * freshly parsed object would look like a change on every render.
 *
 * The server snapshot is `null`, so a server render produces the defaults and the client's first
 * read is applied after hydration. That is what lets the layout's theme applier and the settings page
 * share one source of truth without lying about what the markup contained at render time.
 */
function serverSnapshot(): string | null {
  return null;
}

export function useStoredSettings(): StoredSettings {
  const raw = useSyncExternalStore(subscribeToSettings, readSettingsRaw, serverSnapshot);
  return parseStoredSettings(raw);
}
