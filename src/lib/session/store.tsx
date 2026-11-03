'use client';

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { forgetSession, sessionKeysOwnedBy, type ForgetReport } from '@/lib/session/forget';
import { initialSession, sessionReducer, type SessionAction } from '@/lib/session/reducer';
import type { Mode, Session } from '@/types';

/**
 * The one session store (item **P-05**, shape owned by `lib/session/reducer.ts`).
 *
 * Memory only, as ADR-8 requires: there is no database, nothing is written to storage here,
 * and a full page load loses the document — which is why the shell navigates with
 * `next/link`. The reducer owns the state shape and the page cap; this provider owns the
 * React plumbing and the in-flight request registry.
 *
 * The registry exists because **Forget** (P-10) has to abort every running request, and
 * because a run the app cannot stop is a run whose bytes are still leaving the device after
 * the user pressed the button. A run asks for its own `AbortController` here rather than
 * creating one privately, so nothing can escape the list.
 */
export interface SessionStore {
  session: Session;
  dispatch: Dispatch<SessionAction>;
  /** A controller for one pipeline run, registered until the run finishes. */
  beginRun(): AbortController;
  /** Called by the run when it ends, success or failure. */
  endRun(controller: AbortController): void;
  activeRunCount(): number;
  /**
   * An object URL this session created, so Forget can revoke it. Its first producer is the
   * capture previews (C-02); until one exists the list is honestly empty rather than assumed.
   */
  trackObjectUrl(url: string): void;
  /**
   * Forget (P-10): abort what is running, revoke what was made, clear the session's own
   * storage keys, and reset the reducer. Returns what was actually done, because the caller
   * has to say so out loud and a count nobody computed cannot be spoken.
   */
  forget(): ForgetReport;
}

const SessionContext = createContext<SessionStore | null>(null);

export function SessionProvider({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReducer, mode, initialSession);
  const runs = useRef<Set<AbortController>>(new Set());
  const objectUrls = useRef<Set<string>>(new Set());

  const beginRun = useCallback(() => {
    const controller = new AbortController();
    runs.current.add(controller);
    return controller;
  }, []);

  const endRun = useCallback((controller: AbortController) => {
    runs.current.delete(controller);
  }, []);

  const activeRunCount = useCallback(() => runs.current.size, []);

  const trackObjectUrl = useCallback((url: string) => {
    objectUrls.current.add(url);
  }, []);

  const forget = useCallback(() => {
    const report = forgetSession({
      inFlight: [...runs.current],
      objectUrls: [...objectUrls.current],
      // A store also renders on the server, where there is no browser storage to clear.
      sessionStorageKeys: typeof window === 'undefined' ? [] : sessionKeysOwnedBy(window.sessionStorage),
      revokeObjectUrl: (url) => URL.revokeObjectURL(url),
      removeSessionItem: (key) => window.sessionStorage.removeItem(key),
    });
    // Drained here rather than left in: the next document must not inherit the last one's
    // registrations, and `endRun` on a controller already aborted is a harmless delete.
    runs.current.clear();
    objectUrls.current.clear();
    dispatch({ type: 'forgotten' });
    return report;
  }, []);

  const value = useMemo(
    () => ({ session, dispatch, beginRun, endRun, activeRunCount, trackObjectUrl, forget }),
    [session, beginRun, endRun, activeRunCount, trackObjectUrl, forget],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionStore(): SessionStore {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionStore must be used inside SessionProvider (layout mounts it once).');
  }
  return ctx;
}
