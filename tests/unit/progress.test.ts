import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createProgressTicker, PROGRESS_INTERVAL_MS, PROGRESS_MESSAGES } from '@/lib/a11y/progress';

describe('progress ticker (A-07)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ticks every 10 seconds with progressive reassurance messages', () => {
    const messages: string[] = [];
    const ticker = createProgressTicker((msg) => messages.push(msg));

    ticker.start();
    expect(messages).toEqual([]);

    // 10s: First message
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([PROGRESS_MESSAGES[0]]);

    // 20s: Second message
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([PROGRESS_MESSAGES[0], PROGRESS_MESSAGES[1]]);

    // 30s: Third message
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([PROGRESS_MESSAGES[0], PROGRESS_MESSAGES[1], PROGRESS_MESSAGES[2]]);

    // 40s: Fourth message
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([
      PROGRESS_MESSAGES[0],
      PROGRESS_MESSAGES[1],
      PROGRESS_MESSAGES[2],
      PROGRESS_MESSAGES[3],
    ]);

    // 50s: Repeats the final message (never goes out of bounds)
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([
      PROGRESS_MESSAGES[0],
      PROGRESS_MESSAGES[1],
      PROGRESS_MESSAGES[2],
      PROGRESS_MESSAGES[3],
      PROGRESS_MESSAGES[3],
    ]);

    ticker.stop();
  });

  it('stops immediately and emits no further announcements', () => {
    const messages: string[] = [];
    const ticker = createProgressTicker((msg) => messages.push(msg));

    ticker.start();
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toHaveLength(1);

    ticker.stop();
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS * 3);
    expect(messages).toHaveLength(1);
  });

  it('reset restarts interval and message sequence without dropping existing work', () => {
    const messages: string[] = [];
    const ticker = createProgressTicker((msg) => messages.push(msg));

    ticker.start();
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(messages).toEqual([PROGRESS_MESSAGES[0]]);

    // Reset occurs (e.g., when a page completes and a new page begins)
    ticker.reset();

    // Advance 5s (half-interval) -> no message yet
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS / 2);
    expect(messages).toEqual([PROGRESS_MESSAGES[0]]);

    // Advance remaining 5s -> new sequence first message
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS / 2);
    expect(messages).toEqual([PROGRESS_MESSAGES[0], PROGRESS_MESSAGES[0]]);

    ticker.stop();
  });

  it('contains zero banned privacy phrases across all progress messages', () => {
    const FORBIDDEN_FRAGMENTS = [
      /nothing is sent/i,
      /zero server storage/i,
      /completely private/i,
      /fully secure/i,
      /guaranteed privacy/i,
      /end-to-end encrypted/i,
      /100% verified/i,
    ];

    for (const msg of PROGRESS_MESSAGES) {
      for (const pattern of FORBIDDEN_FRAGMENTS) {
        expect(msg).not.toMatch(pattern);
      }
    }
  });
});
