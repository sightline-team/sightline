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

/**
 * Every `sessionStorage` key this app writes starts with this, and it is the only thing that
 * decides what Forget is allowed to remove — a browser store is shared with anything else on
 * the origin, and wiping keys that are not ours is not our data to clear. T-13 (Mode A's key)
 * and A-15 (settings) must store under it or their values survive Forget by construction.
 */
export const SESSION_STORAGE_PREFIX = 'sightline.';

export interface ForgetReport {
  aborted: number;
  revoked: number;
  cleared: number;
  /**
   * Collaborators that threw. Counted rather than swallowed: `sessionStorage.removeItem`
   * genuinely fails in some private-browsing modes, and a report that said `cleared: 3` when
   * only two were removed is this project's worst failure — a control claiming it cleaned up
   * when it did not.
   */
  failed: number;
}

export function forgetSession(targets: ForgetTargets): ForgetReport {
  // Aborting comes first, and it is what makes the rest safe. A request still in flight can
  // put document data back into state and into storage *after* this function cleared them, so
  // the order is part of the guarantee rather than a style choice.
  const aborted = runEach(targets.inFlight, (controller) => controller.abort());
  const revoked = runEach(targets.objectUrls, (url) => targets.revokeObjectUrl(url));
  const cleared = runEach(targets.sessionStorageKeys, (key) => targets.removeSessionItem(key));

  return {
    aborted: aborted.done,
    revoked: revoked.done,
    cleared: cleared.done,
    failed: aborted.failed + revoked.failed + cleared.failed,
  };
}

/**
 * The keys this session is allowed to remove: ours, matched by prefix, and nobody else's.
 *
 * Read out of the live store instead of a registry the app maintains, because a value written
 * by another part of the build (Mode A's API key, T-13) must be found even if that part
 * forgot to register it. Collected before anything is removed — deleting while iterating
 * `Storage` by index shifts every later slot.
 */
export function sessionKeysOwnedBy(storage: Pick<Storage, 'length' | 'key'>): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(SESSION_STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

function runEach<T>(items: readonly T[], action: (item: T) => void): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  // Every item is attempted even if one throws; stopping at the first failure would leave the
  // rest of the document's data in the browser under a screen that said it was forgotten.
  for (const item of items) {
    try {
      action(item);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed };
}
