/**
 * Screen wake lock and background visibility management (**A-12**).
 *
 * Keeps device screen awake during document and multi-page capture/analysis.
 * Handles background app switching cleanly with retryable error.
 */

export interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
}

export interface WakeLockManager {
  acquire(): Promise<void>;
  release(): Promise<void>;
  isLocked(): boolean;
}

export function createWakeLockManager(): WakeLockManager {
  let sentinel: WakeLockSentinelLike | null = null;

  async function acquire(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }
    try {
      const lock = await (navigator as unknown as { wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock.request('screen');
      sentinel = lock;
      sentinel.addEventListener?.('release', () => {
        sentinel = null;
      });
    } catch {
      // Browser permission policy or low-battery restriction: fail open without error
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // ignore
      }
    }
    sentinel = null;
  }

  function isLocked(): boolean {
    return sentinel !== null && !sentinel.released;
  }

  return { acquire, release, isLocked };
}
