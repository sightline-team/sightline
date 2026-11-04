import { describe, expect, it } from 'vitest';
import { assembleDocument, type PageOutcome } from '@/features/capture/assemble';
import {
  checkPageLabels,
  pageLabelFindingMessage,
  pageLabelSummary,
  parsePrintedLabel,
  type PageLabelFinding,
} from '@/features/capture/page-labels';
import { appError } from '@/lib/errors';
import { MAX_PAGES } from '@/lib/session/reducer';
import type { Transcript } from '@/types';

/**
 * **C-05** — do the page numbers printed on the photographs agree with each other?
 *
 * Every case below is built by `assembleDocument` rather than by hand-writing a `Transcript`, because
 * the check's most load-bearing input is `pageOffsets.length`: that is the number of photographs the
 * person took, and only the joiner knows it including the pages that came back empty (ADR-27). A
 * hand-built transcript could get that wrong and the test would still pass.
 */

/** One photographed page. `'hole'` is a page that yielded no text, so ADR-27's marker stands in it. */
type PageSpec = string | null | 'hole';

function assembled(...specs: PageSpec[]): Transcript {
  const pages: PageOutcome[] = specs.map((spec) =>
    spec === 'hole'
      ? { kind: 'truncated', error: appError('output_truncated') }
      : {
          kind: 'ok',
          model: 'test-model',
          value: { text: 'body text of that page', uncertain: [], captureIssues: [], pageLabel: spec ?? undefined },
        },
  );
  return assembleDocument(pages).transcript;
}

function kinds(findings: readonly PageLabelFinding[]): string[] {
  return findings.map((f) => f.kind);
}

describe('parsePrintedLabel — three shapes, and a date is rejected first', () => {
  it('reads the number and the count out of the fraction forms', () => {
    expect(parsePrintedLabel('Page 2 of 3')).toEqual({ own: 2, total: 3 });
    expect(parsePrintedLabel('2 of 3')).toEqual({ own: 2, total: 3 });
    expect(parsePrintedLabel('2 out of 5')).toEqual({ own: 2, total: 5 });
    expect(parsePrintedLabel('3/8')).toEqual({ own: 3, total: 8 });
    expect(parsePrintedLabel('Page 2 of 3 (continued)')).toEqual({ own: 2, total: 3 });
  });

  it('reads just the number when the paper gives only a number', () => {
    expect(parsePrintedLabel('Page 4')).toEqual({ own: 4 });
    expect(parsePrintedLabel('p. 4')).toEqual({ own: 4 });
    expect(parsePrintedLabel('No. 3')).toEqual({ own: 3 });
    expect(parsePrintedLabel('Sheet 2')).toEqual({ own: 2 });
    expect(parsePrintedLabel('3')).toEqual({ own: 3 });
    expect(parsePrintedLabel('- 3 -')).toEqual({ own: 3 });
    expect(parsePrintedLabel('(12)')).toEqual({ own: 12 });
  });

  it('refuses the shapes that are not page numbers, because a wrong warning costs attention', () => {
    // A date is the most common run of digits on a letter, and the fraction rule would otherwise read
    // "23 of 04" out of it and report a page count of four.
    expect(parsePrintedLabel('23/04/2026')).toBeUndefined();
    expect(parsePrintedLabel('03/2026')).toBeUndefined();
    expect(parsePrintedLabel('April 2026')).toBeUndefined();
    expect(parsePrintedLabel('Annex B')).toBeUndefined();
    expect(parsePrintedLabel('Continued')).toBeUndefined();
    expect(parsePrintedLabel('£1,200')).toBeUndefined();
    // An amount is not a page either, and this is why the bare-number rule stops at three digits.
    expect(parsePrintedLabel('1200')).toBeUndefined();
  });

  it('takes the number after the word "page" as the page number it was told to copy', () => {
    // The keyword rule is deliberately trusting: the model was asked for a label printed on the page and
    // copied as printed, so a label that begins "Page 2" is reporting page 2 whatever follows it.
    expect(parsePrintedLabel('Page 2, please ignore')).toEqual({ own: 2 });
    expect(parsePrintedLabel('Page 2 of the agreement')).toEqual({ own: 2 });
  });
});

describe('checkPageLabels — the measured five-page run finds nothing, as it should', () => {
  it('is silent on five pages that each print their own number and the same count', () => {
    // `--stage=pages` read all five labels off the paper (`labels 5`), numbered 1–5 of 5.
    const transcript = assembled('Page 1 of 5', 'Page 2 of 5', 'Page 3 of 5', 'Page 4 of 5', 'Page 5 of 5');
    expect(checkPageLabels(transcript).findings).toEqual([]);
  });

  it('is silent when no page carries a number at all, which is most documents', () => {
    const transcript = assembled(null, null, null);
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([]);
    expect(result.parsed).toBe(0);
    expect(result.unparsed).toBe(0);
  });

  it('is silent when the paper prints words instead of numbers', () => {
    const transcript = assembled('Annex A', 'Annex B');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([]);
    expect(result.unparsed).toBe(2);
  });

  it('says nothing about a pasted document, which has no labels and no photographs', () => {
    const transcript = assembled(null);
    expect(checkPageLabels(transcript)).toEqual({ findings: [], parsed: 0, unparsed: 0, pageCount: 1 });
  });
});

describe('checkPageLabels — the hole is measured against the photographs, not against the answers', () => {
  it('does not report the unread page as a missing page', () => {
    // C-11's second assembly: five photographs, page 1 truncated, so its label left with its text and
    // `labels 4`. Compared against the four pages that answered, "Page 1 of 5" would look absent.
    const transcript = assembled('hole', 'Page 2 of 5', 'Page 3 of 5', 'Page 4 of 5', 'Page 5 of 5');
    expect(transcript.pageOffsets.length).toBe(5);
    expect(checkPageLabels(transcript).findings).toEqual([]);
  });

  it('names the unread photograph when a gap sits where one of them is', () => {
    const transcript = assembled('Page 1 of 5', 'Page 2 of 5', 'hole', 'Page 4 of 5', 'Page 5 of 5');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'gap', printed: 3, between: [1, 3], unreadPage: 2 }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).toContain('Page 3 of your photographs could not be read');
  });

  it('keeps the gap when nothing explains it, with no unread-page clause', () => {
    const transcript = assembled('Page 1 of 4', 'Page 2 of 4', null, 'Page 4 of 4');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'gap', printed: 3, between: [1, 3] }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).not.toContain('could not be read');
  });
});

describe('checkPageLabels — gaps, duplicates and the numbers that cannot belong here', () => {
  it('reports the same page photographed twice and the number it displaced', () => {
    const transcript = assembled('Page 1 of 5', 'Page 2 of 5', 'Page 3 of 5', 'Page 3 of 5', 'Page 5 of 5');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([
      { kind: 'duplicate', printed: 3, pages: [2, 3] },
      { kind: 'gap', printed: 4, between: [2, 4] },
    ]);
  });

  it('never calls a missing first number a gap, because page 1 is the page least likely to be numbered', () => {
    // Four photographs of a four-page document, the first carrying no printed number. "1" is absent from
    // the labels and that proves nothing — an unnumbered cover page is normal. Only a number *between*
    // two reported ones is a finding.
    const transcript = assembled(null, 'Page 2 of 4', 'Page 3 of 4', 'Page 4 of 4');
    expect(checkPageLabels(transcript).findings).toEqual([]);
  });

  it('reports a number that cannot belong to this many photographs', () => {
    const transcript = assembled('Page 1 of 3', 'Page 2 of 3', 'Page 6 of 3');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'out_of_range', printed: 6, page: 2, pageCount: 3 }]);
    // One gap claim would be invented by walking from 2 to 6, and it is the same photograph retaken.
    expect(kinds(result.findings)).not.toContain('gap');
  });

  it('reports a zero or negative number the same way, with wording that fits it', () => {
    const transcript = assembled('Page 0 of 3', 'Page 1 of 3', 'Page 2 of 3');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'out_of_range', printed: 0, page: 0, pageCount: 3 }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).toContain('not a page number that fits');
  });

  it('holds its order, so a screen reader hears the same sequence every run', () => {
    const transcript = assembled('Page 9 of 3', 'Page 2 of 3', 'Page 2 of 3');
    expect(kinds(checkPageLabels(transcript).findings)).toEqual(['out_of_range', 'duplicate']);
  });
});

describe('checkPageLabels — the page count the paper states', () => {
  it('says so when the document is longer than what was photographed', () => {
    const transcript = assembled('Page 1 of 4', 'Page 2 of 4', 'Page 3 of 4');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'total_differs', printed: 4, pageCount: 3, beyondCaptureCap: false }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).toContain('1 of them have not been read');
  });

  it('names the app limit when the document is longer than it can be shown at all', () => {
    const transcript = assembled('Page 1 of 9', 'Page 2 of 9');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'total_differs', printed: 9, pageCount: 2, beyondCaptureCap: true }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).toContain(`at most ${MAX_PAGES} photographs`);
  });

  it('says a photograph may belong to another document when there are more photographs than pages', () => {
    const transcript = assembled('Page 1 of 2', 'Page 2 of 2', null);
    expect(kinds(checkPageLabels(transcript).findings)).toEqual(['total_differs']);
    expect(pageLabelFindingMessage(checkPageLabels(transcript).findings[0]!)).toContain('a different document');
  });

  it('reports two different counts as a conflict rather than picking one', () => {
    const transcript = assembled('Page 1 of 3', 'Page 2 of 4');
    const result = checkPageLabels(transcript);
    expect(result.findings).toEqual([{ kind: 'conflicting_totals', printed: [3, 4], pages: [0, 1] }]);
    expect(pageLabelFindingMessage(result.findings[0]!)).toContain('different page counts');
  });
});

describe('checkPageLabels — what the messages are allowed to claim', () => {
  it('speaks about the photographs, never about the document losing a page', () => {
    // AGENTS.md §4 rule 10: the finding is about what was read. A sentence that asserts the document is
    // incomplete would be a guess about paper this app cannot see.
    const cases = [
      assembled('Page 1 of 5', 'Page 2 of 5', 'Page 3 of 5', 'Page 3 of 5', 'Page 5 of 5'),
      assembled('Page 1 of 5', 'Page 2 of 5', 'hole', 'Page 4 of 5', 'Page 5 of 5'),
      assembled('Page 1 of 4', 'Page 2 of 4', 'Page 3 of 4'),
      assembled('Page 1 of 3', 'Page 2 of 3', 'Page 6 of 3'),
    ];
    for (const transcript of cases) {
      for (const finding of checkPageLabels(transcript).findings) {
        expect(pageLabelFindingMessage(finding)).toContain('photograph');
      }
    }
  });

  it('joins at most three findings and counts the rest rather than reading a wall of them', () => {
    // Two numbers that cannot belong to five photographs (9 and 6), page 3 printed twice, and the gap it
    // leaves behind.
    const transcript = assembled('Page 9 of 5', 'Page 3 of 5', 'Page 3 of 5', 'Page 1 of 5', 'Page 6 of 5');
    const result = checkPageLabels(transcript);
    expect(kinds(result.findings)).toEqual(['out_of_range', 'out_of_range', 'duplicate', 'gap']);
    const summary = pageLabelSummary(result.findings);
    expect(summary.startsWith(result.findings.slice(0, 3).map(pageLabelFindingMessage).join(' '))).toBe(true);
    expect(summary).toContain('There is 1 more page-number difference to check.');
    expect(summary).not.toContain(pageLabelFindingMessage(result.findings[3]!));
    expect(pageLabelSummary([])).toBe('');
  });

  it('reads the labels, not the text, so numbers inside the reading cannot move the verdict', () => {
    const labelled = assembled('Page 1 of 4', 'Page 2 of 4', 'Page 3 of 4');
    // The same three photographs with the numbering also written into the page *bodies* — a letter that
    // quotes "Page 4 of 4" in its text, or a total like 99. The finding is about what the margins print,
    // so a different body must give the same result.
    const echoed = assembleDocument([
      { kind: 'ok', model: 'test-model', value: { text: 'Page 1 of 4. Page 2 of 4. Page 3 of 4. Page 4 of 4.', uncertain: [], captureIssues: [], pageLabel: 'Page 1 of 4' } },
      { kind: 'ok', model: 'test-model', value: { text: 'a body that names no numbers at all', uncertain: [], captureIssues: [], pageLabel: 'Page 2 of 4' } },
      { kind: 'ok', model: 'test-model', value: { text: 'Page 9 of 99', uncertain: [], captureIssues: [], pageLabel: 'Page 3 of 4' } },
    ]).transcript;
    expect(echoed.text).not.toBe(labelled.text);
    expect(checkPageLabels(echoed)).toEqual(checkPageLabels(labelled));
  });
});
