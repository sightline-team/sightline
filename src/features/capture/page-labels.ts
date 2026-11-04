import { MAX_PAGES } from '@/lib/session/reducer';
import type { Transcript } from '@/types';

/**
 * "Do the page numbers on the paper agree with each other?" (item **C-05**; spec:
 * `docs/ARCHITECTURE.md` §7's `Transcript.pageNumbersSeen`, §9 step 1).
 *
 * The person photographs 1–5 pages and never tells the app how the *document* is numbered. Each page's
 * label is whatever the model read off that page, copied as printed (§9: the user message says
 * `Transcribe this page.` and names no page and no count, so a reported label cannot be our own
 * sentence echoed back). Comparing those labels against each other is the only way to notice two
 * things a blind person cannot see for themselves: **the same page photographed twice**, and **a page
 * in the middle of a document that never got photographed**. Both are silent otherwise — the reading
 * is fluent, complete-looking, and missing a clause.
 *
 * ### Why the capture position is never the expected number
 *
 * `pageNumbersSeen` holds `{ page, label }`: the label the *paper* reported, beside the capture
 * position. Nothing here assumes page-at-position-2 prints "3". People photograph out of order, a
 * single-sided scan has no number on the back, and a form's third sheet can legitimately read "Page 1
 * of 2" because it is a different document's page — which is one of the findings below, and exactly
 * the kind of mistake a phone camera makes. The check compares printed numbers with printed numbers,
 * and printed numbers with **how many photographs were taken**, which is the one quantity we are
 * allowed to know (ADR-27: capture order is document order and nothing reorders it, so the count is
 * sound while the per-page identity is not).
 *
 * ### Silence is a correct answer, and this is the rule that keeps it that way
 *
 * A page with nothing printed on it is answered with no label at all (**C-03** measured exactly that:
 * `pageLabel absent`), and most letters, bills and leaves of instruction have no page numbers anywhere.
 * So:
 *  - a label that does not read as a page number is **not a finding** and is not counted — §4 rule 10
 *    forbids guessing, and `pageNumbersSeen` exists only to warn, never to reorder;
 *  - **only a gap *between* two reported numbers is claimed.** If the labels read 2, 3, 4 then "1" is
 *    absent, and that is not evidence of a missing first page — the first page may simply carry no
 *    number. A hole between 2 and 5 is different: two pages that *do* print their number disagree
 *    about what is between them;
 *  - fewer than two parseable labels still leaves two sound checks (a number too big for the number of
 *    photographs, and a page count that differs from it), so the check does not require coverage.
 *
 * **The direction every message faces:** a finding describes **what the photographs print**, never what
 * the document contains. "Two of your photographs print page 3" is a sentence we can stand behind from
 * the data in hand; "you are missing a page" is not, and AGENTS.md §4 rule 10 says surface the
 * uncertainty rather than smooth it. The copy is here rather than in a component so it is computed from
 * the finding, and it still owes **C-06**'s human plain-language review.
 *
 * Called by the capture screen (**C-02**) and the retake loop (**C-04**), before the structure step:
 * ESSENTIALS §Pipeline step 5 puts a capture problem *before* the person spends ≈2 minutes on a reading
 * of a document that is not the whole document.
 */

/** A page number read off one page, as distinct from the capture position it was found at. */
export interface PrintedLabel {
  /** The page's own number as printed. */
  own: number;
  /** How many pages the paper says the document has, when it prints one ("Page 2 **of 5**"). */
  total?: number;
}

/**
 * `2 of 3`, `2 out of 3`, `2/3`. Ordered before {@link KEYWORD_LABEL} because "Page 2 of 3" must yield
 * both numbers, not just the first.
 */
const FRACTION_LABEL = /(\d+)\s*(?:of|out of|\/)\s*(\d+)/i;

/** A number with a page-shaped word in front of it: `Page 3`, `p. 3`, `Sheet 2`, `No. 3`. */
const KEYWORD_LABEL = /(?:pages?|p\.|nos?\.|no\.|sheet|letter|part|clause|annex)\s*(?:no\.?|number|#)?\s*(\d+)/i;

/** The whole label is one number with decoration around it: `3`, `- 3 -`, `(3)`. */
const STANDALONE_LABEL = /^[\s\-–—.·()#*]*(\d{1,3})[\s\-–—.·()#*]*$/;

/**
 * `2/3/2024` and `3-4-2024` are dates, and a date is the single most common run of digits on a
 * document. Rejected before the fraction rule rather than after it, because the fraction rule would
 * otherwise read "2 of 3" out of a date and report a page count. `12/2024` goes the same way: a
 * two-part number with a four-digit year is a month and a year, never "page 12 of 2024".
 */
const DATE_SHAPE = /\d\s*[/-]\s*\d\s*[/-]\s*\d|\d{1,2}\s*[/-]\s*\d{4}/;

/**
 * The label as printed, read as a page number — or `undefined`, which is the answer for most real
 * documents and is never a finding. Deliberately narrow: three shapes, in this order, and a date is
 * excluded first. Anything looser turns a reference number, an amount or a year into a warning the
 * person cannot act on — which is why the bare-number rule stops at three digits: a label that is
 * nothing but `2024` is a year, and a four-digit page number could only ever produce a warning.
 */
export function parsePrintedLabel(label: string): PrintedLabel | undefined {
  if (DATE_SHAPE.test(label)) return undefined;

  const fraction = FRACTION_LABEL.exec(label);
  if (fraction) return { own: Number(fraction[1]), total: Number(fraction[2]) };

  const keyword = KEYWORD_LABEL.exec(label);
  if (keyword) return { own: Number(keyword[1]) };

  const standalone = STANDALONE_LABEL.exec(label);
  if (standalone) return { own: Number(standalone[1]) };

  return undefined;
}

/**
 * One thing the printed numbers disagree about. Data only; the sentence a person hears comes from
 * {@link pageLabelFindingMessage}, so a finding cannot be reported without its wording.
 */
export type PageLabelFinding =
  /** Two photographs print the same page number. */
  | { kind: 'duplicate'; printed: number; pages: number[] }
  /**
   * A number between two reported ones is on no page. `between` holds the capture positions of the two
   * reported labels either side of it; {@link unreadPage} is set when a page that yielded no text sits
   * between them, because then the hole is the likely reason and the person hears one story, not two.
   */
  | { kind: 'gap'; printed: number; between: [number, number]; unreadPage?: number }
  /** A printed number that cannot belong to any of the photographs taken (0, negative, or past the count). */
  | { kind: 'out_of_range'; printed: number; page: number; pageCount: number }
  /** Two pages print different totals ("of 3" and "of 5") — usually two documents, or a misread. */
  | { kind: 'conflicting_totals'; printed: number[]; pages: number[] }
  /** The total the paper prints disagrees with the number of photographs taken. */
  | { kind: 'total_differs'; printed: number; pageCount: number; beyondCaptureCap: boolean };

export interface PageLabelFindings {
  /** Stable order, fixed by {@link checkPageLabels}: a screen reader hears the same order every run. */
  findings: PageLabelFinding[];
  /** How many labels the paper reported and this module could read as a page number. */
  parsed: number;
  /** How many labels were reported but are not page numbers ("Annex B", a date, a heading). */
  unparsed: number;
  /** The number of photographs the transcript was assembled from — `Transcript.pageOffsets.length`. */
  pageCount: number;
}

/**
 * The page-label sanity check: gaps and duplicates among the numbers the photographs print, plus the
 * two disagreements a single labelled page can already show (a number too big for the set, a total that
 * does not match the set).
 *
 * Takes the assembled {@link Transcript} rather than a page count and a label list, so the count cannot
 * be handed to it wrong: `pageOffsets.length` *is* how many photographs went into the join, including
 * the pages that came back empty. That is what makes the check survive ADR-27's hole — with five
 * photographs and page 1 unread the labels read 2, 3, 4, 5, and the count it compares them against is
 * still 5. A pasted transcript has no labels and gets no findings.
 */
export function checkPageLabels(transcript: Transcript): PageLabelFindings {
  // Nothing but the label is read here: `page` is kept to say *which photograph* to retake.
  const reported = (transcript.pageNumbersSeen ?? [])
    .map((seen) => ({ page: seen.page, label: parsePrintedLabel(seen.label) }))
    .filter((seen): seen is { page: number; label: PrintedLabel } => seen.label !== undefined);

  const pageCount = transcript.pageOffsets.length;
  const findings: PageLabelFinding[] = [];

  // 1. Per-photograph findings first, in capture order.
  const outOfRange: PageLabelFinding[] = reported
    .filter(({ page, label }) => label.own < 1 || label.own > pageCount)
    .map(({ page, label }) => ({ kind: 'out_of_range', printed: label.own, page, pageCount }));
  findings.push(...outOfRange);

  // 2. Duplicates, then gaps, both in ascending printed order.
  const byOwn = new Map<number, number[]>();
  const firstToPrint = new Map<number, number>();
  for (const { page, label } of reported) {
    const pages = byOwn.get(label.own) ?? [];
    pages.push(page);
    byOwn.set(label.own, pages);
    // Which photograph *first* prints each number — `reported` is in capture order, so this is the lowest.
    if (!firstToPrint.has(label.own)) firstToPrint.set(label.own, page);
  }

  for (const [own, pages] of [...byOwn.entries()].sort(([a], [b]) => a - b)) {
    if (pages.length > 1) findings.push({ kind: 'duplicate', printed: own, pages: [...pages].sort((a, b) => a - b) });
  }

  // Only *between* two reported numbers — see the module note on why a missing first number says nothing.
  // And only among numbers that could belong to this set of photographs: an out-of-range label would
  // otherwise invent a gap along the whole way to it, which finding 1 has already told the person about.
  const plausible = [...firstToPrint.entries()]
    .filter(([own]) => own >= 1 && own <= pageCount)
    .sort(([a], [b]) => a - b);
  const holes = transcript.missingPages ?? [];

  let previous: { own: number; at: number } | undefined;
  for (const [own, at] of plausible) {
    if (previous) {
      const between: [number, number] = previous.at <= at ? [previous.at, at] : [at, previous.at];
      for (let printed = previous.own + 1; printed < own; printed += 1) {
        const unreadPage = holes.find((missing) => missing.page > between[0] && missing.page < between[1])?.page;
        findings.push({
          kind: 'gap',
          printed,
          between,
          ...(unreadPage === undefined ? {} : { unreadPage }),
        });
      }
    }
    previous = { own, at };
  }

  // 3. The totals the paper prints.
  const totals = reported.flatMap(({ page, label }) =>
    label.total !== undefined && label.total >= 1 ? [{ page, total: label.total }] : [],
  );
  const distinctTotals = [...new Set(totals.map((t) => t.total))].sort((a, b) => a - b);
  const [onlyTotal] = distinctTotals;

  if (distinctTotals.length > 1) {
    findings.push({
      kind: 'conflicting_totals',
      printed: distinctTotals,
      pages: totals.map((t) => t.page),
    });
  } else if (onlyTotal !== undefined && onlyTotal !== pageCount) {
    findings.push({
      kind: 'total_differs',
      printed: onlyTotal,
      pageCount,
      beyondCaptureCap: onlyTotal > MAX_PAGES,
    });
  }

  return {
    findings,
    parsed: reported.length,
    unparsed: (transcript.pageNumbersSeen?.length ?? 0) - reported.length,
    pageCount,
  };
}

/** The plain-language sentence for one finding, said about the photographs rather than the document. */
export function pageLabelFindingMessage(finding: PageLabelFinding): string {
  switch (finding.kind) {
    case 'duplicate':
      return `Two of your photographs print the same page number, ${finding.printed}. One of them may be the same page twice, or a page may not have been photographed.`;
    case 'gap': {
      const base = `Your photographs print page numbers that skip ${finding.printed}. Nothing you photographed says it is page ${finding.printed}.`;
      return finding.unreadPage === undefined
        ? base
        : `${base} Page ${finding.unreadPage + 1} of your photographs could not be read, which may be why.`;
    }
    case 'out_of_range':
      return finding.printed < 1
        ? `One of your photographs prints page ${finding.printed}, which is not a page number that fits the ${finding.pageCount} you photographed.`
        : `One of your photographs prints page ${finding.printed}, and you photographed ${finding.pageCount} pages. It may belong to a different document.`;
    case 'conflicting_totals':
      return `Your photographs give different page counts: ${finding.printed.join(' and ')}. They may not all be pages of the same document.`;
    case 'total_differs':
      return finding.beyondCaptureCap
        ? `One of your photographs says the document has ${finding.printed} pages. This app reads at most ${MAX_PAGES} photographs at a time, so ${finding.printed - MAX_PAGES} of them cannot be read here.`
        : finding.printed > finding.pageCount
          ? `One of your photographs says the document has ${finding.printed} pages, and you photographed ${finding.pageCount}. ${finding.printed - finding.pageCount} of them have not been read.`
          : `One of your photographs says the document has ${finding.printed} pages, and you photographed ${finding.pageCount}. One photograph may be of a different document.`;
  }
}

/** The one string an announcement gets. Ordered, and never more than three findings at once. */
export function pageLabelSummary(findings: readonly PageLabelFinding[]): string {
  if (findings.length === 0) return '';
  const shown = findings.slice(0, 3).map(pageLabelFindingMessage).join(' ');
  const rest = findings.length - 3;
  return rest > 0 ? `${shown} There is ${rest} more page-number difference to check.` : shown;
}
