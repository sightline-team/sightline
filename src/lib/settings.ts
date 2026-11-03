import { z } from 'zod';

/**
 * The settings a user may keep after the tab closes (item **P-09** reads the first of them;
 * **A-15** builds the controls that write both).
 *
 * Two rules decide the shape of this file:
 *  - **Non-sensitive only.** `docs/ARCHITECTURE.md` §7 puts `Settings` in `localStorage`, which is
 *    the one storage a browser keeps across sessions and hands to every script on the origin. So
 *    only a number and a boolean may live here — never a document, a transcript, a quote, an
 *    image, or a key (AGENTS.md §4 rule 7; the Mode A key is `sessionStorage` and item **T-13**).
 *    A value stored here also survives Forget by design: a reading speed is not somebody's invoice.
 *  - **Untrusted input, even from ourselves.** `localStorage` is readable and writable by anything
 *    running on the origin, so a stale, tampered or hand-edited blob is data that gets validated,
 *    not trusted. A value that fails the schema falls back to the default rather than throwing:
 *    the reading speed is not worth crashing the results screen over, and a rate outside the
 *    engine's sane range is worse than the default.
 *
 * The *write* path is the mirror image and the reason it is not simply `setItem`: a bad **read**
 * costs one default, a bad **write** poisons every later read. So a patch is merged into the
 * validated current settings, the whole result is re-validated, and only then stored — and a patch
 * that fails validation throws instead of being filed away quietly.
 */

/** One blob, one key. The `sightline.` prefix is the storage convention ARCH §5.4 sets for the session's keys; the settings key follows it so one naming rule covers both stores. */
export const SETTINGS_STORAGE_KEY = 'sightline.settings';

/** `docs/ARCHITECTURE.md` §7: `speechRate: number // 0.5..2`. The bounds are the engine's useful range, not a preference. */
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;

/** Normal speed. Also the answer whenever a stored value is missing or unreadable. */
export const DEFAULT_SPEECH_RATE = 1;

/** Off. The app's default colours are the AA ones, so a theme nobody asked for is not applied. */
export const DEFAULT_HIGH_CONTRAST = false;

/**
 * The speeds the settings page offers, and the only ones it writes.
 *
 * Four named choices rather than a slider because the value is spoken, not seen: a screen reader
 * announces "Fast" from a real `<label>`, and announces "1.35" from a range input, which is a
 * number with no meaning until somebody has tried it. The stored field stays a number in 0.5–2, so
 * a value that arrived from somewhere else (a hand-edited blob, an older build) is still read and
 * still honoured by `speechRate()` — `describeRate` names it instead of pretending it is one of
 * these four.
 */
export interface SpeechRateOption {
  value: number;
  label: string;
}

export const SPEECH_RATE_OPTIONS: readonly SpeechRateOption[] = [
  { value: 0.75, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 1.5, label: 'Fast' },
  { value: 2, label: 'Very fast' },
];

/**
 * Both fields carry a default, so a blob that holds only one of them is still valid — which is what
 * keeps an A-15 blob from breaking P-09's reading speed and vice versa. Unknown siblings (`mode`,
 * a leftover) are stripped rather than rejected; they are not this file's business.
 */
const storedSettingsSchema = z.object({
  speechRate: z.number().min(SPEECH_RATE_MIN).max(SPEECH_RATE_MAX).default(DEFAULT_SPEECH_RATE),
  highContrast: z.boolean().default(DEFAULT_HIGH_CONTRAST),
});

export interface StoredSettings {
  speechRate: number;
  highContrast: boolean;
}

type Read = (key: string) => string | null;
type Write = (key: string, value: string) => void;

function browserRead(): Read | null {
  if (typeof window === 'undefined') return null;
  return (key) => window.localStorage.getItem(key);
}

function browserWrite(): Write | null {
  if (typeof window === 'undefined') return null;
  return (key, value) => window.localStorage.setItem(key, value);
}

const DEFAULTS: StoredSettings = { speechRate: DEFAULT_SPEECH_RATE, highContrast: DEFAULT_HIGH_CONTRAST };

/**
 * The rate read-aloud speaks at, read fresh on every press so a change in Settings takes effect
 * without a reload.
 *
 * `read` is injectable because vitest runs in Node, where `localStorage` does not exist — the same
 * reason `lib/session/forget.ts` takes its collaborators as arguments.
 */
export function speechRate(read: Read | null = browserRead()): number {
  if (read === null) return DEFAULT_SPEECH_RATE;
  const raw = read(SETTINGS_STORAGE_KEY);
  if (raw === null) return DEFAULT_SPEECH_RATE;
  return parseSpeechRate(raw);
}

/** Split out so the two failure kinds — unparseable JSON, and JSON that is not a valid setting — are each testable. */
export function parseSpeechRate(raw: string): number {
  return parseStoredSettings(raw).speechRate;
}

/** Every stored setting, with defaults for whatever is missing or unreadable. Never throws. */
export function parseStoredSettings(raw: string | null): StoredSettings {
  if (raw === null) return DEFAULTS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULTS;
  }
  const parsed = storedSettingsSchema.safeParse(json);
  return parsed.success ? parsed.data : DEFAULTS;
}

export interface SettingsIO {
  read: Read | null;
  write: Write | null;
}

export interface SettingsWriteResult {
  /** What the blob will now say, or what it would have said had the write been refused. */
  settings: StoredSettings;
  /** `false` when the browser would not accept the write, so the caller can say so out loud. */
  saved: boolean;
}

/**
 * Merge a patch into the stored settings and write the validated whole back.
 *
 * Three things this refuses to do, each because the alternative is a wrong claim:
 *  - **Drop a sibling.** It reads the current settings first, so saving the speed never quietly
 *    turns the contrast theme off.
 *  - **Store a value the reader would reject.** A rate outside 0.5–2 throws here rather than
 *    landing in the blob, where the next read would silently fall back to normal and the page
 *    would still be showing the option the user picked. `storedSettingsSchema.parse` is the same
 *    validator the read path uses, so the two cannot drift.
 *  - **Report a save that did not happen.** `localStorage.setItem` genuinely throws — private
 *    browsing in some browsers makes it do so — and a settings page that caught that and said
 *    "Saved" would be claiming persistence it does not have. The caller announces `saved` instead.
 *    This mirrors `lib/session/forget.ts`, which counts what it could not remove rather than
 *    swallowing the failure.
 */
export function updateSettings(patch: Partial<StoredSettings>, io: SettingsIO = liveIO()): SettingsWriteResult {
  const current = io.read === null ? DEFAULTS : parseStoredSettings(io.read(SETTINGS_STORAGE_KEY));
  const settings = storedSettingsSchema.parse({ ...current, ...patch });
  if (io.write === null) return { settings, saved: false };
  try {
    io.write(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    return { settings, saved: false };
  }
  notifySettingsChanged();
  return { settings, saved: true };
}

function liveIO(): SettingsIO {
  return { read: browserRead(), write: browserWrite() };
}

/** The plain-language name of a rate, or the number itself when it is not one of the offered choices. */
export function describeRate(value: number): string {
  const option = SPEECH_RATE_OPTIONS.find((candidate) => candidate.value === value);
  return option === undefined ? `${value} times normal speed` : option.label;
}

/**
 * Write the theme onto the root element, where `globals.css`'s `:root[data-high-contrast='true']`
 * block is defined. Off deletes the attribute rather than setting `'false'`, so the DOM says which
 * theme is active instead of carrying a value that only the selector's absence proves.
 *
 * Guarded on `document` because this module is imported by components Next renders on the server.
 */
export function applyHighContrast(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.highContrast = 'true';
  else delete document.documentElement.dataset.highContrast;
}

/* --------------------------------------------------------------------------------------------
 * The settings as an external store.
 *
 * React's `useSyncExternalStore` needs a snapshot it can compare by identity, so the snapshot is
 * the **raw string** in storage and parsing happens in the component. Returning a fresh object
 * would make every render look like a change and loop. The subscription list is ours because a
 * same-tab write fires no `storage` event: without it the settings page would keep showing the
 * option the user has just left, and the theme would wait for a reload.
 * ----------------------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function notifySettingsChanged(): void {
  for (const listener of [...listeners]) listener();
}

/** The stored blob, verbatim. `null` when there is none, or when this is not a browser. */
export function readSettingsRaw(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SETTINGS_STORAGE_KEY);
}

/** Subscribe to settings writes from this tab and from any other tab on this origin. */
export function subscribeToSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}
