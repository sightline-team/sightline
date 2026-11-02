'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The single announcer (item **F-08**). AGENTS.md §8: every status change goes
 * through this one `aria-live` region — two announcers make a screen reader read the
 * same sentence twice, and a silent transition means a blind user does not know the
 * app moved.
 *
 * Deliberately minimal: one polite region, one message at a time. Two parts of F-08
 * are still open and must be checked with a real screen reader, not assumed:
 * re-announcing an *identical* message (some readers skip it unless the region is
 * emptied in between) and paced progress (about every 10 s, not per tick).
 */
export interface Announcer {
  announce(message: string): void;
  clear(): void;
}

const AnnouncerContext = createContext<Announcer | null>(null);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');

  const announce = useCallback((next: string) => setMessage(next), []);
  const clear = useCallback(() => setMessage(''), []);

  const value = useMemo(() => ({ announce, clear }), [announce, clear]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <p role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {message}
      </p>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): Announcer {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) {
    throw new Error('useAnnouncer must be used inside AnnouncerProvider (layout mounts it once).');
  }
  return ctx;
}
