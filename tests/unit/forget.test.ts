import { describe, expect, it } from 'vitest';
import { forgetSession, sessionKeysOwnedBy, SESSION_STORAGE_PREFIX, type ForgetTargets } from '@/lib/session/forget';

/**
 * Forget (item **P-10**).
 *
 * Everything here is injected — that is the point. `docs/ARCHITECTURE.md` §5.4 names four
 * things a Forget press must do, and a test that cannot see the collaborator cannot prove it
 * was called. The browser side of the seam (`window.sessionStorage`, `URL.revokeObjectURL`) is
 * wired in `lib/session/store.tsx` and proved in a real browser by `tests/e2e/flow.spec.ts`;
 * vitest runs in Node, where neither exists.
 */

interface Calls {
  order: string[];
  revoked: string[];
  removed: string[];
}

function harness(overrides: Partial<ForgetTargets> = {}): { targets: ForgetTargets; calls: Calls } {
  const calls: Calls = { order: [], revoked: [], removed: [] };
  const targets: ForgetTargets = {
    inFlight: [],
    objectUrls: [],
    sessionStorageKeys: [],
    revokeObjectUrl: (url) => {
      calls.order.push('revoke');
      calls.revoked.push(url);
    },
    removeSessionItem: (key) => {
      calls.order.push('remove');
      calls.removed.push(key);
    },
    ...overrides,
  };
  return { targets, calls };
}

describe('forgetSession', () => {
  it('aborts every request that was still running', () => {
    const first = new AbortController();
    const second = new AbortController();
    const { targets } = harness({ inFlight: [first, second] });

    const report = forgetSession(targets);

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(report.aborted).toBe(2);
  });

  it('revokes each object URL with the exact string it was given', () => {
    const { targets, calls } = harness({ objectUrls: ['blob:http://localhost/one', 'blob:http://localhost/two'] });

    forgetSession(targets);

    expect(calls.revoked).toEqual(['blob:http://localhost/one', 'blob:http://localhost/two']);
  });

  it('removes each key it was handed, and nothing else', () => {
    const storage = fakeStorage(['sightline.apiKey', 'someone.elses.key', 'sightline.draft']);
    const { targets, calls } = harness({ sessionStorageKeys: sessionKeysOwnedBy(storage) });

    forgetSession(targets);

    expect(calls.removed).toEqual([`${SESSION_STORAGE_PREFIX}apiKey`, `${SESSION_STORAGE_PREFIX}draft`]);
    expect(storage.map.has('someone.elses.key')).toBe(true);
  });

  it('aborts before it clears anything, so a running request cannot write the data back', () => {
    const controller = new AbortController();
    const { targets, calls } = harness({
      inFlight: [controller],
      objectUrls: ['blob:x'],
      sessionStorageKeys: ['sightline.a'],
    });
    // The order the work happens in is the property, not an implementation detail: an abort that
    // lands after the clear leaves the response free to repopulate a screen the user emptied.
    controller.signal.addEventListener('abort', () => calls.order.unshift('abort'));

    forgetSession(targets);

    expect(calls.order.slice(0, 3)).toEqual(['abort', 'revoke', 'remove']);
    expect(calls.order).toHaveLength(3);
  });

  it('attempts every collaborator even when one throws, and counts what failed', () => {
    const storage = fakeStorage(['sightline.a', 'sightline.b', 'sightline.c']);
    const keys = sessionKeysOwnedBy(storage);
    const { targets, calls } = harness({
      objectUrls: ['blob:survives', 'blob:throws'],
      sessionStorageKeys: keys,
      revokeObjectUrl: (url) => {
        if (url === 'blob:throws') throw new Error('no revoke in this browser');
        calls.revoked.push(url);
      },
    });

    const report = forgetSession(targets);

    // The first revoke failing must not swallow the second URL, nor any of the three keys: this
    // is the whole reason the count exists. `sessionStorage.removeItem` genuinely throws in some
    // private-browsing modes, and a Forget that stopped there would leave two keys behind under a
    // screen that said the document was gone.
    expect(calls.revoked).toEqual(['blob:survives']);
    expect(report.revoked).toBe(1);
    expect(calls.removed).toEqual(keys);
    expect(report.cleared).toBe(3);
    expect(report.failed).toBe(1);
  });

  it('reports zeros and calls nothing when the session holds nothing', () => {
    const { targets, calls } = harness();

    const report = forgetSession(targets);

    expect(report).toEqual({ aborted: 0, revoked: 0, cleared: 0, failed: 0 });
    expect(calls.order).toEqual([]);
  });

  it('holds the report to numbers, so nothing document-derived can ride out of it into a log', () => {
    const { targets } = harness({
      inFlight: [new AbortController()],
      objectUrls: ['blob:doc'],
      sessionStorageKeys: ['sightline.apiKey'],
    });

    const report = forgetSession(targets);

    expect(Object.values(report).every((value) => typeof value === 'number')).toBe(true);
    expect(JSON.stringify(report)).not.toContain('blob:doc');
    expect(JSON.stringify(report)).not.toContain(SESSION_STORAGE_PREFIX);
  });
});

describe('sessionKeysOwnedBy', () => {
  it('takes only what starts with the app prefix', () => {
    const storage = fakeStorage(['sightline.apiKey', 'theme', 'sightline.rate', 'notmine']);

    expect(sessionKeysOwnedBy(storage)).toEqual([`${SESSION_STORAGE_PREFIX}apiKey`, `${SESSION_STORAGE_PREFIX}rate`]);
  });

  it('does not match a near-miss — the prefix mid-string, or the wrong separator', () => {
    const storage = fakeStorage(['other.sightline.apiKey', 'sightline:apiKey', 'sightline']);

    expect(sessionKeysOwnedBy(storage)).toEqual([]);
  });

  it('reads without removing, so the caller can delete the whole list it is given', () => {
    const storage = fakeStorage(['sightline.a', 'sightline.b', 'sightline.c']);
    // Deleting while walking `Storage` by index shifts every later slot, so a scan that removed
    // as it went would silently skip a key. Collecting first is what makes the pair safe.
    const keys = sessionKeysOwnedBy(storage);

    expect([...storage.map.keys()]).toEqual(['sightline.a', 'sightline.b', 'sightline.c']);
    for (const key of keys) storage.map.delete(key);
    expect(storage.map.size).toBe(0);
  });

  it('returns nothing for an empty store, and nothing that is not ours', () => {
    expect(sessionKeysOwnedBy(fakeStorage([]))).toEqual([]);
    expect(sessionKeysOwnedBy(fakeStorage(['only.a.foreign.key']))).toEqual([]);
  });
});

/** A `Storage`-shaped double: vitest runs in Node, where there is no `sessionStorage`. */
function fakeStorage(entries: string[]): { map: Map<string, string>; length: number; key(i: number): string | null } {
  const map = new Map(entries.map((key) => [key, 'value']));
  const list = [...map.keys()];
  return {
    map,
    get length() {
      return list.length;
    },
    key: (i: number) => list[i] ?? null,
  };
}
