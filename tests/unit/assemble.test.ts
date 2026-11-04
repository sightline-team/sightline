import { describe, expect, it } from 'vitest';
import { assembleDocument, PAGE_JOINER, type PageOutcome } from '@/features/capture/assemble';
import { missingPagesAnnouncement, unreadablePageMarker } from '@/lib/transcript/holes';
import { appError } from '@/lib/errors';
import type { TranscribeOutput } from '@/features/capture/schemas';
import type { Transcript } from '@/types';

/**
 * C-11 — five pages, one transcript, and the offsets still mean what they say.
 *
 * The tests are written against `slice`, not against hand-computed numbers, because the property that
 * matters is "cutting the joined string at a page's offset gives back that page" — a hand-written
 * offset that agrees with a hand-written expectation proves nothing about the joiner.
 */

function page(text: string, extra: Partial<TranscribeOutput> = {}): TranscribeOutput {
  return { text, uncertain: [], captureIssues: [], pageLabel: undefined, ...extra };
}

function ok(value: TranscribeOutput): PageOutcome {
  return { kind: 'ok', value, model: 'test-model' };
}

const truncated: PageOutcome = { kind: 'truncated', error: appError('output_truncated') };
const unreadable: PageOutcome = { kind: 'unreadable', error: appError('invalid_model_output') };

function assemble(...outcomes: PageOutcome[]): { transcript: Transcript; usable: boolean; unplaceableSpans: number } {
  return assembleDocument(outcomes);
}

/**
 * The slice of the joined transcript that page `i` occupies. The next page's offset is *after* the
 * joiner, so the joiner is subtracted here — the arithmetic C-11 exists to get right, written out
 * once so every offset test reads as a claim about pages rather than about `+ 2`.
 */
function regionOf(transcript: Transcript, i: number): string {
  const start = transcript.pageOffsets[i]!;
  const next = transcript.pageOffsets[i + 1];
  return transcript.text.slice(start, next === undefined ? undefined : next - PAGE_JOINER.length);
}

describe('assembleDocument — the join and the offsets', () => {
  it('puts each page back where its offset says it is', () => {
    const { transcript } = assemble(ok(page('first page body')), ok(page('second page body')), ok(page('third')));
    expect(transcript.pageOffsets.map((_, i) => regionOf(transcript, i))).toEqual(['first page body', 'second page body', 'third']);
    expect(transcript.pageOffsets[0]).toBe(0);
  });

  it('counts the joiner into every offset, so offsets are strictly increasing', () => {
    const { transcript } = assemble(ok(page('aa')), ok(page('bb')), ok(page('cc')));
    expect(transcript.pageOffsets).toEqual([0, 2 + PAGE_JOINER.length, 2 * (2 + PAGE_JOINER.length)]);
    expect(transcript.text).toBe(['aa', 'bb', 'cc'].join(PAGE_JOINER));
    expect(transcript.pageOffsets.every((o, i) => i === 0 || o > transcript.pageOffsets[i - 1]!)).toBe(true);
  });

  it('keeps capture order, because capture order is the order the person photographed in', () => {
    const { transcript } = assemble(ok(page('one')), ok(page('two')));
    expect(transcript.text.indexOf('one')).toBeLessThan(transcript.text.indexOf('two'));
  });

  it('is one page with paste-shaped input — offset 0 and nothing else', () => {
    const { transcript, usable } = assemble(ok(page('only page')));
    expect(transcript.pageOffsets).toEqual([0]);
    expect(transcript.text).toBe('only page');
    expect(usable).toBe(true);
  });
});

describe('assembleDocument — uncertain spans move with their page', () => {
  it('shifts a span by exactly its page offset, so it still covers its own words', () => {
    const { transcript } = assemble(
      ok(page('Alpha text here.', { uncertain: [{ start: 6, end: 10, reason: 'illegible' }] })),
      ok(page('Beta text here.', { uncertain: [{ start: 0, end: 4, reason: 'low_contrast' }] })),
    );
    expect(transcript.uncertain).toHaveLength(2);
    expect(transcript.text.slice(transcript.uncertain[0]!.start, transcript.uncertain[0]!.end)).toBe('text');
    expect(transcript.text.slice(transcript.uncertain[1]!.start, transcript.uncertain[1]!.end)).toBe('Beta');
    expect(transcript.uncertain[1]!.reason).toBe('low_contrast');
  });

  it('never lets a span reach past its own page into the next one, even when the model miscounts', () => {
    const { transcript } = assemble(
      ok(page('short', { uncertain: [{ start: 0, end: 400, reason: 'illegible' }] })),
      ok(page('the next page says nothing about being unreadable')),
    );
    const span = transcript.uncertain[0]!;
    expect(transcript.text.slice(span.start, span.end)).toBe('short');
  });

  it('counts a span that lies wholly outside its page instead of dropping it in silence', () => {
    const { transcript, unplaceableSpans } = assemble(ok(page('short', { uncertain: [{ start: 90, end: 120, reason: 'cropped' }] })));
    expect(transcript.uncertain).toEqual([]);
    expect(unplaceableSpans).toBe(1);
  });
});

describe('assembleDocument — what the pages reported', () => {
  it('tags every capture issue with the page it came from', () => {
    const { transcript } = assemble(
      ok(page('p1', { captureIssues: ['glare', 'rotated'] })),
      ok(page('p2')),
      ok(page('p3', { captureIssues: ['cut_off_bottom'] })),
    );
    expect(transcript.captureIssues).toEqual([
      { page: 0, issue: 'glare' },
      { page: 0, issue: 'rotated' },
      { page: 2, issue: 'cut_off_bottom' },
    ]);
  });

  it('records page labels against capture position, which is what C-05 compares', () => {
    const { transcript } = assemble(ok(page('p1', { pageLabel: 'Page 1 of 3' })), ok(page('p2')), ok(page('p3', { pageLabel: 'Page 3 of 3' })));
    expect(transcript.pageNumbersSeen).toEqual([
      { page: 0, label: 'Page 1 of 3' },
      { page: 2, label: 'Page 3 of 3' },
    ]);
  });

  it('carries an empty label list when no page printed one', () => {
    const { transcript } = assemble(ok(page('p1')), ok(page('p2')));
    expect(transcript.pageNumbersSeen).toEqual([]);
  });
});

describe('assembleDocument — a page that yielded nothing (ADR-27)', () => {
  it('marks the hole in the reading rather than dropping the page', () => {
    const { transcript } = assemble(ok(page('page one')), truncated, ok(page('page three')));
    expect(transcript.text).toBe(['page one', unreadablePageMarker(1), 'page three'].join(PAGE_JOINER));
    expect(transcript.missingPages).toEqual([{ page: 1, code: 'output_truncated' }]);
  });

  it('says which page with the number the person counted, not the index', () => {
    expect(unreadablePageMarker(0)).toBe('[page 1 could not be read]');
    expect(unreadablePageMarker(4)).toBe('[page 5 could not be read]');
  });

  it('keeps the offsets usable when a page is missing — a marker is still a region', () => {
    const { transcript } = assemble(ok(page('a')), unreadable, ok(page('b')));
    expect(transcript.pageOffsets.map((_, i) => regionOf(transcript, i))).toEqual(['a', unreadablePageMarker(1), 'b']);
  });

  it('still reads the document when one page of five fails', () => {
    const { usable, transcript } = assemble(ok(page('1')), ok(page('2')), truncated, ok(page('4')), ok(page('5')));
    expect(usable).toBe(true);
    expect(transcript.missingPages).toHaveLength(1);
  });

  it('refuses to call an all-markers transcript a document, because it is not one', () => {
    const { usable, transcript } = assemble(truncated, unreadable);
    expect(usable).toBe(false);
    expect(transcript.missingPages).toHaveLength(2);
    expect(transcript.text).toBe([unreadablePageMarker(0), unreadablePageMarker(1)].join(PAGE_JOINER));
  });

  it('keeps the reason each page failed, because the advice differs', () => {
    const { transcript } = assemble(truncated, unreadable);
    expect(transcript.missingPages?.map((m) => m.code)).toEqual(['output_truncated', 'invalid_model_output']);
  });

  it('says nothing about missing pages when every page answered', () => {
    const { transcript } = assemble(ok(page('a')), ok(page('b')));
    expect(transcript.missingPages).toBeUndefined();
  });

  it('has nothing to assemble from zero pages, and does not pretend otherwise', () => {
    const { usable, transcript } = assemble();
    expect(usable).toBe(false);
    expect(transcript.text).toBe('');
    expect(transcript.pageOffsets).toEqual([]);
  });
});

/**
 * What the run says out loud about a hole (item **C-02**). The input is a real `assembleDocument`
 * result rather than a hand-built `missingPages` list, so the numbers the person hears are the ones the
 * joiner actually records — and they are the numbers in the marker the transcript carries.
 */
describe('missingPagesAnnouncement — the hole is spoken as well as marked (ADR-27, C-02)', () => {
  it('names the page the marker names, in the words the transcript already shows', () => {
    const { transcript } = assemble(ok(page('page one')), truncated, ok(page('page three')));
    const announcement = missingPagesAnnouncement(transcript.missingPages ?? []);

    expect(announcement).toBe(
      'Page 2 could not be read, so the text has those places marked instead of guessed. Sightline read the others.',
    );
    expect(transcript.text).toContain('[page 2 could not be read]');
  });

  it('says nothing when there is nothing missing, which is the paste shape too', () => {
    const { transcript } = assemble(ok(page('a')), ok(page('b')));
    expect(missingPagesAnnouncement(transcript.missingPages ?? [])).toBe('');
    expect(missingPagesAnnouncement([])).toBe('');
  });

  it('joins two holes with “and”, keeping both page numbers', () => {
    const { transcript } = assemble(ok(page('a')), truncated, ok(page('c')), unreadable);
    expect(missingPagesAnnouncement(transcript.missingPages ?? [])).toContain('Page 2 and Page 4 could not be read');
  });

  it('names three and counts the rest, because a list is not something a listener can hold', () => {
    const { transcript } = assemble(truncated, truncated, truncated, ok(page('d')), truncated);
    expect(missingPagesAnnouncement(transcript.missingPages ?? [])).toContain('Page 1, Page 2, Page 3 and 1 more page could not be read');
  });

  it('reports on the photographs it was given and never on the document they came from', () => {
    // ADR-28's direction, applied to this sentence: five photographs are the only set with evidence
    // behind them, so "your document is incomplete" is a claim this run cannot make.
    const { transcript } = assemble(truncated, ok(page('b')));
    const announcement = missingPagesAnnouncement(transcript.missingPages ?? []);
    expect(announcement).not.toMatch(/document/i);
    expect(announcement).not.toMatch(/missing page/i);
  });
});
