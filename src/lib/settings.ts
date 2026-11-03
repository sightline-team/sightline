import { z } from 'zod';

/**
 * The settings a user may keep after the tab closes (item **P-09** reads the first of them;
 * **A-15** builds the control that writes them).
 *
 * Two rules decide the shape of this file:
 *  - **Non-sensitive only.** `docs/ARCHITECTURE.md` §7 puts `Settings` in `localStorage`, which is
 *    the one storage a browser keeps across sessions and hands to every script on the origin. So
 *    only a number and a mode name may live here — never a document, a transcript, a quote, an
 *    image, or a key (AGENTS.md §4 rule 7; the Mode A key is `sessionStorage` and item **T-13**).
 *    A value stored here also survives Forget by design: a reading speed is not somebody's invoice.
 *  - **Untrusted input, even from ourselves.** `localStorage` is readable and writable by anything
 *    running on the origin, so a stale, tampered or hand-edited blob is data that gets validated,
 *    not trusted. A value that fails the schema falls back to the default rather than throwing:
 *    the reading speed is not worth crashing the results screen over, and a rate outside the
 *    engine's sane range is worse than the default.
 */

/** One blob, one key. The `sightline.` prefix is the storage convention ARCH §5.4 sets for the session's keys; the settings key follows it so one naming rule covers both stores. */
export const SETTINGS_STORAGE_KEY = 'sightline.settings';

/** `docs/ARCHITECTURE.md` §7: `speechRate: number // 0.5..2`. The bounds are the engine's useful range, not a preference. */
export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2;

/** Normal speed. Also the answer whenever a stored value is missing or unreadable. */
export const DEFAULT_SPEECH_RATE = 1;

/**
 * Only `speechRate` is required to be *sane*; unknown siblings are stripped rather than rejected,
 * so a later A-15 that stores `mode` or `highContrast` alongside it does not break the reading
 * speed by adding a field this file has not heard of.
 */
const storedSettingsSchema = z.object({
  speechRate: z.number().min(SPEECH_RATE_MIN).max(SPEECH_RATE_MAX),
});

type Read = (key: string) => string | null;

function browserRead(): Read | null {
  if (typeof window === 'undefined') return null;
  return (key) => window.localStorage.getItem(key);
}

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
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_SPEECH_RATE;
  }
  const parsed = storedSettingsSchema.safeParse(json);
  return parsed.success ? parsed.data.speechRate : DEFAULT_SPEECH_RATE;
}
