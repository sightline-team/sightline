import { describe, expect, it } from 'vitest';
import {
  chunkForSpeech,
  MAX_UTTERANCE_CHARS,
  selectSpeechVoice,
  speak,
  speakSupported,
  stopSpeaking,
  type Synthesizer,
} from '@/features/speech/speak';
import { DEFAULT_SPEECH_RATE, parseSpeechRate, SETTINGS_STORAGE_KEY, speechRate } from '@/lib/settings';
import { spokenAnswer, SPEAK_LABEL } from '@/app/_flow/spoken_answer';
import type { Analysis } from '@/types';

/**
 * Read-aloud (item **P-09**).
 *
 * The seam is the point: vitest runs in Node, where there is no `speechSynthesis` and no
 * `SpeechSynthesisUtterance`, so `speak()` takes its engine as an argument and these tests watch the
 * calls. What is asserted here is the three things a listener cannot verify from a transcript of what
 * was said: that the text reaches the engine whole, that the speed comes from the user's setting and
 * nowhere else, and that the audio version of the screen is the same sentences the screen renders.
 * The press itself is proved in `tests/e2e/flow.spec.ts`, where the engine is replaced by a recorder.
 */

interface Recorded {
  text: string;
  rate: number;
  onEnd: (() => void) | null;
}

function recorder(): { spoken: Recorded[]; cancels: () => number; synth: Synthesizer } {
  const spoken: Recorded[] = [];
  let cancelled = 0;
  return {
    spoken,
    cancels: () => cancelled,
    synth: {
      speak(utterance) {
        spoken.push(utterance);
      },
      cancel() {
        cancelled += 1;
      },
    },
  };
}

function reading(overrides: Partial<Analysis> = {}): Analysis {
  return {
    docType: 'other',
    summary: 'A document.',
    facts: [],
    actions: [],
    warnings: [],
    model: 'tee-llama',
    ...overrides,
  };
}

/** Storage that answers for one key, so the setting is exercised without a browser. */
function store(value: string | null): (key: string) => string | null {
  return (key: string) => (key === SETTINGS_STORAGE_KEY ? value : null);
}

describe('chunkForSpeech', () => {
  it('hands a short reading to the engine as one piece', () => {
    expect(chunkForSpeech('Two sentences, both brief.')).toEqual(['Two sentences, both brief.']);
  });

  it('never hands the engine more than the limit', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} explains the bill.`).join(' ');
    for (const chunk of chunkForSpeech(long)) expect(chunk.length).toBeLessThanOrEqual(MAX_UTTERANCE_CHARS);
  });

  it('breaks at a sentence end when one is within reach', () => {
    const sentence = 'A first sentence that is long enough to matter.';
    const text = `${Array.from({ length: 6 }, () => sentence).join(' ')} A last short one.`;
    const chunks = chunkForSpeech(text, 80);
    expect(chunks[0]?.endsWith('.')).toBe(true);
  });

  it('breaks between words when a single sentence runs past the limit', () => {
    const chunks = chunkForSpeech('word '.repeat(80) + 'end.', 40);
    for (const chunk of chunks) expect(chunk.endsWith(' ')).toBe(false);
    // Whole words, and the first piece is the most that fit: the cut landed on a space, not a letter.
    expect(chunks[0]).toBe('word '.repeat(8).trim());
  });

  it('hard-cuts a run with no space and no sentence end at all', () => {
    const chunks = chunkForSpeech('a'.repeat(450), 200);
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50]);
  });

  it('keeps every word: the pieces rejoin to the original text', () => {
    const text = [
      'The first sentence is comfortably short.',
      `The second one is not, and it goes on for long enough that the engine has to be given it in pieces, because some engines stop part-way through a long utterance and the person listening never learns the rest of the sentence was said at all.`,
      'Third.',
    ].join(' ');
    const joined = chunkForSpeech(text, 100).join(' ').replace(/\s+/g, ' ');
    expect(joined).toBe(text.replace(/\s+/g, ' '));
  });

  it('speaks nothing for empty or whitespace-only text', () => {
    expect(chunkForSpeech('')).toEqual([]);
    expect(chunkForSpeech('   \n  ')).toEqual([]);
  });
});

describe('speak', () => {
  it('hands the engine one utterance per piece, in order, at the rate it was given', () => {
    const { spoken, synth } = recorder();
    const text = `Piece 0 of the reading. Piece 1 of the reading. Piece 2 of the reading. Piece 3 of the reading. Piece 4 of the reading. Piece 5 of the reading. Piece 6 of the reading. Piece 7 of the reading. Piece 8 of the reading. Piece 9 of the reading.`;
    speak(text, { synth, rate: 0.8 });
    expect(spoken.length).toBe(2);
    expect(spoken.every((u) => u.rate === 0.8)).toBe(true);
    expect(spoken.map((u) => u.text).join(' ')).toBe(text);
  });

  it('speaks at normal speed when no rate is passed', () => {
    const { spoken, synth } = recorder();
    speak('A reading.', { synth });
    expect(spoken[0]?.rate).toBe(DEFAULT_SPEECH_RATE);
  });

  it('marks only the last piece as the end of the reading', () => {
    const { spoken, synth } = recorder();
    let done = 0;
    speak(`${'A sentence about the document. '.repeat(10)}The last one.`, { synth, rate: 1, onDone: () => (done += 1) });
    expect(spoken.length).toBeGreaterThan(1);
    spoken.slice(0, -1).forEach((utterance) => expect(utterance.onEnd).toBeNull());
    spoken.at(-1)?.onEnd?.();
    expect(done).toBe(1);
  });

  it('does not call an engine that was never asked about', () => {
    const { spoken, cancels, synth } = recorder();
    speak('', { synth });
    expect(spoken).toEqual([]);
    expect(cancels()).toBe(0);
  });

  it('is a no-op rather than a crash where the engine is missing', () => {
    // Node: no `window`, no `speechSynthesis`. A browser without the API takes this same path,
    // which is why `SpeakButton` renders nothing instead of a button that says nothing.
    expect(speakSupported()).toBe(false);
    expect(() => speak('A reading.')).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe('the reading speed in Settings', () => {
  it('is normal when nothing has been stored', () => {
    expect(speechRate(store(null))).toBe(DEFAULT_SPEECH_RATE);
  });

  it('honours a stored rate', () => {
    expect(speechRate(store('{"speechRate":1.8}'))).toBe(1.8);
    expect(speechRate(store('{"speechRate":0.5}'))).toBe(0.5);
    expect(speechRate(store('{"speechRate":2}'))).toBe(2);
  });

  it('falls back to normal on a rate outside the engine’s useful range', () => {
    expect(speechRate(store('{"speechRate":0.2}'))).toBe(DEFAULT_SPEECH_RATE);
    expect(speechRate(store('{"speechRate":9}'))).toBe(DEFAULT_SPEECH_RATE);
    expect(parseSpeechRate('{"speechRate":0}')).toBe(DEFAULT_SPEECH_RATE);
  });

  it('treats stored text as untrusted: wrong type, broken JSON, and no JSON at all', () => {
    expect(speechRate(store('{"speechRate":"fast"}'))).toBe(DEFAULT_SPEECH_RATE);
    expect(speechRate(store('{"speechRate":null}'))).toBe(DEFAULT_SPEECH_RATE);
    expect(speechRate(store('{}'))).toBe(DEFAULT_SPEECH_RATE);
    expect(speechRate(store('not json at all'))).toBe(DEFAULT_SPEECH_RATE);
    expect(speechRate(store('[]'))).toBe(DEFAULT_SPEECH_RATE);
  });

  it('ignores a sibling field it has not heard of, so Settings can grow beside it', () => {
    expect(speechRate(store('{"speechRate":1.4,"mode":"fixtures","highContrast":true}'))).toBe(1.4);
  });

  it('reads nothing at all when there is no storage, instead of throwing', () => {
    expect(speechRate()).toBe(DEFAULT_SPEECH_RATE);
  });

  it('holds only a number, under the prefix the storage convention requires', () => {
    // AGENTS.md §4 rule 7: this file is `localStorage`, which survives the tab and survives Forget.
    // A rate belongs there; nothing read out of a document does, and A-15 must keep it that way.
    expect(SETTINGS_STORAGE_KEY.startsWith('sightline.')).toBe(true);
    expect(speechRate(store('{"speechRate":1.5,"summary":"A care trust invoice"}'))).toBe(1.5);
  });
});

describe('the words a press speaks', () => {
  it('opens with the summary the screen shows, unchanged', () => {
    const analysis = reading({ summary: 'A care trust invoice for 840 pounds, due 15 May.' });
    expect(spokenAnswer(analysis).startsWith(`Summary. ${analysis.summary}`)).toBe(true);
  });

  it('says the cautions in Sightline’s voice, and labels them as Sightline’s', () => {
    const analysis = reading({ docType: 'bill', summary: 'An invoice.' });
    const spoken = spokenAnswer(analysis);
    expect(spoken).toContain('Sightline’s cautions.');
    expect(spoken).toContain('Before you pay anything, check the amount with the sender');
    expect(spoken).toContain('Sightline reads English documents only.');
  });

  it('does not read the model’s own warnings, which a listener could not tell from ours', () => {
    const analysis = reading({ warnings: [{ kind: 'urgency', text: 'The sender sounds pressing.' }] });
    expect(spokenAnswer(analysis)).not.toContain('The sender sounds pressing.');
  });

  it('does not read the transcript, the facts, or the receipt', () => {
    const analysis = reading({
      summary: 'An invoice.',
      facts: [{ kind: 'amount', label: 'Amount due', value: '£840', sourceQuote: '840 pounds', quoteFound: true }],
    });
    const spoken = spokenAnswer(analysis);
    expect(spoken).not.toContain('£840');
    expect(spoken).not.toContain('Amount due');
  });

  it('labels the control by what it does, and never starts on its own', () => {
    // The other half of this claim — nothing is spoken before a press — is an e2e test, because
    // "auto-play" is a property of the wiring, not of this string.
    expect(SPEAK_LABEL).toBe('Read the answer aloud');
  });

  it('prefers localService voices over cloud/remote network voices for privacy', () => {
    const voices = [
      { name: 'Cloud Neural Voice', localService: false },
      { name: 'System Local Voice', localService: true },
    ];
    const chosen = selectSpeechVoice(voices);
    expect(chosen?.name).toBe('System Local Voice');
    expect(chosen?.localService).toBe(true);

    const noLocal = [{ name: 'Cloud Voice', localService: false }];
    expect(selectSpeechVoice(noLocal)).toBeUndefined();
  });
});
