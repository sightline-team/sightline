import { describe, expect, it } from 'vitest';
import {
  applyHighContrast,
  DEFAULT_HIGH_CONTRAST,
  DEFAULT_SPEECH_RATE,
  describeRate,
  parseStoredSettings,
  SETTINGS_STORAGE_KEY,
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  SPEECH_RATE_OPTIONS,
  speechRate,
  updateSettings,
  type SettingsIO,
} from '@/lib/settings';

/**
 * The settings writer (item **A-15**).
 *
 * `localStorage` does not exist in Node, so both halves are injected and these tests watch what
 * reaches storage. The reason a writer needs tests at all is that the reader is already trusted by
 * P-09: a bad read costs one default speed, a bad write lands in the blob that every later read
 * parses. Two of these tests are therefore about the *round trip* — write with the writer, read with
 * `speechRate()` — because the contract P-09 left for A-15 was "the same blob the app already reads",
 * and a schema drift between the two halves would pass every test that only checks one side.
 * The controls themselves are proved in a browser in `tests/e2e/flow.spec.ts`.
 */

interface FakeStore {
  blob(): string | null;
  writes(): number;
  readonly io: SettingsIO;
}

function store(initial?: string): FakeStore {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(SETTINGS_STORAGE_KEY, initial);
  let writes = 0;
  return {
    blob: () => data.get(SETTINGS_STORAGE_KEY) ?? null,
    writes: () => writes,
    io: {
      read: (key) => data.get(key) ?? null,
      write: (key, value) => {
        writes += 1;
        data.set(key, value);
      },
    },
  };
}

describe('the stored shape', () => {
  it('reads a rate out of a blob that has no contrast field', () => {
    // The blob P-09 shipped with: one field. An A-15 that made both required would silently
    // downgrade every existing reader to normal speed.
    expect(parseStoredSettings('{"speechRate":1.4}')).toEqual({
      speechRate: 1.4,
      highContrast: DEFAULT_HIGH_CONTRAST,
    });
  });

  it('reads a contrast choice out of a blob that has no rate', () => {
    expect(parseStoredSettings('{"highContrast":true}')).toEqual({
      speechRate: DEFAULT_SPEECH_RATE,
      highContrast: true,
    });
  });

  it('gives defaults for nothing stored, and for a blob that is not JSON', () => {
    expect(parseStoredSettings(null)).toEqual({ speechRate: 1, highContrast: false });
    expect(parseStoredSettings('not json at all')).toEqual({ speechRate: 1, highContrast: false });
  });

  it('still ignores a sibling it does not know', () => {
    expect(parseStoredSettings('{"speechRate":1.4,"mode":"relay"}').speechRate).toBe(1.4);
  });
});

describe('updateSettings', () => {
  it('writes both fields, so the blob is always whole', () => {
    const target = store();
    const result = updateSettings({ speechRate: 1.5 }, target.io);

    expect(result.saved).toBe(true);
    expect(JSON.parse(target.blob() ?? '')).toEqual({ speechRate: 1.5, highContrast: false });
  });

  it('keeps the sibling it was not asked to change', () => {
    // The bug this exists to stop: a rate control that wrote `{ speechRate }` alone would turn
    // someone's high-contrast theme off every time they slowed the voice down.
    const target = store('{"speechRate":1,"highContrast":true}');
    updateSettings({ speechRate: 0.75 }, target.io);

    expect(JSON.parse(target.blob() ?? '')).toEqual({ speechRate: 0.75, highContrast: true });
  });

  it('hands the new value straight to the reader P-09 built', () => {
    const target = store();
    updateSettings({ speechRate: 2 }, target.io);

    expect(speechRate(target.io.read)).toBe(2);
  });

  it('refuses a rate the reader would reject, and files nothing', () => {
    for (const bad of [SPEECH_RATE_MAX + 0.5, SPEECH_RATE_MIN - 0.1, 0, -1]) {
      const target = store('{"speechRate":1,"highContrast":true}');
      expect(() => updateSettings({ speechRate: bad }, target.io)).toThrow();
      expect(target.blob()).toBe('{"speechRate":1,"highContrast":true}');
      expect(target.writes()).toBe(0);
    }
  });

  it('refuses a value of the wrong type rather than storing the string "yes"', () => {
    const target = store();
    // `as never` is why this is a runtime check and not only a type error: the blob is writable by
    // anything on the origin, and a control wired to the wrong field is a mistake someone can make.
    expect(() => updateSettings({ highContrast: 'yes' as never }, target.io)).toThrow();
    expect(target.blob()).toBeNull();
  });

  it('reports that nothing was saved when the browser throws, and changes nothing', () => {
    // Real in some private-browsing modes (`lib/session/forget.ts` meets the same behaviour in
    // `removeItem`). The point is the `saved: false`: the page must not say "Saved".
    const refusing: SettingsIO = {
      read: () => '{"speechRate":1,"highContrast":false}',
      write: () => {
        throw new Error('SecurityError');
      },
    };
    const result = updateSettings({ highContrast: true }, refusing);

    expect(result.saved).toBe(false);
    expect(result.settings).toEqual({ speechRate: 1, highContrast: true });
  });

  it('reports that nothing was saved where there is no storage at all', () => {
    expect(updateSettings({ speechRate: 1.5 }, { read: null, write: null }).saved).toBe(false);
  });

  it('drops a key that is not a setting rather than preserving it', () => {
    const target = store('{"speechRate":1.2,"invoiceTotal":"£400"}');
    updateSettings({ speechRate: 1 }, target.io);

    expect(target.blob()).toBe('{"speechRate":1,"highContrast":false}');
  });

  it('writes under the app’s own storage prefix', () => {
    expect(SETTINGS_STORAGE_KEY.startsWith('sightline.')).toBe(true);
  });
});

describe('the offered speeds', () => {
  it('are all inside the range the reader accepts', () => {
    for (const option of SPEECH_RATE_OPTIONS) {
      expect(option.value).toBeGreaterThanOrEqual(SPEECH_RATE_MIN);
      expect(option.value).toBeLessThanOrEqual(SPEECH_RATE_MAX);
    }
  });

  it('name the default speed, so an untouched app has a selected control', () => {
    expect(SPEECH_RATE_OPTIONS.map((option) => option.value)).toContain(DEFAULT_SPEECH_RATE);
  });

  it('each say something different, in the order a reader hears them', () => {
    expect(SPEECH_RATE_OPTIONS.map((option) => option.label)).toEqual([
      'Slow',
      'Normal',
      'Fast',
      'Very fast',
    ]);
  });

  it('describes an offered speed by its word', () => {
    expect(describeRate(1.5)).toBe('Fast');
  });

  it('describes a speed nobody offers by its number, instead of naming the nearest one', () => {
    // Reachable: the blob is writable by anything on the origin, and P-09's e2e writes 1.8 to prove
    // the rate is read per press. Saying "Fast" here would misreport the voice the user is hearing.
    expect(describeRate(1.8)).toBe('1.8 times normal speed');
  });
});

describe('applyHighContrast', () => {
  it('does nothing where there is no document', () => {
    // `layout.tsx` imports the component that calls this, and Next renders the layout on the server
    // first, so the guard is load-bearing rather than defensive.
    expect(() => applyHighContrast(true)).not.toThrow();
  });
});
