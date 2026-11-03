import { describe, expect, it } from 'vitest';
import { initialSession, MAX_PAGES, sessionReducer, type SessionAction } from '@/lib/session/reducer';
import type { Analysis, Page, QAEntry, Transcript, TrustRecord } from '@/types';

function page(id: string): Page {
  return { id, index: 0, blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), width: 1200, height: 1600 };
}

function transcript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    text: 'Invoice 42. Amount due £840.',
    pageOffsets: [0],
    uncertain: [],
    captureIssues: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    docType: 'bill',
    summary: 'A bill for £840.',
    facts: [
      { kind: 'amount', label: 'Payment due', value: '£840', sourceQuote: 'Amount due £840', quoteFound: true },
    ],
    actions: [],
    warnings: [],
    model: 'fixture-model',
    ...overrides,
  };
}

function trustRecord(overrides: Partial<TrustRecord> = {}): TrustRecord {
  return {
    id: 'tr-1',
    purpose: 'analyse',
    model: 'fixture-model',
    endpoint: 'fixtures',
    requestId: 'req-1',
    e2ee: false,
    attestation: { nonce: 'a'.repeat(64), fetchedAt: 1, checks: [], status: 'partial' },
    signature: { algo: 'ed25519', verified: false },
    claim: 'fixtures',
    ...overrides,
  };
}

/** Drive the reducer through a real sequence instead of hand-building state. */
function run(actions: SessionAction[], mode: 'fixtures' | 'relay' | 'direct' = 'fixtures') {
  return actions.reduce(sessionReducer, initialSession(mode));
}

describe('session reducer (F-07)', () => {
  it('starts in fixtures mode, idle, and holds no document data', () => {
    const s = initialSession();
    expect(s).toMatchObject({ mode: 'fixtures', status: 'idle', input: 'images' });
    expect(s.pages).toEqual([]);
    expect(s.transcript).toBeUndefined();
    expect(s.analysis).toBeUndefined();
    expect(s.trust).toEqual([]);
  });

  it('numbers pages in capture order', () => {
    const s = run([
      { type: 'page_added', page: page('p1') },
      { type: 'page_added', page: page('p2') },
      { type: 'page_added', page: page('p3') },
    ]);
    expect(s.pages.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(s.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(s.status).toBe('preparing');
  });

  it('refuses a sixth page and says so instead of failing silently', () => {
    const actions: SessionAction[] = Array.from({ length: MAX_PAGES }, (_, i) => ({
      type: 'page_added',
      page: page(`p${i}`),
    }));
    const s = run([...actions, { type: 'page_added', page: page('overflow') }]);
    expect(s.pages).toHaveLength(MAX_PAGES);
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('too_many_pages');
    expect(s.error?.userMessage).toContain('five pages');
  });

  it('reindexes after a removal so "Page n" stays contiguous', () => {
    const s = run([
      { type: 'page_added', page: page('p1') },
      { type: 'page_added', page: page('p2') },
      { type: 'page_added', page: page('p3') },
      { type: 'page_removed', id: 'p1' },
    ]);
    expect(s.pages.map((p) => [p.id, p.index])).toEqual([
      ['p2', 0],
      ['p3', 1],
    ]);
  });

  it('retake replaces the page in place and keeps its position', () => {
    const s = run([
      { type: 'page_added', page: page('p1') },
      { type: 'page_added', page: page('p2') },
      { type: 'page_retaken', id: 'p1', page: page('p1-new') },
    ]);
    expect(s.pages.map((p) => [p.id, p.index])).toEqual([
      ['p1-new', 0],
      ['p2', 1],
    ]);
  });

  it('ignores a retake for a page that is gone', () => {
    const before = run([{ type: 'page_added', page: page('p1') }]);
    expect(sessionReducer(before, { type: 'page_retaken', id: 'nope', page: page('x') })).toBe(before);
  });

  it('routes pasted text straight to analysis and images through transcription (ARCH §5.2)', () => {
    expect(run([{ type: 'input_selected', input: 'text' }, { type: 'analysis_started' }, { type: 'verification_passed' }]).status).toBe(
      'analysing',
    );
    expect(run([{ type: 'input_selected', input: 'images' }, { type: 'analysis_started' }, { type: 'verification_passed' }]).status).toBe(
      'transcribing',
    );
  });

  it('holds at "needs_retake" when the model reports a capture issue', () => {
    const s = run([
      { type: 'analysis_started' },
      { type: 'verification_passed' },
      { type: 'transcript_received', transcript: transcript({ captureIssues: [{ page: 0, issue: 'cut_off_right' }] }) },
    ]);
    expect(s.status).toBe('needs_retake');
    expect(s.transcript?.captureIssues).toHaveLength(1);
  });

  it('continues past a capture issue only when the user says to', () => {
    const stuck = run([
      { type: 'analysis_started' },
      { type: 'verification_passed' },
      { type: 'transcript_received', transcript: transcript({ captureIssues: [{ page: 0, issue: 'blurry' }] }) },
    ]);
    expect(sessionReducer(stuck, { type: 'retake_continued' }).status).toBe('analysing');
  });

  it('reaches ready with the analysis attached', () => {
    const s = run([
      { type: 'analysis_started' },
      { type: 'verification_passed' },
      { type: 'transcript_received', transcript: transcript() },
      { type: 'analysis_received', analysis: analysis() },
    ]);
    expect(s.status).toBe('ready');
    expect(s.analysis?.facts[0]?.quoteFound).toBe(true);
  });

  it('keeps what it already read when a later step fails (ARCH §13)', () => {
    const s = run([
      { type: 'analysis_started' },
      { type: 'verification_passed' },
      { type: 'transcript_received', transcript: transcript() },
      { type: 'failed', code: 'network_lost' },
    ]);
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('network_lost');
    expect(s.transcript?.text).toContain('£840');
    expect(s.error?.retryable).toBe(true);
  });

  it('appends trust records and Q&A without dropping earlier ones', () => {
    const entry: QAEntry = { id: 'q1', question: 'When is it due?', answer: 'Not stated.', notInDocument: true, askedAt: 2 };
    const s = run([
      { type: 'trust_recorded', record: trustRecord({ id: 'tr-1' }) },
      { type: 'trust_recorded', record: trustRecord({ id: 'tr-2' }) },
      { type: 'question_answered', entry },
    ]);
    expect(s.trust.map((t) => t.id)).toEqual(['tr-1', 'tr-2']);
    expect(s.qa).toHaveLength(1);
    expect(s.status).toBe('idle');
  });

  it('an answered question clears the error a refused question left, so the box cannot contradict the page', () => {
    const entry: QAEntry = { id: 'q1', question: 'Is there a payment plan?', answer: 'Nothing offers one.', notInDocument: true, askedAt: 3 };
    const s = run([
      { type: 'transcript_received', transcript: transcript() },
      { type: 'analysis_received', analysis: analysis() },
      { type: 'failed', code: 'no_fixture_for_question' },
      { type: 'question_answered', entry },
    ]);
    expect(s.error).toBeUndefined();
    expect(s.status).toBe('ready');
    // The refused question left no entry behind, the answered one is on screen: answers are
    // appended in the order asked (P-06), never substituted.
    expect(s.qa.map((q) => q.id)).toEqual(['q1']);
  });

  it('keeps the status honest when there is no analysis to show', () => {
    const entry: QAEntry = { id: 'q1', question: 'When is it due?', answer: 'Not stated.', notInDocument: true, askedAt: 2 };
    const s = run([{ type: 'failed', code: 'no_fixture_for_question' }, { type: 'question_answered', entry }]);
    // Nothing has been read, so nothing may claim the results view is ready (AGENTS.md §4 rule 5
    // applies to statuses as much as to verification).
    expect(s.status).toBe('idle');
    expect(s.error).toBeUndefined();
  });

  it('clears an error back to idle', () => {
    const errored = run([{ type: 'failed', code: 'verification_failed' }]);
    expect(sessionReducer(errored, { type: 'error_cleared' })).toMatchObject({ status: 'idle', error: undefined });
  });

  it('forgetting leaves a fresh session with nothing document-derived and keeps the mode', () => {
    const used = run(
      [
        { type: 'page_added', page: page('p1') },
        { type: 'analysis_started' },
        { type: 'verification_passed' },
        { type: 'transcript_received', transcript: transcript() },
        { type: 'analysis_received', analysis: analysis() },
        { type: 'trust_recorded', record: trustRecord() },
      ],
      'relay',
    );
    const forgotten = sessionReducer(used, { type: 'forgotten' });
    expect(forgotten).toMatchObject({ mode: 'relay', status: 'forgotten', input: 'images' });
    expect(forgotten.pages).toEqual([]);
    expect(forgotten.trust).toEqual([]);
    expect(forgotten.qa).toEqual([]);
    expect(forgotten.transcript).toBeUndefined();
    expect(forgotten.analysis).toBeUndefined();
    expect(forgotten.error).toBeUndefined();
    expect(forgotten.id).not.toBe(used.id);
    expect(JSON.stringify(forgotten)).not.toContain('840');
  });

  it('never mutates the previous state object', () => {
    const before = initialSession();
    const snapshot = JSON.stringify(before);
    sessionReducer(before, { type: 'page_added', page: page('p1') });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
