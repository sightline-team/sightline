import { describe, expect, it } from 'vitest';
import { SAFETY_NOTICE_IDS, safetyNotices, type SafetyNoticeId } from '@/features/safety/notices';
import { analysisSchema } from '@/features/analysis/schemas';
import { groundFacts } from '@/features/analysis/grounding';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';
import type { Analysis, KeyFact } from '@/types';

/**
 * Safety notices (item **P-07**, `docs/PRD.md` §6 R7).
 *
 * These are the sentences Sightline writes itself, about content it read, so the tests are about
 * two things a person cannot see from a screenshot: whether a notice can fire on a document that
 * does not carry that content, and whether the wording ever exceeds what the project is allowed to
 * claim. The second group is why the copy is checked by rules rather than admired — a safety
 * sentence that says "this looks like a scam" would be a capability claim (PRD §12: **do not**
 * claim detection), and one that says "take two tablets" would be the advice the notice exists to
 * send the person away from.
 */

function fact(kind: KeyFact['kind']): KeyFact {
  return { kind, label: 'L', value: 'V', sourceQuote: 'V', quoteFound: true };
}

function reading(overrides: Partial<Analysis> = {}): Analysis {
  return {
    docType: 'other',
    summary: 'A document.',
    facts: [],
    actions: [],
    warnings: [],
    model: 'tee-llama',
    ...overrides,
  };
}

function ids(analysis: Analysis): SafetyNoticeId[] {
  return safetyNotices(analysis).map((notice) => notice.id);
}

describe('which notices fire', () => {
  it('names a medicine reading on the document type alone', () => {
    expect(ids(reading({ docType: 'medical' }))).toContain('medicine');
    expect(ids(reading({ docType: 'prescription' }))).toContain('medicine');
  });

  it('names a medicine reading on a medication or dose fact, whatever the type says', () => {
    expect(ids(reading({ facts: [fact('medication')] }))).toContain('medicine');
    expect(ids(reading({ docType: 'government', facts: [fact('dose')] }))).toContain('medicine');
  });

  it('names a money reading on a bill, a bank letter or an amount', () => {
    expect(ids(reading({ docType: 'bill' }))).toContain('money');
    expect(ids(reading({ docType: 'bank' }))).toContain('money');
    expect(ids(reading({ docType: 'other', facts: [fact('amount')] }))).toContain('money');
  });

  it('names a deadline reading when an action carries a date to act by', () => {
    const analysis = reading({
      actions: [{ text: 'Pay the invoice.', sourceQuote: 'due 14 March', quoteFound: true, deadline: '14 March' }],
    });
    expect(ids(analysis)).toContain('deadline');
  });

  it('names a deadline reading for a legal or government letter that states a date', () => {
    expect(ids(reading({ docType: 'legal', facts: [fact('date')] }))).toContain('deadline');
    expect(ids(reading({ docType: 'government', facts: [fact('date')] }))).toContain('deadline');
  });

  it('does not invent a deadline from a date that no action asks anything of', () => {
    // A bill that mentions the date it was issued is not a letter with a date to act by. Firing
    // here would attach a caution to a document that carries no urgency, which teaches the person
    // to discount the notice.
    expect(ids(reading({ docType: 'other', facts: [fact('date')] }))).not.toContain('deadline');
    expect(ids(reading({ actions: [{ text: 'Call the office.', sourceQuote: 'call', quoteFound: true }] }))).not.toContain('deadline');
  });

  it('does not fire a content notice on content the reading did not identify', () => {
    const quiet = reading({ docType: 'other', facts: [fact('reference'), fact('phone')] });
    expect(ids(quiet)).toEqual(['language']);
  });

  it('says the language limit for every reading, because it is about Sightline and not the document', () => {
    for (const analysis of [reading(), reading({ docType: 'bill' }), reading({ docType: 'medical' })]) {
      expect(ids(analysis).at(-1)).toBe('language');
    }
  });

  it('fires each notice once and keeps the fixed order', () => {
    const everything = reading({
      docType: 'prescription',
      facts: [fact('medication'), fact('dose'), fact('amount'), fact('date')],
      actions: [{ text: 'Do it.', sourceQuote: 'do it', quoteFound: true, deadline: '5 April' }],
    });
    const fired = ids(everything);
    expect(fired).toEqual(['medicine', 'money', 'deadline', 'language']);
    expect(new Set(fired).size).toBe(fired.length);
    expect(fired).toEqual(fired.filter((id) => SAFETY_NOTICE_IDS.includes(id)));
  });

  it('is deterministic and leaves the reading alone', () => {
    const analysis = reading({ docType: 'bill', facts: [fact('amount')] });
    const before = JSON.stringify(analysis);
    expect(safetyNotices(analysis)).toEqual(safetyNotices(analysis));
    expect(JSON.stringify(analysis)).toBe(before);
  });
});

describe('the wording is plain and stays inside what the project may claim', () => {
  // Jargon AGENTS.md §8 keeps out of the main flow. It belongs in the receipt's details view.
  const JARGON = [/\bTEE\b/, /attestation/i, /enclave/i, /encrypt/i, /nonce/i, /\bAPI\b/, /schema/i, /zod/i, /\bmodel\b/i];

  it('uses no technical vocabulary in any notice', () => {
    for (const analysis of [reading({ docType: 'medical' }), reading({ docType: 'bill' }), reading()]) {
      for (const notice of safetyNotices(analysis)) {
        for (const pattern of JARGON) {
          expect(notice.text, `${notice.id} matches ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('keeps every notice to three short sentences', () => {
    // A screen-reader user hears these before the answer, every time there is an answer. The cap
    // is the measurable half of "reviewed for plain language": no clause long enough to lose.
    for (const notice of safetyNotices(reading({ docType: 'prescription', facts: [fact('amount')] }))) {
      const sentences = notice.text.split(/(?<=[.!?])\s+/);
      expect(sentences.length).toBeLessThanOrEqual(3);
      for (const sentence of sentences) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20);
      }
      expect(notice.text).toMatch(/[.]$/);
    }
  });

  it('never claims to detect a fake letter, and says so in the money notice', () => {
    const money = safetyNotices(reading({ docType: 'bill' })).find((notice) => notice.id === 'money')!.text;
    // PRD §12: "Read faithfully; **do not** claim detection". The word for the capability never
    // appears; the absence of it does.
    for (const notice of safetyNotices(reading({ docType: 'bank', facts: [fact('amount')] }))) {
      expect(notice.text).not.toMatch(/scam|fraud|detect/i);
    }
    expect(money).toContain('cannot tell you whether this one is genuine');
    expect(money).toContain('contact details you already have');
  });

  it('sends the person to a professional or the sender, and never gives the advice itself', () => {
    const analysis = reading({
      docType: 'medical',
      facts: [fact('dose'), fact('amount')],
      actions: [{ text: 'Book the appointment.', sourceQuote: 'book by 5 April', quoteFound: true, deadline: '5 April' }],
    });
    const byId = new Map(safetyNotices(analysis).map((n) => [n.id, n.text]));
    expect([...byId.keys()]).toEqual(['medicine', 'money', 'deadline', 'language']);
    expect(byId.get('medicine')).toMatch(/doctor|pharmacist|surgery/);
    expect(byId.get('medicine')).toContain('does not give medical advice');
    expect(byId.get('money')).toMatch(/sender/);
    expect(byId.get('deadline')).toMatch(/sender/);
    // No notice may carry a dose, an amount or a date: that is the document's job, and repeating it
    // here would put an ungrounded copy of it outside the flagged-facts list.
    for (const text of byId.values()) {
      expect(text).not.toMatch(/\d+\s*(mg|micrograms?|tablets?)|£\s?\d|\bdeadline\b.*\d{4}/i);
    }
  });

  it('writes its own sentences rather than repeating the reading', () => {
    const analysis = reading({
      docType: 'medical',
      warnings: [{ kind: 'medical', text: 'This letter describes a medicine and a dose. Confirm any change with the surgery.' }],
    });
    for (const notice of safetyNotices(analysis)) {
      expect(notice.text).not.toContain(analysis.warnings[0]!.text);
    }
  });

  it('adds no privacy or data-flow sentence, which is claims.ts territory (AGENTS.md §4 rule 1)', () => {
    const all = SAFETY_NOTICE_IDS.map((id) => safetyNotices(reading({ docType: 'prescription', facts: [fact('amount')] })).find((n) => n.id === id)?.text ?? '')
      .join(' ');
    expect(all).not.toMatch(/sent|server|stored|leaves the device|uploaded|nothing was/i);
  });
});

describe('the demo corpus fires the notices a reviewer will hear', () => {
  // Run the same conversion `runPipeline` does — schema, then grounding — so this is the analysis
  // the results view receives, not a description of it.
  for (const fixtureCase of FIXTURE_CASES) {
    it(`${fixtureCase.name} shows exactly the notices its own reading justifies`, () => {
      const output = analysisSchema.parse(fixtureCase.analysis);
      const analysis = safetyReading(fixtureCase.name, fixtureCase.text, output);
      const fired = ids(analysis);
      if (fixtureCase.name === 'meadow-walk-letter') {
        expect(fired).toEqual(['medicine', 'deadline', 'language']);
      } else if (fixtureCase.name === 'northgate-bill') {
        expect(fired).toEqual(['money', 'deadline', 'language']);
      } else {
        // Riverside is a statement with money in it and no date to act by on any action.
        expect(fired).toEqual(['money', 'language']);
      }
    });
  }

  function safetyReading(name: string, text: string, output: ReturnType<typeof analysisSchema.parse>): Analysis {
    return {
      docType: output.docType,
      summary: output.summary,
      facts: groundFacts(text, output.facts),
      actions: groundFacts(text, output.actions),
      warnings: output.warnings,
      model: `fixtures/${name}`,
    };
  }
});
