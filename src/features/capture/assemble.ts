import type { TranscribeOutput } from '@/features/capture/schemas';
import type { CompletionResult } from '@/lib/near-ai/completion';
import { unreadablePageMarker } from '@/lib/transcript/holes';
import type { CaptureIssue, MissingPage, Transcript, UncertainSpan } from '@/types';

/**
 * Five pages, one document (item **C-11**; spec: `docs/ARCHITECTURE.md` §7's `Transcript`, §9 step 1,
 * §13's `finish_reason: length` row, **ADR-27**).
 *
 * `transcribePage` (C-03) reads *a* page. Nothing until now turned several pages into the one
 * `Transcript` the structure step and the full-text screen consume, and the gap is not just the
 * joining: `TranscribeOutput.uncertain` holds character offsets **into that page's own text**
 * (`features/capture/schemas.ts`), so five pages concatenated without remapping would leave every
 * "this part is uncertain" mark pointing at whichever page happened to sit at that position in the
 * joined string. The person then hears "part of this is unreadable" over the wrong words, which is
 * worse than not saying it (AGENTS.md §4 rule 10). The same array is what lets a quote, a warning or
 * a retake be traced back to the photograph it came from.
 *
 * ### What a failed page does (ADR-27)
 *
 * A page whose reply was truncated or unreadable leaves a **hole in the reading, shown where the hole
 * is**: `unreadablePageMarker()` goes into the joined text at that page's position and the page is
 * recorded in `missing` with the error code the service step actually returned. Three alternatives were
 * rejected:
 *  - *drop the page quietly* — the summary would then describe four of five photographs as if it
 *    described five, and the missing one is usually the page with the clause in it;
 *  - *halt the run* — a 28 s page (SPIKE §4, C-11's five-page mean) failing would throw away the other four and the
 *    person's whole upload, and §13's image-path rows are degradations, not stops (only a refusal
 *    stops, and `readCompletion`'s `refused` never reaches this function);
 *  - *keep the partial text of a truncated reply* — there usually is none. `finish_reason: length` on
 *    a reasoning model returns `content: null` (SPIKE §1, **P-13**) or a JSON object cut off mid-string,
 *    and a cut-off object has no validated `text` field to keep. So a truncated page contributes no
 *    words, and ADR-23's fixed 8,192 is why: the truncation is evidence the page is too dense to be one
 *    photograph, which is a **split** decision (§13's "split by page") and not a number to raise here.
 *
 * `usable` is what the run acts on: a document with a hole still gets a reading, and the reading has
 * to say so.
 *
 * **The marker's own cost is closed where the marker is read, not here:** putting our sentence inside a
 * transcript that is otherwise verbatim means `quoteFound` could credit it, so
 * `lib/transcript/holes.ts` masks it out of the text grounding searches (**P-17**, and the tests in
 * `tests/unit/grounding.test.ts`).
 *
 * ### Nothing is reordered
 *
 * Capture order is document order and stays that way. `pageNumbersSeen` carries the labels the pages
 * *report* alongside their capture position so that C-05's gap-and-duplicate check compares the paper's
 * numbering against the person's photographs; reordering here would make that check pass by
 * construction, and §7's comment on the field says "never to reorder silently" for the same reason.
 *
 * ### Byte positions, not line positions
 *
 * Offsets are characters in a JS string, which is what `uncertain` already counts and what
 * `slice` on the joined text agrees with. The joiner is a fixed two newlines rather than a decorative
 * separator because a page boundary has to survive a screen reader, a `slice`, and the arithmetic below
 * — and because anything variable (a rule line, "— page 2 —") would itself become part of the
 * transcript the structure step is asked to quote from.
 */

/** What separates two pages in the joined transcript. Counted into every offset below. */
export const PAGE_JOINER = '\n\n';

/**
 * One page's outcome, in capture order. A `refused` reply is **not** in this type on purpose: §13 makes
 * a refusal halt the run (`features/analysis/pipeline.ts`'s `refused` branch), so a caller that has one
 * in hand has a decision to make before it has an assembly to call.
 */
export type PageOutcome = Exclude<CompletionResult<TranscribeOutput>, { kind: 'refused' }>;

export interface AssembledDocument {
  transcript: Transcript;
  /**
   * False when **no** page contributed text, which is the one case where the joined transcript is only
   * markers. The run must not send that to the structure step: it would be billed to read a document
   * made of our own sentences and would answer with a summary of the failure.
   */
  usable: boolean;
  /**
   * Uncertain spans the model reported at offsets outside the page they belong to, and which therefore
   * could not be placed. Counted rather than silently discarded — `schemas.ts` validates that a span
   * runs forward but cannot validate it against a length the model did not state — and a non-zero count
   * belongs in the announcement, because it is a notice about unreadable writing that went missing.
   */
  unplaceableSpans: number;
}

export function assembleDocument(pages: readonly PageOutcome[]): AssembledDocument {
  const chunks: string[] = [];
  const pageOffsets: number[] = [];
  const uncertain: UncertainSpan[] = [];
  const captureIssues: { page: number; issue: CaptureIssue }[] = [];
  const pageNumbersSeen: { page: number; label: string }[] = [];
  const missingPages: MissingPage[] = [];

  let cursor = 0;
  let unplaceableSpans = 0;
  let readablePages = 0;

  pages.forEach((outcome, page) => {
    if (page > 0) cursor += PAGE_JOINER.length;
    const pageStart = cursor;
    pageOffsets.push(pageStart);

    const text = outcome.kind === 'ok' ? outcome.value.text : unreadablePageMarker(page);
    chunks.push(text);
    cursor += text.length;

    if (outcome.kind !== 'ok') {
      missingPages.push({ page, code: outcome.error.code });
      return;
    }
    readablePages += 1;

    // The shift is the whole reason this file exists. A span is clamped into its own page's region
    // first, because a model is allowed to miscount and an unclamped end would mark the *next* page's
    // readable words as unreadable.
    for (const span of outcome.value.uncertain) {
      const from = Math.min(span.start, text.length);
      const to = Math.min(span.end, text.length);
      if (to <= from) {
        unplaceableSpans += 1;
        continue;
      }
      uncertain.push({ start: from + pageStart, end: to + pageStart, reason: span.reason });
    }

    for (const issue of outcome.value.captureIssues) captureIssues.push({ page, issue });
    if (outcome.value.pageLabel !== undefined) pageNumbersSeen.push({ page, label: outcome.value.pageLabel });
  });

  return {
    transcript: {
      text: chunks.join(PAGE_JOINER),
      pageOffsets,
      uncertain,
      captureIssues,
      pageNumbersSeen,
      ...(missingPages.length === 0 ? {} : { missingPages }),
    },
    usable: readablePages > 0,
    unplaceableSpans,
  };
}
