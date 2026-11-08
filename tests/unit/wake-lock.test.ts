import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createWakeLockManager, type WakeLockSentinelLike } from '@/lib/a11y/wake_lock';

describe('wake lock manager (A-12)', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('acquires and releases wake lock when navigator.wakeLock is supported', async () => {
    let released = false;
    const sentinel: WakeLockSentinelLike = {
      get released() {
        return released;
      },
      release: vi.fn(async () => {
        released = true;
      }),
    };

    const requestMock = vi.fn(async () => sentinel);

    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: requestMock } },
      writable: true,
      configurable: true,
    });

    const manager = createWakeLockManager();
    expect(manager.isLocked()).toBe(false);

    await manager.acquire();
    expect(requestMock).toHaveBeenCalledWith('screen');
    expect(manager.isLocked()).toBe(true);

    await manager.release();
    expect(sentinel.release).toHaveBeenCalled();
    expect(manager.isLocked()).toBe(false);
  });

  it('fails open gracefully when wakeLock API is unsupported or throws', async () => {
    // 1. wakeLock missing
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const manager1 = createWakeLockManager();
    await expect(manager1.acquire()).resolves.toBeUndefined();
    expect(manager1.isLocked()).toBe(false);

    // 2. wakeLock throws (e.g. low power mode or permissions policy)
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: vi.fn(async () => {
            throw new Error('NotAllowedError');
          }),
        },
      },
      writable: true,
      configurable: true,
    });

    const manager2 = createWakeLockManager();
    await expect(manager2.acquire()).resolves.toBeUndefined();
    expect(manager2.isLocked()).toBe(false);
    await expect(manager2.release()).resolves.toBeUndefined();
  });

  it('tracks external release event', async () => {
    let released = false;
    let releaseListener: (() => void) | undefined;

    const sentinel: WakeLockSentinelLike = {
      get released() {
        return released;
      },
      release: vi.fn(async () => {
        released = true;
      }),
      addEventListener: vi.fn((_type: 'release', listener: () => void) => {
        releaseListener = listener;
      }),
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: {
          request: vi.fn(async () => sentinel),
        },
      },
      writable: true,
      configurable: true,
    });

    const manager = createWakeLockManager();
    await manager.acquire();
    expect(manager.isLocked()).toBe(true);

    // Simulate system releasing lock (e.g., user minimized browser)
    released = true;
    releaseListener?.();
    expect(manager.isLocked()).toBe(false);
  });
});
