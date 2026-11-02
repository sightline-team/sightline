import { notBuilt } from '@/lib/not_built';

/**
 * Read-aloud (item **P-09**) using the device's own `speechSynthesis`.
 *
 * Cut deliberately (PROJECT_STRUCTURE §8): no voice picker, no spell-out mode, no
 * auto-speak, no verbosity levels — a screen reader already does all of that better
 * than we can, and our own speech on top of it talks over the user's assistive tech
 * (docs/PRD.md §12 Q1 row 9). What remains is one opt-in button, off by default, a rate
 * in Settings, and a stop when the session is forgotten.
 *
 * `speechSynthesis` is the device's own engine, so this function involves no network — a fact
 * about the code, and not a privacy statement the UI may make. Anything a user hears about where
 * their document went is computed in `features/trust/claims.ts` (AGENTS.md §4 rule 1).
 */
export interface SpeakOptions {
  rate?: number;
}

export function speak(_text: string, _options?: SpeakOptions): void {
  return notBuilt('P-09', 'Read-aloud') as never;
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking;
}
