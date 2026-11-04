import { describe, expect, it } from 'vitest';
import { completionEnvelopeSchema, contentOf, truncated } from '@/lib/near-ai/envelope';

/**
 * The transport contract's own edges (item **P-13**).
 *
 * P-13 exists because a live measurement — `npm run spike -- --stage=image`, 2026-11-04,
 * `docs/SPIKE_RESULTS.md` §1 and §4 — came back with `message: {content: null}` and
 * `finish_reason: "length"`: the model spent its whole 256-token budget on reasoning and left the
 * answer empty. The schema required a string there, so a page that ran out of room was reported to the
 * person as a broken service (`invalid_model_output`) instead of the truth (no answer arrived).
 *
 * The tests below are the pair that keeps that fix honest in both directions: `null` is a shape the
 * wire carries, **and `content` is still a required key** — nullable is not optional, and a message
 * with no content at all must stay a transport failure rather than become a silent empty answer.
 */

const envelope = (message: Record<string, unknown>, finish_reason?: string | null) =>
  completionEnvelopeSchema.parse({
    id: 'chat-1',
    model: 'z-ai/glm-5.3-flash',
    choices: finish_reason === undefined ? [{ message }] : [{ message, finish_reason }],
  });

describe('a content of null is a reply, not a broken transport (P-13)', () => {
  it('parses the measured budget-exhausted reply, and reads it as no answer', () => {
    // Field-for-field what the service actually sent for a page. `reasoning_content` is what the
    // model's chain of thought is called there; the schema names no such field, and nothing reads it.
    const parsed = envelope({ content: null, reasoning_content: 'Counting the lines on the page…' }, 'length');

    expect(contentOf(parsed)).toBe('');
    expect(truncated(parsed)).toBe(true);
  });

  it('still refuses a message with no `content` key at all — nullable is not optional', () => {
    expect(() => envelope({ reasoning_content: 'nothing was ever said' }, 'stop')).toThrowError();
  });

  it('keeps a string answer a string answer', () => {
    const parsed = envelope({ content: '{"docType":"bill"}' }, 'stop');

    expect(contentOf(parsed)).toBe('{"docType":"bill"}');
    expect(truncated(parsed)).toBe(false);
  });

  it('treats an empty string the way it always did: no answer, and not a truncation either', () => {
    const parsed = envelope({ content: '' }, 'stop');

    // `null` reaches the same place as `''` by way of `contentOf`, and the caller decides what an
    // empty answer means. `truncated` stays false because nothing said `length` — the absence of a
    // claim is not a claim of completion (AGENTS.md §4 rule 5).
    expect(contentOf(parsed)).toBe('');
    expect(truncated(parsed)).toBe(false);
  });
});
