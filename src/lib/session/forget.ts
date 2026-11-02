import { notBuilt } from '@/lib/not_built';

/**
 * Forget (item **P-10**, flow `docs/ARCHITECTURE.md` §5.4).
 *
 * In-app this is total: reducer state, object URLs, in-flight requests, the session's
 * own `sessionStorage` entries. What it cannot do is clear what the *device* kept —
 * screen-reader history, clipboard, screenshots, bfcache, OS camera roll. The README
 * says so instead of this file pretending otherwise.
 *
 * Dependencies are injected so the test can prove each one was called, and so this
 * stays runnable in Node (no `URL.revokeObjectURL` there).
 */
export interface ForgetTargets {
  inFlight: AbortController[];
  objectUrls: string[];
  /** Only keys this session created. Never wipe someone else's storage. */
  sessionStorageKeys: string[];
  revokeObjectUrl: (url: string) => void;
  removeSessionItem: (key: string) => void;
}

export interface ForgetReport {
  aborted: number;
  revoked: number;
  cleared: number;
}

export function forgetSession(_targets: ForgetTargets): ForgetReport {
  return notBuilt('P-10', 'Forget') as never;
}
