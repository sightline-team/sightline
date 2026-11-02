import type { AppError, CaptureIssue, ErrorCode } from '@/types';

/**
 * Plain-language messages for every failure in `docs/ARCHITECTURE.md` §13, plus
 * the per-`CaptureIssue` announcements `docs/PRD.md` §12 Q2 requires.
 *
 * Two rules shape this file (AGENTS.md §4):
 *  - No privacy or data-flow sentence lives here: nothing in this file may state that
 *    bytes stayed on the device, that content is not stored, or that an enclave is the
 *    only reader. Those are computed from a `TrustRecord` in `features/trust/claims.ts`
 *    (AGENTS.md §4 rule 1), and `tests/unit/claims.test.ts` walks the source tree and
 *    fails if a sentence of that shape appears anywhere else — so describe the failure,
 *    never what it protected.
 *  - Never guess unreadable content, and never promise behaviour the code does
 *    not have yet.
 */

interface ErrorSpec {
  userMessage: string;
  retryable: boolean;
}

const ERRORS: Record<ErrorCode, ErrorSpec> = {
  verification_failed: {
    userMessage: 'Sightline could not confirm that the private AI service is safe to use, so it stopped.',
    retryable: true,
  },
  verification_unreachable: {
    userMessage: 'Sightline could not reach its verification service, so it stopped. Check your connection and try again.',
    retryable: true,
  },
  attestation_changed: {
    userMessage: 'The private service changed while you were working, so Sightline stopped. Try again.',
    retryable: true,
  },
  signature_invalid: {
    userMessage: 'Sightline could not confirm where that answer came from, so it discarded it. Try again.',
    retryable: true,
  },
  model_unavailable: {
    userMessage: 'The private model is not available right now. Try again, or paste the text of the document instead.',
    retryable: true,
  },
  capture_issue: {
    userMessage: 'Part of the page may be missing from the photo. Retake it, or carry on with what you have.',
    retryable: true,
  },
  too_many_pages: {
    userMessage: 'Sightline can work with up to five pages at a time. Remove one, then add this again.',
    retryable: false,
  },
  image_too_large: {
    userMessage: 'That picture was too large to work with. Try retaking it, or paste the text instead.',
    retryable: false,
  },
  not_a_document: {
    userMessage:
      'This does not look like a document. If it is one, try again in better light. If the words are on a screen, copy and paste them.',
    retryable: true,
  },
  illegible_content: {
    userMessage:
      'Some of this is unreadable, so Sightline has marked those parts instead of guessing them. A steadier, closer photo may help.',
    retryable: true,
  },
  output_truncated: {
    userMessage: 'The answer was cut short. Try again, or work with one page at a time.',
    retryable: true,
  },
  model_refused: {
    userMessage: 'The service would not work with this document. If it is yours, you can paste its text instead.',
    retryable: false,
  },
  invalid_model_output: {
    userMessage: 'The service returned something Sightline could not read. Try again.',
    retryable: true,
  },
  network_lost: {
    userMessage: 'The connection dropped. What Sightline has already read is still here. Try again when you are online.',
    retryable: true,
  },
  aborted: {
    userMessage: 'Sightline stopped because you left or the request was cancelled. You can try again.',
    retryable: true,
  },
  rate_limited: {
    userMessage: 'Too many requests just now. Wait a minute and try again, or add your own key in Settings.',
    retryable: true,
  },
  relay_disabled: {
    userMessage: 'This deployment does not allow the shared service. Use your own key in Settings, or run fixture mode.',
    retryable: false,
  },
  unsupported_language: {
    userMessage: 'Sightline only reads English documents at the moment.',
    retryable: false,
  },
  unknown: {
    userMessage: 'Something went wrong. Try again.',
    retryable: true,
  },
};

/**
 * One sentence per capture issue, announced rather than shown only as an icon
 * (`docs/PRD.md` §12 Q2: say *which* edge is cut off).
 */
const CAPTURE_ISSUES: Record<CaptureIssue, string> = {
  cut_off_top: 'The top of the page is missing from the photo.',
  cut_off_bottom: 'The bottom of the page is missing from the photo.',
  cut_off_left: 'The left edge of the page is missing from the photo.',
  cut_off_right: 'The right edge of the page is missing from the photo.',
  rotated: 'The page looks sideways or upside down.',
  glare: 'There is a bright patch on the page, so some words are hidden.',
  too_small_text: 'The writing looks very small. Move closer to the page.',
  blurry: 'The photo looks blurry.',
  not_a_document: 'This does not look like a document.',
  handwriting_present: 'Part of this is handwriting. Sightline is less reliable with handwriting.',
};

export function appError(code: ErrorCode, context?: AppError['context']): AppError {
  const spec = ERRORS[code];
  return context ? { code, ...spec, context } : { code, ...spec };
}

export function captureIssueMessage(issue: CaptureIssue): string {
  return CAPTURE_ISSUES[issue];
}

/**
 * What to say when several pages have capture issues at once. Names the pages in
 * capture order so the announcement matches "Page 1, Page 2" labels elsewhere.
 */
export function captureIssueSummary(issues: { page: number; issue: CaptureIssue }[]): string {
  if (issues.length === 0) return '';
  const first = issues[0]!;
  const lead = `Page ${first.page + 1}: ${captureIssueMessage(first.issue)}`;
  return issues.length === 1 ? lead : `${lead} ${issues.length - 1} other page${issues.length === 2 ? '' : 's'} may have problems too.`;
}
