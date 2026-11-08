/**
 * Interval progress announcements (~every 10 s) during long model operations (**A-07**, AGENTS.md §8).
 *
 * Prevents screen-reader users sitting before a silent screen thinking the app has frozen.
 * Announcements are plain-language, non-spamming, and cancelled immediately upon completion.
 */

export const PROGRESS_INTERVAL_MS = 10_000;

export const PROGRESS_MESSAGES: readonly string[] = [
  'Still reading your document. Please wait.',
  'Still processing. Checking the text and verifying facts.',
  'Still working on your document. This can take up to a minute.',
  'Still working. Please keep this tab open.',
] as const;

export interface ProgressTicker {
  start(): void;
  stop(): void;
  reset(): void;
  tick(): void;
}

export function createProgressTicker(
  announce: (message: string) => void,
  intervalMs = PROGRESS_INTERVAL_MS,
  messages: readonly string[] = PROGRESS_MESSAGES,
): ProgressTicker {
  let timer: ReturnType<typeof setInterval> | null = null;
  let index = 0;

  function tick() {
    const msg = messages[Math.min(index, messages.length - 1)];
    if (msg) {
      announce(msg);
      index++;
    }
  }

  function start() {
    stop();
    index = 0;
    timer = setInterval(tick, intervalMs);
  }

  function reset() {
    if (timer !== null) {
      clearInterval(timer);
      index = 0;
      timer = setInterval(tick, intervalMs);
    }
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    index = 0;
  }

  return { start, stop, reset, tick };
}
