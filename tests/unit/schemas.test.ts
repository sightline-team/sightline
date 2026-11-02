import { describe, expect, it } from 'vitest';
import {
  analysisSchema,
  captureIssueSchema,
  factKindSchema,
  qaSchema,
  transcribeSchema,
} from '@/features/analysis/schemas';

/**
 * Model output is untrusted input (AGENTS.md §7), so these tests are about what the schema
 * refuses and what it quietly drops. Two behaviours matter most: an unknown `confidence` field
 * must never survive to the UI (ADR-11 cut self-reported confidence), and a malformed required
 * field must fail loudly rather than default into a plausible-looking transcript.
 */
const valid = {
  docType: 'bill',
  summary: 'A bill for care at Northgate.',
  facts: [{ kind: 'amount', label: 'Amount due', value: '£840', sourceQuote: 'Amount due: £840' }],
  actions: [{ text: 'Pay by 30 days', sourceQuote: 'within 30 days' }],
  warnings: [{ kind: 'financial', text: 'Money is owed.' }],
};
describe('transcribeSchema', () => {
  it('accepts a clean transcription and fills the optional arrays', () => {
    const parsed = transcribeSchema.parse({ text: 'Hello\nWorld' });
    expect(parsed.text).toBe('Hello\nWorld');
    expect(parsed.uncertain).toEqual([]);
    expect(parsed.captureIssues).toEqual([]);
  });

  it('refuses an empty transcript — silence is not a reading', () => {
    expect(transcribeSchema.safeParse({ text: '' }).success).toBe(false);
  });

  it('refuses a missing text field instead of defaulting it', () => {
    expect(transcribeSchema.safeParse({ uncertain: [] }).success).toBe(false);
  });

  it('keeps illegible spans with a reason, which is how we surface unreadable text instead of guessing it', () => {
    const parsed = transcribeSchema.parse({
      text: 'Dose: 2 [illegible] mg',
      uncertain: [{ start: 7, end: 17, reason: 'illegible' }],
    });
    expect(parsed.uncertain[0]!.reason).toBe('illegible');
  });

  it('refuses a span that runs backwards, which would corrupt page offsets', () => {
    expect(transcribeSchema.safeParse({ text: 'x', uncertain: [{ start: 10, end: 4, reason: 'illegible' }] }).success).toBe(false);
    expect(transcribeSchema.safeParse({ text: 'x', uncertain: [{ start: 5, end: 5, reason: 'illegible' }] }).success).toBe(false);
  });

  it('refuses an unknown span reason', () => {
    expect(transcribeSchema.safeParse({ text: 'x', uncertain: [{ start: 0, end: 2, reason: 'probably' }] }).success).toBe(false);
  });

  it('refuses a capture issue we have no message for, so an added enum value cannot arrive silently', () => {
    expect(transcribeSchema.safeParse({ text: 'x', captureIssues: ['dark_photo'] }).success).toBe(false);
  });

  it.each(['cut_off_top', 'cut_off_bottom', 'cut_off_left', 'cut_off_right', 'rotated', 'glare', 'too_small_text', 'blurry', 'not_a_document', 'handwriting_present'] as const)(
    'accepts capture issue %s',
    (issue) => {
      expect(captureIssueSchema.safeParse(issue).success).toBe(true);
      expect(transcribeSchema.safeParse({ text: 'x', captureIssues: [issue] }).success).toBe(true);
    },
  );
});

describe('analysisSchema', () => {

  it('accepts a well-formed analysis', () => {
    expect(analysisSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a summary, because an empty summary is the failure the user notices least', () => {
    expect(analysisSchema.safeParse({ ...valid, summary: '' }).success).toBe(false);
    // `undefined`, not a deleted key: spreading `{...valid}` would re-add the summary we are
    // trying to omit.
    expect(analysisSchema.safeParse({ ...valid, summary: undefined }).success).toBe(false);
  });

  it('refuses an unknown document type rather than mapping it to "other"', () => {
    expect(analysisSchema.safeParse({ ...valid, docType: 'insurance' }).success).toBe(false);
  });

  it('refuses a fact with no sourceQuote — an unsourced "key fact" is the thing we tell users not to trust', () => {
    expect(analysisSchema.safeParse({ ...valid, facts: [{ kind: 'amount', label: 'x', value: 'y', sourceQuote: '' }] }).success).toBe(false);
    expect(analysisSchema.safeParse({ ...valid, facts: [{ kind: 'amount', label: 'x', value: 'y' }] }).success).toBe(false);
  });

  it('requires an action to carry its quote too', () => {
    expect(analysisSchema.safeParse({ ...valid, actions: [{ text: 'Pay now' }] }).success).toBe(false);
  });

  it.each(['date', 'amount', 'phone', 'reference', 'medication', 'dose', 'address', 'other'] as const)(
    'accepts fact kind %s',
    (kind) => {
      expect(factKindSchema.safeParse(kind).success).toBe(true);
    },
  );

  it('refuses a fact kind that would let the model invent a category', () => {
    expect(factKindSchema.safeParse('conclusion').success).toBe(false);
  });
});

describe('fields that must not survive', () => {
  it('strips a model-reported confidence instead of showing it (ADR-11)', () => {
    const parsed = analysisSchema.parse({ ...valid, confidence: 0.98 });
    expect('confidence' in parsed).toBe(false);
  });

  it('strips confidence on individual facts too', () => {
    const parsed = analysisSchema.parse({
      docType: 'bill',
      summary: 's',
      facts: [{ kind: 'amount', label: 'a', value: 'b', sourceQuote: 'q', confidence: 0.9, certainty: 'high' }],
    });
    expect(parsed.facts[0]).toEqual({ kind: 'amount', label: 'a', value: 'b', sourceQuote: 'q' });
  });

  it('strips a quoteFound the model tried to set itself — grounding is code-only', () => {
    const parsed = analysisSchema.parse({
      docType: 'bill',
      summary: 's',
      facts: [{ kind: 'amount', label: 'a', value: 'b', sourceQuote: 'q', quoteFound: true }],
    });
    expect(parsed.facts[0]).not.toHaveProperty('quoteFound');
  });

  it('strips unknown keys on the transcript rather than rejecting the whole page for noise', () => {
    const parsed = transcribeSchema.parse({ text: 'hello', model_notes: 'I am very confident', page_summary: 'ignored' });
    expect(parsed).not.toHaveProperty('model_notes');
    expect(parsed.text).toBe('hello');
  });
});

describe('qaSchema', () => {
  it('requires the notInDocument flag, which is how a guess is told apart from an answer', () => {
    expect(qaSchema.safeParse({ answer: 'Tuesday' }).success).toBe(false);
  });

  it('accepts an honest "not in the document" answer with no quote', () => {
    const parsed = qaSchema.parse({ answer: 'The letter does not say.', notInDocument: true });
    expect(parsed.notInDocument).toBe(true);
    expect(parsed.sourceQuote).toBeUndefined();
  });

  it('refuses an empty answer', () => {
    expect(qaSchema.safeParse({ answer: '', notInDocument: false }).success).toBe(false);
  });
});
