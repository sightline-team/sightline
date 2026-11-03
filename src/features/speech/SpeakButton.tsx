'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { speechRate } from '@/lib/settings';
import { speak, speakSupported, stopSpeaking } from './speak';

/**
 * `SpeakButton` — item **P-09**. One opt-in read-aloud button: off by default, nothing is ever
 * auto-played, at least 44×44 px (AGENTS.md §8), and it stops when the session is forgotten (P-10,
 * which calls `stopSpeaking()` from `app/_flow/useForget.ts`).
 *
 * It is a **play/stop toggle** (`docs/PRD.md` §6: "one button, play/stop, rate control") rather than
 * two buttons, because the second would need to be disabled at the moment the first is useful.
 * `aria-pressed` is the native way to carry that state; the visible label changes too, so a sighted
 * helper and a screen reader get the same story.
 *
 * Three decisions worth stating:
 *  - **No announcement through the live region.** AGENTS.md §8 forbids a silent state change, and
 *    this one is not silent: the voice *is* the feedback. Announcing "reading started" while the
 *    device is already talking would put two speech streams over each other — the exact collision
 *    §12 Q1 row 9 exists to avoid.
 *  - **The rate is read on every press**, from `lib/settings.ts`, so a change in Settings applies to
 *    the next reading without a reload. No control writes it yet — that is **A-15**.
 *  - **No engine, no control.** Some browsers have no working `speechSynthesis`; a button that reads
 *    nothing aloud is an accessibility bug, so the component renders nothing instead.
 *
 * `text` arrives from a composition root (`app/_flow/ReadAloud.tsx`), which is what keeps this
 * feature from importing the analysis or the safety notices (AGENTS.md §7).
 */
export function SpeakButton({ text, label }: { text: string; label: string }) {
  const [speaking, setSpeaking] = useState(false);
  /** Did *this* control ever start the voice? Nothing touches the engine before a press. */
  const started = useRef(false);

  // Leaving the screen stops the reading: the words on it are gone, so the audio is stale.
  // Forget (P-10) has the same rule and reaches it through `useForget`. Gated on `started` because
  // React's StrictMode runs a mount–cleanup–mount cycle in development, and an untouched control
  // calling `cancel()` would contradict the sentence printed next to it.
  useEffect(() => {
    return () => {
      if (started.current) stopSpeaking();
    };
  }, []);

  if (!speakSupported()) return null;

  function toggle() {
    if (speaking) {
      stopSpeaking();
      started.current = false;
      setSpeaking(false);
      return;
    }
    started.current = true;
    setSpeaking(true);
    speak(text, {
      rate: speechRate(),
      onDone: () => {
        started.current = false;
        setSpeaking(false);
      },
    });
  }

  return (
    <p className="speak-control">
      <Button onClick={toggle} aria-pressed={speaking}>
        {speaking ? 'Stop reading' : label}
      </Button>
      <span className="muted">Nothing is read until you press this.</span>
    </p>
  );
}
