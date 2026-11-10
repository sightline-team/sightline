import { DEFAULT_SPEECH_RATE } from '@/lib/settings';

/**
 * Read-aloud (item **P-09**) using the device's own `speechSynthesis`.
 *
 * Cut deliberately (PROJECT_STRUCTURE §8): no voice picker, no spell-out mode, no auto-speak, no
 * verbosity levels — a screen reader already does all of that better than we can, and our own
 * speech on top of it talks over the user's assistive tech (docs/PRD.md §12 Q1 row 9). What
 * remains is one opt-in button, off by default, a rate in Settings, and a stop when the session is
 * forgotten (P-10).
 *
 * `speechSynthesis` is the browser's own API, so nothing in this file makes a request — but the
 * engine behind that API belongs to the device, and some browser voices synthesise over the network.
 * Sightline therefore says nothing about where the spoken words go: no UI sentence here may be a
 * privacy or data-flow claim, which belongs to `features/trust/claims.ts` (AGENTS.md §4 rule 1), and
 * the limit is stated in README's accessibility section.
 *
 * ### Why a `Synthesizer` seam
 *
 * vitest runs in Node (`vitest.config.mts`, `environment: 'node'`), which has no `speechSynthesis`
 * and no `SpeechSynthesisUtterance`, so an un-injected call is untestable *and* a crash waiting for
 * the browser that lacks the API. `speak()` therefore takes its engine as an argument and defaults to
 * the window's; when neither exists it says nothing rather than throwing. The browser half — press,
 * hear, stop — is proved in `tests/e2e/flow.spec.ts`, where the engine is replaced by a recorder.
 */

/**
 * Long utterances are where engines get unreliable: a well-reported flaw in some engines is that a
 * single utterance stops part-way through, past a few hundred characters or a dozen seconds.
 * **[Unverified on our own hardware — no device here has been listened to; see A-03/A-04.]** The
 * mitigation is cheap and needs no event plumbing: hand the engine a queue of short pieces and let
 * it speak them in order. `speechSynthesis.speak()` already queues, so chunking costs one loop.
 */
export const MAX_UTTERANCE_CHARS = 200;

/** The parts of an utterance this feature uses. Deliberately not the browser class: the seam has to be buildable in Node. */
export interface SpeechUtterance {
  text: string;
  rate: number;
  /** Fired by the engine when this piece finishes. Only the last piece of a reading carries one. */
  onEnd: (() => void) | null;
}

export interface Synthesizer {
  speak(utterance: SpeechUtterance): void;
  cancel(): void;
}

export interface SpeakOptions {
  rate?: number;
  synth?: Synthesizer | null;
  /** Called once, when the last piece has been spoken — the button's "Stop reading" depends on it. */
  onDone?: () => void;
}

/** Whether this browser has the engine at all. A control that cannot speak is not shown (see `SpeakButton`). */
export function speakSupported(): boolean {
  return windowSynthesizer() !== null;
}

export function speak(text: string, options: SpeakOptions = {}): void {
  const synth = options.synth === undefined ? windowSynthesizer() : options.synth;
  if (synth === null) return;
  const rate = options.rate ?? DEFAULT_SPEECH_RATE;
  const chunks = chunkForSpeech(text);
  if (chunks.length === 0) return;
  const onEnd = options.onDone ?? null;
  chunks.forEach((chunk, index) => {
    synth.speak({ text: chunk, rate, onEnd: index === chunks.length - 1 ? onEnd : null });
  });
}

/**
 * Stop whatever is queued. Safe to call when nothing is speaking, and called by Forget (P-10).
 * The same guard as `speak()`, because a browser that has a `speechSynthesis` property but no
 * engine behind it would otherwise throw inside a Forget press.
 */
export function stopSpeaking(): void {
  windowSynthesizer()?.cancel();
}

/**
 * Split into pieces the engine will finish, breaking at sentence ends where possible and at a space
 * otherwise. No character of the input is dropped: pieces rejoin to the same words (whitespace
 * aside), which `tests/unit/speech.test.ts` asserts rather than assumes.
 */
export function chunkForSpeech(text: string, limit: number = MAX_UTTERANCE_CHARS): string[] {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const cut = breakPoint(rest, limit);
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== '') chunks.push(rest);
  return chunks;
}

/** Where to cut the first `limit` characters: the end of the last complete sentence, else the last space, else the limit itself. */
function breakPoint(text: string, limit: number): number {
  const head = text.slice(0, limit + 1);
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentenceEnd > 0) return sentenceEnd + 1;
  const space = head.lastIndexOf(' ');
  if (space > 0) return space;
  return limit;
}

/** Selects a local offline voice when available to avoid sending document text to cloud speech engines. */
export function selectSpeechVoice<T extends { localService?: boolean }>(voices: readonly T[]): T | undefined {
  return voices.find((v) => v.localService === true);
}

function windowSynthesizer(): Synthesizer | null {
  if (typeof window === 'undefined') return null;
  const engine = window.speechSynthesis;
  if (engine === undefined || typeof engine.speak !== 'function' || typeof engine.cancel !== 'function') return null;
  if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return {
    speak({ text, rate, onEnd }) {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      if (typeof engine.getVoices === 'function') {
        const localVoice = selectSpeechVoice(engine.getVoices());
        if (localVoice) utterance.voice = localVoice;
      }
      if (onEnd !== null) utterance.onend = () => onEnd();
      engine.speak(utterance);
    },
    cancel() {
      engine.cancel();
    },
  };
}
