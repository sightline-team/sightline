import { describe, expect, it } from 'vitest';
import {
  RETAKE_ISSUES,
  isRetakeIssue,
  requiresRetake,
  retakeOfferMessage,
  captureIssueMessage,
} from '@/lib/errors';
import type { CaptureIssue } from '@/types';

/**
 * Capture issues and retake policy (item **C-04**, **C-06**; PRD §12 Q2, ESSENTIALS step 5).
 *
 * Measured in SPIKE_RESULTS.md §4:
 * `rotated` fired on 6 of 14 measured live pages on a slight 0.63° tilt (the normal condition
 * of handheld phone photography, PRD §10 risk 6), including the demo's own shipped photographs.
 * A retake loop that treated `rotated` as "take it again" would nag on nearly every photograph.
 *
 * Severe issues (e.g. cut off edges, blur, glare, not a document) compromise readability and
 * justify pausing the run at `needs_retake` to offer the person a retake or continue anyway.
 */
describe('capture retake policy (C-04, C-06)', () => {
  const ALL_ISSUES: CaptureIssue[] = [
    'cut_off_top',
    'cut_off_bottom',
    'cut_off_left',
    'cut_off_right',
    'blurry',
    'glare',
    'too_small_text',
    'not_a_document',
    'rotated',
    'handwriting_present',
  ];

  it('RETAKE_ISSUES contains all 8 severe issues and excludes rotated and handwriting', () => {
    expect(RETAKE_ISSUES.size).toBe(8);
    expect(RETAKE_ISSUES.has('cut_off_top')).toBe(true);
    expect(RETAKE_ISSUES.has('cut_off_bottom')).toBe(true);
    expect(RETAKE_ISSUES.has('cut_off_left')).toBe(true);
    expect(RETAKE_ISSUES.has('cut_off_right')).toBe(true);
    expect(RETAKE_ISSUES.has('blurry')).toBe(true);
    expect(RETAKE_ISSUES.has('glare')).toBe(true);
    expect(RETAKE_ISSUES.has('too_small_text')).toBe(true);
    expect(RETAKE_ISSUES.has('not_a_document')).toBe(true);

    // Specifically excluded based on measurement:
    expect(RETAKE_ISSUES.has('rotated')).toBe(false);
    expect(RETAKE_ISSUES.has('handwriting_present')).toBe(false);
  });

  it('isRetakeIssue correctly classifies severe vs informational issues', () => {
    for (const issue of ALL_ISSUES) {
      if (issue === 'rotated' || issue === 'handwriting_present') {
        expect(isRetakeIssue(issue)).toBe(false);
      } else {
        expect(isRetakeIssue(issue)).toBe(true);
      }
    }
  });

  it('requiresRetake is false for empty issues or informational issues only', () => {
    expect(requiresRetake([])).toBe(false);
    expect(requiresRetake([{ page: 0, issue: 'rotated' }])).toBe(false);
    expect(
      requiresRetake([
        { page: 0, issue: 'rotated' },
        { page: 1, issue: 'handwriting_present' },
      ]),
    ).toBe(false);
  });

  it('requiresRetake is true if any page reports a severe capture issue', () => {
    expect(requiresRetake([{ page: 0, issue: 'cut_off_bottom' }])).toBe(true);
    expect(
      requiresRetake([
        { page: 0, issue: 'rotated' },
        { page: 1, issue: 'cut_off_left' },
      ]),
    ).toBe(true);
  });

  it('retakeOfferMessage produces a clear plain-language prompt naming the edge and offering retake', () => {
    const topMsg = retakeOfferMessage([{ page: 0, issue: 'cut_off_top' }]);
    expect(topMsg).toBe('Page 1: The top of the page is missing from the photo. Retake the photograph, or carry on with what you have.');

    const bottomMsg = retakeOfferMessage([{ page: 1, issue: 'cut_off_bottom' }]);
    expect(bottomMsg).toBe('Page 2: The bottom of the page is missing from the photo. Retake the photograph, or carry on with what you have.');

    const leftMsg = retakeOfferMessage([{ page: 2, issue: 'cut_off_left' }]);
    expect(leftMsg).toBe('Page 3: The left edge of the page is missing from the photo. Retake the photograph, or carry on with what you have.');

    const rightMsg = retakeOfferMessage([{ page: 3, issue: 'cut_off_right' }]);
    expect(rightMsg).toBe('Page 4: The right edge of the page is missing from the photo. Retake the photograph, or carry on with what you have.');
  });

  it('retakeOfferMessage handles multiple pages cleanly', () => {
    const multiMsg = retakeOfferMessage([
      { page: 0, issue: 'cut_off_bottom' },
      { page: 1, issue: 'glare' },
    ]);
    expect(multiMsg).toContain('Page 1: The bottom of the page is missing from the photo.');
    expect(multiMsg).toContain('1 other page may have problems too.');
    expect(multiMsg).toContain('Retake the photograph, or carry on with what you have.');
  });

  it('retakeOfferMessage returns empty string when issues list is empty', () => {
    expect(retakeOfferMessage([])).toBe('');
  });

  it('never contains banned privacy phrases or gesture instructions', () => {
    for (const issue of ALL_ISSUES) {
      const msg = captureIssueMessage(issue);
      expect(msg).not.toMatch(/nothing was sent|enclave|encrypt|attest|nonce|token/i);
      expect(msg).not.toMatch(/click|tap|swipe|pinch/i);
    }
  });
});
