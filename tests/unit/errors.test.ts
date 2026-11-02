import { describe, expect, it } from 'vitest';
import { appError, captureIssueMessage, captureIssueSummary } from '@/lib/errors';
import type { CaptureIssue, ErrorCode } from '@/types';

/**
 * `lib/errors.ts` (F-10). The interesting assertion here is the negative one: these messages
 * must never become privacy claims. AGENTS.md §4 rule 1 allows a privacy sentence only when it
 * is computed from a `TrustRecord` in `features/trust/claims.ts`, and an error message is the
 * easiest place in the codebase to write one by accident — "so nothing was sent" is two words
 * away from the natural explanation of why we stopped.
 *
 * The `Record<ErrorCode, true>` below is compile-time exhaustive: add a code to the union in
 * `types/index.ts` without giving it a message and `tsc --noEmit` fails. That is the real test
 * for "every error in ARCH §13 has a message"; the runtime checks below cover message quality.
 */
const ALL_CODES: Record<ErrorCode, true> = {
  verification_failed: true,
  verification_unreachable: true,
  attestation_changed: true,
  signature_invalid: true,
  model_unavailable: true,
  capture_issue: true,
  too_many_pages: true,
  image_too_large: true,
  not_a_document: true,
  illegible_content: true,
  output_truncated: true,
  model_refused: true,
  invalid_model_output: true,
  network_lost: true,
  aborted: true,
  rate_limited: true,
  relay_disabled: true,
  unsupported_language: true,
  unknown: true,
};

const ALL_CAPTURE_ISSUES: Record<CaptureIssue, true> = {
  cut_off_top: true,
  cut_off_bottom: true,
  cut_off_left: true,
  cut_off_right: true,
  rotated: true,
  glare: true,
  too_small_text: true,
  blurry: true,
  not_a_document: true,
  handwriting_present: true,
};

const codes = Object.keys(ALL_CODES) as ErrorCode[];

/**
 * Guarantee-shaped phrasing and jargon. Deliberately narrow: "Sightline could not confirm the
 * service is safe" is an explanation of a stop, while "nothing was sent" is a data-flow promise
 * only `claims.ts` may make. A broad "no reassuring words" rule would get weakened away by the
 * next person who hit it, which is why it targets the promise shape instead.
 */
const BANNED = [
  /\bnothing was sent\b/i,
  /\bnothing (is|was) (kept|stored|saved)\b/i,
  /\bnever (left|leaves)\b/i,
  /\bencrypt(ed|ion)\b/i,
  /\byour (data|document|photo)s?\b.{0,40}\b(safe|secure|private|protected)\b/i,
  /\bnot (stored|kept|saved) on (our|the) server\b/i,
  /\battestation\b/i,
  /\benclave\b/i,
  /\bTEE\b/,
  /\bnonce\b/i,
  /\bquote\b/i,
];

describe('every error code has a plain-language message', () => {
  it('covers all 19 codes with a non-empty message and a decided retryable flag', () => {
    expect(codes).toHaveLength(19);
    for (const code of codes) {
      const err = appError(code);
      expect(err.code, code).toBe(code);
      expect(err.userMessage.trim().length, `${code} message`).toBeGreaterThan(10);
      expect(typeof err.retryable, `${code} retryable`).toBe('boolean');
      // One sentence the user hears in full, so it ends with sentence punctuation.
      expect(err.userMessage, `${code} ends cleanly`).toMatch(/[.!?]$/);
    }
  });

  it('says something different for each failure, so a message identifies the problem', () => {
    const messages = new Set(codes.map((c) => appError(c).userMessage));
    expect(messages.size).toBe(codes.length);
  });

  it.each(codes)('%s asserts no privacy or data-flow guarantee', (code) => {
    const message = appError(code).userMessage;
    for (const pattern of BANNED) {
      expect(message, `${code}: "${message}" matches banned ${pattern}`).not.toMatch(pattern);
    }
  });

  it('never instructs a gesture, which a screen reader user cannot find (AGENTS.md §8)', () => {
    for (const code of codes) {
      expect(appError(code).userMessage).not.toMatch(/click|tap|swipe|pinch|drag|double-?click/i);
    }
  });
});

describe('context is metadata, never content', () => {
  it('carries a page number when given one', () => {
    expect(appError('capture_issue', { page: 2 }).context).toEqual({ page: 2 });
  });

  it('omits the context key entirely when there is nothing to say', () => {
    expect('context' in appError('unknown')).toBe(false);
  });
});

describe('capture issues are announced specifically (PRD §12 Q2)', () => {
  it('names every issue, including which edge is missing', () => {
    for (const issue of Object.keys(ALL_CAPTURE_ISSUES) as CaptureIssue[]) {
      expect(captureIssueMessage(issue).length).toBeGreaterThan(10);
    }
    expect(captureIssueMessage('cut_off_top')).toMatch(/top/i);
    expect(captureIssueMessage('cut_off_bottom')).toMatch(/bottom/i);
    expect(captureIssueMessage('cut_off_left')).toMatch(/left/i);
    expect(captureIssueMessage('cut_off_right')).toMatch(/right/i);
  });

  it('does not claim handwriting is unreadable, only that we are less reliable with it', () => {
    expect(captureIssueMessage('handwriting_present')).toMatch(/less reliable/i);
  });

  it('summarises one page without mentioning "other pages"', () => {
    expect(captureIssueSummary([{ page: 0, issue: 'blurry' }])).toBe('Page 1: The photo looks blurry.');
  });

  it('summarises several pages and counts the rest', () => {
    const two = captureIssueSummary([
      { page: 0, issue: 'blurry' },
      { page: 2, issue: 'glare' },
    ]);
    expect(two).toContain('Page 1');
    expect(two).toMatch(/1 other page may have problems too/);

    const three = captureIssueSummary([
      { page: 0, issue: 'blurry' },
      { page: 1, issue: 'glare' },
      { page: 3, issue: 'rotated' },
    ]);
    expect(three).toMatch(/2 other pages may have problems too/);
  });

  it('says nothing when there is nothing wrong', () => {
    expect(captureIssueSummary([])).toBe('');
  });

  it('numbers pages the way the rest of the UI does (capture order, 1-based)', () => {
    expect(captureIssueSummary([{ page: 4, issue: 'blurry' }])).toMatch(/^Page 5/);
  });
});
